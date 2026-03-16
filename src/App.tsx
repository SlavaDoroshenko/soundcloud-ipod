import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { isAuthenticatedAtom, currentUserAtom, saveUserCache } from '@/stores/auth'
import { likedTrackIdsAtom } from '@/stores/player'
import { usePlayerSync } from '@/hooks/usePlayer'
import { sc, fetchAllLikedTrackIds } from '@/lib/api'
import { currentEntryAtom } from '@/stores/navigation'
import { controlModeAtom } from '@/stores/settings'
import IpodShell from '@/components/ipod/IpodShell'
import MainMenu from '@/components/screens/MainMenu'
import MusicMenu from '@/components/screens/MusicMenu'
import FeedScreen from '@/components/screens/FeedScreen'
import SettingsScreen from '@/components/screens/SettingsScreen'
import NowPlayingScreen from '@/components/screens/NowPlayingScreen'
import NowPlayingTouchScreen from '@/components/screens/NowPlayingTouchScreen'
import LikedScreen from '@/components/screens/LikedScreen'
import SearchScreen from '@/components/screens/SearchScreen'
import PlaylistsScreen from '@/components/screens/PlaylistsScreen'
import SongsScreen from '@/components/screens/SongsScreen'
import ArtistsScreen from '@/components/screens/ArtistsScreen'
import AlbumsScreen from '@/components/screens/AlbumsScreen'
import DownloadsScreen from '@/components/screens/DownloadsScreen'
import CoverFlowScreen from '@/components/screens/CoverFlowScreen'
import ContextMenuScreen from '@/components/screens/ContextMenuScreen'
import PlaylistDetailScreen from '@/components/screens/PlaylistDetailScreen'
import OnTheGoScreen from '@/components/screens/OnTheGoScreen'

function ScreenRenderer() {
  const entry = useAtomValue(currentEntryAtom)
  const screen = entry.screen
  const controlMode = useAtomValue(controlModeAtom)

  switch (screen.id) {
    case 'main': return <MainMenu />
    case 'music': return <MusicMenu />
    case 'feed': return <FeedScreen />
    case 'settings': return <SettingsScreen />
    case 'now-playing': return controlMode === 'touch' ? <NowPlayingTouchScreen /> : <NowPlayingScreen />
    case 'liked': return <LikedScreen />
    case 'search': return <SearchScreen />
    case 'playlists': return <PlaylistsScreen />
    case 'on-the-go': return <OnTheGoScreen />
    case 'playlist-detail': return <PlaylistDetailScreen playlistId={screen.playlistId} />
    case 'songs': return <SongsScreen />
    case 'artists': return <ArtistsScreen />
    case 'albums': return <AlbumsScreen />
    case 'downloads': return <DownloadsScreen />
    case 'cover-flow': return <CoverFlowScreen />
    case 'context-menu': return <ContextMenuScreen track={screen.track} />
    default: return <MainMenu />
  }
}

export default function App() {
  usePlayerSync()
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const currentUser = useAtomValue(currentUserAtom)
  const setUser = useSetAtom(currentUserAtom)
  const setLikedIds = useSetAtom(likedTrackIdsAtom)

  // Restore user profile after app restart
  useEffect(() => {
    if (!isAuthenticated) return
    sc.me().then(user => { setUser(user); saveUserCache(user) }).catch(() => {})
  }, [isAuthenticated, setUser])

  // Load all liked track IDs on startup
  useEffect(() => {
    if (!currentUser?.id) return
    fetchAllLikedTrackIds(currentUser.id)
      .then(ids => setLikedIds(ids))
      .catch(() => {})
  }, [currentUser?.id, setLikedIds])

  return (
    <IpodShell>
      <ScreenRenderer />
    </IpodShell>
  )
}
