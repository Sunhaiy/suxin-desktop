import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import TitleBar from './components/Layout/TitleBar'
import Sidebar from './components/Layout/Sidebar'
import PlayerBar from './components/Player/PlayerBar'
import Lyrics from './components/Player/Lyrics'
import Toaster from './components/UI/Toaster'
import Music from './pages/Music'
import Playlists from './pages/Playlists'
import Settings from './pages/Settings'
import ActivityLog from './pages/ActivityLog'
import Wallpaper from './pages/Wallpaper'
import { usePlayerStore } from './store/player'
import { getMusicLyric } from './api/music'

export default function App() {
  const { currentTrack, showLyrics, setLyrics } = usePlayerStore()

  useEffect(() => {
    if (!currentTrack) return
    getMusicLyric(currentTrack.id).then(setLyrics)
  }, [currentTrack?.id])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-primary">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex flex-1 overflow-hidden bg-primaryLight">
          <div className={['flex flex-col', showLyrics ? 'flex-1' : 'w-full'].join(' ')}>
            <Routes>
              <Route path="/" element={<Navigate to="/music" replace />} />
              <Route path="/music" element={<Music />} />
              <Route path="/playlists" element={<Playlists />} />
              <Route path="/activity"   element={<ActivityLog />} />
              <Route path="/wallpaper" element={<Wallpaper />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>

          {showLyrics && (
            <div className="w-72 flex-shrink-0 border-l border-dividerLight bg-primary">
              <Lyrics />
            </div>
          )}
        </main>
      </div>

      <PlayerBar />
      <Toaster />
    </div>
  )
}
