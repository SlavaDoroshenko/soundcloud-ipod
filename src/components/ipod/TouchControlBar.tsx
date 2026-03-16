import { useAtomValue } from 'jotai'
import { currentTrackAtom, isPlayingAtom } from '@/stores/player'
import { usePlayer } from '@/hooks/usePlayer'
import { useNavigation } from '@/stores/navigation'

export default function TouchControlBar() {
  const track = useAtomValue(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const { togglePlay, playNext, playPrev } = usePlayer()
  const { push } = useNavigation()

  const artworkUrl = track?.artwork_url?.replace('-large', '-t60x60') ?? null

  return (
    <div style={{
      height: '64px',
      flexShrink: 0,
      background: 'linear-gradient(to bottom, #111, #0a0a0a)',
      borderTop: '1px solid #2a2a2a',
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
      paddingBottom: 'env(safe-area-inset-bottom)',
      gap: '0',
    }}>
      {/* Prev */}
      <button
        onPointerDown={() => playPrev()}
        style={{ flexShrink: 0, background: 'none', border: 'none', padding: '0 14px', cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
          <path d="M19 20L9 12l10-8v16zM5 4h2v16H5V4z" />
        </svg>
      </button>

      {/* Track info — tap → Now Playing */}
      <div
        onPointerDown={() => push({ id: 'now-playing' })}
        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', overflow: 'hidden', height: '100%' }}
      >
        {/* Thumbnail */}
        <div style={{
          width: '40px', height: '40px', flexShrink: 0,
          borderRadius: '4px', overflow: 'hidden',
          background: '#1a1a1a',
        }}>
          {artworkUrl && (
            <img src={artworkUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>

        {/* Title + Artist */}
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{
            fontSize: '13px', fontWeight: 600, color: '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {track?.title ?? 'Not playing'}
          </div>
          {track && (
            <div style={{ fontSize: '11px', color: '#8a8a8a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {track.user.username}
            </div>
          )}
        </div>
      </div>

      {/* Play / Pause */}
      <button
        onPointerDown={() => togglePlay()}
        style={{ flexShrink: 0, background: 'none', border: 'none', padding: '0 14px', cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center' }}
      >
        {isPlaying ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
            <rect x="5" y="3" width="4" height="18" rx="1" />
            <rect x="15" y="3" width="4" height="18" rx="1" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
        )}
      </button>

      {/* Next */}
      <button
        onPointerDown={() => playNext()}
        style={{ flexShrink: 0, background: 'none', border: 'none', padding: '0 14px', cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
          <path d="M5 4l10 8-10 8V4zM19 4h2v16h-2V4z" />
        </svg>
      </button>
    </div>
  )
}
