/**
 * Точка приземления OAuth popup после редиректа от Cloudflare Worker.
 * Worker редиректит сюда с #token=... или ?error=...
 * Если это popup — закроется сам, parent window поймает токен через polling.
 * Если основное окно (redirect mode) — сохраняем токен и идём дальше.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { accessTokenAtom, currentUserAtom } from '@/stores/auth'
import { setAccessToken } from '@/lib/api'
import { fetchCurrentUser } from '@/lib/auth'

export default function AuthResultPage() {
  const navigate = useNavigate()
  const setToken = useSetAtom(accessTokenAtom)
  const setUser  = useSetAtom(currentUserAtom)

  useEffect(() => {
    const hash   = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const token  = params.get('token')

    if (window.opener) {
      // Это popup — parent сам прочитает URL, просто ждём закрытия
      return
    }

    // Основное окно — сохраняем токен напрямую
    if (token) {
      const decoded = decodeURIComponent(token)
      setAccessToken(decoded)
      setToken(decoded)
      fetchCurrentUser().then(setUser).catch(() => {})
      navigate('/feed', { replace: true })
    } else {
      navigate('/settings?auth=error', { replace: true })
    }
  }, [navigate, setToken, setUser])

  if (window.opener) return null

  return (
    <div className="flex items-center justify-center min-h-dvh">
      <p className="text-muted-foreground text-sm">Авторизация...</p>
    </div>
  )
}
