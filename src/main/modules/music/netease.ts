/**
 * 网易云音乐
 * API: interface.music.163.com (Android 客户端端点，不需要 WeAPI 加密)
 */
import axios from 'axios'
import { get as getCookie, set as setCookie } from './cookieStore'

const UA          = 'NeteaseMusic/9.1.65.240927161425(9001065);Dalvik/2.1.0 (Linux; U; Android 14; 23013RK75C Build/UKQ1.230804.001)'
const BASE_COOKIE = 'os=android; appver=9.1.65; channel=netease'
const BASE        = 'https://interface.music.163.com'

function headers(): Record<string, string> {
  const user = getCookie('netease') ?? ''
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    Referer: 'https://music.163.com',
    'User-Agent': UA,
    Cookie: user ? `${BASE_COOKIE}; ${user}` : BASE_COOKIE,
  }
}

function http(path: string, data: Record<string, unknown>) {
  return axios
    .post(`${BASE}${path}`, new URLSearchParams(data as any).toString(), {
      headers: headers(),
      timeout: 12000,
    })
    .then((r) => r.data)
}

// ── 搜索 ──────────────────────────────────────────────────────────
export async function search(keywords: string, limit = 30, offset = 0) {
  const res = await http('/api/search/get/web', {
    s: keywords, type: 1, limit, offset, total: true, csrf_token: '',
  })
  const songs: any[] = res.result?.songs ?? []
  if (!songs.length) return []

  // 批量拉封面（search 只返回 picId 数字，detail 才有完整 picUrl）
  const covers = await batchCovers(songs.map((s: any) => s.id))

  return songs.map((s: any) => mapSong(s, covers.get(s.id) ?? ''))
}

async function batchCovers(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  try {
    const res = await http('/api/song/detail', {
      ids: JSON.stringify(ids),
      c: JSON.stringify(ids.map((id) => ({ id }))),
      csrf_token: '',
    })
    for (const s of (res.songs ?? []) as any[]) {
      const url = s.al?.picUrl || s.album?.picUrl || ''
      if (url) map.set(s.id, url)
    }
  } catch {}
  return map
}

function mapSong(s: any, rawCover: string) {
  const artists = (s.ar ?? s.artists ?? []).map((a: any) => a.name).join(' / ')
  const album   = s.al ?? s.album ?? {}
  return {
    id:       `netease_${s.id}`,
    title:    s.name,
    artist:   artists,
    album:    album.name ?? '',
    cover:    rawCover ? `${toHttps(rawCover)}?param=130y130` : '',
    duration: Math.floor((s.dt ?? s.duration ?? 0) / 1000),
    source:   'netease' as const,
  }
}

// ── 排行榜（热歌/新歌/飙升） ────────────────────────────────────────
const CHART_IDS = [
  { id: 3778678,  name: '热歌榜' },
  { id: 3779629,  name: '新歌榜' },
  { id: 19723756, name: '飙升榜' },
]

export interface ChartCard {
  id: number
  name: string
  cover: string
  tracks: ReturnType<typeof mapSong>[]
}

export async function getCharts(): Promise<ChartCard[]> {
  const results = await Promise.allSettled(
    CHART_IDS.map(async ({ id, name }) => {
      const res = await http('/api/playlist/detail', {
        id, t: -1, n: 10, s: 0, csrf_token: '',
      })
      const pl = res.playlist ?? {}
      const tracks = ((pl.tracks ?? []) as any[])
        .slice(0, 5)
        .map((s: any) => mapSong(s, s.al?.picUrl ?? ''))
      const rawCover = pl.coverImgUrl || pl.picUrl || pl.backgroundCoverUrl || ''
      return {
        id,
        name:   pl.name ?? name,
        cover:  rawCover ? toHttps(rawCover) : (tracks[0]?.cover ?? ''),
        tracks,
      }
    })
  )
  return results
    .filter((r): r is PromiseFulfilledResult<ChartCard> => r.status === 'fulfilled')
    .map(r => r.value)
}

// ── 新歌推荐 ──────────────────────────────────────────────────────
export async function getNewSongs(limit = 16): Promise<ReturnType<typeof mapSong>[]> {
  try {
    const res = await http('/api/personalized/newsong', { limit, csrf_token: '' })
    return ((res.result ?? []) as any[]).map((item: any) => {
      const s = item.song
      const cover = s.album?.blurPicUrl ?? s.album?.picUrl ?? ''
      return mapSong(s, cover)
    })
  } catch { return [] }
}

// ── 获取播放 URL ──────────────────────────────────────────────────
export async function getUrl(id: string): Promise<{ url: string | null; cover?: string }> {
  const realId = id.replace('netease_', '')

  try {
    const res = await http('/api/song/enhance/player/url', {
      ids: `[${realId}]`, br: 320000, csrf_token: '',
    })
    const item = res.data?.[0]
    if (item?.url) return { url: toHttps(item.url) }
  } catch {}

  // 策略 2：outer/url 重定向
  try {
    const res = await axios.get(
      `https://music.163.com/song/media/outer/url?id=${realId}`,
      { headers: { Referer: 'https://music.163.com', 'User-Agent': UA }, maxRedirects: 0, validateStatus: () => true },
    )
    const loc = res.headers?.location
    if (loc && !loc.includes('163.com/404')) return { url: toHttps(loc) }
  } catch {}

  return { url: null }
}

// ── 歌词 ─────────────────────────────────────────────────────────
export async function getLyric(id: string): Promise<string> {
  const realId = id.replace('netease_', '')
  try {
    const res = await http('/api/song/lyric', {
      id: realId, lv: -1, kv: -1, tv: -1,
    })
    return res.lrc?.lyric ?? ''
  } catch {
    return ''
  }
}

function toHttps(url: string) {
  return url.replace(/^http:\/\//, 'https://')
}

export function isLoggedIn() { return !!getCookie('netease') }
export function saveCookie(c: string) { setCookie('netease', c) }
