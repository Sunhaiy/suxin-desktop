import type { Track, MusicSource } from '../types'
import type { LyricLine } from '../store/player'
import { parseLRC } from '../components/Player/Lyrics'

export type SearchSource = MusicSource | 'all'

export async function searchMusic(query: string, source: SearchSource = 'all', offset = 0): Promise<Track[]> {
  return window.electron.invoke<Track[]>('music:search', { query, source, offset })
}

export async function getMusicUrl(id: string): Promise<{ url: string | null; cover?: string }> {
  return window.electron.invoke<{ url: string | null; cover?: string }>('music:getUrl', { id })
}

export async function getMusicLyric(id: string): Promise<LyricLine[]> {
  const raw = await window.electron.invoke<string>('music:getLyric', { id })
  return parseLRC(raw || '')
}

// ── 发现页 ────────────────────────────────────────────────────────
export interface ChartCard {
  id: number
  name: string
  cover: string
  tracks: Track[]
}
export interface DiscoverData {
  charts: ChartCard[]
  newSongs: Track[]
}
export async function getDiscover(): Promise<DiscoverData> {
  return window.electron.invoke<DiscoverData>('music:discover')
}

// ── 认证 ─────────────────────────────────────────────────────────
export async function getAuthStatus(): Promise<{ netease: boolean; qq: boolean }> {
  return window.electron.invoke('auth:status')
}

/** 打开网易云登录浏览器窗口，成功返回 true */
export async function loginNetease(): Promise<boolean> {
  return window.electron.invoke<boolean>('auth:netease:openLogin')
}

export async function logoutNetease(): Promise<void> {
  return window.electron.invoke('auth:netease:logout')
}

/** 打开 QQ 音乐登录浏览器窗口，成功返回 true */
export async function loginQQ(): Promise<boolean> {
  return window.electron.invoke<boolean>('auth:qq:openLogin')
}

export async function logoutQQ(): Promise<void> {
  return window.electron.invoke('auth:qq:logout')
}
