import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useDrag } from '@use-gesture/react'
import { sc, apiGet } from '@/lib/api'
import type { ScTrack, ScCollection } from '@/lib/api'
import { currentUserAtom } from '@/stores/auth'
import { useNavigation, registerCenterAction } from '@/stores/navigation'
import { usePlayer } from '@/hooks/usePlayer'
import { controlModeAtom } from '@/stores/settings'

type LikePage = ScCollection<{ created_at: string; track: ScTrack }>

const COVER_SIZE = 148
const OFFSETS = [-2, -1, 0, 1, 2]

function getCoverTransform(offset: number): string {
  if (offset === 0) return `perspective(700px) translateX(0px) rotateY(0deg)`
  const sign = offset < 0 ? -1 : 1
  const abs = Math.abs(offset)
  const tx = sign * (COVER_SIZE * 0.6 + (abs - 1) * COVER_SIZE * 0.44)
  const ry = -sign * 68
  return `perspective(700px) translateX(${tx}px) rotateY(${ry}deg)`
}

function getCoverOpacity(offset: number): number {
  if (offset === 0) return 1
  return Math.abs(offset) === 1 ? 0.72 : 0.4
}

export default function CoverFlowScreen() {
  const currentUser = useAtomValue(currentUserAtom)
  const controlMode = useAtomValue(controlModeAtom)
  const { selectedIndex, setSelectedIndex, push } = useNavigation()
  const { playTrack } = usePlayer()

  const { data, isLoading } = useInfiniteQuery({
    queryKey: ['liked', currentUser?.id],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      pageParam
        ? apiGet<LikePage>(pageParam)
        : sc.likes(currentUser!.id, 50),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_href ?? undefined,
    enabled: !!currentUser?.id,
  })

  const tracks = data?.pages.flatMap((p) => p.collection.map((i) => i.track)) ?? []

  // Clamp selectedIndex to valid range
  useEffect(() => {
    if (tracks.length > 0 && selectedIndex >= tracks.length) {
      setSelectedIndex(tracks.length - 1)
    }
  }, [selectedIndex, tracks.length, setSelectedIndex])

  // CENTER = play selected track + go to now playing
  useEffect(() => {
    registerCenterAction(() => {
      const track = tracks[selectedIndex]
      if (!track) return
      playTrack(track, tracks)
      push({ id: 'now-playing' })
    })
  }, [selectedIndex, tracks, playTrack, push])

  // Touch swipe in touch mode
  const bind = useDrag(({ last, movement: [mx], velocity: [vx] }) => {
    if (!last) return
    if (Math.abs(mx) > 30 || Math.abs(vx) > 0.2) {
      if (mx < 0 && selectedIndex < tracks.length - 1) setSelectedIndex(selectedIndex + 1)
      else if (mx > 0 && selectedIndex > 0) setSelectedIndex(selectedIndex - 1)
    }
  }, { filterTaps: true, axis: 'x' })

  if (!currentUser) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Sign in to see liked tracks</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Loading...</div>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ color: '#8a8a8a', fontSize: '13px' }}>No liked tracks</div>
      </div>
    )
  }

  const selectedTrack = tracks[Math.min(selectedIndex, tracks.length - 1)]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000', overflow: 'hidden' }}>

      {/* 3D carousel */}
      <div
        {...(controlMode === 'touch' ? bind() : {})}
        style={{
          flex: '1 1 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          touchAction: controlMode === 'touch' ? 'none' : 'auto',
          userSelect: 'none',
          position: 'relative',
        }}
      >
        {/* Positioning anchor — covers are absolute relative to this */}
        <div
          style={{
            position: 'relative',
            width: `${COVER_SIZE}px`,
            height: `${COVER_SIZE}px`,
          }}
        >
          {OFFSETS.map(offset => {
            const trackIndex = selectedIndex + offset
            if (trackIndex < 0 || trackIndex >= tracks.length) return null
            const track = tracks[trackIndex]
            const artworkUrl = track.artwork_url?.replace('-large', '-t300x300') ?? null

            return (
              <div
                key={track.id}
                className={offset === 0 ? 'coverflow-cover' : ''}
                onPointerDown={() => {
                  if (offset !== 0) setSelectedIndex(trackIndex)
                  else {
                    playTrack(track, tracks)
                    push({ id: 'now-playing' })
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${COVER_SIZE}px`,
                  height: `${COVER_SIZE}px`,
                  transform: getCoverTransform(offset),
                  opacity: getCoverOpacity(offset),
                  zIndex: 10 - Math.abs(offset),
                  transition: 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.28s',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    background: '#1a1a1a',
                    boxShadow: offset === 0
                      ? '0 8px 32px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6)'
                      : '0 4px 12px rgba(0,0,0,0.6)',
                  }}
                >
                  {artworkUrl ? (
                    <img
                      src={artworkUrl}
                      alt={track.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      draggable={false}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      background: 'linear-gradient(135deg, #1e3a5f, #0a1628)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="#3a5a8a">
                        <path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Track info */}
      {selectedTrack && (
        <div style={{
          flexShrink: 0,
          textAlign: 'center',
          padding: '8px 24px 14px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 40%, #000 100%)',
        }}>
          <div style={{
            fontSize: '13px', fontWeight: 600, color: '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {selectedTrack.title}
          </div>
          <div style={{
            fontSize: '11px', color: '#8a8a8a', marginTop: '2px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {selectedTrack.user.username}
          </div>
        </div>
      )}
    </div>
  )
}
