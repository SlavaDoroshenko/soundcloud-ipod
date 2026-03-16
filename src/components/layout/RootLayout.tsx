import { Outlet } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { currentTrackAtom } from '@/stores/player'
import BottomNav from './BottomNav'
import MiniPlayer from '@/components/player/MiniPlayer'
import NowPlaying from '@/components/player/NowPlaying'
import { cn } from '@/lib/utils'

export default function RootLayout() {
  const currentTrack = useAtomValue(currentTrackAtom)

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <main className={cn(
        'flex-1 overflow-y-auto',
        currentTrack ? 'pb-nav-player' : 'pb-nav',
      )}>
        <Outlet />
      </main>

      {currentTrack && <MiniPlayer />}
      <BottomNav />
      <NowPlaying />
    </div>
  )
}
