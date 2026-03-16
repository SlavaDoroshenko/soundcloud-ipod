import { type ReactNode } from 'react'
import { useAtomValue } from 'jotai'
import { controlModeAtom } from '@/stores/settings'
import StatusBar from './StatusBar'
import ClickWheel from './ClickWheel'
import TouchControlBar from './TouchControlBar'

type Props = {
  children: ReactNode
}

export default function IpodShell({ children }: Props) {
  const controlMode = useAtomValue(controlModeAtom)

  if (controlMode === 'touch') {
    return (
      <div
        style={{
          height: '100dvh',
          width: '100%',
          maxWidth: '430px',
          margin: '0 auto',
          background: '#000',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Screen area — fills space above TouchControlBar */}
        <div
          style={{
            flex: '1 1 0',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <StatusBar />
          </div>
          <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
            {children}
          </div>
        </div>

        {/* Touch control bar — fixed at bottom */}
        <TouchControlBar />
      </div>
    )
  }

  // Wheel mode
  return (
    <div
      style={{
        height: '100dvh',
        width: '100%',
        maxWidth: '430px',
        margin: '0 auto',
        background: '#000',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Screen area — 55% высоты */}
      <div
        style={{
          flex: '0 0 55%',
          background: '#000',
          overflow: 'hidden',
          borderBottom: '2px solid #1a1a1a',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <StatusBar />
        </div>
        <div style={{ flex: 1, overflow: 'hidden', background: '#000' }}>
          {children}
        </div>
      </div>

      {/* Разделительная полоска */}
      <div
        style={{
          height: '6px',
          flexShrink: 0,
          background: 'linear-gradient(to bottom, #1a1a1a, #2a2a2a)',
        }}
      />

      {/* Click wheel area — остаток высоты */}
      <div
        style={{
          flex: '1 1 0',
          background: 'linear-gradient(to bottom, #1c1c1c, #111)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 'env(safe-area-inset-bottom)',
          overflow: 'hidden',
        }}
      >
        <ClickWheel />
      </div>
    </div>
  )
}
