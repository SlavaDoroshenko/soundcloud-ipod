import { useEffect, useState } from 'react'
import {
  getAllDownloads,
  getDownloadedIds,
  downloadTrack,
  deleteDownload,
  onDownloadProgress,
  isDownloading,
  type DownloadedTrack,
} from '@/lib/downloads'
import type { ScTrack } from '@/lib/api'


/** Загружает все ID скачанных треков из IndexedDB (вызывать при старте) */
export async function initDownloadedIds(setIds: (ids: Set<number>) => void) {
  const ids = await getDownloadedIds()
  setIds(ids)
}

/** Хук для работы с загрузками */
export function useDownloads() {
  const [ids, setIds] = useState<Set<number>>(new Set())
  const [progress, setProgress] = useState<Map<number, number>>(new Map())
  const [downloads, setDownloads] = useState<DownloadedTrack[]>([])

  // Загружаем IDs и список при монтировании
  useEffect(() => {
    getDownloadedIds().then(setIds)
    getAllDownloads().then(setDownloads)

    // Подписываемся на прогресс
    const unsub = onDownloadProgress((trackId: number, p: number) => {
      setProgress(prev => {
        const next = new Map(prev)
        if (p < 0 || p >= 1) {
          next.delete(trackId)
          if (p >= 1) {
            // Обновляем список и IDs после успешной загрузки
            getDownloadedIds().then(setIds)
            getAllDownloads().then(setDownloads)
          }
        } else {
          next.set(trackId, p)
        }
        return next
      })
    })

    return () => { unsub() }
  }, [])

  const download = async (track: ScTrack) => {
    if (ids.has(track.id) || isDownloading(track.id)) return
    await downloadTrack(track)
  }

  const remove = async (trackId: number) => {
    await deleteDownload(trackId)
    setIds(prev => { const s = new Set(prev); s.delete(trackId); return s })
    setDownloads(prev => prev.filter(d => d.id !== trackId))
  }

  return { ids, progress, downloads, download, remove }
}
