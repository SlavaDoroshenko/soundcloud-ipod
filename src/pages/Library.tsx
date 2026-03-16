import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { Loader2, Heart, AlertCircle } from 'lucide-react'
import { sc } from '@/lib/api'
import { usePlayer } from '@/hooks/usePlayer'
import { currentUserAtom } from '@/stores/auth'
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

export default function LibraryPage() {
  const { playTrack } = usePlayer()
  const currentUser = useAtomValue(currentUserAtom)
  const currentTrack = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const { data, isLoading, error } = useQuery({
    queryKey: ['likes', currentUser?.id],
    queryFn: () => sc.likes(currentUser!.id),
    enabled: Boolean(currentUser?.id),
    retry: 1,
  })

  const tracks = data?.collection.map(item => item.track).filter(Boolean) ?? []

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b border-border/30">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">Коллекция</p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Библиотека</h1>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Heart className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">{tracks.length > 0 ? `${tracks.length} треков` : ''}</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !currentUser ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <Heart className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/80">Войди в аккаунт</p>
            <p className="text-xs text-muted-foreground mt-1">Открой Настройки и добавь токен</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-destructive/60" />
          </div>
          <div className="text-center px-8">
            <p className="text-sm font-medium text-foreground/80">Ошибка загрузки</p>
            <p className="text-xs text-muted-foreground mt-1 break-all">{(error as Error).message}</p>
          </div>
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <Heart className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/80">Нет лайкнутых треков</p>
            <p className="text-xs text-muted-foreground mt-1">Лайкай треки на SoundCloud</p>
          </div>
        </div>
      ) : (
        <div className="pt-1">
          {tracks.map(track => (
            <TrackRow
              key={track.id}
              track={track}
              onPlay={() => playTrack(track, tracks)}
              isActive={currentTrack?.id === track.id}
              isPlaying={isPlaying && currentTrack?.id === track.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
