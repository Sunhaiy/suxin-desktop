import { create } from 'zustand'
import type { Track } from '../types'

export interface Playlist {
  id: string
  name: string
  createdAt: number
  tracks: Track[]
}

interface PlaylistState {
  playlists: Playlist[]
  create: (name: string) => Playlist
  remove: (id: string) => void
  rename: (id: string, name: string) => void
  addTrack: (playlistId: string, track: Track) => boolean
  removeTrack: (playlistId: string, trackId: string) => void
}

const KEY = 'playlists'

/** 同步读取（主进程 sendSync，不受 dev/prod 域名影响） */
function load(): Playlist[] {
  try {
    const raw = window.electron?.store?.getSync(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(playlists: Playlist[]) {
  try {
    window.electron?.store?.set(KEY, JSON.stringify(playlists))
  } catch {}
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: load(),   // 应用启动时同步加载，无闪烁

  create: (name) => {
    const pl: Playlist = { id: `pl_${Date.now()}`, name: name.trim(), createdAt: Date.now(), tracks: [] }
    set((s) => { const playlists = [...s.playlists, pl]; save(playlists); return { playlists } })
    return pl
  },

  remove: (id) =>
    set((s) => { const playlists = s.playlists.filter((p) => p.id !== id); save(playlists); return { playlists } }),

  rename: (id, name) =>
    set((s) => {
      const playlists = s.playlists.map((p) => (p.id === id ? { ...p, name: name.trim() } : p))
      save(playlists); return { playlists }
    }),

  addTrack: (playlistId, track) => {
    const pl = get().playlists.find((p) => p.id === playlistId)
    if (!pl) return false
    if (pl.tracks.some((t) => t.id === track.id)) return false
    set((s) => {
      const playlists = s.playlists.map((p) =>
        p.id === playlistId ? { ...p, tracks: [...p.tracks, track] } : p,
      )
      save(playlists); return { playlists }
    })
    return true
  },

  removeTrack: (playlistId, trackId) =>
    set((s) => {
      const playlists = s.playlists.map((p) =>
        p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p,
      )
      save(playlists); return { playlists }
    }),
}))
