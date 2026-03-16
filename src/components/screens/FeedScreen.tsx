import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { sc, apiGet } from '@/lib/api'
import { setQueueExtender } from '@/lib/player'
import { usePlayer } from '@/hooks/usePlayer'
import { currentTrackAtom, isPlayingAtom } from '@/stores/player'
import { useNavigation } from '@/stores/navigation'
import type { ScTrack, ScPlaylist, ScCollection } from '@/lib/api'

type FeedItem = { track?: ScTrack; playlist?: ScPlaylist }
type FeedPage = ScCollection<FeedItem>

function artworkUrl(url: string | null, fallback: string) {
  const src = url ?? fallback
  return src ? src.replace('-large', '-t200x200') : ''
}

export default function FeedScreen() {
  const { playTrack } = usePlayer()
  const { push } = useNavigation()
  const currentTrack = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const nextHrefRef = useRef<string | null>(null)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['feed'],
      queryFn: ({ pageParam }: { pageParam: string | null }) =>
        pageParam ? apiGet<FeedPage>(pageParam) : sc.feed(30),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.next_href ?? undefined,
      gcTime: 0,
    })

  const tracks = (() => {
    const seen = new Set<number>()
    return (
      data?.pages
        .flatMap((p) => p.collection)
        .map((item) => item.track)
        .filter((t): t is ScTrack => {
          if (!t || seen.has(t.id)) return false
          seen.add(t.id)
          return true
        }) ?? []
    )
  })()

  useEffect(() => {
    const lastPage = data?.pages[data.pages.length - 1]
    if (lastPage?.next_href) nextHrefRef.current = lastPage.next_href
  }, [data?.pages.length])

  useEffect(() => {
    setQueueExtender(async () => {
      const href = nextHrefRef.current
      if (!href) return []
      const page = await apiGet<FeedPage>(href)
      nextHrefRef.current = page.next_href
      return page.collection.filter((i) => i.track).map((i) => i.track!)
    })
    return () => setQueueExtender(null)
  }, [])

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
        const artwork = artworkUrl(track.artwork_url, track.user.avatar_url)

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
            {/* Artwork */}
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '4px',
              overflow: 'hidden',
              flexShrink: 0,
              background: '#1a1a1a',
            }}>
              {artwork && (
                <img
                  src={artwork}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#5baef8' : '#fff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {track.title}
              </div>
              <div style={{
                fontSize: '11px',
                color: '#8a8a8a',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: '1px',
              }}>
                {track.user.username}
              </div>
            </div>

            {/* Playing indicator */}
            {isActive && (
              <div style={{ flexShrink: 0, width: '12px' }}>
                {isPlaying ? (
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="#5baef8">
                    <rect x="0" y="0" width="3" height="12" rx="0.5" />
                    <rect x="7" y="0" width="3" height="12" rx="0.5" />
                  </svg>
                ) : (
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="#5baef8">
                    <path d="M0 0L10 6L0 12V0Z" />
                  </svg>
                )}
              </div>
            )}
          </div>
        )
      })}

      <div ref={sentinelRef} style={{ height: '1px' }} />

      {isFetchingNextPage && (
        <div style={{ textAlign: 'center', padding: '12px', color: '#8a8a8a', fontSize: '12px' }}>
          Loading more...
        </div>
      )}
    </div>
  )
}
