import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import TitleBar from './components/Layout/TitleBar'
import Sidebar from './components/Layout/Sidebar'
import PlayerBar from './components/Player/PlayerBar'
import Lyrics from './components/Player/Lyrics'
import Toaster from './components/UI/Toaster'
import Music from './pages/Music'
import Settings from './pages/Settings'
import ActivityLog from './pages/ActivityLog'
import Wallpaper from './pages/Wallpaper'
import { usePlayerStore } from './store/player'

export default function App() {
  const { currentTrack, showLyrics, setLyrics } = usePlayerStore()

  useEffect(() => {
    if (!currentTrack?.lyricPath) { setLyrics([]); return }
    window.electron.invoke<string>('music:getLocalLyric', currentTrack.lyricPath).then(raw => {
      const lines = raw.split(/\r?\n/).flatMap(line => {
        const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
        return match ? [{ time: Number(match[1]) * 60 + Number(match[2]), text: match[3].trim() }] : []
      }).sort((a, b) => a.time - b.time)
      setLyrics(lines)
    })
  }, [currentTrack?.id, currentTrack?.lyricPath, setLyrics])

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
