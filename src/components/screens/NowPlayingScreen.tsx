import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { useAtomValue, useAtom } from 'jotai'
import {
  currentTrackAtom,
  isPlayingAtom,
  currentTimeAtom,
  durationAtom,
  shuffleAtom,
  repeatModeAtom,
  queueIndexAtom,
} from '@/stores/player'
import { usePlayer } from '@/hooks/usePlayer'
import {
  registerCenterAction,
  registerCenterHoldAction,
  registerScrollAction,
} from '@/stores/navigation'
import { useNavigation } from '@/stores/navigation'
import { getPlayerState, setVolume, subscribePlayer } from '@/lib/player'

function formatTime(s: number) {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Marquee component — анимируется только если текст не влезает
function MarqueeText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const spanRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(0)

  useLayoutEffect(() => {
    const check = () => {
      const c = containerRef.current
      const s = spanRef.current
      if (c && s) {
        const ov = s.scrollWidth - c.clientWidth
        setOverflow(ov > 2 ? ov : 0)
      }
    }
    check()
    const ro = new ResizeObserver(check)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [text])

  const duration = overflow > 0 ? Math.max(5, overflow / 25) : 0

  return (
    <div ref={containerRef} style={{ overflow: 'hidden', ...style }}>
      <span
        ref={spanRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          willChange: overflow > 0 ? 'transform' : 'auto',
          animation: overflow > 0
            ? `marquee-scroll ${duration}s linear infinite`
            : 'none',
          '--marquee-offset': `-${overflow}px`,
        } as React.CSSProperties}
      >
        {text}
      </span>
    </div>
  )
}

// Иконки shuffle и repeat
function ShuffleIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M16 3h5v5M4 20l17-17M16 20h5v-5M4 4l6 6M14 14l7 7"
        stroke={active ? '#5baef8' : '#555'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RepeatIcon({ mode }: { mode: 'off' | 'one' | 'all' }) {
  const color = mode !== 'off' ? '#5baef8' : '#555'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position: 'relative' }}>
      <path
        d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {mode === 'one' && (
        <text x="12" y="14" textAnchor="middle" fontSize="7" fontWeight="700" fill={color}>1</text>
      )}
    </svg>
  )
}

