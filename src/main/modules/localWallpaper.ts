import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { getDataBase } from './paths'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])

const cfgPath = () => path.join(getDataBase(), 'local-wallpaper.json')

function getFolder(): string {
  try { return (JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) as { folder?: string }).folder ?? '' } catch { return '' }
}
function saveFolder(folder: string) {
  fs.writeFileSync(cfgPath(), JSON.stringify({ folder }), 'utf8')
}

function listImages(folder: string): { name: string; path: string; url: string }[] {
  if (!folder || !fs.existsSync(folder)) return []
  try {
    return fs.readdirSync(folder)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .slice(0, 300)
      .map(f => {
        const p = path.join(folder, f)
        return { name: f, path: p, url: `local-img://local?p=${encodeURIComponent(p.replace(/\\/g, '/'))}` }
      })
  } catch { return [] }
}

function applyWallpaper(imagePath: string): void {
  const escaped    = imagePath.replace(/'/g, "''")
  const scriptPath = path.join(getDataBase(), 'set-wallpaper-local.ps1')
  fs.writeFileSync(scriptPath, `
$ErrorActionPreference = 'SilentlyContinue'
Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value 10
Set-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper  -Value 0
$code = '[DllImport("user32.dll")]public static extern int SystemParametersInfo(int a,int b,string c,int d);'
Add-Type -MemberDefinition $code -Name LcWP -Namespace SxLc
[SxLc.LcWP]::SystemParametersInfo(20, 0, '${escaped}', 3)
`.trim(), 'utf8')
  execSync(
    `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
    { windowsHide: true },
  )
}

export function setupLocalWallpaperIPC(): void {
  ipcMain.handle('local-wallpaper:get-folder', () => getFolder())

  ipcMain.handle('local-wallpaper:pick-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    saveFolder(result.filePaths[0])
    return result.filePaths[0]
  })

  ipcMain.handle('local-wallpaper:list', (_e, folder: string) => listImages(folder))

  ipcMain.handle('local-wallpaper:set', (_e, imagePath: string) => applyWallpaper(imagePath))
}
