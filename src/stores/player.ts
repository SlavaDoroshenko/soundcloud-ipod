import { atom } from 'jotai'
import type { ScTrack } from '@/lib/api'

export const currentTrackAtom = atom<ScTrack | null>(null)
export const queueAtom = atom<ScTrack[]>([])
export const queueIndexAtom = atom<number>(-1)
export const isPlayingAtom = atom<boolean>(false)
export const isLoadingAtom = atom<boolean>(false)
export const currentTimeAtom = atom<number>(0)
export const durationAtom = atom<number>(0)
export const volumeAtom = atom<number>(1)

export type RepeatMode = 'off' | 'one' | 'all'
export const shuffleAtom = atom<boolean>(false)
export const repeatModeAtom = atom<RepeatMode>('off')

export const isNowPlayingOpenAtom = atom<boolean>(false)
export const isLikedAtom = atom<boolean>(false)
export const likedTrackIdsAtom = atom<Set<number>>(new Set<number>())

// Derived
export const hasQueueAtom = atom((get) => get(queueAtom).length > 0)
export const canPlayPrevAtom = atom((get) => get(queueIndexAtom) > 0)
export const canPlayNextAtom = atom((get) => {
  const idx = get(queueIndexAtom)
  const len = get(queueAtom).length
  return idx < len - 1
})
