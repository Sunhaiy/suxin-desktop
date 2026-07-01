/**
 * Local navigation page server.
 * Serves static files from userData/nav/ on http://localhost:<port>
 * Port is persisted in userData/nav-config.json and changeable at runtime.
 * Creates an example index.html on first run.
 */
import { app, dialog, ipcMain, shell } from 'electron'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { getDataBase } from './paths'

const DEFAULT_PORT = 9900
let currentPort    = DEFAULT_PORT
let currentNavDir  = ''

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
}

// ── Example page ────────────────────────────────────────────────────────────
// Written to userData/nav/index.html on first run. Edit freely.

const EXAMPLE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>新标签页</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }

body {
  min-height: 100vh;
  background: #0f0f0f;
  background-image: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(20,184,166,0.06) 0%, transparent 70%);
  color: #d4d4d4;
  font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2.25rem;
  padding: 2rem;
}

/* ── Clock ── */
#greeting {
  font-size: 0.8rem;
  color: #555;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
#clock {
  font-size: clamp(3.5rem, 9vw, 7.5rem);
  font-weight: 100;
  letter-spacing: 0.04em;
  color: #f0f0f0;
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', ui-monospace, 'Fira Code', monospace;
  line-height: 1;
  text-align: center;
}
#date {
  color: #4a4a4a;
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-align: center;
  margin-top: 0.5rem;
}

