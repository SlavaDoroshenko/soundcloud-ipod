import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { Loader2 } from 'lucide-react'
import { sc, apiGet } from '@/lib/api'
import { setQueueExtender } from '@/lib/player'
import { usePlayer } from '@/hooks/usePlayer'
import { currentTrackAtom, isPlayingAtom } from '@/stores/player'
import type { ScTrack, ScPlaylist, ScCollection } from '@/lib/api'
import { cn } from '@/lib/utils'

type FeedItem = { track?: ScTrack; playlist?: ScPlaylist }
type FeedPage = ScCollection<FeedItem>

function artworkUrl(url: string | null, fallback: string) {
  const src = url ?? fallback
  return src ? src.replace('-large', '-t500x500') : ''
}

function EqBars() {
  return (
    <div className="absolute bottom-2 right-2 flex items-end gap-[3px] h-4">
      <div className="w-[3px] rounded-sm bg-primary origin-bottom animate-soundwave" />
      <div className="w-[3px] rounded-sm bg-primary origin-bottom animate-soundwave [animation-delay:0.15s]" />
      <div className="w-[3px] rounded-sm bg-primary origin-bottom animate-soundwave [animation-delay:0.3s]" />
    </div>
  )
}

function FeedCard({ track, onPlay, isActive, isPlaying }: {
  track: ScTrack
  onPlay: () => void
  isActive: boolean
  isPlaying: boolean
}) {
  const artwork = artworkUrl(track.artwork_url, track.user.avatar_url)

  return (
    <div onClick={onPlay} className="cursor-pointer group">
      <div className={cn(
        'aspect-square rounded-xl overflow-hidden bg-muted mb-2.5 relative',
        'ring-1 transition-all duration-300',
        isActive
          ? 'ring-primary/70 shadow-[0_0_20px_rgba(255,85,0,0.2)]'
          : 'ring-white/5 group-hover:ring-white/15',
      )}>
        {artwork && (
          <img
            src={artwork}
            alt={track.title}
            className={cn(
              'w-full h-full object-cover transition-transform duration-500',
              'group-hover:scale-105',
            )}
          />
        )}

        {!isActive && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/0 group-hover:bg-white/20 backdrop-blur-sm flex items-center justify-center scale-75 group-hover:scale-100 opacity-0 group-hover:opacity-100 transition-all duration-200">
              <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-0.5" />
            </div>
          </div>
        )}

        {isActive && isPlaying && <EqBars />}
        {isActive && !isPlaying && (
          <div className="absolute bottom-2 right-2 w-4 h-4 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-sm bg-primary opacity-80" />
          </div>
        )}
      </div>

      <p className={cn(
        'text-sm font-semibold truncate leading-tight transition-colors',
        isActive ? 'text-primary' : 'group-hover:text-foreground',
      )}>
        {track.title}
      </p>
      <p className="text-xs text-muted-foreground truncate mt-0.5">{track.user.username}</p>
    </div>
  )
}

export default function FeedPage() {
  const { playTrack } = usePlayer()
  const currentTrack = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const nextHrefRef = useRef<string | null>(null)

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      pageParam
        ? apiGet<FeedPage>(pageParam)
        : sc.feed(30),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_href ?? undefined,
    gcTime: 0,
  })

  const tracks = (() => {
    const seen = new Set<number>()
    return data?.pages
      .flatMap(page => page.collection)
      .map(item => item.track)
      .filter((t): t is ScTrack => {
        if (!t || seen.has(t.id)) return false
        seen.add(t.id)
        return true
      }) ?? []
  })()

  // Обновляем nextHrefRef при каждой новой странице
  useEffect(() => {
    const lastPage = data?.pages[data.pages.length - 1]
    if (lastPage?.next_href) nextHrefRef.current = lastPage.next_href
  }, [data?.pages.length])

  // Queue extender: player вызывает его когда очередь заканчивается.
  // Работает с заблокированным экраном — прямой fetch без React.
  useEffect(() => {
    setQueueExtender(async () => {
      const href = nextHrefRef.current
      if (!href) return []
      const page = await apiGet<FeedPage>(href)
      nextHrefRef.current = page.next_href
      const newTracks: ScTrack[] = []
      for (const item of page.collection) {
        if (item.track) newTracks.push(item.track)
      }
      return newTracks
    })
    return () => setQueueExtender(null)
  }, [])

  // Подгружаем следующую страницу когда sentinel входит во viewport
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-full py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-2">
      <div className="mb-5">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">Лента</p>
        <h1 className="text-2xl font-bold tracking-tight">Главная</h1>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {tracks.map(track => (
          <FeedCard
            key={track.id}
            track={track}
            onPlay={() => playTrack(track, tracks)}
            isActive={currentTrack?.id === track.id}
            isPlaying={isPlaying && currentTrack?.id === track.id}
          />
        ))}
      </div>

      {/* Sentinel — триггер для загрузки следующей страницы */}
      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary/60" />
        </div>
      )}
    </div>
  )
}
