import MenuScreen from '@/components/ipod/MenuScreen'
import { useNavigation } from '@/stores/navigation'

export default function MusicMenu() {
  const { push, selectedIndex, setSelectedIndex } = useNavigation()

  const items = [
    {
      label: 'Cover Flow',
      rightArrow: true,
      onTap: () => push({ id: 'cover-flow' }),
    },
    {
      label: 'Playlists',
      rightArrow: true,
      onTap: () => push({ id: 'playlists' }),
    },
    {
      label: 'Liked Tracks',
      rightArrow: true,
      onTap: () => push({ id: 'liked' }),
    },
    {
      label: 'Artists',
      rightArrow: true,
      onTap: () => push({ id: 'artists' }),
    },
    {
      label: 'Albums',
      rightArrow: true,
      onTap: () => push({ id: 'albums' }),
    },
    {
      label: 'Songs',
      rightArrow: true,
      onTap: () => push({ id: 'songs' }),
    },
    {
      label: 'Downloads',
      rightArrow: true,
      onTap: () => push({ id: 'downloads' }),
    },
    {
      label: 'Search',
      rightArrow: true,
      onTap: () => push({ id: 'search' }),
    },
  ]

  return (
    <MenuScreen
      items={items}
      selectedIndex={selectedIndex}
      onSelectIndex={setSelectedIndex}
    />
  )
}
