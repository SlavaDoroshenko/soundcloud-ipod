/**
 * Аудио плеер — два режима:
 *
 * 1. Native (Capacitor iOS/Android): AudioPlayerPlugin (AVPlayer)
 *    - Работает в фоне бесконечно, не замерзает при заблокированном экране
 *    - Подключается автоматически когда Capacitor.isNativePlatform() === true
 *
 * 2. HTML5 <audio> (браузер / PWA):
 *    - Blob-preload следующего трека
 *    - Early switch при заблокированном экране (за 2с до конца)
 *    - Media Session API для экрана блокировки (без кнопки лайка)
 *
 * Все публичные функции (loadTrack, play, pause, seek, setVolume) работают
 * одинаково в обоих режимах — вызывающий код не знает о платформе.
 */

import { Capacitor } from '@capacitor/core'
import { AudioPlayer } from './native/AudioPlayer'
import { sc } from './api'
import type { ScTrack } from './api'

// ─── Platform detection ──────────────────────────────────────────────────────

export const isNative = Capacitor.isNativePlatform()

const _audio = new Audio()

// ─── Visibility (screen lock detection) ─────────────────────────────────────

let _isHidden = document.visibilityState === 'hidden'
document.addEventListener('visibilitychange', () => {
  _isHidden = document.visibilityState === 'hidden'
})

// ─── State ──────────────────────────────────────────────────────────────────

