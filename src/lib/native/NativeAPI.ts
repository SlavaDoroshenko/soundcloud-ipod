import { registerPlugin } from '@capacitor/core'

export interface NativeAPIPlugin {
  put(options: NativeRequestOptions): Promise<{ status: number }>
  delete(options: NativeRequestOptions): Promise<{ status: number }>
}

export interface NativeRequestOptions {
  path: string
  clientId: string
  accessToken?: string
  ddCookie?: string
}

export const NativeAPI = registerPlugin<NativeAPIPlugin>('NativeAPI')
