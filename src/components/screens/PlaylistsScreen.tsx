import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { currentUserAtom } from '@/stores/auth'
import { useNavigation, registerCenterAction } from '@/stores/navigation'
import { sc } from '@/lib/api'
import MenuScreen, { type MenuItem } from '@/components/ipod/MenuScreen'

export default function PlaylistsScreen() {
  const { push, selectedIndex, setSelectedIndex } = useNavigation()
  const currentUser = useAtomValue(currentUserAtom)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['playlists', currentUser?.id],
    queryFn: () => sc.playlists(currentUser!.id),
    staleTime: 5 * 60_000,
    enabled: !!currentUser?.id,
  })

  const playlists = data?.collection ?? []

  const items: MenuItem[] = playlists.map(pl => ({
    label: pl.title,
    sublabel: `${pl.track_count}`,
    onTap: () => push({ id: 'playlist-detail', playlistId: pl.id }),
  }))

  useEffect(() => {
    registerCenterAction(() => items[selectedIndex]?.onTap?.())
  }, [selectedIndex, items])

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ color: '#8a8a8a', fontSize: '13px' }}>Loading…</div>
    </div>
  )

  if (isError || playlists.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ color: '#8a8a8a', fontSize: '13px' }}>
        {isError ? 'Failed to load' : 'No playlists'}
      </div>
    </div>
  )

  return (
    <MenuScreen
      items={items}
      selectedIndex={selectedIndex}
      onSelectIndex={setSelectedIndex}
    />
  )
}
