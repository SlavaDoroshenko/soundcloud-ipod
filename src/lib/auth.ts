/**
 * SoundCloud OAuth через Cloudflare Worker (PKCE flow).
 *
 * Схема:
 *   PWA → Worker /auth/start → secure.soundcloud.com/authorize
 *       → Worker /auth/callback (code exchange с client_secret)
 *       → PWA /auth/result#token=...
 *
 * Требует secrets в Worker:
 *   SOUNDCLOUD_CLIENT_ID
 *   SOUNDCLOUD_CLIENT_SECRET
 *   PWA_ORIGIN
 */

import { setAccessToken, clearAuth, sc } from './api'

const WORKER_URL = import.meta.env.VITE_PROXY_URL as string

export function buildAuthUrl(): string {
  return `${WORKER_URL}/auth/start`
}

export type AuthResult =
  | { success: true; token: string }
  | { success: false; error: string }

/**
 * Открывает popup → Worker /auth/start → SoundCloud login → Worker /auth/callback
 * → PWA /auth/result#token=... (popup закрывается, parent читает токен)
 */
export function openAuthPopup(): Promise<AuthResult> {
  return new Promise((resolve) => {
    const width = 520
    const height = 680
    const left = Math.round(window.screen.width / 2 - width / 2)
    const top  = Math.round(window.screen.height / 2 - height / 2)

    const popup = window.open(
      buildAuthUrl(),
      'sc-auth',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no`,
    )

    if (!popup) {
      resolve({ success: false, error: 'Popup заблокирован браузером' })
      return
    }

    let resolved = false

    const timer = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(timer)
          if (!resolved) resolve({ success: false, error: 'Окно закрыто пользователем' })
          return
        }

        const href = popup.location.href

        // Ждём пока popup окажется на нашем /auth/result
        if (href.includes('/auth/result')) {
          const hash = new URL(href).hash.slice(1)
          const params = new URLSearchParams(hash)
          const token = params.get('token')
          const error = params.get('error')

          resolved = true
          clearInterval(timer)
          popup.close()

          if (token) {
            setAccessToken(decodeURIComponent(token))
            resolve({ success: true, token: decodeURIComponent(token) })
          } else {
            resolve({ success: false, error: error ?? 'Авторизация отклонена' })
          }
        }
      } catch {
        // Cross-origin — popup ещё на soundcloud.com, продолжаем ждать
      }
    }, 300)

    setTimeout(() => {
      if (!resolved) {
        resolved = true
        clearInterval(timer)
        try { popup.close() } catch { /* ok */ }
        resolve({ success: false, error: 'Таймаут' })
      }
    }, 5 * 60 * 1000)
  })
}

/** Ручной ввод токена (fallback пока нет credentials) */
export async function loginWithToken(token: string): Promise<AuthResult> {
  setAccessToken(token)
  try {
    await sc.me()
    return { success: true, token }
  } catch {
    clearAuth()
    return { success: false, error: 'Токен недействителен' }
  }
}

export async function logout() {
  clearAuth()
}

export async function fetchCurrentUser() {
  return sc.me()
}
