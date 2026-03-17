import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { useQuery } from '@tanstack/react-query'
import { sc } from '@/lib/api'
import { currentTrackAtom } from '@/stores/player'
import { usePlayer } from '@/hooks/usePlayer'
import { useNavigation } from '@/stores/navigation'
import MenuScreen, { type MenuItem } from '@/components/ipod/MenuScreen'

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const currentTrack = useAtomValue(currentTrackAtom)
  const { playTrack } = usePlayer()
  const { selectedIndex, setSelectedIndex, push } = useNavigation()

  const { data, isLoading } = useQuery({
    queryKey: ['search', submitted],
    queryFn: () => sc.search(submitted, 30),
    enabled: submitted.length > 0,
  })

  const tracks = data?.collection ?? []

  const items: MenuItem[] = tracks.map((track) => ({
    label: track.title,
    sublabel: track.user.username,
    artwork: (track.artwork_url ?? track.user.avatar_url)?.replace('-large', '-t200x200') ?? null,
    isActive: currentTrack?.id === track.id,
    rightArrow: false,
    onTap: () => {
      playTrack(track, tracks)
      push({ id: 'now-playing' })
    },
  }))

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
      <div className="flex-1 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Searching...</div>
          </div>
        )}

        {!isLoading && submitted && tracks.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div style={{ color: '#8a8a8a', fontSize: '13px' }}>No results</div>
          </div>
        )}

        {!isLoading && tracks.length > 0 && (
          <MenuScreen
            items={items}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
          />
        )}
      </div>
    </div>
  )
}