export default function NowPlayingScreen() {
  const track = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const currentTime = useAtomValue(currentTimeAtom)
  const duration = useAtomValue(durationAtom)
  const queueIndex = useAtomValue(queueIndexAtom)
  const [shuffle, setShuffle] = useAtom(shuffleAtom)
  const [repeatMode, setRepeatMode] = useAtom(repeatModeAtom)
  const { push } = useNavigation()
  const { togglePlay: togglePlayFn, playNext: playNextFn, playPrev: playPrevFn } = usePlayer()

  // Volume overlay state
  const [volume, setVolumeState] = useState(() => getPlayerState().volume)
  const [showVolume, setShowVolume] = useState(false)
  const volumeHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track direction for artwork animation
  const prevQueueIndex = useRef(queueIndex)
  const [artworkKey, setArtworkKey] = useState(0)
  const [artworkDir, setArtworkDir] = useState<'right' | 'left'>('right')

  useEffect(() => {
    if (queueIndex !== prevQueueIndex.current) {
      setArtworkDir(queueIndex > prevQueueIndex.current ? 'right' : 'left')
      setArtworkKey(k => k + 1)
      prevQueueIndex.current = queueIndex
    }
  }, [queueIndex])

  // Sync volume from player
  useEffect(() => {
    const unsub = subscribePlayer(() => {
      setVolumeState(getPlayerState().volume)
    })
    return () => { unsub() }
  }, [])

  // CENTER = play/pause
  useEffect(() => {
    registerCenterAction(() => togglePlayFn())
  }, [togglePlayFn])

  // CENTER HOLD = context menu
  useEffect(() => {
    if (!track) return
    registerCenterHoldAction(() => {
      push({ id: 'context-menu', track })
    })
    return () => registerCenterHoldAction(null)
  }, [track, push])

  // SCROLL в NowPlaying = volume
  useEffect(() => {
    registerScrollAction((delta) => {
      const newVol = Math.max(0, Math.min(1, getPlayerState().volume + delta * 0.05))
      setVolume(newVol)
      setVolumeState(newVol)
      setShowVolume(true)
      if (volumeHideRef.current) clearTimeout(volumeHideRef.current)
      volumeHideRef.current = setTimeout(() => setShowVolume(false), 1800)
    })
    return () => {
      registerScrollAction(null)
      if (volumeHideRef.current) clearTimeout(volumeHideRef.current)
    }
  }, [])

  const artworkUrl = track?.artwork_url?.replace('-large', '-t500x500') ?? null
  const progress = duration > 0 ? currentTime / duration : 0

  const cycleRepeat = () => {
    setRepeatMode(m => m === 'off' ? 'all' : m === 'all' ? 'one' : 'off')
  }

  if (!track) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Nothing playing</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000', padding: '6px 8px 4px', position: 'relative' }}>

      {/* Artwork */}
      <div style={{
        flex: '1 1 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <div
          key={artworkKey}
          style={{
            width: '100%',
            maxWidth: '168px',
            aspectRatio: '1',
            borderRadius: '6px',
            overflow: 'hidden',
            background: '#1a1a1a',
            boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
            animation: `${artworkDir === 'right' ? 'artwork-enter' : 'artwork-enter-prev'} 0.28s ease-out`,
          }}
        >
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt={track.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, #1e3a5f, #0a1628)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="#3a5a8a">
                <path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Track info */}
      <div style={{ padding: '5px 0 3px', textAlign: 'center' }}>
        <MarqueeText
          text={track.title}
          style={{ fontSize: '13px', fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}
        />
        <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.user.username}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '2px 0' }}>
        <div style={{ height: '3px', background: '#2a2a2a', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: 'linear-gradient(to right, #5baef8, #3478c4)',
            borderRadius: '2px',
            transition: 'width 1s linear',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '10px', color: '#8a8a8a' }}>
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(duration - currentTime)}</span>
        </div>
      </div>

      {/* Controls row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: '2px 0 2px',
      }}>
        {/* Shuffle */}
        <button
          onPointerDown={() => setShuffle(s => !s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', opacity: 0.9 }}
        >
          <ShuffleIcon active={shuffle} />
        </button>

        {/* Prev */}
        <button
          onPointerDown={() => playPrevFn()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
        >
          <svg width="18" height="14" viewBox="0 0 20 16" fill="#fff">
            <path d="M10 8L19 1v14L10 8z M1 1h2v14H1V1z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onPointerDown={() => togglePlayFn()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
        >
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#fff">
              <rect x="3" y="2" width="5" height="16" rx="1" />
              <rect x="12" y="2" width="5" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#fff">
              <path d="M4 2L18 10L4 18V2Z" />
            </svg>
          )}
        </button>

        {/* Next */}
        <button
          onPointerDown={() => playNextFn()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
        >
          <svg width="18" height="14" viewBox="0 0 20 16" fill="#fff">
            <path d="M10 8L1 1v14l9-7z M17 1h2v14h-2V1z" />
          </svg>
        </button>

        {/* Repeat */}
        <button
          onPointerDown={cycleRepeat}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', opacity: 0.9 }}
        >
          <RepeatIcon mode={repeatMode} />
        </button>
      </div>

      {/* Volume overlay */}
      {showVolume && (
        <div style={{
          position: 'absolute',
          bottom: '56px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(20,20,20,0.92)',
          borderRadius: '10px',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minWidth: '150px',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          animation: 'fade-in-up 0.15s ease-out',
          zIndex: 10,
        }}>
          {/* Speaker icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#8a8a8a">
            {volume === 0
              ? <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" stroke="#8a8a8a" strokeWidth="2" fill="none" strokeLinecap="round" />
              : <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07" stroke="#8a8a8a" strokeWidth="2" fill="none" strokeLinecap="round" />
            }
          </svg>
          {/* Bar */}
          <div style={{ flex: 1, height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${volume * 100}%`,
              height: '100%',
              background: 'linear-gradient(to right, #5baef8, #3478c4)',
              borderRadius: '2px',
              transition: 'width 0.1s',
            }} />
          </div>
          {/* Percentage */}
          <span style={{ fontSize: '10px', color: '#8a8a8a', minWidth: '26px', textAlign: 'right' }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}