type PlayerListener = () => void
const listeners = new Set<PlayerListener>()
export function subscribePlayer(fn: PlayerListener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() { listeners.forEach(fn => fn()) }

export type PlayerState = {
  track: ScTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isLoading: boolean
  error: string | null
}

let state: PlayerState = {
  track: null, isPlaying: false, currentTime: 0,
  duration: 0, volume: 1, isLoading: false, error: null,
}
export function getPlayerState(): PlayerState { return state }
export function setPlayerError(msg: string | null) { setState({ error: msg, isLoading: false }) }
function setState(patch: Partial<PlayerState>) {
  state = { ...state, ...patch }
  notify()
}

// ─── Queue ───────────────────────────────────────────────────────────────────

let _queue: ScTrack[] = []
let _queueIndex = -1

export function setPlayerQueue(tracks: ScTrack[], index: number) {
  _queue = tracks
  _queueIndex = index
  // Запускаем расширение очереди при ручном переключении тоже
  _maybeExtendQueue(index)
}

type AutoAdvanceCallback = (track: ScTrack, idx: number) => void
let _onAutoAdvance: AutoAdvanceCallback | null = null
export function setAutoAdvanceCallback(fn: AutoAdvanceCallback | null) {
  _onAutoAdvance = fn
}

// Вызывается при ошибке воспроизведения — usePlayer может сделать retry (максимум 1 раз)
type PlayerErrorCallback = (track: ScTrack) => void
let _onPlayerError: PlayerErrorCallback | null = null
let _retryCount = 0
export function setPlayerErrorCallback(fn: PlayerErrorCallback | null) {
  _onPlayerError = fn
}

// ─── Queue extender (бесконечная лента с заблокированным экраном) ────────────
// Callback устанавливается из Feed.tsx. Вызывается напрямую из player (без React),
// поэтому работает когда экран заблокирован — iOS пропускает fetch через audio session.

type QueueExtender = () => Promise<ScTrack[]>
let _queueExtender: QueueExtender | null = null
let _isExtending = false

export function setQueueExtender(fn: QueueExtender | null) {
  _queueExtender = fn
  _isExtending = false
}

// Вызывается когда _queue расширен — обновляет Jotai queueAtom в React
type QueueExtendedCallback = (newTracks: ScTrack[]) => void
let _onQueueExtended: QueueExtendedCallback | null = null
export function setQueueExtendedCallback(fn: QueueExtendedCallback | null) {
  _onQueueExtended = fn
}

// Запускает preload трека _queue[_queueIndex + 1] если ещё не начат
let _isPreloading = false
function _preloadNextIfMissing() {
  if (_nextBlobUrl || _nextResolvedUrl || _isPreloading) return
  const next = _queue[_queueIndex + 1]
  if (!next) return
  const tr = sc.streams(next)
  if (!tr) return
  _isPreloading = true
  sc.resolveStreamUrl(tr)
    .then(url => {
      _nextResolvedUrl = url
      _isPreloading = false
      return fetch(url).then(r => (r.ok ? r.blob() : null))
    })
    .then(blob => {
      if (!blob) return
      _cleanupBlob()
      _nextBlobUrl = URL.createObjectURL(blob)
    })
    .catch(() => { _isPreloading = false })
}

function _maybeExtendQueue(fromIndex: number) {
  const remaining = _queue.length - fromIndex
  if (remaining > 5 || !_queueExtender || _isExtending) return
  _isExtending = true
  _queueExtender()
    .then(newTracks => {
      if (newTracks.length > 0) {
        _queue = [..._queue, ...newTracks]
        _onQueueExtended?.(newTracks)  // синхронизируем Jotai queueAtom
        _preloadNextIfMissing()        // стартуем preload если цепочка прервалась
      }
    })
    .catch(() => {})
    .finally(() => { _isExtending = false })
}

// ─── Preload: Blob + resolved URL ────────────────────────────────────────────

// Blob-URL: данные в памяти, не требуют сети в момент переключения.
// Resolved URL: fallback CDN-ссылка (может протухнуть за >5 мин).
let _nextBlobUrl: string | null = null
let _nextResolvedUrl: string | null = null
let _preloadRefreshed = false

function _cleanupBlob() {
  if (_nextBlobUrl) {
    URL.revokeObjectURL(_nextBlobUrl)
    _nextBlobUrl = null
  }
}

/** Сохраняет URL и запускает blob-fetch следующего трека.
 *  Вызывается из usePlayer сразу после старта текущего трека. */
export function preloadNextTrack(url: string) {
  _preloadRefreshed = false
  _cleanupBlob()
  _nextResolvedUrl = url

  fetch(url)
    .then(r => (r.ok ? r.blob() : null))
    .then(blob => {
      if (!blob) return
      _cleanupBlob()
      _nextBlobUrl = URL.createObjectURL(blob)
    })
    .catch(() => {})
}

// ─── Core transition logic ───────────────────────────────────────────────────

function _transitionToTrack(nextTrack: ScTrack, nextIndex: number) {
  const url = _nextBlobUrl ?? _nextResolvedUrl
  if (!url) return

  // Сохраняем ссылку на blob для отложенного удаления
  const blobToRevoke = _nextBlobUrl
  _nextBlobUrl = null
  _nextResolvedUrl = null
  _preloadRefreshed = false
  _isPreloading = false
  _queueIndex = nextIndex

  // src-swap на том же элементе — iOS продолжает audio session
  _maybeExtendQueue(nextIndex)

  _audio.src = url
  setState({ track: nextTrack, isLoading: true, currentTime: 0, duration: 0, error: null })
  updateMediaSession(nextTrack)
  _onAutoAdvance?.(nextTrack, nextIndex)
  _audio.play().catch(err => setState({ error: String(err), isPlaying: false }))

  // Удаляем blob URL через 10с — браузер уже начал читать данные
  if (blobToRevoke) setTimeout(() => URL.revokeObjectURL(blobToRevoke), 10_000)

  // Запускаем blob-fetch для следующего за следующим
  const afterNext = _queue[nextIndex + 1]
  if (afterNext) {
    const tr = sc.streams(afterNext)
    if (tr) {
      sc.resolveStreamUrl(tr)
        .then(freshUrl => {
          _nextResolvedUrl = freshUrl
          return fetch(freshUrl).then(r => (r.ok ? r.blob() : null))
        })
        .then(blob => {
          if (!blob) return
          _cleanupBlob()
          _nextBlobUrl = URL.createObjectURL(blob)
        })
        .catch(() => {})
    }
  }
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function onPlay() {
  setState({ isPlaying: true, isLoading: false })
  updateMediaSessionState('playing')
}
function onPause() {
  setState({ isPlaying: false })
  updateMediaSessionState('paused')
}
function onTimeUpdate() {
  setState({ currentTime: _audio.currentTime })
  updatePositionState()

  if (!_audio.duration || _audio.duration <= 0) return
  const remaining = _audio.duration - _audio.currentTime

  // Защитный запуск preload — если цепочка сломалась (например, очередь только что расширилась)
  if (!_nextBlobUrl && !_nextResolvedUrl && _queue[_queueIndex + 1]) {
    _preloadNextIfMissing()
  }

  // Обновляем fallback URL за 90с до конца (CDN-ссылки живут ~5 мин).
  // Если blob ещё не готов — пробуем fetch с новым URL.
  if (!_preloadRefreshed && remaining > 0 && remaining < 90) {
    _preloadRefreshed = true
    const nextTrack = _queue[_queueIndex + 1]
    if (nextTrack) {
      const tr = sc.streams(nextTrack)
      if (tr) {
        sc.resolveStreamUrl(tr)
          .then(freshUrl => {
            _nextResolvedUrl = freshUrl
            if (!_nextBlobUrl) {
              return fetch(freshUrl).then(r => (r.ok ? r.blob() : null))
            }
            return null
          })
          .then(blob => {
            if (!blob) return
            _cleanupBlob()
            _nextBlobUrl = URL.createObjectURL(blob)
          })
          .catch(() => {})
      }
    }
  }

  // Экран заблокирован: переключаем за 2с до конца, пока audio session активна.
  // iOS завершает audio session вместе с `ended`, поэтому play() из ended не работает.
  if (_isHidden && remaining > 0 && remaining < 2) {
    const nextIndex = _queueIndex + 1
    const nextTrack = _queue[nextIndex]
    if (nextTrack) {
      if (_nextBlobUrl || _nextResolvedUrl) {
        _transitionToTrack(nextTrack, nextIndex)
      }
      // Если preload ещё не готов — переключим как только `ended` сработает,
      // _transitionToTrack в onEnded тоже работает пока audio session жива
    }
  }
}
function onDurationChange() {
  setState({ duration: _audio.duration || 0 })
}
function onWaiting() {
  setState({ isLoading: true })
}
function onCanPlay() {
  setState({ isLoading: false })
}
function onError() {
  setState({ isLoading: false, isPlaying: false, error: 'Ошибка воспроизведения' })
  updateMediaSessionState('paused')
}
function onVolumeChange() {
  setState({ volume: _audio.volume })
}

function onEnded() {
  // Экран открыт: переключаем здесь (без потери конца трека).
  // Если screen был заблокирован — timeupdate уже переключил трек раньше,
  // а ended не должен был сработать (src был сменён до окончания).
  const nextIndex = _queueIndex + 1
  const nextTrack = _queue[nextIndex]

  if (!nextTrack) {
    setState({ isPlaying: false, currentTime: 0 })
    onEndedCallbacks.forEach(fn => fn())
    return
  }

  if (_nextBlobUrl || _nextResolvedUrl) {
    _transitionToTrack(nextTrack, nextIndex)
    return
  }

  // Нет preloaded URL — цепочка сломалась. Фетчим прямо в ended-контексте
  // (audio session на iOS может быть ещё жива в момент вызова ended).
  const tr = sc.streams(nextTrack)
  if (!tr) {
    setState({ isPlaying: false, currentTime: 0 })
    onEndedCallbacks.forEach(fn => fn())
    return
  }
  sc.resolveStreamUrl(tr)
    .then(url => {
      _nextResolvedUrl = url
      _transitionToTrack(nextTrack, nextIndex)
    })
    .catch(() => {
      setState({ isPlaying: false, currentTime: 0 })
      onEndedCallbacks.forEach(fn => fn())
    })
}

_audio.addEventListener('play', onPlay)
_audio.addEventListener('pause', onPause)
_audio.addEventListener('timeupdate', onTimeUpdate)
_audio.addEventListener('durationchange', onDurationChange)
_audio.addEventListener('waiting', onWaiting)
_audio.addEventListener('canplay', onCanPlay)
_audio.addEventListener('error', onError)
_audio.addEventListener('volumechange', onVolumeChange)
_audio.addEventListener('ended', onEnded)

const onEndedCallbacks = new Set<() => void>()
export function onTrackEnded(fn: () => void) {
  onEndedCallbacks.add(fn)
  return () => onEndedCallbacks.delete(fn)
}

// ─── Player controls ─────────────────────────────────────────────────────────

export async function loadTrack(track: ScTrack, streamUrl: string) {
  _retryCount = 0   // сброс счётчика при загрузке нового трека
  _preloadRefreshed = false
  _isPreloading = false
  _cleanupBlob()
  _nextResolvedUrl = null

  setState({ track, isLoading: true, error: null, currentTime: 0, duration: 0 })

  // blob:// URLs live only in WKWebView JS context — AVPlayer can't resolve them
  const useBlobAudio = streamUrl.startsWith('blob:')

  if (isNative && !useBlobAudio) {
    // Native: AVPlayer (5s timeout — если плагин не зарегистрирован, промис зависает навсегда)
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AudioPlayer: plugin not responding (5s timeout). Check Xcode project.')), 5000)
    )
    try {
      await Promise.race([AudioPlayer.load({ url: streamUrl }), timeout])
    } catch (err) {
      setState({ error: String(err), isLoading: false })
    }
  } else {
    // HTML5 (browser or blob:// offline playback)
    _audio.src = streamUrl
    _audio.load()
    updateMediaSession(track)
  }
}

export function play() {
  if (isNative) {
    AudioPlayer.play().catch(err => setState({ error: String(err) }))
  } else {
    _audio.play().catch(err => setState({ error: String(err) }))
  }
}

export function pause() {
  if (isNative) {
    AudioPlayer.pause().catch(() => {})
  } else {
    _audio.pause()
  }
}

export function togglePlay() {
  if (state.isPlaying) pause()
  else play()
}

export function seek(time: number) {
  if (isNative) {
    AudioPlayer.seek({ position: time }).catch(() => {})
  } else {
    _audio.currentTime = time
  }
}

export function setVolume(vol: number) {
  const clamped = Math.max(0, Math.min(1, vol))
  if (isNative) {
    AudioPlayer.setVolume({ volume: clamped }).catch(() => {})
  } else {
    _audio.volume = clamped
  }
}

// ─── Native event listeners (подключаются один раз при старте) ───────────────

if (isNative) {
  AudioPlayer.addListener('progress', (data) => {
    setState({
      currentTime: data.currentTime ?? 0,
      duration:    data.duration    ?? 0,
      isPlaying:   data.isPlaying   ?? false,
      isLoading:   false,
    })
    updatePositionState()
  })

  AudioPlayer.addListener('stateChanged', (data) => {
    setState({ isPlaying: data.isPlaying ?? false, isLoading: false })
    updateMediaSessionState(data.isPlaying ? 'playing' : 'paused')
  })

  AudioPlayer.addListener('ready', (data) => {
    _retryCount = 0  // сброс при успешной загрузке
    setState({ duration: data.duration ?? 0, isLoading: false })
  })

  AudioPlayer.addListener('error', (data) => {
    const track = state.track
    // Retry только один раз — защита от бесконечного цикла
    if (track && _onPlayerError && _retryCount === 0) {
      _retryCount = 1
      _onPlayerError(track)
    } else {
      _retryCount = 0
      setState({ error: data.message ?? 'Playback error', isLoading: false, isPlaying: false })
    }
  })

  AudioPlayer.addListener('trackEnded', () => {
    const nextIndex = _queueIndex + 1
    const nextTrack = _queue[nextIndex]
    if (!nextTrack) {
      setState({ isPlaying: false, currentTime: 0 })
      onEndedCallbacks.forEach(fn => fn())
      return
    }
    // JS side fetches URL and calls loadTrack
    _onAutoAdvance?.(nextTrack, nextIndex)
    _queueIndex = nextIndex
    _maybeExtendQueue(nextIndex)
    onEndedCallbacks.forEach(fn => fn())
  })

  AudioPlayer.addListener('nextTrack', () => {
    const nextIndex = _queueIndex + 1
    const nextTrack = _queue[nextIndex]
    if (nextTrack) { _onAutoAdvance?.(nextTrack, nextIndex) }
    onEndedCallbacks.forEach(fn => fn())
  })

  AudioPlayer.addListener('prevTrack', () => {
    const prevIndex = _queueIndex - 1
    const prevTrack = _queue[prevIndex]
    if (prevTrack) { _onAutoAdvance?.(prevTrack, prevIndex) }
  })
}

// ─── Media Session API ────────────────────────────────────────────────────────

let onPrevCallback: (() => void) | null = null
let onNextCallback: (() => void) | null = null

export function setMediaSessionCallbacks(prev: () => void, next: () => void) {
  onPrevCallback = prev
  onNextCallback = next
}

function artworkUrl(track: ScTrack, size: string): string {
  const url = track.artwork_url ?? track.user.avatar_url
  return url ? url.replace('-large', size) : ''
}

function updateMediaSession(track: ScTrack) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.user.username,
    album: track.genre || track.user.username,
    artwork: [
      { src: artworkUrl(track, '-t500x500'), sizes: '512x512', type: 'image/jpeg' },
      { src: artworkUrl(track, '-t300x300'), sizes: '300x300', type: 'image/jpeg' },
      { src: artworkUrl(track, '-large'), sizes: '100x100', type: 'image/jpeg' },
    ].filter(a => a.src),
  })
  navigator.mediaSession.setActionHandler('play', play)
  navigator.mediaSession.setActionHandler('pause', pause)
  navigator.mediaSession.setActionHandler('stop', () => { pause(); seek(0) })
  navigator.mediaSession.setActionHandler('seekto', d => { if (d.seekTime != null) seek(d.seekTime) })
  navigator.mediaSession.setActionHandler('previoustrack', () => onPrevCallback?.())
  navigator.mediaSession.setActionHandler('nexttrack', () => onNextCallback?.())
}

function updateMediaSessionState(s: 'playing' | 'paused' | 'none') {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = s
}

function updatePositionState() {
  if (!('mediaSession' in navigator)) return
  if (!_audio.duration || !isFinite(_audio.duration)) return
  try {
    navigator.mediaSession.setPositionState({
      duration: _audio.duration,
      playbackRate: _audio.playbackRate,
      position: _audio.currentTime,
    })
  } catch { /* ignore */ }
}
