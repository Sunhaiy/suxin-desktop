import { app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { networkInterfaces } from 'os'

/**
 * 获取本机局域网 IPv4 地址（如 192.168.1.x）
 * 用于替换 localhost，绕过 v2rayN TUN 模式对 loopback 的劫持。
 * TUN 路由规则里 geoip:private → direct，LAN IP 直连，localhost 被截。
 */
function getLanIP(): string {
  const nets = networkInterfaces()
  for (const iface of Object.values(nets ?? {})) {
    for (const net of iface ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return 'localhost'
}
import { setupTray } from './modules/tray'
import { setupAutoLaunch } from './modules/autoLaunch'
import { setupIPC } from './modules/ipc'
import { setupMusicIPC } from './modules/music/index'
import { startTracking, setupActivityIPC, flushAndStop } from './modules/activityTracker'
import { startNavServer, setupNavIPC } from './modules/navServer'
import { setupWallpaperEngineIPC, shutdownWallpaperEngine } from './modules/wallpaperEngine'

// Windows 11 任务栏媒体控制 (SMTC) 必须在 app ready 前设置
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService')

// 不走系统代理（解决开启 v2rayN/Clash 时 localhost 无法访问的问题）
app.commandLine.appendSwitch('no-proxy-server')

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// ── CDN 请求拦截：注入 Referer / Origin，解决音频403问题 ─────────
function setupSessionHeaders() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        '*://*.music.126.net/*',
        '*://*.music.163.com/*',
        '*://*.stream.qqmusic.qq.com/*',
        '*://*.y.qq.com/*',
        '*://*.kugou.com/*',
        '*://*.imge.kugou.com/*',
        '*://*.imgessl.kugou.com/*',
        '*://*.kuwo.cn/*',
      ],
    },
    (details, callback) => {
      const h = { ...details.requestHeaders }
      const url = details.url

      if (url.includes('music.126.net') || url.includes('music.163.com')) {
        h['Referer'] = 'https://music.163.com/'
        h['Origin'] = 'https://music.163.com'
      } else if (url.includes('qqmusic.qq.com') || url.includes('y.qq.com')) {
        h['Referer'] = 'https://y.qq.com/'
      } else if (url.includes('kugou.com')) {
        h['Referer'] = 'https://www.kugou.com/'
      } else if (url.includes('kuwo.cn')) {
        h['Referer'] = 'https://www.kuwo.cn/'
      }

      callback({ requestHeaders: h })
    },
  )
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#181818',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow?.hide() }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    // 开发模式：把 localhost 替换为局域网 IP，绕过 TUN 对 loopback 的劫持
    const devURL = process.env['ELECTRON_RENDERER_URL'].replace('localhost', getLanIP())
    mainWindow.loadURL(devURL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.suxin.desktop')
  app.setName('SuXin Desktop')
  setupSessionHeaders()
  createWindow()
  if (mainWindow) setupTray(mainWindow, () => { isQuitting = true })
  setupAutoLaunch()
  setupIPC(mainWindow!)
  setupMusicIPC()
  setupActivityIPC()
  startTracking()
  setupNavIPC()
  startNavServer()
  setupWallpaperEngineIPC()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { /* 留在托盘 */ })
app.on('before-quit', () => { isQuitting = true; flushAndStop(); shutdownWallpaperEngine() })
