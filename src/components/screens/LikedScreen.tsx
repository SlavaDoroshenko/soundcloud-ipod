import { useAtomValue } from 'jotai'
import { currentUserAtom } from '@/stores/auth'
import { currentTrackAtom } from '@/stores/player'
import { usePlayer } from '@/hooks/usePlayer'
import { useNavigation } from '@/stores/navigation'
import { useInfiniteQuery } from '@tanstack/react-query'
import { sc, apiGet } from '@/lib/api'
import type { ScTrack, ScCollection } from '@/lib/api'
import { useEffect, useRef } from 'react'
import MenuScreen, { type MenuItem } from '@/components/ipod/MenuScreen'

type LikePage = ScCollection<{ created_at: string; track: ScTrack }>

export default function LikedScreen() {
  const currentUser = useAtomValue(currentUserAtom)
  const currentTrack = useAtomValue(currentTrackAtom)
  const { playTrack } = usePlayer()
  const { selectedIndex, setSelectedIndex, push } = useNavigation()
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

  const items: MenuItem[] = tracks.map((track) => ({
    label: track.title,
    sublabel: track.user.username,
    artwork: (track.artwork_url ?? track.user.avatar_url)?.replace('-large', '-t200x200') ?? null,
    isActive: currentTrack?.id === track.id,
    rightArrow: false,
    onTap: () => {
      playTrack(track, tracks)
      push({ id: 'now-playing' })
    },
  }))

  return (
    <MenuScreen
      items={items}
      selectedIndex={selectedIndex}
      onSelectIndex={setSelectedIndex}
      footer={
        <>
          <div ref={sentinelRef} style={{ height: '1px' }} />
          {isFetchingNextPage && (
            <div style={{ textAlign: 'center', padding: '10px', color: '#8a8a8a', fontSize: '12px' }}>
              Loading more...
            </div>
          )}
        </>
      }
    />
  )
}
