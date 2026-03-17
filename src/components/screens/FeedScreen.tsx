import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { sc, apiGet } from '@/lib/api'
import { setQueueExtender } from '@/lib/player'
import { usePlayer } from '@/hooks/usePlayer'
import { currentTrackAtom } from '@/stores/player'
import { useNavigation } from '@/stores/navigation'
import MenuScreen, { type MenuItem } from '@/components/ipod/MenuScreen'
import type { ScTrack, ScPlaylist, ScCollection } from '@/lib/api'

type FeedItem = { track?: ScTrack; playlist?: ScPlaylist }
type FeedPage = ScCollection<FeedItem>

export default function FeedScreen() {
  const { playTrack } = usePlayer()
  const { selectedIndex, setSelectedIndex, push } = useNavigation()
  const currentTrack = useAtomValue(currentTrackAtom)
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
