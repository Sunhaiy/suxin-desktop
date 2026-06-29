import { ipcMain, net } from 'electron'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { getDataBase } from './paths'

export interface KonachanPost {
  id: number
  tags: string
  preview_url: string
  sample_url: string
  file_url: string
  width: number
  height: number
  rating: string
}

// Uses electron.net so the request goes through the Chromium network stack,
// which reads Windows system proxy settings (v2rayN / Clash WinInet proxy).
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
  const d = path.join(getDataBase(), 'konachan')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

function applyDesktopWallpaper(imagePath: string): void {
  const escaped    = imagePath.replace(/'/g, "''")
  const scriptPath = path.join(getDataBase(), 'set-wallpaper-kc.ps1')
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value 10
Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper  -Value 0
$code = '[DllImport("user32.dll")]public static extern int SystemParametersInfo(int a,int b,string c,int d);'
Add-Type -MemberDefinition $code -Name KcWP -Namespace SxKc
[SxKc.KcWP]::SystemParametersInfo(20, 0, '${escaped}', 3)
`
  fs.writeFileSync(scriptPath, script, 'utf8')
  execSync(
    `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
    { windowsHide: true },
  )
}

async function downloadAndSet(fileUrl: string, postId: number): Promise<void> {
  const ext  = (fileUrl.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase()
  const dest = path.join(getCacheDir(), `${postId}.${ext}`)
  if (!fs.existsSync(dest)) {
    const buf = await netGet(fileUrl)
    fs.writeFileSync(dest, buf)
  }
  applyDesktopWallpaper(dest)
}

export function setupKonachanIPC(): void {
  ipcMain.handle('konachan:set', (_e, { fileUrl, postId }: { fileUrl: string; postId: number }) =>
    downloadAndSet(fileUrl, postId))
}
