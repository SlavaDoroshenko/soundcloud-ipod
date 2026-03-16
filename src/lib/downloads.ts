import Dexie, { type Table } from 'dexie'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import type { ScTrack } from './api'
import { sc } from './api'

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface DownloadedTrack {
  id: number            // SC track id (primary key)
  track: ScTrack        // полные метаданные
  filePath: string      // file:// URI (native) или blob: URL (web)
  fileSize: number      // bytes
  downloadedAt: number  // timestamp
}

class DownloadsDB extends Dexie {
  downloads!: Table<DownloadedTrack, number>

  constructor() {
    super('sc_downloads')
    this.version(1).stores({ downloads: 'id, downloadedAt' })
    // v2: migrate from blob to filePath — clear all (blobs can't be converted)
    this.version(2).stores({ downloads: 'id, downloadedAt' }).upgrade(tx =>
      tx.table('downloads').clear()
    )
  }
}

export const db = new DownloadsDB()

// ─── Download progress ────────────────────────────────────────────────────────

type ProgressListener = (trackId: number, progress: number) => void
const progressListeners = new Set<ProgressListener>()

export function onDownloadProgress(fn: ProgressListener) {
  progressListeners.add(fn)
  return () => progressListeners.delete(fn)
}

function emitProgress(trackId: number, progress: number) {
  progressListeners.forEach(fn => fn(trackId, progress))
}

const activeDownloads = new Map<number, AbortController>()

export function isDownloading(trackId: number) {
  return activeDownloads.has(trackId)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // strip "data:audio/mpeg;base64,"
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadTrack(track: ScTrack): Promise<void> {
  if (activeDownloads.has(track.id)) return

  const transcoding = sc.streams(track)
  if (!transcoding) throw new Error('No stream available')

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
      if (contentLength > 0) emitProgress(track.id, (received / contentLength) * 0.9)
    }

    const blob = new Blob(chunks as BlobPart[], { type: 'audio/mpeg' })
    let filePath: string

    if (Capacitor.isNativePlatform()) {
      // Write to filesystem — AVPlayer plays file:// URLs natively (LockScreen works)
      emitProgress(track.id, 0.92)
      const base64 = await blobToBase64(blob)
      const path = `downloads/${track.id}.mp3`
      await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      })
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents })
      filePath = uri  // file:///var/mobile/.../Documents/downloads/123.mp3
    } else {
      // Web: blob URL
      filePath = URL.createObjectURL(blob)
    }

    await db.downloads.put({
      id: track.id,
      track,
      filePath,
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
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.deleteFile({
        path: `downloads/${trackId}.mp3`,
        directory: Directory.Documents,
      })
    } catch { /* file might not exist */ }
  }
  await db.downloads.delete(trackId)
}

export async function getAllDownloads(): Promise<DownloadedTrack[]> {
  return db.downloads.orderBy('downloadedAt').reverse().toArray()
}

export async function getDownloadedIds(): Promise<Set<number>> {
  const keys = await db.downloads.toCollection().primaryKeys()
  return new Set(keys as number[])
}
