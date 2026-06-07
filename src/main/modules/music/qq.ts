import axios from 'axios'
import { get as getCookie } from './cookieStore'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function headers() {
  const cookie = getCookie('qq') ?? ''
  return {
    'User-Agent': UA,
    Referer: 'https://y.qq.com',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

export async function search(keywords: string, limit = 30, offset = 0) {
  const page = Math.floor(offset / limit) + 1
  const res = await axios.get('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
    params: { w: keywords, n: limit, p: page, format: 'json', platform: 'yqq.json', needNewCode: 0 },
    headers: headers(),
    timeout: 10000,
  })
  return (res.data?.data?.song?.list ?? []).map((s: any) => ({
    id: `qq_${s.songmid}`,
    title: s.songname,
    artist: (s.singer ?? []).map((a: any) => a.name).join(' / '),
    album: s.albumname ?? '',
    cover: s.albummid
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid}.jpg`
      : '',
    duration: s.interval ?? 0,
    source: 'qq' as const,
  }))
}

export async function getUrl(id: string): Promise<{ url: string | null; cover?: string }> {
  const songmid = id.replace('qq_', '')
  const guid    = String(Math.floor(Math.random() * 9e9))

  try {
    const data = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: { guid, songmid: [songmid], songtype: [0], uin: '0', loginflag: 1, platform: '20' },
      },
      comm: { uin: 0, format: 'json', ct: 24, cv: 0 },
    }
    const res = await axios.get('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      params: { format: 'json', data: JSON.stringify(data) },
      headers: headers(),
      timeout: 10000,
    })
    const info = res.data?.req_0?.data?.midurlinfo?.[0]
    if (info?.purl) return { url: `https://dl.stream.qqmusic.qq.com/${info.purl}` }
  } catch {}

  return { url: null }
}

export function isLoggedIn(): boolean {
  return !!getCookie('qq')
}
