import { useEffect, useCallback } from 'react'
import { db } from '@/lib/downloads'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import {
  currentTrackAtom,
  queueAtom,
  queueIndexAtom,
  isPlayingAtom,
  isLoadingAtom,
  currentTimeAtom,
  durationAtom,
  canPlayNextAtom,
  canPlayPrevAtom,
  isLikedAtom,
  likedTrackIdsAtom,
} from '@/stores/player'
import { isAuthenticatedAtom, currentUserAtom } from '@/stores/auth'
import {
  loadTrack,
  play,
  pause,
  togglePlay,
  seek,
  setVolume,
  subscribePlayer,
  getPlayerState,
  setMediaSessionCallbacks,
  setPlayerError,
  setPlayerErrorCallback,
  resetRetryCount,
  onTrackEnded,
  setPlayerQueue,
  preloadNextTrack,
  setAutoAdvanceCallback,
  setQueueExtendedCallback,
  isNative,
} from '@/lib/player'
import { LockScreen } from '@/lib/native/LockScreen'
import { sc, invalidateLikedIdsCache } from '@/lib/api'
import type { ScTrack } from '@/lib/api'

// Module-level remote callbacks — обновляются из usePlayer, используются в одном listener
let _remoteNext: (() => void) | null = null
let _remotePrev: (() => void) | null = null
let _lockScreenListenersSetup = false

function setupLockScreenListeners() {
  if (_lockScreenListenersSetup || !isNative) return
  _lockScreenListenersSetup = true
  LockScreen.addListener('remotePlay',  () => play())
  LockScreen.addListener('remotePause', () => pause())
  LockScreen.addListener('remoteNext',  () => _remoteNext?.())
  LockScreen.addListener('remotePrev',  () => _remotePrev?.())
  LockScreen.addListener('remoteSeek',  (d: { position: number }) => seek(d.position))
}

/** Синхронизирует нативный audio с Jotai atoms */
export function usePlayerSync() {
  const setIsPlaying = useSetAtom(isPlayingAtom)
  const setIsLoading = useSetAtom(isLoadingAtom)
  const setCurrentTime = useSetAtom(currentTimeAtom)
  const setDuration = useSetAtom(durationAtom)

  useEffect(() => {
    const unsubscribe = subscribePlayer(() => {
      const s = getPlayerState()
      setIsPlaying(s.isPlaying)
      setIsLoading(s.isLoading)
      setCurrentTime(s.currentTime)
      setDuration(s.duration)
    })
    return () => { unsubscribe() }
  }, [setIsPlaying, setIsLoading, setCurrentTime, setDuration])
}


