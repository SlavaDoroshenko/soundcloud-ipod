import { registerPlugin } from '@capacitor/core'

export interface UpdateNowPlayingOptions {
  title: string
  artist: string
  duration: number
  currentTime: number
  isPlaying: boolean
  artworkUrl?: string
  isLiked?: boolean
}

export interface LockScreenPlugin {
  updateNowPlaying(options: UpdateNowPlayingOptions): Promise<void>
  setLiked(options: { isLiked: boolean }): Promise<void>
  clear(): Promise<void>
  addListener(
    event: 'remotePlay' | 'remotePause' | 'remoteNext' | 'remotePrev' | 'remoteSeek' | 'remoteLike',
    handler: (data: any) => void,
  ): Promise<{ remove: () => void }>
}

export const LockScreen = registerPlugin<LockScreenPlugin>('LockScreen')
