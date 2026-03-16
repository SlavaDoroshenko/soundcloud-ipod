import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { useAtomValue } from 'jotai'
import {
  currentTrackAtom,
  isPlayingAtom,
  currentTimeAtom,
  durationAtom,
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

// Marquee — анимируется только если текст не влезает
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

export default function NowPlayingScreen() {
  const track = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const currentTime = useAtomValue(currentTimeAtom)
  const duration = useAtomValue(durationAtom)
  const queueIndex = useAtomValue(queueIndexAtom)
  const { push } = useNavigation()
  const { togglePlay: togglePlayFn } = usePlayer()
  const [playerError, setError] = useState<string | null>(() => getPlayerState().error)

  useEffect(() => {
    const unsub = subscribePlayer(() => setError(getPlayerState().error))
    return () => { unsub() }
  }, [])

  // Volume overlay
  const [volume, setVolumeState] = useState(() => getPlayerState().volume)
  const [showVolume, setShowVolume] = useState(false)
  const volumeHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsub = subscribePlayer(() => setVolumeState(getPlayerState().volume))
    return () => { unsub() }
  }, [])

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

  // CENTER = play/pause
  useEffect(() => {
    registerCenterAction(() => togglePlayFn())
  }, [togglePlayFn])

  // CENTER HOLD = context menu
  useEffect(() => {
    if (!track) return
    registerCenterHoldAction(() => push({ id: 'context-menu', track }))
    return () => registerCenterHoldAction(null)
  }, [track, push])

  // SCROLL = volume control
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

  if (!track) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#000' }}>
        <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Nothing playing</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000', padding: '4px 8px 6px', position: 'relative' }}>

      {/* Artwork — fills all available space */}
      <div style={{
        flex: '1 1 0',
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '2px 0',
      }}>
        <div
          key={artworkKey}
          style={{
            height: '100%',
            aspectRatio: '1 / 1',
            maxWidth: '100%',
            borderRadius: '6px',
            overflow: 'hidden',
            background: '#1a1a1a',
            boxShadow: '0 4px 24px rgba(0,0,0,0.9)',
            animation: `${artworkDir === 'right' ? 'artwork-enter' : 'artwork-enter-prev'} 0.28s ease-out`,
          }}
        >
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt={track.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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

      {/* Track info strip */}
      <div style={{ padding: '4px 0 2px', textAlign: 'center' }}>
        <MarqueeText
          text={track.title}
          style={{ fontSize: '14px', fontWeight: 600, color: '#fff', letterSpacing: '-0.01em', lineHeight: '1.2' }}
        />
        <div style={{
          fontSize: '12px',
          color: '#8a8a8a',
          marginTop: '1px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {track.user.username}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '3px 0 2px' }}>
        <div style={{ height: '3px', background: '#2a2a2a', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: 'linear-gradient(to right, #5baef8, #3478c4)',
            borderRadius: '2px',
            transition: 'width 1s linear',
          }} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '2px',
          fontSize: '10px',
          color: '#8a8a8a',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>{formatTime(currentTime)}</span>
          {playerError ? (
            <span style={{ color: '#ff6b6b', fontSize: '9px', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {playerError}
            </span>
          ) : (
            <span style={{ color: isPlaying ? '#5baef8' : '#555', fontSize: '8px', letterSpacing: '0.05em' }}>
              {isPlaying ? '▶' : '■'}
            </span>
          )}
          <span>-{formatTime(duration - currentTime)}</span>
        </div>
      </div>

      {/* Volume overlay */}
      {showVolume && (
        <div style={{
          position: 'absolute',
          bottom: '50px',
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            {volume === 0
              ? <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" stroke="#8a8a8a" strokeWidth="2" strokeLinecap="round" />
              : <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07" stroke="#8a8a8a" strokeWidth="2" strokeLinecap="round" />
            }
          </svg>
          <div style={{ flex: 1, height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${volume * 100}%`,
              height: '100%',
              background: 'linear-gradient(to right, #5baef8, #3478c4)',
              borderRadius: '2px',
              transition: 'width 0.1s',
            }} />
          </div>
          <span style={{ fontSize: '10px', color: '#8a8a8a', minWidth: '26px', textAlign: 'right' }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}
