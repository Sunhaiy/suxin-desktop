import axios from 'axios'
import crypto from 'crypto'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// ── 搜索 ──────────────────────────────────────────────────────────
export async function search(keywords: string, limit = 30, offset = 0) {
  const page = Math.floor(offset / limit) + 1
  const res = await axios.get('http://mobilecdn.kugou.com/api/v3/search/song', {
    params: { format: 'json', keyword: keywords, page, pagesize: limit, showtype: 1 },
    headers: { 'User-Agent': UA },
    timeout: 10000,
  })
  const songs: any[] = res.data?.data?.info ?? []
  if (!songs.length) return []

  // 批量拉专辑封面（search 只有 album_id，需要调 album/info）
  const albumIds = [...new Set(songs.map((s: any) => Number(s.album_id)).filter(Boolean))]
  const covers   = await batchAlbumCovers(albumIds)

  return songs.map((s: any) => ({
    id:       `kugou_${s.hash}`,
    title:    (s.songname ?? s.filename ?? '').replace(/<\/?em>/g, ''),
    artist:   s.singername ?? '',
    album:    s.album_name ?? '',
    cover:    covers.get(Number(s.album_id)) ?? '',
    duration: s.duration ?? 0,
    source:   'kugou' as const,
  }))
}

async function batchAlbumCovers(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  // 并行拉，最多同时 8 个
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += 8) chunks.push(ids.slice(i, i + 8))

  for (const chunk of chunks) {
    await Promise.allSettled(
      chunk.map(async (albumId) => {
        try {
          const r = await axios.get('http://mobilecdn.kugou.com/api/v3/album/info', {
            params: { albumid: albumId, plat: 0, pagesize: 1, area_code: 1 },
            headers: { 'User-Agent': UA },
            timeout: 5000,
          })
          const imgurl: string = r.data?.data?.imgurl ?? ''
          if (imgurl) {
            // 模板格式：http://imge.kugou.com/stdmusic/{size}/20230920/xxx.jpg
            map.set(albumId, imgurl.replace('{size}', '400').replace(/^http:\/\//, 'https://'))
          }
        } catch {}
      }),
    )
  }
  return map
}

// ── 获取播放 URL + 封面 ────────────────────────────────────────────
export async function getUrl(id: string): Promise<{ url: string | null; cover?: string }> {
  const hash = id.replace('kugou_', '').toUpperCase()

  try {
    const ts  = String(Math.floor(Date.now() / 1000))
    const mid = crypto.randomUUID().replace(/-/g, '')
    const sig = crypto.createHash('md5')
      .update(`NVPh55sTt9zKpW8${hash}${ts}NVPh55sTt9zKpW8`)
      .digest('hex')

    const res = await axios.get('https://wwwapi.kugou.com/play/songinfo', {
      params: {
        srcappid: 2919, clientver: 20000, clienttime: ts,
        mid, uuid: mid, dfid: '-', appid: 1014, platid: 4,
        encode_album_audio_id: hash, token: '', userid: 0, signature: sig,
      },
      headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com' },
      timeout: 10000,
    })

    const data   = res.data?.data ?? {}
    const url    = data.play_url ? String(data.play_url) : null
    const imgUrl = (data.img ?? data.imgcrop ?? '') as string
    const cover  = imgUrl ? imgUrl.replace(/^http:\/\//, 'https://') : undefined

    return { url, cover }
  } catch {
    return { url: null }
  }
}
