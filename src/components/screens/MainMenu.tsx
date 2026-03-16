import { useAtomValue } from 'jotai'
import MenuScreen from '@/components/ipod/MenuScreen'
import { useNavigation } from '@/stores/navigation'
import { currentTrackAtom } from '@/stores/player'

export default function MainMenu() {
  const { push, selectedIndex, setSelectedIndex } = useNavigation()
  const currentTrack = useAtomValue(currentTrackAtom)

  const items = [
    {
      label: 'Music',
      rightArrow: true,
      onTap: () => push({ id: 'music' }),
    },
    {
      label: 'Feed',
      rightArrow: true,
      onTap: () => push({ id: 'feed' }),
    },
    ...(currentTrack
      ? [{
          label: 'Now Playing',
          rightArrow: true,
          onTap: () => push({ id: 'now-playing' }),
        }]
      : []),
    {
      label: 'Settings',
      rightArrow: true,
      onTap: () => push({ id: 'settings' }),
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
