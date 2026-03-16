import { atom, useAtom } from 'jotai'
import type { ScTrack } from '@/lib/api'

const STORAGE_KEY = 'sc_on_the_go'

function load(): ScTrack[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(tracks: ScTrack[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks))
  } catch { /* quota exceeded — ignore */ }
}

const _atom = atom<ScTrack[]>(load())

export const onTheGoAtom = atom(
  (get) => get(_atom),
  (_get, set, updater: ScTrack[] | ((prev: ScTrack[]) => ScTrack[])) => {
    set(_atom, (prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      save(next)
      return next
    })
  },
)

export function useOnTheGo() {
  const [tracks, setTracks] = useAtom(onTheGoAtom)

  const addTrack = (track: ScTrack) => {
    setTracks(prev =>
      prev.some(t => t.id === track.id) ? prev : [...prev, track]
    )
  }

  const removeTrack = (trackId: number) => {
    setTracks(prev => prev.filter(t => t.id !== trackId))
  }

  const clear = () => setTracks([])

  return { tracks, addTrack, removeTrack, clear }
}
