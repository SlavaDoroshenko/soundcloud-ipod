import Dexie, { type Table } from 'dexie'
import type { ScTrack } from './api'
import { sc } from './api'

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface DownloadedTrack {
  id: number            // SC track id (primary key)
  track: ScTrack        // полные метаданные
  blob: Blob            // аудио-данные
  fileSize: number      // bytes
  downloadedAt: number  // timestamp
}

class DownloadsDB extends Dexie {
  downloads!: Table<DownloadedTrack, number>

  constructor() {
    super('sc_downloads')
    this.version(1).stores({
      downloads: 'id, downloadedAt',
    })
  }
}

export const db = new DownloadsDB()

// ─── Download progress ────────────────────────────────────────────────────────

type ProgressListener = (trackId: number, progress: number) => void  // 0..1, -1 = error
const progressListeners = new Set<ProgressListener>()

export function onDownloadProgress(fn: ProgressListener) {
  progressListeners.add(fn)
  return () => progressListeners.delete(fn)
}

function emitProgress(trackId: number, progress: number) {
  progressListeners.forEach(fn => fn(trackId, progress))
}

// Трек ID → AbortController (для отмены)
const activeDownloads = new Map<number, AbortController>()

export function isDownloading(trackId: number) {
  return activeDownloads.has(trackId)
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadTrack(track: ScTrack): Promise<void> {
  if (activeDownloads.has(track.id)) return  // уже качается

  const transcoding = sc.streams(track)
  if (!transcoding) throw new Error('No stream available')

  // Резолвим URL непосредственно перед загрузкой — SC URLs живут ~5 мин
  const url = await sc.resolveStreamUrl(transcoding)

  const abort = new AbortController()
  activeDownloads.set(track.id, abort)
  emitProgress(track.id, 0)

  try {
    const response = await fetch(url, { signal: abort.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const contentLength = Number(response.headers.get('content-length') ?? 0)
    const reader = response.body!.getReader()
    const chunks: Uint8Array[] = []
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (contentLength > 0) {
        emitProgress(track.id, received / contentLength)
      }
    }

    const blob = new Blob(chunks as BlobPart[], { type: 'audio/mpeg' })
    await db.downloads.put({
      id: track.id,
      track,
      blob,
      fileSize: blob.size,
      downloadedAt: Date.now(),
    })
    emitProgress(track.id, 1)
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      emitProgress(track.id, -1)
      throw err
    }
  } finally {
    activeDownloads.delete(track.id)
  }
}

export function cancelDownload(trackId: number) {
  activeDownloads.get(trackId)?.abort()
  activeDownloads.delete(trackId)
}

export async function deleteDownload(trackId: number) {
  await db.downloads.delete(trackId)
}

export async function getAllDownloads(): Promise<DownloadedTrack[]> {
  return db.downloads.orderBy('downloadedAt').reverse().toArray()
}

export async function getDownloadedIds(): Promise<Set<number>> {
  const keys = await db.downloads.toCollection().primaryKeys()
  return new Set(keys as number[])
}

/** Создаёт blob URL для воспроизведения скачанного трека */
export function createBlobUrl(dl: DownloadedTrack): string {
  return URL.createObjectURL(dl.blob)
}
