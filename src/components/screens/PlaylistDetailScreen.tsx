import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigation, registerCenterAction } from '@/stores/navigation'
import { usePlayer } from '@/hooks/usePlayer'
import { sc } from '@/lib/api'
import MenuScreen, { type MenuItem } from '@/components/ipod/MenuScreen'

type Props = { playlistId: number }


export default function PlaylistDetailScreen({ playlistId }: Props) {
  const { selectedIndex, setSelectedIndex, push } = useNavigation()
  const { playTrack } = usePlayer()

  const { data: playlist, isLoading, isError } = useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: () => sc.playlist(playlistId),
    staleTime: 5 * 60_000,
  })

  const tracks = playlist?.tracks ?? []

  const items: MenuItem[] = tracks.map(track => ({
    label: track.title,
    sublabel: track.user.username,
    artwork: (track.artwork_url ?? track.user.avatar_url)?.replace('-large', '-t200x200') ?? null,
    rightArrow: false,
    onTap: () => {
      playTrack(track, tracks)
      push({ id: 'now-playing' })
    },
  }))

  useEffect(() => {
    registerCenterAction(() => items[selectedIndex]?.onTap?.())
  }, [selectedIndex, items])

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Loading…</div>
    </div>
  )

  if (isError || tracks.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ color: '#8a8a8a', fontSize: '13px' }}>
        {isError ? 'Failed to load' : 'Empty playlist'}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Playlist header */}
      <div style={{
        padding: '4px 12px',
        fontSize: '10px',
        color: '#8a8a8a',
        borderBottom: '1px solid #1e1e1e',
        background: '#0a0a0a',
        flexShrink: 0,
      }}>
        {playlist?.title} · {tracks.length} tracks
      </div>
      <MenuScreen
        items={items}
        selectedIndex={selectedIndex}
        onSelectIndex={setSelectedIndex}
      />
    </div>
  )
}
