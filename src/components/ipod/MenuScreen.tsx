import { useEffect, useRef } from 'react'
import { registerCenterAction } from '@/stores/navigation'

export type MenuItem = {
  label: string
  sublabel?: string
  artwork?: string | null   // small thumbnail; presence enables track-row layout
  isActive?: boolean        // show pause-bars icon (currently playing)
  rightArrow?: boolean
  onTap: () => void
}

type Props = {
  items: MenuItem[]
  selectedIndex: number
  onSelectIndex?: (index: number) => void
  title?: string
  footer?: React.ReactNode  // rendered after items (infinite-scroll sentinel etc.)
}

export default function MenuScreen({ items, selectedIndex, onSelectIndex, title, footer }: Props) {
  const selectedRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (items.length > 0 && selectedIndex >= items.length) {
      onSelectIndex?.(items.length - 1)
    }
  }, [selectedIndex, items.length])

  useEffect(() => {
    const container = containerRef.current
    const item = selectedRef.current
    if (!container || !item) return
    const itemTop = item.offsetTop
    const itemBottom = itemTop + item.offsetHeight
    const containerTop = container.scrollTop
    const containerBottom = containerTop + container.clientHeight
    if (itemTop < containerTop) {
      container.scrollTop = itemTop
    } else if (itemBottom > containerBottom) {
      container.scrollTop = itemBottom - container.clientHeight
    }
  }, [selectedIndex])

  useEffect(() => {
    registerCenterAction(() => items[selectedIndex]?.onTap?.())
  }, [selectedIndex, items])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {title && (
        <div
          className="px-3 py-1 shrink-0"
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#8a8a8a',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderBottom: '1px solid #1e1e1e',
            background: '#0a0a0a',
          }}
        >
          {title}
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'none' }}>
        {items.map((item, i) => {
          const isSelected = i === selectedIndex
          // Track-row layout when artwork key is explicitly present (even if null)
          const isTrackRow = 'artwork' in item

          return (
            <div
              key={i}
              ref={isSelected ? selectedRef : null}
              onPointerDown={() => {
                onSelectIndex?.(i)
                item.onTap()
              }}
              className={`flex items-center cursor-pointer${isSelected ? ' ipod-selected' : ''}`}
              style={{
                height: isTrackRow ? '44px' : '32px',
                padding: isTrackRow ? '0 10px' : '0 12px',
                gap: isTrackRow ? '8px' : '0',
                borderBottom: '1px solid #1e1e1e',
              }}
            >
              {/* ── Track row ── artwork + two-line label */}
              {isTrackRow && (
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: '#1a1a1a',
                }}>
                  {item.artwork && (
                    <img src={item.artwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
              )}

              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <span style={{
                  fontSize: isTrackRow ? '13px' : '14px',
                  fontWeight: isSelected ? 600 : 400,
                  color: '#ffffff',
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block',
                }}>
                  {item.label}
                </span>
                {/* Sublabel below label (artist name for track rows) */}
                {isTrackRow && item.sublabel && (
                  <span style={{
                    fontSize: '11px',
                    color: isSelected ? 'rgba(255,255,255,0.65)' : '#8a8a8a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'block',
                    marginTop: '1px',
                  }}>
                    {item.sublabel}
                  </span>
                )}
              </div>

              {/* ── Right section ── */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Play indicator (track rows) */}
                {item.isActive && (
                  <svg width="8" height="10" viewBox="0 0 8 10" fill={isSelected ? '#fff' : '#5baef8'}>
                    <rect x="0" y="0" width="2.5" height="10" rx="0.5" />
                    <rect x="5.5" y="0" width="2.5" height="10" rx="0.5" />
                  </svg>
                )}
                {/* Sublabel on right (menu rows: file size, count, etc.) */}
                {!isTrackRow && item.sublabel && (
                  <span style={{
                    fontSize: '12px',
                    color: isSelected ? 'rgba(255,255,255,0.7)' : '#8a8a8a',
                  }}>
                    {item.sublabel}
                  </span>
                )}
                {/* Arrow — shown for menu rows (default on) or track rows (opt-in) */}
                {(!isTrackRow && item.rightArrow !== false) || (isTrackRow && item.rightArrow === true) ? (
                  <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
                    <path
                      d="M1 1L4 4.5L1 8"
                      stroke={isSelected ? 'rgba(255,255,255,0.8)' : '#5a5a5a'}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </div>
            </div>
          )
        })}

        {footer}
      </div>
    </div>
  )
}
