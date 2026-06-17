/**
 * Wallpaper module
 * - Fetches Bing daily wallpapers (no API key needed)
 * - Downloads & stores images in getDataBase()/wallpapers/
 * - Sets Windows desktop wallpaper via PowerShell + SystemParametersInfo
 */
import { ipcMain, dialog, shell } from 'electron'
import { execSync } from 'child_process'
import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { getDataBase } from './paths'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WallpaperItem {
  id:        string
  title:     string
  copyright: string
  thumbUrl:  string
  fullUrl:   string
  date:      string
  source:    'bing' | 'local'
  localPath?: string
}

export type WallpaperStyle = 'fill' | 'fit' | 'stretch' | 'center' | 'tile' | 'span'

interface WallpaperConfig {
  style:        WallpaperStyle
  currentPath?: string
}

const STYLE_MAP: Record<WallpaperStyle, { ws: number; tw: number }> = {
  fill:    { ws: 10, tw: 0 },
  fit:     { ws: 6,  tw: 0 },
  stretch: { ws: 2,  tw: 0 },
  center:  { ws: 0,  tw: 0 },
  tile:    { ws: 0,  tw: 1 },
  span:    { ws: 22, tw: 0 },
}

// ── Storage helpers ──────────────────────────────────────────────────────────

function getWallpaperDir(): string {
  const d = path.join(getDataBase(), 'wallpapers')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

function getConfigPath(): string {
  return path.join(getDataBase(), 'wallpaper-config.json')
}

function loadConfig(): WallpaperConfig {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) }
  catch { return { style: 'fill' } }
}

function saveConfig(cfg: WallpaperConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg))
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function httpGet(url: string, redirects = 5): Promise<Buffer> {
  if (redirects === 0) return Promise.reject(new Error('too many redirects'))
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = (mod as typeof https).get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    }, (res) => {
      if (res.statusCode! >= 300 && res.statusCode! < 400 && res.headers.location) {
        resolve(httpGet(res.headers.location, redirects - 1))
        res.resume(); return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end',  () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

// ── Bing wallpaper source ─────────────────────────────────────────────────────

interface BingImage {
  startdate: string; urlbase: string; title: string; copyright: string
}

async function fetchBing(): Promise<WallpaperItem[]> {
  const BASE = 'https://www.bing.com'
  const buf  = await httpGet(`${BASE}/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN`)
  const data: { images: BingImage[] } = JSON.parse(buf.toString('utf8'))
  return (data.images ?? []).map(img => ({
    id:        `bing-${img.startdate}`,
    title:     img.title,
    copyright: img.copyright,
    thumbUrl:  `${BASE}${img.urlbase}_400x240.jpg`,
    fullUrl:   `${BASE}${img.urlbase}_1920x1080.jpg`,
    date:      img.startdate,
    source:    'bing' as const,
  }))
}

// ── Local library ────────────────────────────────────────────────────────────

const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])

function listLocal(): WallpaperItem[] {
  const dir = getWallpaperDir()
  return fs.readdirSync(dir)
    .filter(f => IMG_EXTS.has(path.extname(f).toLowerCase()))
    .map(f => {
      const full = path.join(dir, f)
      return {
        id:        `local-${f}`,
        title:     path.basename(f, path.extname(f)),
        copyright: '',
        thumbUrl:  `file:///${full.replace(/\\/g, '/')}`,
        fullUrl:   `file:///${full.replace(/\\/g, '/')}`,
        date:      '',
        source:    'local' as const,
        localPath: full,
      }
    })
    .reverse()
}

// ── Apply wallpaper (Windows) ────────────────────────────────────────────────

function applyWallpaper(imagePath: string, style: WallpaperStyle): void {
  const { ws, tw } = STYLE_MAP[style] ?? STYLE_MAP.fill
  const escaped    = imagePath.replace(/'/g, "''")

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value ${ws}
Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper  -Value ${tw}
$code = '[DllImport("user32.dll")]public static extern int SystemParametersInfo(int a,int b,string c,int d);'
Add-Type -MemberDefinition $code -Name W -Namespace SxWP
[SxWP.W]::SystemParametersInfo(20, 0, '${escaped}', 3)
`
  const scriptPath = path.join(getDataBase(), 'set-wallpaper.ps1')
  fs.writeFileSync(scriptPath, script, 'utf8')
  execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`, { windowsHide: true })
}

// ── IPC ──────────────────────────────────────────────────────────────────────

export function setupWallpaperIPC(): void {
  // Fetch Bing daily images (main process to avoid CORS)
  ipcMain.handle('wallpaper:bing', () => fetchBing())

  // List locally saved wallpapers
  ipcMain.handle('wallpaper:list', () => listLocal())

  // Download a remote image to the wallpaper dir; returns local file path
  ipcMain.handle('wallpaper:download', async (_e, url: string, filename: string) => {
    const dest = path.join(getWallpaperDir(), filename)
    const buf  = await httpGet(url)
    fs.writeFileSync(dest, buf)
    return dest
  })

  // Set wallpaper — downloads first if localPath not provided
  ipcMain.handle('wallpaper:set', async (_e, localPath: string, style?: WallpaperStyle) => {
    const cfg = loadConfig()
    const s   = style ?? cfg.style
    applyWallpaper(localPath, s)
    saveConfig({ ...cfg, style: s, currentPath: localPath })
  })

  // Change style (re-applies to current wallpaper immediately)
  ipcMain.handle('wallpaper:setStyle', (_e, style: WallpaperStyle) => {
    const cfg = loadConfig()
    saveConfig({ ...cfg, style })
    if (cfg.currentPath && fs.existsSync(cfg.currentPath)) {
      applyWallpaper(cfg.currentPath, style)
    }
  })

  // Get persisted config
  ipcMain.handle('wallpaper:getConfig', () => loadConfig())

  // Delete a local wallpaper file
  ipcMain.handle('wallpaper:delete', (_e, localPath: string) => {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath)
  })

  // Open wallpaper folder in Explorer
  ipcMain.handle('wallpaper:openDir', () => shell.openPath(getWallpaperDir()))

  // Import images from a file picker dialog
  ipcMain.handle('wallpaper:import', async () => {
    const result = await dialog.showOpenDialog({
      title:      '选择壁纸图片',
      filters:    [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled || !result.filePaths.length) return []

    const dir     = getWallpaperDir()
    const imported: string[] = []
    for (const src of result.filePaths) {
      let dest = path.join(dir, path.basename(src))
      // Avoid overwriting
      let n = 1
      while (fs.existsSync(dest)) {
        dest = path.join(dir, `${path.basename(src, path.extname(src))}-${n++}${path.extname(src)}`)
      }
      fs.copyFileSync(src, dest)
      imported.push(dest)
    }
    return imported
  })
}
