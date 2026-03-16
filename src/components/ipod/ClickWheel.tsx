import { useRef, useState } from 'react'
import { useClickWheel } from '@/hooks/useClickWheel'
import { useNavigation, triggerScrollAction, triggerCenterHoldAction } from '@/stores/navigation'
import { usePlayer } from '@/hooks/usePlayer'

type PressedButton = 'menu' | 'play' | 'next' | 'prev' | 'center' | null

export default function ClickWheel() {
  const wheelRef = useRef<HTMLDivElement>(null)
  const [pressed, setPressed] = useState<PressedButton>(null)

  const { scrollSelectedIndex, pop } = useNavigation()
  const { togglePlay, playNext, playPrev } = usePlayer()

  useClickWheel(wheelRef, {
    onScroll: (delta) => {
      if (!triggerScrollAction(delta)) {
        scrollSelectedIndex(delta)
      }
    },
    onCenterHold: () => {
      setPressed('center')
      setTimeout(() => setPressed(null), 200)
      triggerCenterHoldAction()
    },
    onMenu: () => {
      setPressed('menu')
      setTimeout(() => setPressed(null), 150)
      pop()
    },
    onPlay: () => {
      setPressed('play')
      setTimeout(() => setPressed(null), 150)
      togglePlay()
    },
    onNext: () => {
      setPressed('next')
      setTimeout(() => setPressed(null), 150)
      playNext()
    },
    onPrev: () => {
      setPressed('prev')
      setTimeout(() => setPressed(null), 150)
      playPrev()
    },
    onButtonRelease: () => setPressed(null),
  })

  const isPressed = (btn: PressedButton) => pressed === btn

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px',
        touchAction: 'none',
      }}
    >
      {/* Outer wheel ring */}
      <div
        ref={wheelRef}
        style={{
          width: '100%',
          aspectRatio: '1',
          maxWidth: '320px',
          borderRadius: '50%',
          position: 'relative',
          background: `
            radial-gradient(ellipse at 32% 28%,
              #f5f5f5 0%,
              #d0d0d0 30%,
              #b0b0b0 55%,
              #909090 75%,
              #787878 100%
            )
          `,
          boxShadow: `
            inset 0 2px 8px rgba(255,255,255,0.55),
            inset 0 -3px 6px rgba(0,0,0,0.35),
            0 6px 24px rgba(0,0,0,0.85),
            0 2px 8px rgba(0,0,0,0.6)
          `,
          cursor: 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* MENU label — top */}
        <div style={{
          position: 'absolute',
          top: '13%',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '9.5px',
          fontWeight: 700,
          color: isPressed('menu') ? '#000' : '#444',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: isPressed('menu') ? 0.5 : 1,
          transition: 'opacity 0.1s',
          pointerEvents: 'none',
        }}>
          MENU
        </div>

        {/* ▶| label — right (NEXT) */}
        <div style={{
          position: 'absolute',
          right: '10%',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '13px',
          color: isPressed('next') ? '#000' : '#444',
          fontWeight: 700,
          opacity: isPressed('next') ? 0.4 : 1,
          transition: 'opacity 0.1s',
          pointerEvents: 'none',
        }}>
          ▶|
        </div>

        {/* |◀ label — left (PREV) */}
        <div style={{
          position: 'absolute',
          left: '10%',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '13px',
          color: isPressed('prev') ? '#000' : '#444',
          fontWeight: 700,
          opacity: isPressed('prev') ? 0.4 : 1,
          transition: 'opacity 0.1s',
          pointerEvents: 'none',
        }}>
          |◀
        </div>

        {/* ▶/⏸ label — bottom (PLAY) */}
        <div style={{
          position: 'absolute',
          bottom: '13%',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '13px',
          color: isPressed('play') ? '#000' : '#444',
          fontWeight: 700,
          opacity: isPressed('play') ? 0.4 : 1,
          transition: 'opacity 0.1s',
          pointerEvents: 'none',
        }}>
          ▶
        </div>

        {/* CENTER button */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '34%',
            aspectRatio: '1',
            borderRadius: '50%',
            background: isPressed('center')
              ? 'radial-gradient(ellipse at 35% 30%, #d0d0d0, #909090 50%, #787878)'
              : 'radial-gradient(ellipse at 35% 30%, #ebebeb, #c0c0c0 50%, #a0a0a0)',
            boxShadow: `
              inset 0 1px 4px rgba(255,255,255,0.5),
              inset 0 -1px 3px rgba(0,0,0,0.25),
              0 1px 4px rgba(0,0,0,0.4)
            `,
            transition: 'background 0.08s',
            zIndex: 2,
            pointerEvents: 'none',  // pointer events handled by parent wheel
          }}
        />
      </div>
    </div>
  )
}
