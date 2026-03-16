import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { Search as SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { sc } from '@/lib/api'
import { usePlayer } from '@/hooks/usePlayer'
import { currentTrackAtom, isPlayingAtom } from '@/stores/player'
import type { ScTrack } from '@/lib/api'
import { cn } from '@/lib/utils'

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function artworkUrl(url: string | null, fallback: string) {
  const src = url ?? fallback
  return src ? src.replace('-large', '-t300x300') : ''
}

function EqBars() {
  return (
    <div className="flex items-end gap-0.75 h-4">
      <div className="w-0.75 rounded-sm bg-primary origin-bottom animate-soundwave" />
      <div className="w-0.75 rounded-sm bg-primary origin-bottom animate-soundwave [animation-delay:0.15s]" />
      <div className="w-0.75 rounded-sm bg-primary origin-bottom animate-soundwave [animation-delay:0.3s]" />
    </div>
  )
}

function TrackRow({ track, onPlay, isActive, isPlaying }: {
  track: ScTrack
  onPlay: () => void
  isActive: boolean
  isPlaying: boolean
}) {
  const artwork = artworkUrl(track.artwork_url, track.user.avatar_url)

  return (
    <div
      onClick={onPlay}
      className={cn(
        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150',
        isActive ? 'bg-primary/5' : 'hover:bg-secondary/50 active:bg-secondary',
      )}
    >
      {/* Active stripe */}
      <div className={cn(
        'w-0.5 self-stretch rounded-full shrink-0 transition-colors',
        isActive ? 'bg-primary' : 'bg-transparent',
      )} />

      {/* Artwork */}
      <div className={cn(
        'w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-muted relative group/art',
        'ring-1 transition-all',
        isActive ? 'ring-primary/40' : 'ring-white/5',
      )}>
        {artwork && (
          <img src={artwork} alt={track.title} className="w-full h-full object-cover" />
        )}
        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/art:opacity-100 transition-opacity">
            <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-8 border-l-white border-b-[5px] border-b-transparent ml-0.5" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium truncate leading-tight',
          isActive && 'text-primary',
        )}>
          {track.title}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{track.user.username}</p>
      </div>

      {/* Duration / EQ bars */}
      <div className="shrink-0">
        {isActive && isPlaying
          ? <EqBars />
          : <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(track.duration)}</span>
        }
      </div>
    </div>
  )
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const { playTrack } = usePlayer()
  const currentTrack = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', submitted],
    queryFn: () => sc.search(submitted, 30),
    enabled: submitted.length > 0,
  })

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (query.trim()) setSubmitted(query.trim())
  }

  function handlePlay(track: ScTrack) {
    const tracks = data?.collection ?? [track]
    playTrack(track, tracks)
  }

  const showSpinner = isLoading || isFetching

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl px-4 pt-6 pb-3 border-b border-border/30">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">Найти</p>
        <form onSubmit={handleSubmit} className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Треки, артисты..."
            className="pl-9 bg-secondary/60 border-0 h-11 rounded-xl text-sm focus-visible:ring-1 focus-visible:ring-primary/60"
          />
        </form>
      </div>

      {/* Results */}
      <div className="flex-1">
        {showSpinner ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-end gap-1 h-8">
              <div className="w-1.5 rounded-sm bg-primary origin-bottom animate-soundwave" />
              <div className="w-1.5 rounded-sm bg-primary origin-bottom animate-soundwave [animation-delay:0.15s]" />
              <div className="w-1.5 rounded-sm bg-primary origin-bottom animate-soundwave [animation-delay:0.3s]" />
              <div className="w-1.5 rounded-sm bg-primary origin-bottom animate-soundwave [animation-delay:0.45s]" />
            </div>
          </div>
        ) : data?.collection.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <SearchIcon className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">Ничего не найдено по «{submitted}»</p>
          </div>
        ) : data ? (
          <div className="pt-1">
            {data.collection.map(track => (
              <TrackRow
                key={track.id}
                track={track}
                onPlay={() => handlePlay(track)}
                isActive={currentTrack?.id === track.id}
                isPlaying={isPlaying && currentTrack?.id === track.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <SearchIcon className="w-12 h-12 text-muted-foreground/15" />
            <p className="text-sm text-muted-foreground">Введи запрос и нажми Enter</p>
          </div>
        )}
      </div>
    </div>
  )
}
