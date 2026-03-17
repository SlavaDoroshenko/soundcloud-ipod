import { registerPlugin } from '@capacitor/core'

export interface DataDomePlugin {
  /** Загружает soundcloud.com в скрытом WKWebView и возвращает cookie datadome */
  fetchCookie(): Promise<{ cookie: string }>
}

export const DataDome = registerPlugin<DataDomePlugin>('DataDome')
