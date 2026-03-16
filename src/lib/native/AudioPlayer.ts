import { registerPlugin } from '@capacitor/core'

export interface AudioPlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
}

export interface AudioPlayerPlugin {
  load(options: { url: string }): Promise<{ loaded: boolean }>
  play(): Promise<void>
  pause(): Promise<void>
  seek(options: { position: number }): Promise<void>
  setVolume(options: { volume: number }): Promise<void>
  getState(): Promise<AudioPlayerState>
  skipToNext(): Promise<void>
  skipToPrev(): Promise<void>
  addListener(
    event: 'progress' | 'stateChanged' | 'ready' | 'error' | 'trackEnded' | 'nextTrack' | 'prevTrack',
    handler: (data: any) => void,
  ): Promise<{ remove: () => void }>
}

export const AudioPlayer = registerPlugin<AudioPlayerPlugin>('AudioPlayer')
