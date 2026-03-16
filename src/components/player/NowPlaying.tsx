import { useAtom } from 'jotai'
import { useRef, type MouseEvent, type TouchEvent } from 'react'
import { isNowPlayingOpenAtom } from '@/stores/player'
import { usePlayer } from '@/hooks/usePlayer'
import { Play, Pause, SkipBack, SkipForward, Heart, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function artworkUrl(url: string | null, fallback: string, size: string) {
  const src = url ?? fallback
  return src ? src.replace('-large', size) : ''
}

export default function NowPlaying() {
  const [isOpen, setIsOpen] = useAtom(isNowPlayingOpenAtom)
  const {
    currentTrack: track,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    canPlayNext,
    canPlayPrev,
    isLiked,
    isAuthenticated,
    togglePlay,
    playNext,
    playPrev,
    toggleLike,
    seek,
  } = usePlayer()

  const progressRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number | null>(null)

  if (!track) return null

  const bgArtwork = artworkUrl(track.artwork_url, track.user.avatar_url, '-t500x500')
  const artwork = artworkUrl(track.artwork_url, track.user.avatar_url, '-t300x300')
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  function seekTo(clientX: number, rect: DOMRect) {
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    seek(duration * pct)
  }

  function handleProgressClick(e: MouseEvent<HTMLDivElement>) {
    if (!progressRef.current) return
    seekTo(e.clientX, progressRef.current.getBoundingClientRect())
  }

  function handleProgressTouch(e: TouchEvent<HTMLDivElement>) {
    if (!progressRef.current) return
    e.preventDefault()
    seekTo(e.touches[0].clientX, progressRef.current.getBoundingClientRect())
  }

  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: TouchEvent<HTMLDivElement>) {
    if (touchStartY.current === null) return
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (dy > 60) setIsOpen(false)
    touchStartY.current = null
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col',
        'transition-[transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
        isOpen ? 'translate-y-0' : 'translate-y-full pointer-events-none',
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Blurred artwork atmosphere */}
      <div className="absolute inset-0 overflow-hidden bg-background">
        {bgArtwork && (
          <img
            src={bgArtwork}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl brightness-[0.2] saturate-[1.8]"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background/80 via-transparent to-background/40" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full px-6 pt-safe pb-safe">

        {/* Close button */}
        <div className="flex items-center justify-between pt-2 pb-1">
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Закрыть"
            className="flex items-center justify-center w-10 h-10 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-90"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
          <p className="text-xs font-semibold tracking-widest uppercase text-white/30">Сейчас играет</p>
          <div className="w-10" />
        </div>

        {/* Artwork */}
        <div className={cn(
          'flex-1 flex items-center justify-center py-2',
          'transition-[transform,opacity] duration-500 delay-75',
          isOpen ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
        )}>
          <div className="w-4/5 max-w-xs aspect-square rounded-3xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.06)]">
            {artwork && (
              <img src={artwork} alt={track.title} className="w-full h-full object-cover" />
            )}
          </div>
        </div>

        {/* Track info + like */}
        <div className="flex items-start gap-3 mb-5">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold tracking-tight leading-tight truncate">{track.title}</h2>
            <p className="text-sm text-white/50 mt-1 truncate">{track.user.username}</p>
          </div>
          {isAuthenticated && (
            <button
              onClick={toggleLike}
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full shrink-0 mt-0.5',
                'transition-all duration-200 active:scale-90',
                isLiked ? 'text-primary' : 'text-white/30 hover:text-white/60',
              )}
              aria-label={isLiked ? 'Убрать лайк' : 'Лайкнуть'}
            >
              <Heart className={cn('w-5 h-5 transition-all', isLiked && 'fill-primary')} />
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="mb-2">
          <div
            ref={progressRef}
            onClick={handleProgressClick}
            onTouchStart={handleProgressTouch}
            className="relative flex items-center h-10 cursor-pointer group"
          >
            <div className="w-full h-1 rounded-full bg-white/15 overflow-visible">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-300 ease-linear relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md scale-0 group-hover:scale-100 transition-transform" />
              </div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-white/35 tabular-nums -mt-1 select-none">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-10">
          <button
            onClick={playPrev}
            disabled={!canPlayPrev}
            className="w-12 h-12 flex items-center justify-center text-white/70 hover:text-white disabled:opacity-25 active:scale-90 transition-all duration-150"
          >
            <SkipBack className="w-7 h-7" strokeWidth={1.75} />
          </button>

          <button
            onClick={togglePlay}
            className="w-18 h-18 rounded-full bg-primary flex items-center justify-center shadow-[0_8px_32px_rgba(255,85,0,0.4)] active:scale-95 transition-all duration-150"
          >
            {isLoading
              ? <Loader2 className="w-8 h-8 text-white animate-spin" />
              : isPlaying
                ? <Pause className="w-8 h-8 text-white fill-white" />
                : <Play className="w-8 h-8 text-white fill-white ml-0.5" />}
          </button>

          <button
            onClick={playNext}
            disabled={!canPlayNext}
            className="w-12 h-12 flex items-center justify-center text-white/70 hover:text-white disabled:opacity-25 active:scale-90 transition-all duration-150"
          >
            <SkipForward className="w-7 h-7" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  )
}
