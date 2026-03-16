import { useAtomValue } from 'jotai'
import { screenTitleAtom, canPopAtom, useNavigation } from '@/stores/navigation'
import { currentTrackAtom, isPlayingAtom } from '@/stores/player'

export default function StatusBar() {
  const title = useAtomValue(screenTitleAtom)
  const canPop = useAtomValue(canPopAtom)
  const currentTrack = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const { pop, screen } = useNavigation()

  const isNowPlaying = screen.id === 'now-playing'

  return (
    <div
      className="flex items-center justify-between px-2 shrink-0"
      style={{
        height: '22px',
        background: 'linear-gradient(to bottom, #4a4a4a, #2a2a2a)',
        borderBottom: '1px solid #1a1a1a',
      }}
    >
      {/* Left: back button or spacer */}
      <div className="w-14 flex items-center">
        {canPop && (
          <button
            onPointerDown={(e) => { e.stopPropagation(); pop() }}
            className="flex items-center gap-0.5 text-[#5baef8] active:opacity-60"
            style={{ fontSize: '11px', lineHeight: 1 }}
          >
            <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
              <path d="M5 1L1 5L5 9" stroke="#5baef8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: '10px' }}>Menu</span>
          </button>
        )}
      </div>

      {/* Center: title */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-1">
        <span
          className="truncate text-center font-semibold text-white"
          style={{ fontSize: '11px', letterSpacing: '0.01em' }}
        >
          {title}
        </span>
      </div>

      {/* Right: playing indicator or battery */}
      <div className="w-14 flex items-center justify-end gap-1">
        {currentTrack && !isNowPlaying && (
          <button
            onPointerDown={(e) => { e.stopPropagation() }}
            className="flex items-center gap-0.5"
          >
            {isPlaying ? (
              <svg width="8" height="10" viewBox="0 0 8 10" fill="white">
                <rect x="0" y="0" width="2.5" height="10" rx="0.5" />
                <rect x="5.5" y="0" width="2.5" height="10" rx="0.5" />
              </svg>
            ) : (
              <svg width="8" height="10" viewBox="0 0 8 10" fill="white">
                <path d="M0 0L8 5L0 10V0Z" />
              </svg>
            )}
          </button>
        )}
        {/* Battery icon placeholder */}
        <div
          className="flex items-center justify-center"
          style={{
            width: '20px',
            height: '10px',
            border: '1px solid #8a8a8a',
            borderRadius: '2px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: '-4px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '3px',
              height: '5px',
              background: '#8a8a8a',
              borderRadius: '0 1px 1px 0',
            }}
          />
          <div
            style={{
              width: '70%',
              height: '60%',
              background: '#5baef8',
              borderRadius: '1px',
              marginRight: '2px',
            }}
          />
        </div>
      </div>
    </div>
  )
}
