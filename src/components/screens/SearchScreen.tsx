import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQuery } from '@tanstack/react-query'
import { sc } from '@/lib/api'
import { currentTrackAtom } from '@/stores/player'
import { usePlayer } from '@/hooks/usePlayer'
import { useNavigation } from '@/stores/navigation'

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const currentTrack = useAtomValue(currentTrackAtom)
  const { playTrack } = usePlayer()
  const { push } = useNavigation()

  const { data, isLoading } = useQuery({
    queryKey: ['search', submitted],
    queryFn: () => sc.search(submitted, 30),
    enabled: submitted.length > 0,
  })

  const tracks = data?.collection ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div style={{
        padding: '6px 8px',
        borderBottom: '1px solid #1e1e1e',
        background: '#0a0a0a',
        flexShrink: 0,
      }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setSubmitted(query.trim())}
          placeholder="Search tracks..."
          style={{
            width: '100%',
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: '8px',
            padding: '5px 10px',
            color: '#fff',
            fontSize: '13px',
            outline: 'none',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'none' }}>
        {isLoading && (
          <div className="flex items-center justify-center h-24">
            <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Searching...</div>
          </div>
        )}

        {!isLoading && submitted && tracks.length === 0 && (
          <div className="flex items-center justify-center h-24">
            <div style={{ color: '#8a8a8a', fontSize: '13px' }}>No results</div>
          </div>
        )}

        {tracks.map((track) => {
          const isActive = currentTrack?.id === track.id
          const artwork = (track.artwork_url ?? track.user.avatar_url)?.replace('-large', '-t200x200')

          return (
            <div
              key={track.id}
              onPointerDown={() => {
                playTrack(track, tracks)
                push({ id: 'now-playing' })
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 10px',
                borderBottom: '1px solid #1e1e1e',
                background: isActive ? 'rgba(91,174,248,0.1)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '4px',
                overflow: 'hidden', flexShrink: 0, background: '#1a1a1a',
              }}>
                {artwork && <img src={artwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{
                  fontSize: '13px', fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#5baef8' : '#fff',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {track.title}
                </div>
                <div style={{ fontSize: '11px', color: '#8a8a8a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
                  {track.user.username}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
