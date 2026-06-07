import { BrowserWindow, ipcMain } from 'electron'
import * as netease from './netease'
import * as qq from './qq'
import * as kugou from './kugou'
import { set as setCookie, clear as clearCookie } from './cookieStore'

type SongUrlResult = { url: string | null; cover?: string }
type Provider = {
  search: (q: string, limit: number, offset: number) => Promise<any[]>
  getUrl: (id: string) => Promise<SongUrlResult>
}
const providers: Record<string, Provider> = { netease, qq, kugou }

const PAGE_SIZE = 30

export function setupMusicIPC(): void {
  // ── 搜索（支持分页 offset）──────────────────────────────────────
  ipcMain.handle('music:search', async (
    _e,
    { query, source, offset = 0 }: { query: string; source: string; offset?: number }
  ) => {
    if (!query.trim()) return []
    try {
      if (source === 'all') {
        const settled = await Promise.allSettled(
          Object.values(providers).map((p) => p.search(query, PAGE_SIZE, offset))
        )
        return settled
          .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
          .flatMap((r) => r.value)
      }
      return await (providers[source]?.search(query, PAGE_SIZE, offset) ?? Promise.resolve([]))
    } catch (e) {
      console.error('[music:search]', e)
      return []
    }
  })

  // ── 获取播放 URL + 封面 ────────────────────────────────────────
  ipcMain.handle('music:getUrl', async (_e, { id }: { id: string }) => {
    const source = id.split('_')[0]
    try {
      return await (providers[source]?.getUrl(id) ?? Promise.resolve({ url: null }))
    } catch (e) {
      console.error('[music:getUrl]', e)
      return { url: null }
    }
  })

  // ── 歌词 ───────────────────────────────────────────────────────
  ipcMain.handle('music:getLyric', async (_e, { id }: { id: string }) => {
    if (!id.startsWith('netease_')) return ''
    return netease.getLyric(id)
  })

  // ── 登录状态 ───────────────────────────────────────────────────
  ipcMain.handle('auth:status', () => ({
    netease: netease.isLoggedIn(),
    qq: qq.isLoggedIn(),
  }))

  // ── 网易云：打开浏览器窗口登录（同 QQ 方案）───────────────────
  ipcMain.handle('auth:netease:openLogin', () => openLoginWindow({
    title: '网易云音乐 - 登录',
    url: 'https://music.163.com/#/login',
    cookieDomain: 'https://music.163.com',
    cookieName: 'MUSIC_U',
    onSuccess: async (win) => {
      const all = await win.webContents.session.cookies.get({ url: 'https://music.163.com' })
      netease.saveCookie(all.map((c) => `${c.name}=${c.value}`).join('; '))
    },
    isLoggedIn: netease.isLoggedIn,
  }))

  ipcMain.handle('auth:netease:logout', () => clearCookie('netease'))

  // ── QQ 音乐：打开浏览器窗口登录 ───────────────────────────────
  ipcMain.handle('auth:qq:openLogin', () => openLoginWindow({
    title: 'QQ 音乐 - 登录',
    url: 'https://y.qq.com',
    cookieDomain: 'https://y.qq.com',
    cookieName: 'uin',
    onSuccess: async (win) => {
      const all = await win.webContents.session.cookies.get({ url: 'https://y.qq.com' })
      setCookie('qq', all.map((c) => `${c.name}=${c.value}`).join('; '))
    },
    isLoggedIn: qq.isLoggedIn,
  }))

  ipcMain.handle('auth:qq:logout', () => clearCookie('qq'))
}

// ── 通用浏览器窗口登录 helper ─────────────────────────────────────
function openLoginWindow(opts: {
  title: string
  url: string
  cookieDomain: string
  cookieName: string
  onSuccess: (win: BrowserWindow) => Promise<void>
  isLoggedIn: () => boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 900,
      height: 680,
      title: opts.title,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    win.loadURL(opts.url)

    const timer = setInterval(async () => {
      try {
        const cookies = await win.webContents.session.cookies.get({
          url: opts.cookieDomain,
          name: opts.cookieName,
        })
        if (cookies.length > 0) {
          clearInterval(timer)
          await opts.onSuccess(win)
          win.close()
          resolve(true)
        }
      } catch {}
    }, 2000)

    win.on('closed', () => {
      clearInterval(timer)
      resolve(opts.isLoggedIn())
    })
  })
}
