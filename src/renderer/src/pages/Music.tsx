import { useCallback, useEffect, useMemo, useState } from 'react'
import { Disc3, FolderOpen, Music2, Play, RefreshCw, Search } from 'lucide-react'
import { usePlayerStore } from '../store/player'
import type { Track } from '../types'

export default function Music() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [directory, setDirectory] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const { currentTrack, setTrack, setPlaying, setQueue } = usePlayerStore()

  const scan = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    const [items, dir] = await Promise.all([
      window.electron.invoke<Track[]>('music:scanLocal'),
      window.electron.invoke<string>('music:getDirectory'),
    ])
    setTracks(items ?? [])
    setQueue(items ?? [])
    setDirectory(dir ?? '')
    setLoading(false)
  }, [setQueue])

  useEffect(() => {
    void scan()
    const timer = setInterval(() => { void scan(true) }, 10_000)
    return () => clearInterval(timer)
  }, [scan])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter(track => [track.title, track.artist, track.album].some(v => v.toLowerCase().includes(q)))
  }, [tracks, query])

  function play(track: Track) {
    setQueue(filtered)
    setTrack(track)
    setPlaying(true)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-dividerLight px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-secondaryDark">本地音乐</p>
          <p className="truncate text-[10px] text-secondary opacity-60">{directory}</p>
        </div>
        <label className="flex w-60 items-center gap-2 rounded-lg border border-dividerLight bg-primaryDark px-3 py-1.5">
          <Search size={12} className="text-secondary" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索歌曲、艺术家、专辑"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-secondaryDark outline-none" />
        </label>
        <button onClick={() => window.electron.invoke('music:openDirectory')} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] text-secondary hover:bg-primaryDark hover:text-accent">
          <FolderOpen size={12} /> 音乐目录
        </button>
        <button onClick={() => scan()} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] text-secondary hover:bg-primaryDark hover:text-accent">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 扫描
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!loading && tracks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-secondary">
            <Disc3 size={38} className="opacity-20" />
            <p className="text-[13px]">音乐目录还是空的</p>
            <p className="text-[11px] opacity-60">放入 MP3、FLAC、WAV、M4A、AAC、OGG 或 OPUS，10 秒内自动出现</p>
            <button onClick={() => window.electron.invoke('music:openDirectory')} className="rounded-lg bg-accent px-4 py-1.5 text-[11px] text-white">打开音乐目录</button>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="mb-2 text-[10px] text-secondary">{filtered.length} 首歌曲 · 双击播放</p>
            {filtered.map((track, index) => {
              const active = currentTrack?.id === track.id
              return (
                <button key={track.id} onDoubleClick={() => play(track)} onClick={() => active && setPlaying(true)}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${active ? 'bg-accent/10' : 'hover:bg-white/[0.035]'}`}>
                  <span className="w-6 text-center text-[10px] tabular-nums text-secondary">{active ? <Play size={11} className="mx-auto text-accent" fill="currentColor" /> : index + 1}</span>
                  {track.cover ? <img src={track.cover} className="h-9 w-9 rounded object-cover" alt="" /> : <div className="flex h-9 w-9 items-center justify-center rounded bg-white/5"><Music2 size={15} className="text-secondary" /></div>}
                  <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium text-secondaryDark">{track.title}</p><p className="truncate text-[10px] text-secondary">{track.artist}</p></div>
                  <span className="w-40 truncate text-[10px] text-secondary">{track.album}</span>
                  <span className="text-[10px] uppercase text-secondary opacity-50">{track.path?.split('.').pop()}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
