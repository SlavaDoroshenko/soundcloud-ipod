import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { useAtomValue, useAtom } from 'jotai'
import { useDrag } from '@use-gesture/react'
import {
  currentTrackAtom,
  isPlayingAtom,
  currentTimeAtom,
  durationAtom,
  queueIndexAtom,
  shuffleAtom,
  repeatModeAtom,
} from '@/stores/player'
import { usePlayer } from '@/hooks/usePlayer'
import { useNavigation } from '@/stores/navigation'
import { seek } from '@/lib/player'

function formatTime(s: number) {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

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

  const dur = overflow > 0 ? Math.max(5, overflow / 25) : 0

  return (
    <div ref={containerRef} style={{ overflow: 'hidden', ...style }}>
      <span
        ref={spanRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          willChange: overflow > 0 ? 'transform' : 'auto',
          animation: overflow > 0 ? `marquee-scroll ${dur}s linear infinite` : 'none',
          '--marquee-offset': `-${overflow}px`,
        } as React.CSSProperties}
      >
        {text}
      </span>
    </div>
  )
}

function ShuffleIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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

export default function NowPlayingTouchScreen() {
  const track = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const currentTime = useAtomValue(currentTimeAtom)
  const duration = useAtomValue(durationAtom)
  const queueIndex = useAtomValue(queueIndexAtom)
  const [shuffle, setShuffle] = useAtom(shuffleAtom)
  const [repeatMode, setRepeatMode] = useAtom(repeatModeAtom)
  const { pop } = useNavigation()
  const { togglePlay, playNext, playPrev } = usePlayer()

  // Artwork animation direction
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

  // Swipe gestures on artwork
  const bind = useDrag(({ last, movement: [mx, my], velocity: [vx, vy] }) => {
    if (!last) return
    const absMx = Math.abs(mx)
    const absMy = Math.abs(my)
    if (absMx > absMy) {
      if (absMx > 50 || Math.abs(vx) > 0.3) {
        if (mx < 0) playNext()
        else playPrev()
      }
    } else {
      if (my > 80 || vy > 0.3) pop()
    }
  }, { filterTaps: true })

  // Scrubber
  const scrubberRef = useRef<HTMLDivElement>(null)
  const [seeking, setSeeking] = useState(false)
  const [seekPreview, setSeekPreview] = useState<number | null>(null)

  const getRatio = (e: React.PointerEvent) => {
    const rect = scrubberRef.current?.getBoundingClientRect()
    if (!rect || duration === 0) return null
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  const onScrubDown = (e: React.PointerEvent) => {
    const r = getRatio(e)
    if (r === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setSeeking(true)
    setSeekPreview(r)
  }
  const onScrubMove = (e: React.PointerEvent) => {
    if (!seeking) return
    const r = getRatio(e)
    if (r !== null) setSeekPreview(r)
  }
  const onScrubUp = (e: React.PointerEvent) => {
    const r = getRatio(e)
    if (r !== null) seek(r * duration)
    setSeeking(false)
    setSeekPreview(null)
  }

  const progress = seekPreview !== null ? seekPreview : (duration > 0 ? currentTime / duration : 0)
  const artworkUrl = track?.artwork_url?.replace('-large', '-t500x500') ?? null

  const cycleRepeat = () => {
    setRepeatMode(m => m === 'off' ? 'all' : m === 'all' ? 'one' : 'off')
  }

  if (!track) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ color: '#8a8a8a', fontSize: '14px' }}>Nothing playing</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000', padding: '12px 24px 20px' }}>

      {/* Artwork — swipeable zone */}
      <div
        {...bind()}
        style={{
          flex: '1 1 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <div
          key={artworkKey}
          style={{
            width: '100%',
            maxWidth: '320px',
            aspectRatio: '1',
            borderRadius: '16px',
            overflow: 'hidden',
            background: '#1a1a1a',
            boxShadow: '0 12px 48px rgba(0,0,0,0.9)',
            animation: `${artworkDir === 'right' ? 'artwork-enter' : 'artwork-enter-prev'} 0.28s ease-out`,
          }}
        >
          {artworkUrl ? (
            <img src={artworkUrl} alt={track.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1e3a5f, #0a1628)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="#3a5a8a">
                <path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Track info */}
      <div style={{ padding: '16px 0 10px' }}>
        <MarqueeText
          text={track.title}
          style={{ fontSize: '18px', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}
        />
        <div style={{ fontSize: '14px', color: '#8a8a8a', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.user.username}
        </div>
      </div>

      {/* Progress scrubber */}
      <div style={{ paddingBottom: '20px' }}>
        <div
          ref={scrubberRef}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          style={{ height: '32px', display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}
        >
          <div style={{ flex: 1, height: '4px', background: '#2a2a2a', borderRadius: '2px', position: 'relative', overflow: 'visible' }}>
            <div style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: 'linear-gradient(to right, #5baef8, #3478c4)',
              borderRadius: '2px',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                right: '-7px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#8a8a8a', marginTop: '-4px' }}>
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(duration - currentTime)}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onPointerDown={() => setShuffle(s => !s)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}
        >
          <ShuffleIcon active={shuffle} />
        </button>

        <button
          onPointerDown={() => playPrev()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff">
            <path d="M19 20L9 12l10-8v16zM5 4h2v16H5V4z" />
          </svg>
        </button>

        <button
          onPointerDown={() => togglePlay()}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            cursor: 'pointer',
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isPlaying ? (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff">
              <rect x="5" y="3" width="4" height="18" rx="1" />
              <rect x="15" y="3" width="4" height="18" rx="1" />
            </svg>
          ) : (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff">
              <path d="M5 3l14 9-14 9V3z" />
            </svg>
          )}
        </button>

        <button
          onPointerDown={() => playNext()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff">
            <path d="M5 4l10 8-10 8V4zM19 4h2v16h-2V4z" />
          </svg>
        </button>

        <button
          onPointerDown={cycleRepeat}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}
        >
          <RepeatIcon mode={repeatMode} />
        </button>
      </div>
    </div>
  )
}
