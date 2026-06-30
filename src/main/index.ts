import { app, BrowserWindow, session, protocol, net, powerMonitor } from 'electron'
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
    for (const ni of iface ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address
    }
  }
  return 'localhost'
}
import { setupTray } from './modules/tray'
import { setupAutoLaunch } from './modules/autoLaunch'
import { setupIPC } from './modules/ipc'
import { setupMusicIPC } from './modules/music/index'
import { initializeTracking, recordSystemEvent, setupActivityIPC, flushAndStop } from './modules/activityTracker'
import { startNavServer, setupNavIPC } from './modules/navServer'
import { setupWallpaperEngineIPC, shutdownWallpaperEngine } from './modules/wallpaperEngine'
import { setupLocalWallpaperIPC } from './modules/localWallpaper'

// local-img:// 协议必须在 app ready 前注册
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-img', privileges: { bypassCSP: true, corsEnabled: true, supportFetchAPI: true } },
  { scheme: 'local-media', privileges: { bypassCSP: true, corsEnabled: true, supportFetchAPI: true, stream: true } },
])

// Windows 11 任务栏媒体控制 (SMTC) 必须在 app ready 前设置
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService')

// 绕过本地地址的代理，外部域名（如 konachan.net）仍走系统代理（v2rayN/Clash）
app.commandLine.appendSwitch('proxy-bypass-list', '<local>;127.0.0.1;::1;192.168.0.0/16;10.0.0.0/8')

let mainWindow: BrowserWindow | null = null
let isQuitting = false
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) app.quit()

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

// ── 读取 WinInet 系统代理并显式写入 session，确保 Electron 走 Clash/v2ray ──
async function syncSystemProxy(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    const { execSync } = await import('child_process')
    const r1 = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    if (!r1.includes('0x1')) return  // 系统代理未启用（纯 TUN 模式）
    const r2 = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const m = r2.match(/ProxyServer\s+REG_SZ\s+(.+)/)
    if (!m) return
    const addr = m[1].trim()  // 形如 "127.0.0.1:7897"
    await session.defaultSession.setProxy({
      proxyRules: addr,
      proxyBypassRules: '<local>;127.0.0.1;::1;192.168.0.0/16;10.0.0.0/8;172.16.0.0/12',
    })
  } catch { /* 读取失败，沿用自动检测 */ }
}

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

function createWindow(showOnReady = true): void {
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

  mainWindow.on('ready-to-show', () => { if (showOnReady) mainWindow?.show() })
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

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  await syncSystemProxy()   // 先同步代理，再创建窗口

  // 本地图片协议处理
  protocol.handle('local-img', (request) => {
    const fp = new URL(request.url).searchParams.get('p') ?? ''
    if (!fp) return new Response('', { status: 404 })
    return net.fetch(`file:///${fp}`)
  })
  protocol.handle('local-media', (request) => {
    const fp = new URL(request.url).searchParams.get('p') ?? ''
    if (!fp) return new Response('', { status: 404 })
    return net.fetch(`file:///${fp}`)
  })

  app.setAppUserModelId('com.suxin.desktop')
  app.setName('SuXin Desktop')
  setupSessionHeaders()
  const openedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin
  createWindow(!openedAtLogin)
  if (mainWindow) setupTray(mainWindow, () => { isQuitting = true })
  setupAutoLaunch()
  setupIPC(mainWindow!)
  setupMusicIPC()
  setupActivityIPC()
  initializeTracking()
  powerMonitor.on('suspend', () => recordSystemEvent('suspend'))
  powerMonitor.on('resume', () => recordSystemEvent('resume'))
  powerMonitor.on('lock-screen', () => recordSystemEvent('lock'))
  powerMonitor.on('unlock-screen', () => recordSystemEvent('unlock'))
  setupNavIPC()
  startNavServer()
  setupWallpaperEngineIPC()
  setupLocalWallpaperIPC()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(true) })
})

app.on('window-all-closed', () => { /* 留在托盘 */ })
app.on('before-quit', () => { isQuitting = true; flushAndStop(); shutdownWallpaperEngine() })
