import { useAtomValue, useSetAtom } from 'jotai'
import { useRef, type MouseEvent, type TouchEvent } from 'react'
import {
  currentTrackAtom,
  isPlayingAtom,
  isLoadingAtom,
  currentTimeAtom,
  durationAtom,
  isNowPlayingOpenAtom,
} from '@/stores/player'
import { usePlayer } from '@/hooks/usePlayer'
import { Play, Pause, SkipForward, Loader2, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

function artworkUrl(url: string | null, fallback: string) {
  const src = url ?? fallback
  return src ? src.replace('-large', '-t300x300') : ''
}

export default function MiniPlayer() {
  const track = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const isLoading = useAtomValue(isLoadingAtom)
  const currentTime = useAtomValue(currentTimeAtom)
  const duration = useAtomValue(durationAtom)
  const setIsNowPlayingOpen = useSetAtom(isNowPlayingOpenAtom)
  const { togglePlay, playNext, canPlayNext, isLiked, isAuthenticated, toggleLike, seek } = usePlayer()

  const progressRef = useRef<HTMLDivElement>(null)

  if (!track) return null

  const artwork = artworkUrl(track.artwork_url, track.user.avatar_url)
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  function seekTo(clientX: number, rect: DOMRect) {
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    seek(duration * pct)
  }

  function handleProgressClick(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (!progressRef.current) return
    seekTo(e.clientX, progressRef.current.getBoundingClientRect())
  }

  function handleProgressTouch(e: TouchEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (!progressRef.current) return
    seekTo(e.touches[0].clientX, progressRef.current.getBoundingClientRect())
  }

  return (
    <div className={cn(
      'fixed left-3 right-3 z-40 rounded-2xl overflow-hidden bottom-above-nav',
      'bg-card/90 backdrop-blur-2xl border border-border/40',
      'shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]',
    )}>
      {/* Seekable progress bar */}
      <div
        ref={progressRef}
        onClick={handleProgressClick}
        onTouchStart={handleProgressTouch}
        className="h-0.5 bg-border/40 cursor-pointer group relative"
      >
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-linear"
          style={{ width: `${progress}%` }}
        />
        {/* Wider invisible tap target */}
        <div className="absolute inset-x-0 -inset-y-2" />
      </div>

      {/* Main row */}
      <div
        className="flex items-center gap-3 px-3 h-17 cursor-pointer"
        onClick={() => setIsNowPlayingOpen(true)}
      >
        {/* Artwork */}
        <div className={cn(
          'w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-muted ring-1 ring-white/5',
          isPlaying && 'ring-primary/30',
        )}>
          {artwork && (
            <img src={artwork} alt={track.title} className="w-full h-full object-cover" />
          )}
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{track.title}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{track.user.username}</p>
        </div>

        {/* Controls — stopPropagation чтобы не открывать NowPlaying */}
        <div className="flex items-center shrink-0" onClick={e => e.stopPropagation()}>
          {isAuthenticated && (
            <button
              onClick={toggleLike}
              className={cn(
                'w-9 h-9 flex items-center justify-center rounded-full transition-all duration-150 active:scale-90',
                isLiked ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label={isLiked ? 'Убрать лайк' : 'Лайкнуть'}
            >
              <Heart className={cn('w-4 h-4', isLiked && 'fill-primary')} />
            </button>
          )}
          <button
            onClick={togglePlay}
            className="w-10 h-10 flex items-center justify-center rounded-full text-foreground hover:text-primary active:scale-90 transition-all duration-150"
          >
            {isLoading
              ? <Loader2 className="w-5 h-5 animate-spin text-primary" />
              : isPlaying
                ? <Pause className="w-5 h-5" />
                : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={playNext}
            disabled={!canPlayNext}
            className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-25 active:scale-90 transition-all duration-150"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
