/**
 * auth atoms
 *
 * accessTokenAtom — читает raw string из localStorage (не JSON),
 * чтобы синхронизироваться с api.ts.
 *
 * currentUserAtom — кэшируется в localStorage как JSON, загружается
 * мгновенно при перезагрузке страницы.
 */
import { atom } from 'jotai'
import type { ScUser } from '@/lib/api'
import { getAccessToken } from '@/lib/api'

const USER_CACHE_KEY = 'sc_user_cache'

function loadCachedUser(): ScUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    return raw ? (JSON.parse(raw) as ScUser) : null
  } catch {
    return null
  }
}

export function saveUserCache(user: ScUser | null) {
  if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_CACHE_KEY)
}

export const accessTokenAtom = atom<string | null>(getAccessToken())
export const currentUserAtom = atom<ScUser | null>(loadCachedUser())
export const isAuthenticatedAtom = atom((get) => get(accessTokenAtom) !== null)
