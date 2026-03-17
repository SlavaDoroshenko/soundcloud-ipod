import { useEffect, useRef } from 'react'
import { registerCenterAction } from '@/stores/navigation'

export type MenuItem = {
  label: string
  sublabel?: string
  rightArrow?: boolean
  onTap: () => void
}

type Props = {
  items: MenuItem[]
  selectedIndex: number
  onSelectIndex?: (index: number) => void
  title?: string
}

export default function MenuScreen({ items, selectedIndex, onSelectIndex, title }: Props) {
  const selectedRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Clamp selectedIndex to valid range
  useEffect(() => {
    if (items.length > 0 && selectedIndex >= items.length) {
      onSelectIndex?.(items.length - 1)
    }
  }, [selectedIndex, items.length])

  // Scroll selected item into view — instant, no animation lag during momentum
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

  // Register CENTER action for click wheel
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
          return (
            <div
              key={i}
              ref={isSelected ? selectedRef : null}
              onPointerDown={() => {
                onSelectIndex?.(i)
                item.onTap()
              }}
              className={`flex items-center justify-between px-3 cursor-pointer${isSelected ? ' ipod-selected' : ''}`}
              style={{
                height: '32px',
                borderBottom: '1px solid #1e1e1e',
              }}
            >
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: isSelected ? 600 : 400,
                  color: '#ffffff',
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {item.label}
              </span>

              <div className="flex items-center gap-1.5 shrink-0">
                {item.sublabel && (
                  <span
                    style={{
                      fontSize: '12px',
                      color: isSelected ? 'rgba(255,255,255,0.7)' : '#8a8a8a',
                    }}
                  >
                    {item.sublabel}
                  </span>
                )}
                {item.rightArrow !== false && (
                  <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
                    <path
                      d="M1 1L4 4.5L1 8"
                      stroke={isSelected ? 'rgba(255,255,255,0.8)' : '#5a5a5a'}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
