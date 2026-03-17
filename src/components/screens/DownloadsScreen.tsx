import { useEffect } from 'react'
import { useNavigation, registerCenterAction } from '@/stores/navigation'
import { usePlayer } from '@/hooks/usePlayer'
import { useDownloads } from '@/stores/downloads'

import MenuScreen, { type MenuItem } from '@/components/ipod/MenuScreen'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function DownloadsScreen() {
  const { selectedIndex, setSelectedIndex } = useNavigation()
  const { playTrack } = usePlayer()
  const { downloads } = useDownloads()

  const totalSize = downloads.reduce((sum, d) => sum + d.fileSize, 0)

  const items: MenuItem[] = downloads.map(dl => ({
    label: dl.track.title,
    sublabel: dl.track.user.username,
    artwork: (dl.track.artwork_url ?? dl.track.user.avatar_url)?.replace('-large', '-t200x200') ?? null,
    rightArrow: false,
    onTap: () => playTrack(dl.track, downloads.map(d => d.track)),
  }))

  useEffect(() => {
    registerCenterAction(() => items[selectedIndex]?.onTap?.())
  }, [selectedIndex, items])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Storage info header */}
      {downloads.length > 0 && (
        <div style={{
          padding: '4px 12px',
          fontSize: '10px',
          color: '#8a8a8a',
          borderBottom: '1px solid #1e1e1e',
          background: '#0a0a0a',
          flexShrink: 0,
        }}>
          {downloads.length} tracks · {formatBytes(totalSize)}
        </div>
      )}

      {downloads.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div style={{ color: '#8a8a8a', fontSize: '13px' }}>No downloads</div>
        </div>
      ) : (
        <MenuScreen
          items={items}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
        />
      )}
    </div>
  )
}