/* ── Search ── */
.search-wrap {
  position: relative;
  width: min(560px, 90vw);
}
.search-wrap input {
  width: 100%;
  padding: 0.8rem 3rem 0.8rem 1.4rem;
  background: #1a1a1a;
  border: 1px solid #272727;
  border-radius: 999px;
  color: #e8e8e8;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.search-wrap input:focus {
  border-color: rgba(20,184,166,0.5);
  box-shadow: 0 0 0 3px rgba(20,184,166,0.08);
}
.search-wrap input::placeholder { color: #3a3a3a; }
.search-btn {
  position: absolute;
  right: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #444;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.2rem;
  transition: color 0.15s;
  line-height: 1;
}
.search-btn:hover { color: #14b8a6; }

.engines {
  display: flex;
  justify-content: center;
  gap: 0.35rem;
  margin-top: 0.6rem;
}
.engines button {
  background: none;
  border: none;
  color: #3a3a3a;
  cursor: pointer;
  padding: 0.18rem 0.6rem;
  border-radius: 4px;
  font-size: 0.72rem;
  transition: all 0.15s;
}
.engines button:hover { color: #888; }
.engines button.active {
  color: #14b8a6;
  background: rgba(20,184,166,0.1);
}

/* ── Links ── */
.links {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 0.65rem;
  width: min(560px, 90vw);
}
.link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 0.85rem 0.4rem 0.7rem;
  border-radius: 14px;
  background: #161616;
  border: 1px solid transparent;
  text-decoration: none;
  color: #888;
  font-size: 0.68rem;
  text-align: center;
  transition: all 0.15s;
  cursor: pointer;
}
.link:hover {
  background: #1e1e1e;
  border-color: #2a2a2a;
  color: #ccc;
  transform: translateY(-1px);
}
.ico {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  font-weight: 600;
  flex-shrink: 0;
}
.ico img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
</style>
</head>
<body>

<div style="text-align:center">
  <div id="greeting"></div>
  <div id="clock">00:00:00</div>
  <div id="date"></div>
</div>

<div style="display:flex;flex-direction:column;align-items:center;width:100%">
  <div class="search-wrap">
    <input id="q" type="text" placeholder="搜索或输入网址…" autofocus>
    <button class="search-btn" onclick="doSearch()" title="搜索">→</button>
  </div>
  <div class="engines">
    <button id="e-google" onclick="setEngine('google')">Google</button>
    <button id="e-bing"   onclick="setEngine('bing')">Bing</button>
    <button id="e-baidu"  onclick="setEngine('baidu')">百度</button>
  </div>
</div>

<div class="links" id="links"></div>

<script>
const SITES = [
  { name: 'GitHub',       href: 'https://github.com',          bg: '#24292e', fg: '#fff', label: 'GH' },
  { name: 'YouTube',      href: 'https://youtube.com',         bg: '#ff0000', fg: '#fff', label: '▶' },
  { name: '哔哩哔哩',    href: 'https://bilibili.com',        bg: '#fb7299', fg: '#fff', label: 'B' },
  { name: '知乎',         href: 'https://zhihu.com',           bg: '#0084ff', fg: '#fff', label: '知' },
  { name: 'V2EX',         href: 'https://v2ex.com',            bg: '#4caf50', fg: '#fff', label: 'V2' },
  { name: 'Stack Overflow',href: 'https://stackoverflow.com',  bg: '#f48024', fg: '#fff', label: 'SO' },
  { name: 'Wikipedia',    href: 'https://wikipedia.org',       bg: '#f8f9fa', fg: '#202122', label: 'W' },
  { name: 'X / Twitter',  href: 'https://x.com',              bg: '#000',    fg: '#fff', label: '𝕏' },
  { name: 'Reddit',       href: 'https://reddit.com',         bg: '#ff4500', fg: '#fff', label: 'r/' },
  { name: 'Hacker News',  href: 'https://news.ycombinator.com',bg: '#ff6600', fg: '#fff', label: 'HN' },
  { name: 'Claude',       href: 'https://claude.ai',          bg: '#c96442', fg: '#fff', label: 'C' },
  { name: '豆瓣',         href: 'https://douban.com',         bg: '#2e7d32', fg: '#fff', label: '豆' },
]

const linksEl = document.getElementById('links')
SITES.forEach(s => {
  const a = document.createElement('a')
  a.className = 'link'
  a.href = s.href
  a.target = '_blank'
  a.rel = 'noopener'
  a.innerHTML =
    '<div class="ico" style="background:' + s.bg + ';color:' + s.fg + '">' +
    '<img src="https://www.google.com/s2/favicons?domain=' + new URL(s.href).hostname + '&sz=40" ' +
    'onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + s.label.replace(/'/g,"\\'") + '\'" alt="">' +
    '</div>' + s.name
  linksEl.appendChild(a)
})

// ── Search ──
const ENGINES = {
  google: q => 'https://www.google.com/search?q=' + encodeURIComponent(q),
  bing:   q => 'https://www.bing.com/search?q='   + encodeURIComponent(q),
  baidu:  q => 'https://www.baidu.com/s?wd='       + encodeURIComponent(q),
}
let engine = localStorage.getItem('engine') || 'google'
setEngine(engine)

function setEngine(e) {
  engine = e
  localStorage.setItem('engine', e)
  document.querySelectorAll('.engines button').forEach(b => b.classList.remove('active'))
  const btn = document.getElementById('e-' + e)
  if (btn) btn.classList.add('active')
}

function doSearch() {
  const q = (document.getElementById('q')).value.trim()
  if (!q) return
  const isUrl = q.match(/^https?:\\/\\//) || (q.match(/^[\\w-]+\\.\\w{2,}/) && !q.includes(' '))
  window.open(isUrl ? (q.includes('://') ? q : 'https://' + q) : ENGINES[engine](q), '_blank')
}

document.getElementById('q').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch()
})

