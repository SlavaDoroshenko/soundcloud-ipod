/**
 * SoundCloud API client
 * Все запросы идут через Cloudflare Worker proxy.
 */

import { Capacitor } from '@capacitor/core'
import { DataDome } from './native/DataDome'
import { NativeAPI } from './native/NativeAPI'

const PROXY_BASE = import.meta.env.VITE_PROXY_URL ?? 'https://api-v2.soundcloud.com'
const SC_BASE = 'https://api-v2.soundcloud.com'

// Извлечён из сетевых запросов soundcloud.com — обновлять при смене
const FALLBACK_CLIENT_ID = 'khI8ciOiYPX6UVGInQY5zA0zvTkfzuuC'

// Хранимые в памяти credentials
let _clientId: string | null = null
let _accessToken: string | null = null

export function setAccessToken(token: string) {
  _accessToken = token
  localStorage.setItem('sc_access_token', token)
}

export function getAccessToken(): string | null {
  if (_accessToken) return _accessToken
  // Сначала наш сохранённый токен, потом нативный ключ soundcloud.com
  _accessToken = localStorage.getItem('sc_access_token')
              ?? localStorage.getItem('oauth_token')
  return _accessToken
}

export function clearAuth() {
  _accessToken = null
  _clientId = null
  localStorage.removeItem('sc_access_token')
  localStorage.removeItem('sc_client_id')
}

/** Извлекает client_id из JS бандла soundcloud.com */
export async function fetchClientId(): Promise<string> {
  const cached = localStorage.getItem('sc_client_id')
  if (cached) {
    _clientId = cached
    return cached
  }

  // Получаем главную страницу через прокси
  const html = await fetch(`${PROXY_BASE}/__sc_home`).then(r => r.text()).catch(() => '')

  // Ищем ссылки на script chunks
  const scriptUrls = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)]
    .map(m => m[1])
    .slice(-5) // последние 5 чанков, там обычно хранится client_id

  for (const url of scriptUrls) {
    const js = await fetch(url).then(r => r.text()).catch(() => '')
    const match = js.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/) ??
                  js.match(/"client_id","([a-zA-Z0-9]{32})"/) ??
                  js.match(/\bclient_id=([a-zA-Z0-9]{32})\b/)
    if (match) {
      _clientId = match[1]
      localStorage.setItem('sc_client_id', _clientId)
      return _clientId
    }
  }

  throw new Error('Не удалось извлечь client_id из SoundCloud')
}

export async function getClientId(): Promise<string> {
  if (_clientId) return _clientId
  // Кэш в localStorage
  const cached = localStorage.getItem('sc_client_id')
  if (cached) { _clientId = cached; return cached }
  // Динамическое извлечение из JS бандла SC
  try { return await fetchClientId() } catch { /* fallback */ }
  // Захардкоженный fallback (меняется раз в несколько недель)
  _clientId = FALLBACK_CLIENT_ID
  return _clientId
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────

type RequestOptions = {
  params?: Record<string, string | number | boolean>
  signal?: AbortSignal
  auth?: boolean // использовать Bearer token (default: true если токен есть)
}

async function buildUrl(path: string, params: Record<string, string | number | boolean> = {}) {
  const base = path.startsWith('http') ? path : `${SC_BASE}${path}`
  const url = new URL(base.replace(SC_BASE, PROXY_BASE))

  // Всегда включаем client_id — SC возвращает user_favorite только при наличии client_id
  const clientId = await getClientId()
  url.searchParams.set('client_id', clientId)

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }

  return url.toString()
}

function authHeaders(): HeadersInit {
  const token = getAccessToken()
  const ddClientId = localStorage.getItem('sc_dd_clientid')
  return {
    ...(token ? { Authorization: `OAuth ${token}` } : {}),
    ...(ddClientId ? { 'x-datadome-id': ddClientId } : {}),
  }
}

function saveDatadomeId(res: Response) {
  const ddId = res.headers.get('x-datadome-id')
  if (ddId) localStorage.setItem('sc_dd_clientid', ddId)
}

