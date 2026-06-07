export interface Track {
  id: string
  title: string
  artist: string
  album: string
  cover: string
  duration: number
  source: MusicSource
  url?: string
}

export type MusicSource = 'netease' | 'qq' | 'kugou' | 'kuwo' | 'bilibili' | 'migu' | 'taihe'

export interface SearchResult {
  tracks: Track[]
  total: number
}

export type NavPage = 'music' | 'automation' | 'settings'