// ── Clock ──
function tick() {
  const now  = new Date()
  const h    = now.getHours()
  const pad  = n => String(n).padStart(2, '0')
  document.getElementById('clock').textContent = pad(h) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
  document.getElementById('date').textContent  = now.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  })
  document.getElementById('greeting').textContent =
    h < 6  ? '夜深了，注意休息' :
    h < 12 ? '早上好' :
    h < 14 ? '中午好' :
    h < 18 ? '下午好' :
    h < 22 ? '晚上好' : '夜深了，注意休息'
}
tick()
setInterval(tick, 1000)
</script>
</body>
</html>
`

// ── Port config ─────────────────────────────────────────────────────────────

function getConfigPath(): string {
  return path.join(getDataBase(), 'nav-config.json')
}

function loadConfig(): { port: number; folder?: string } {
  try {
    const cfg = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
    const p   = parseInt(cfg.port, 10)
    return { port: p >= 1024 && p <= 65535 ? p : DEFAULT_PORT, folder: cfg.folder }
  } catch { return { port: DEFAULT_PORT } }
}

function saveConfig(change: { port?: number; folder?: string }): void {
  try {
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) } catch {}
    fs.writeFileSync(getConfigPath(), JSON.stringify({ ...cfg, ...change }))
  } catch {}
}

// ── Server ──────────────────────────────────────────────────────────────────

function getNavDir(): string {
  const configured = currentNavDir || loadConfig().folder
  const d = configured && fs.existsSync(configured) ? path.resolve(configured) : path.join(getDataBase(), 'nav')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

let server: http.Server | null = null

function createHandler(navDir: string) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url      = req.url ?? '/'
    const relative = url === '/' ? 'index.html' : url.split('?')[0]
    const filePath = path.resolve(navDir, relative.replace(/^\//, ''))

    if (!filePath.startsWith(navDir + path.sep) && filePath !== navDir) {
      res.writeHead(403); res.end('Forbidden'); return
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404); res.end('Not found'); return
    }

    const mime = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' })
    fs.createReadStream(filePath).pipe(res)
  }
}

function doListen(port: number): void {
  const navDir   = getNavDir()
  const htmlPath = path.join(navDir, 'index.html')
  if (!fs.existsSync(htmlPath)) fs.writeFileSync(htmlPath, EXAMPLE_HTML, 'utf8')

  server = http.createServer(createHandler(navDir))
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[navServer] port ${port} already in use — skipping`)
    } else {
      console.error('[navServer]', err.message)
    }
  })
  server.listen(port, '127.0.0.1', () => {
    currentPort = port
    console.log(`[navServer] http://localhost:${port}  (files: ${navDir})`)
  })
}

export function startNavServer(): void {
  const config = loadConfig()
  currentPort = config.port
  currentNavDir = config.folder && fs.existsSync(config.folder) ? path.resolve(config.folder) : ''
  doListen(currentPort)
}

export function stopNavServer(): void {
  server?.close()
  server = null
}

export function getNavUrl(): string {
  return `http://localhost:${currentPort}`
}

function changePort(newPort: number): Promise<string> {
  return new Promise(resolve => {
    const restart = () => { doListen(newPort); resolve(getNavUrl()) }
    if (server) {
      server.close(() => { server = null; restart() })
    } else {
      restart()
    }
  })
}

function changeDirectory(folder: string): Promise<string> {
  currentNavDir = path.resolve(folder)
  saveConfig({ folder: currentNavDir })
  return new Promise(resolve => {
    const restart = () => { doListen(currentPort); resolve(currentNavDir) }
    if (server) server.close(() => { server = null; restart() })
    else restart()
  })
}

// ── IPC ─────────────────────────────────────────────────────────────────────

export function setupNavIPC(): void {
  ipcMain.handle('nav:getUrl',  () => getNavUrl())
  ipcMain.handle('nav:getPort', () => currentPort)
  ipcMain.handle('nav:getDir', () => getNavDir())
  ipcMain.handle('nav:setPort', async (_e, port: number) => {
    if (port < 1024 || port > 65535) throw new Error('port out of range')
    saveConfig({ port })
    return changePort(port)
  })
  ipcMain.handle('nav:openDir', () => shell.openPath(getNavDir()))
  ipcMain.handle('nav:pickDir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择本地站点目录', defaultPath: getNavDir(), properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return changeDirectory(result.filePaths[0])
  })
}