/** Разбирает тело 403 ответа, находит DataDome challenge URL и решает его в WKWebView.
 *  Только на native iOS. Возвращает true если cookie успешно обновлён. */
async function solveDataDomeChallenge(errBody: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const data = JSON.parse(errBody) as { url?: string }
    if (data.url && (data.url.includes('datadome') || data.url.includes('captcha-delivery'))) {
      console.log('[DataDome] solving challenge:', data.url)
      const { cookie } = await DataDome.solveCaptcha({ url: data.url })
      localStorage.setItem('sc_dd_clientid', cookie)
      console.log('[DataDome] cookie obtained via challenge')
      return true
    }
  } catch { /* not JSON or no url */ }

  // Fallback: загружаем soundcloud.com напрямую
  try {
    const { cookie } = await DataDome.fetchCookie()
    localStorage.setItem('sc_dd_clientid', cookie)
    console.log('[DataDome] cookie obtained via soundcloud.com')
    return true
  } catch (err) {
    console.warn('[DataDome] fetchCookie failed:', err)
    return false
  }
}

/** Публичный fallback для кнопки "Обновить" в Settings */
export async function refreshDataDomeCookie(): Promise<boolean> {
  return solveDataDomeChallenge('')
}

export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = await buildUrl(path, options.params as Record<string, string | number | boolean>)
  const res = await fetch(url, {
    headers: authHeaders(),
    signal: options.signal,
  })
  saveDatadomeId(res)
  if (!res.ok) throw new Error(`SC API error: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const url = await buildUrl(path, options.params as Record<string, string | number | boolean>)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
    signal: options.signal,
  })
  saveDatadomeId(res)
  if (!res.ok) throw new Error(`SC API error: ${res.status} ${res.statusText}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const makeReq = async () => {
    const url = await buildUrl(path)
    return fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    })
  }
  let res = await makeReq()
  saveDatadomeId(res)
  if (res.status === 403) {
    const errBody = await res.text().catch(() => '')
    await solveDataDomeChallenge(errBody)
    res = await makeReq()
    saveDatadomeId(res)
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`SC API error: ${res.status} — ${errBody.slice(0, 400)}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function apiDelete(path: string): Promise<void> {
  const makeReq = async () => {
    const url = await buildUrl(path)
    return fetch(url, {
      method: 'DELETE',
      headers: authHeaders(),
    })
  }
  let res = await makeReq()
  saveDatadomeId(res)
  if (res.status === 403) {
    const errBody = await res.text().catch(() => '')
    await solveDataDomeChallenge(errBody)
    res = await makeReq()
    saveDatadomeId(res)
  }
  if (!res.ok && res.status !== 404) throw new Error(`SC API error: ${res.status} ${res.statusText}`)
}

// ─── SoundCloud Types ──────────────────────────────────────────────────────

export type ScUser = {
  id: number
  urn: string
  username: string
  display_name: string
  avatar_url: string
  permalink_url: string
  followers_count: number
  followings_count: number
  track_count: number
  playlist_count: number
  public_favorites_count: number
}

export type ScTrack = {
  id: number
  urn: string
  title: string
  duration: number
  artwork_url: string | null
  permalink_url: string
  stream_url?: string
  media: { transcodings: ScTranscoding[] }
  user: Pick<ScUser, 'id' | 'username' | 'avatar_url' | 'permalink_url'>
  likes_count: number
  playback_count: number
  genre: string
  tag_list: string
  created_at: string
  user_favorite?: boolean
  policy?: string
}

export type ScTranscoding = {
  url: string
  preset: string
  duration: number
  format: { protocol: string; mime_type: string }
  quality: string
}

export type ScPlaylist = {
  id: number
  urn: string
  title: string
  artwork_url: string | null
  permalink_url: string
  tracks: ScTrack[]
  track_count: number
  duration: number
  user: Pick<ScUser, 'id' | 'username' | 'avatar_url'>
  is_album: boolean
  created_at: string
}

export type ScCollection<T> = {
  collection: T[]
  next_href: string | null
  query_urn: string | null
}

// ─── API methods ───────────────────────────────────────────────────────────

// ─── Liked track IDs cache ─────────────────────────────────────────────────

let _likedIdsPromise: Promise<Set<number>> | null = null

export function fetchAllLikedTrackIds(userId: number): Promise<Set<number>> {
  if (_likedIdsPromise) return _likedIdsPromise
  _likedIdsPromise = (async () => {
    const ids = new Set<number>()
    let next: string | null = `/users/${userId}/track_likes?limit=200&linked_partitioning=1`
    while (next) {
      const data: ScCollection<{ track: ScTrack | null }> = await apiGet(next)
      for (const item of data.collection) {
        if (item.track?.id) ids.add(item.track.id)
      }
      next = data.next_href
    }
    return ids
  })()
  _likedIdsPromise.catch(() => { _likedIdsPromise = null })
  return _likedIdsPromise
}

export function invalidateLikedIdsCache() {
  _likedIdsPromise = null
}

export const sc = {
  me: () => apiGet<ScUser>('/me'),

  search: (q: string, limit = 20) =>
    apiGet<ScCollection<ScTrack>>('/search/tracks', { params: { q, limit } }),

  track: (id: number) => apiGet<ScTrack>(`/tracks/${id}`),

  streams: (track: ScTrack) => {
    // Предпочитаем прогрессивный MP3 для совместимости с <audio> на iOS
    const mp3 = track.media.transcodings.find(
      t => t.format.protocol === 'progressive' && t.format.mime_type === 'audio/mpeg'
    )
    const hls = track.media.transcodings.find(
      t => t.format.protocol === 'hls'
    )
    return mp3 ?? hls ?? null
  },

  resolveStreamUrl: async (transcoding: ScTranscoding): Promise<string> => {
    const clientId = await getClientId()
    const url = new URL(transcoding.url.replace('https://api-v2.soundcloud.com', PROXY_BASE))
    url.searchParams.set('client_id', clientId)
    const res = await fetch(url.toString(), { headers: authHeaders() })
    if (!res.ok) throw new Error(`Stream resolve failed: ${res.status}`)
    const data = await res.json() as { url: string }
    return data.url
  },

  // Правильный эндпоинт v2: /users/{userId}/track_likes
  likes: (userId: number, limit = 24) =>
    apiGet<ScCollection<{ created_at: string; track: ScTrack }>>(
      `/users/${userId}/track_likes`,
      { params: { limit, linked_partitioning: 1 } }
    ),

  like: async (trackId: number, userId: number) => {
    const path = `/users/${userId}/track_likes/${trackId}`
    if (Capacitor.isNativePlatform()) {
      const clientId = await getClientId()
      const accessToken = getAccessToken() ?? ''
      const ddCookie = localStorage.getItem('sc_dd_clientid') ?? ''
      await NativeAPI.put({ path, clientId, accessToken, ddCookie })
      return
    }
    return apiPut<void>(path)
  },

  unlike: async (trackId: number, userId: number) => {
    const path = `/users/${userId}/track_likes/${trackId}`
    if (Capacitor.isNativePlatform()) {
      const clientId = await getClientId()
      const accessToken = getAccessToken() ?? ''
      const ddCookie = localStorage.getItem('sc_dd_clientid') ?? ''
      await NativeAPI.delete({ path, clientId, accessToken, ddCookie })
      return
    }
    return apiDelete(path)
  },

  playlists: (userId: number, limit = 50) =>
    apiGet<ScCollection<ScPlaylist>>(`/users/${userId}/playlists`, { params: { limit, linked_partitioning: 1 } }),

  playlist: (id: number) =>
    apiGet<ScPlaylist>(`/playlists/${id}`, { params: { representation: 'full' } }),

  feed: (limit = 30) =>
    apiGet<ScCollection<{ track?: ScTrack; playlist?: ScPlaylist }>>('/stream', { params: { limit, linked_partitioning: 1 } }),

  recommendations: (trackId: number, limit = 10) =>
    apiGet<ScCollection<ScTrack>>(`/tracks/${trackId}/related`, { params: { limit } }),
}
