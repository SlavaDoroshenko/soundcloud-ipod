import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { likedTrackIdsAtom } from '@/stores/player'
import { useNavigation, registerCenterAction } from '@/stores/navigation'
import { usePlayer } from '@/hooks/usePlayer'
import { useOnTheGo } from '@/stores/onthego'
import { useDownloads } from '@/stores/downloads'
import MenuScreen, { type MenuItem } from '@/components/ipod/MenuScreen'
import type { ScTrack } from '@/lib/api'

type Props = { track: ScTrack }

export default function ContextMenuScreen({ track }: Props) {
  const { pop, selectedIndex, setSelectedIndex } = useNavigation()
  const { toggleLike, isAuthenticated } = usePlayer()
  const { addTrack } = useOnTheGo()
  const { ids: downloadedIds, download, progress } = useDownloads()
  const likedIds = useAtomValue(likedTrackIdsAtom)

  const isLiked = likedIds.has(track.id)
  const isDownloaded = downloadedIds.has(track.id)
  const dlProgress = progress.get(track.id)
  const isDownloading = dlProgress !== undefined

  const items: MenuItem[] = [
    isAuthenticated && {
      label: isLiked ? 'Unlike' : 'Like',
      rightArrow: false,
      onTap: async () => { await toggleLike(); pop() },
    },
    {
      label: 'Add to On-The-Go',
      rightArrow: false,
      onTap: () => { addTrack(track); pop() },
    },
    {
      label: isDownloaded
        ? 'Downloaded ✓'
        : isDownloading
          ? `Downloading ${Math.round((dlProgress ?? 0) * 100)}%`
          : 'Download',
      rightArrow: false,
      onTap: () => {
        if (!isDownloaded && !isDownloading) download(track)
        pop()
      },
    },
    {
      label: 'Cancel',
      rightArrow: false,
      onTap: () => pop(),
    },
  ].filter(Boolean) as MenuItem[]

  useEffect(() => {
    registerCenterAction(() => items[selectedIndex]?.onTap?.())
  }, [selectedIndex, items])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Track info header */}
      <div style={{
        padding: '8px 12px 6px',
        borderBottom: '1px solid #1e1e1e',
        background: '#0a0a0a',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: '12px', fontWeight: 600, color: '#fff',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {track.title}
        </div>
        <div style={{ fontSize: '11px', color: '#8a8a8a', marginTop: '1px' }}>
          {track.user.username}
        </div>
      </div>

      <MenuScreen
        items={items}
        selectedIndex={selectedIndex}
        onSelectIndex={setSelectedIndex}
      />
    </div>
  )
}
