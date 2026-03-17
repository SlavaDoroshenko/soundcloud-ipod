import { registerPlugin } from '@capacitor/core'

export interface DataDomePlugin {
  /** Загружает DataDome challenge URL в скрытом WKWebView → авто-решает → возвращает cookie */
  solveCaptcha(options: { url: string }): Promise<{ cookie: string }>
  /** Fallback: загружает soundcloud.com (может быть недоступен в RU) */
  fetchCookie(): Promise<{ cookie: string }>
}

export const DataDome = registerPlugin<DataDomePlugin>('DataDome')
