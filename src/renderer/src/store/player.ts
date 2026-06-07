import { create } from 'zustand'
import type { Track } from '../types'

export type PlayMode = 'sequential' | 'loop' | 'shuffle' | 'repeat-one'

export interface LyricLine {
  time: number
  text: string
}

interface PlayerState {
  currentTrack: Track | null
  isPlaying: boolean
  volume: number
  progress: number
  duration: number
  queue: Track[]
  playMode: PlayMode
  lyrics: LyricLine[]
  currentLyricIdx: number
  showLyrics: boolean

  setTrack: (track: Track) => void
  setPlaying: (v: boolean) => void
  setVolume: (v: number) => void
  setProgress: (v: number) => void
  setDuration: (v: number) => void
  setQueue: (tracks: Track[]) => void
  setPlayMode: (m: PlayMode) => void
  cyclePlayMode: () => void
  setLyrics: (lines: LyricLine[]) => void
  setCurrentLyricIdx: (i: number) => void
  toggleLyrics: () => void
  playNext: () => void
  playPrev: () => void
}

const MODES: PlayMode[] = ['sequential', 'loop', 'shuffle', 'repeat-one']

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  volume: 0.8,
  progress: 0,
  duration: 0,
  queue: [],
  playMode: 'loop',
  lyrics: [],
  currentLyricIdx: -1,
  showLyrics: false,

  setTrack: (track) => set({ currentTrack: track, progress: 0, lyrics: [], currentLyricIdx: -1 }),
  setPlaying: (v) => set({ isPlaying: v }),
  setVolume: (v) => set({ volume: v }),
  setProgress: (v) => set({ progress: v }),
  setDuration: (v) => set({ duration: v }),
  setQueue: (tracks) => set({ queue: tracks }),
  setPlayMode: (m) => set({ playMode: m }),
  cyclePlayMode: () =>
    set((s) => ({ playMode: MODES[(MODES.indexOf(s.playMode) + 1) % MODES.length] })),
  setLyrics: (lines) => set({ lyrics: lines }),
  setCurrentLyricIdx: (i) => set({ currentLyricIdx: i }),
  toggleLyrics: () => set((s) => ({ showLyrics: !s.showLyrics })),

  playNext: () => {
    const { currentTrack, queue, playMode } = get()
    if (!currentTrack || !queue.length) return

    const idx = queue.findIndex((t) => t.id === currentTrack.id)

    switch (playMode) {
      case 'repeat-one':
        // PlayerBar 的 onEnded 直接 seek+play，这里不切歌
        return
      case 'sequential':
        if (idx >= queue.length - 1) {
          set({ isPlaying: false })
        } else {
          set({ currentTrack: queue[idx + 1], progress: 0, lyrics: [], currentLyricIdx: -1 })
        }
        break
      case 'loop':
        set({
          currentTrack: queue[(idx + 1) % queue.length],
          progress: 0, lyrics: [], currentLyricIdx: -1,
        })
        break
      case 'shuffle': {
        let next = Math.floor(Math.random() * queue.length)
        if (queue.length > 1 && next === idx) next = (next + 1) % queue.length
        set({ currentTrack: queue[next], progress: 0, lyrics: [], currentLyricIdx: -1 })
        break
      }
    }
  },

  playPrev: () => {
    const { currentTrack, queue, playMode } = get()
    if (!currentTrack || !queue.length) return

    const idx = queue.findIndex((t) => t.id === currentTrack.id)

    if (playMode === 'shuffle') {
      let prev = Math.floor(Math.random() * queue.length)
      if (queue.length > 1 && prev === idx) prev = (prev + 1) % queue.length
      set({ currentTrack: queue[prev], progress: 0, lyrics: [], currentLyricIdx: -1 })
    } else {
      const prev = (idx - 1 + queue.length) % queue.length
      set({ currentTrack: queue[prev], progress: 0, lyrics: [], currentLyricIdx: -1 })
    }
  },
}))
