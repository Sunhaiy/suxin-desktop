import { ipcMain, net } from 'electron'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { getDataBase } from './paths'

export interface WallhavenWallpaper {
  id: string
  thumbs: { large: string; original: string; small: string }
  file_url: string
  dimension_x: number
  dimension_y: number
  resolution: string
  views: number
  favorites: number
}

// electron.net → 走 Chromium 网络栈，自动读取 WinInet 系统代理
function netGet(url: string, maxRedirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) { reject(new Error('too many redirects')); return }
    const req = net.request({ url, method: 'GET' })
    req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    req.on('response', (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = Array.isArray(res.headers.location)
          ? res.headers.location[0]
          : res.headers.location as string
        netGet(loc, maxRedirects - 1).then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data',  (c: Buffer) => chunks.push(c))
      res.on('end',   () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}


function getCacheDir(): string {
  const d = path.join(getDataBase(), 'wallhaven')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

function applyDesktopWallpaper(imagePath: string): void {
  const escaped    = imagePath.replace(/'/g, "''")
  const scriptPath = path.join(getDataBase(), 'set-wallpaper-wh.ps1')
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value 10
Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper  -Value 0
$code = '[DllImport("user32.dll")]public static extern int SystemParametersInfo(int a,int b,string c,int d);'
Add-Type -MemberDefinition $code -Name WhWP -Namespace SxWh
[SxWh.WhWP]::SystemParametersInfo(20, 0, '${escaped}', 3)
`
  fs.writeFileSync(scriptPath, script, 'utf8')
  execSync(
    `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
    { windowsHide: true },
  )
}

async function downloadAndSet(fileUrl: string, wallId: string): Promise<void> {
  const ext  = (fileUrl.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase()
  const dest = path.join(getCacheDir(), `${wallId}.${ext}`)
  if (!fs.existsSync(dest)) {
    const buf = await netGet(fileUrl)
    fs.writeFileSync(dest, buf)
  }
  applyDesktopWallpaper(dest)
}

export function setupWallhavenIPC(): void {
  ipcMain.handle('wallhaven:set', (_e, { fileUrl, wallId }: { fileUrl: string; wallId: string }) =>
    downloadAndSet(fileUrl, wallId))
}
