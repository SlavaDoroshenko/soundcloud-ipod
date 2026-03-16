import { useEffect } from 'react'
import { useNavigation, registerCenterAction } from '@/stores/navigation'
import { usePlayer } from '@/hooks/usePlayer'
import { useOnTheGo } from '@/stores/onthego'
import MenuScreen, { type MenuItem } from '@/components/ipod/MenuScreen'

export default function OnTheGoScreen() {
  const { selectedIndex, setSelectedIndex } = useNavigation()
  const { playTrack } = usePlayer()
  const { tracks, clear } = useOnTheGo()

  const trackItems: MenuItem[] = tracks.map((track) => ({
    label: track.title,
    sublabel: track.user.username,
    rightArrow: false,
    onTap: () => playTrack(track, tracks),
  }))

  const clearItem: MenuItem = {
    label: 'Clear On-The-Go',
    rightArrow: false,
    onTap: clear,
  }

  const items: MenuItem[] = tracks.length > 0
    ? [...trackItems, clearItem]
    : [{ label: 'Empty', rightArrow: false, onTap: () => {} }]

  useEffect(() => {
    registerCenterAction(() => items[selectedIndex]?.onTap?.())
  }, [selectedIndex, items])

  return (
    <MenuScreen
      items={items}
      selectedIndex={selectedIndex}
      onSelectIndex={setSelectedIndex}
    />
  )
}
