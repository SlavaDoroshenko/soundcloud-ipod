import { useAtomValue } from 'jotai'
import { currentUserAtom } from '@/stores/auth'
import { currentTrackAtom, isPlayingAtom } from '@/stores/player'
import { usePlayer } from '@/hooks/usePlayer'
import { useNavigation } from '@/stores/navigation'
import { useInfiniteQuery } from '@tanstack/react-query'
import { sc, apiGet } from '@/lib/api'
import type { ScTrack, ScCollection } from '@/lib/api'
import { useEffect, useRef } from 'react'

type LikePage = ScCollection<{ created_at: string; track: ScTrack }>

export default function LikedScreen() {
  const currentUser = useAtomValue(currentUserAtom)
  const currentTrack = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const { playTrack } = usePlayer()
  const { push } = useNavigation()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['liked', currentUser?.id],
      queryFn: ({ pageParam }: { pageParam: string | null }) =>
        pageParam
          ? apiGet<LikePage>(pageParam)
          : sc.likes(currentUser!.id, 24),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.next_href ?? undefined,
      enabled: !!currentUser?.id,
    })

  const tracks = data?.pages.flatMap((p) => p.collection.map((i) => i.track)) ?? []

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Sign in to see liked tracks</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto" style={{ overscrollBehavior: 'none' }}>
      {tracks.map((track) => {
        const isActive = currentTrack?.id === track.id
        const artwork = (track.artwork_url ?? track.user.avatar_url)?.replace('-large', '-t200x200')

        return (
          <div
            key={track.id}
            onPointerDown={() => {
              playTrack(track, tracks)
              push({ id: 'now-playing' })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 10px',
              borderBottom: '1px solid #1e1e1e',
              background: isActive ? 'rgba(91,174,248,0.1)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <div style={{
              width: '36px', height: '36px', borderRadius: '4px',
              overflow: 'hidden', flexShrink: 0, background: '#1a1a1a',
            }}>
              {artwork && <img src={artwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{
                fontSize: '13px', fontWeight: isActive ? 600 : 400,
                color: isActive ? '#5baef8' : '#fff',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {track.title}
              </div>
              <div style={{ fontSize: '11px', color: '#8a8a8a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
                {track.user.username}
              </div>
            </div>
            {isActive && (
              <div style={{ flexShrink: 0, width: '10px' }}>
                <svg width="8" height="10" viewBox="0 0 8 10" fill="#5baef8">
                  {isPlaying
                    ? <><rect x="0" y="0" width="2.5" height="10" rx="0.5" /><rect x="5.5" y="0" width="2.5" height="10" rx="0.5" /></>
                    : <path d="M0 0L8 5L0 10V0Z" />
                  }
                </svg>
              </div>
            )}
          </div>
        )
      })}
      <div ref={sentinelRef} style={{ height: '1px' }} />
      {isFetchingNextPage && (
        <div style={{ textAlign: 'center', padding: '10px', color: '#8a8a8a', fontSize: '12px' }}>Loading more...</div>
      )}
    </div>
  )
}