/** Основной хук для управления плеером */
export function usePlayer() {
  const [queue, setQueue] = useAtom(queueAtom)
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom)
  const currentTrack = useAtomValue(currentTrackAtom)
  const setCurrentTrack = useSetAtom(currentTrackAtom)
  const isPlaying = useAtomValue(isPlayingAtom)
  const isLoading = useAtomValue(isLoadingAtom)
  const currentTime = useAtomValue(currentTimeAtom)
  const duration = useAtomValue(durationAtom)
  const canPlayNext = useAtomValue(canPlayNextAtom)
  const canPlayPrev = useAtomValue(canPlayPrevAtom)
  const [isLiked, setIsLiked] = useAtom(isLikedAtom)
  const [likedIds, setLikedIds] = useAtom(likedTrackIdsAtom)
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const currentUser = useAtomValue(currentUserAtom)
  const queryClient = useQueryClient()

  // Sync like state from the liked IDs set (loaded at app startup)
  useEffect(() => {
    setIsLiked(currentTrack ? likedIds.has(currentTrack.id) : false)
  }, [currentTrack?.id, likedIds, setIsLiked])

  const toggleLike = useCallback(async () => {
    if (!isAuthenticated || !currentTrack || !currentUser) return
    const next = !isLiked
    // Optimistic update
    setIsLiked(next)
    setLikedIds(prev => {
      const s = new Set(prev)
      if (next) s.add(currentTrack.id); else s.delete(currentTrack.id)
      return s
    })
    try {
      if (next) await sc.like(currentTrack.id, currentUser.id)
      else await sc.unlike(currentTrack.id, currentUser.id)
      queryClient.invalidateQueries({ queryKey: ['likes', currentUser.id] })
    } catch {
      // Revert
      setIsLiked(!next)
      setLikedIds(prev => {
        const s = new Set(prev)
        if (next) s.delete(currentTrack.id); else s.add(currentTrack.id)
        return s
      })
    }
    invalidateLikedIdsCache()
  }, [isAuthenticated, currentTrack, currentUser, isLiked, setIsLiked, setLikedIds, queryClient])

  const playTrackAtIndex = useCallback(async (idx: number, q: ScTrack[]) => {
    const track = q[idx]
    if (!track) return

    resetRetryCount() // новый трек — сбросить счётчик retry
    setCurrentTrack(track)
    setQueueIndex(idx)
    setPlayerQueue(q, idx)

    try {
      // Offline-first: use downloaded file if available (file:// → AVPlayer → LockScreen works)
      let streamUrl: string
      const downloaded = await db.downloads.get(track.id)
      if (downloaded) {
        streamUrl = downloaded.filePath
      } else {
        const transcoding = sc.streams(track)
        if (!transcoding) throw new Error('Нет доступного потока')
        streamUrl = await sc.resolveStreamUrl(transcoding)
      }
      await loadTrack(track, streamUrl)
      play()

      // Обновляем экран блокировки iOS
      if (isNative) {
        const artworkUrl = track.artwork_url?.replace('-large', '-t500x500') ?? undefined
        LockScreen.updateNowPlaying({
          title: track.title,
          artist: track.user.username,
          duration: 0, // обновится через 'progress' event
          currentTime: 0,
          isPlaying: true,
          artworkUrl,
          isLiked: false, // usePlayer.toggleLike обновит отдельно
        }).catch(() => {})
      }

      // Предзагружаем следующий трек в неактивный <audio> элемент.
      // inactive().load() — буферизация на уровне OS, работает с заблокированным экраном.
      const nextTrack = q[idx + 1]
      if (nextTrack) {
        const nextTranscoding = sc.streams(nextTrack)
        if (nextTranscoding) {
          sc.resolveStreamUrl(nextTranscoding)
            .then(url => preloadNextTrack(url))
            .catch(() => {})
        }
      }
    } catch (err) {
      console.error('Ошибка загрузки трека:', err)
      setPlayerError(err instanceof Error ? err.message : String(err))
    }
  }, [setCurrentTrack, setQueueIndex])

  const playTrack = useCallback(async (track: ScTrack, newQueue?: ScTrack[]) => {
    const q = newQueue ?? [track]
    const idx = q.findIndex(t => t.id === track.id)
    setQueue(q)
    await playTrackAtIndex(idx >= 0 ? idx : 0, q)
  }, [setQueue, playTrackAtIndex])

  const playNext = useCallback(async () => {
    if (!canPlayNext) return
    await playTrackAtIndex(queueIndex + 1, queue)
  }, [canPlayNext, queueIndex, queue, playTrackAtIndex])

  const playPrev = useCallback(async () => {
    if (!canPlayPrev) return
    await playTrackAtIndex(queueIndex - 1, queue)
  }, [canPlayPrev, queueIndex, queue, playTrackAtIndex])

  useEffect(() => {
    setMediaSessionCallbacks(playPrev, playNext)
    // Обновляем module-level callbacks для нативного экрана блокировки
    _remoteNext = playNext
    _remotePrev = playPrev
    setupLockScreenListeners()
  }, [playPrev, playNext])

  // Синхронизируем Jotai atoms при автопереключении из player.ts (заблокированный экран)
  useEffect(() => {
    setAutoAdvanceCallback((track, idx) => {
      setCurrentTrack(track)
      setQueueIndex(idx)
    })
    return () => setAutoAdvanceCallback(null)
  }, [setCurrentTrack, setQueueIndex])

  // Синхронизируем queueAtom когда player.ts расширяет очередь (queue extender)
  useEffect(() => {
    setQueueExtendedCallback((newTracks) => {
      setQueue(prev => [...prev, ...newTracks])
    })
    return () => setQueueExtendedCallback(null)
  }, [setQueue])

  // Retry при ошибке AVPlayer (истёкший CDN URL и т.п.) — переполучаем URL и перезагружаем
  useEffect(() => {
    setPlayerErrorCallback(async (track) => {
      try {
        const downloaded = await db.downloads.get(track.id)
        let streamUrl: string
        if (downloaded) {
          streamUrl = downloaded.filePath
        } else {
          const transcoding = sc.streams(track)
          if (!transcoding) throw new Error('Нет доступного потока')
          streamUrl = await sc.resolveStreamUrl(transcoding)
        }
        await loadTrack(track, streamUrl)
        play()
      } catch (err) {
        setPlayerError(err instanceof Error ? err.message : String(err))
      }
    })
    return () => setPlayerErrorCallback(null)
  }, [])

  // Fallback: если предзагруженный URL недоступен, даём React попробовать
  useEffect(() => {
    const unsubscribe = onTrackEnded(() => { playNext().catch(console.error) })
    return () => { unsubscribe() }
  }, [playNext])

  return {
    queue,
    queueIndex,
    currentTrack,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    canPlayNext,
    canPlayPrev,
    isLiked,
    isAuthenticated,
    playTrack,
    playNext,
    playPrev,
    togglePlay,
    toggleLike,
    seek,
    setVolume,
    pause,
    play,
  }
}
