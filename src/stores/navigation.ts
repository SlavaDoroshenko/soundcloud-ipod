import { atom, useAtomValue, useSetAtom } from 'jotai'
import type { ScTrack } from '@/lib/api'

export type Screen =
  | { id: 'main' }
  | { id: 'music' }
  | { id: 'feed' }
  | { id: 'playlists' }
  | { id: 'playlist-detail'; playlistId: number }
  | { id: 'on-the-go' }
  | { id: 'liked' }
  | { id: 'artists' }
  | { id: 'artist-detail'; artistId: number }
  | { id: 'albums' }
  | { id: 'album-detail'; albumId: number }
  | { id: 'songs' }
  | { id: 'downloads' }
  | { id: 'search' }
  | { id: 'now-playing' }
  | { id: 'settings' }
  | { id: 'context-menu'; track: ScTrack }
  | { id: 'cover-flow' }

export type StackEntry = { screen: Screen; selectedIndex: number }

export const navigationStackAtom = atom<StackEntry[]>([
  { screen: { id: 'main' }, selectedIndex: 0 },
])

export const currentEntryAtom = atom(
  (get) => get(navigationStackAtom).at(-1)!,
)

export const canPopAtom = atom(
  (get) => get(navigationStackAtom).length > 1,
)

export const screenTitleAtom = atom((get) => {
  const screen = get(currentEntryAtom).screen
  switch (screen.id) {
    case 'main': return 'SoundCloud iPod'
    case 'music': return 'Music'
    case 'feed': return 'Feed'
    case 'playlists': return 'Playlists'
    case 'playlist-detail': return 'Playlist'
    case 'on-the-go': return 'On-The-Go'
    case 'liked': return 'Liked Tracks'
    case 'artists': return 'Artists'
    case 'artist-detail': return 'Artist'
    case 'albums': return 'Albums'
    case 'album-detail': return 'Album'
    case 'songs': return 'Songs'
    case 'downloads': return 'Downloads'
    case 'search': return 'Search'
    case 'now-playing': return 'Now Playing'
    case 'settings': return 'Settings'
    case 'context-menu': return screen.track.title
    case 'cover-flow': return 'Cover Flow'
    default: return ''
  }
})

// Module-level CENTER action registry.
// Each active screen registers what CENTER button should do.
// ClickWheel calls triggerCenterAction() on center press.
let _centerAction: (() => void) | null = null

export function registerCenterAction(fn: () => void) {
  _centerAction = fn
}

export function triggerCenterAction() {
  _centerAction?.()
}

// CENTER hold (500ms) action — e.g. context menu
let _centerHoldAction: (() => void) | null = null

export function registerCenterHoldAction(fn: (() => void) | null) {
  _centerHoldAction = fn
}

export function triggerCenterHoldAction() {
  _centerHoldAction?.()
}

// Scroll override — active screen can steal scroll (e.g. NowPlaying → volume)
// Returns true if the action was handled, false if default scroll should proceed
let _scrollAction: ((delta: number) => void) | null = null

export function registerScrollAction(fn: ((delta: number) => void) | null) {
  _scrollAction = fn
}

export function triggerScrollAction(delta: number): boolean {
  if (_scrollAction) {
    _scrollAction(delta)
    return true
  }
  return false
}

export function useNavigation() {
  const stack = useAtomValue(navigationStackAtom)
  const setStack = useSetAtom(navigationStackAtom)
  const entry = useAtomValue(currentEntryAtom)
  const canPop = useAtomValue(canPopAtom)

  const push = (screen: Screen) => {
    setStack((s) => [...s, { screen, selectedIndex: 0 }])
  }

  const pop = () => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  }

  const setSelectedIndex = (index: number) => {
    setStack((s) => {
      const next = [...s]
      next[next.length - 1] = { ...next[next.length - 1], selectedIndex: index }
      return next
    })
  }

  // Безопасен при momentum: читает актуальный state, не замыкание
  const scrollSelectedIndex = (delta: number) => {
    setStack((s) => {
      const next = [...s]
      const current = next[next.length - 1]
      const newIdx = Math.max(0, current.selectedIndex + delta)
      next[next.length - 1] = { ...current, selectedIndex: newIdx }
      return next
    })
  }

  return {
    screen: entry.screen,
    selectedIndex: entry.selectedIndex,
    stack,
    canPop,
    push,
    pop,
    setSelectedIndex,
    scrollSelectedIndex,
  }
}
