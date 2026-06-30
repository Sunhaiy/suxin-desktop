export interface Track {
  id: string
  title: string
  artist: string
  album: string
  cover: string
  duration: number
  source: MusicSource
  url?: string
  path?: string
  lyricPath?: string
  modifiedAt?: number
}

export type MusicSource = 'local' | 'netease' | 'qq' | 'kugou' | 'kuwo' | 'bilibili' | 'migu' | 'taihe'

export interface SearchResult {
  tracks: Track[]
  total: number
}

export type NavPage = 'music' | 'automation' | 'settings'
