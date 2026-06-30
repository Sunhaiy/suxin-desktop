import { app, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma'])
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png']

export interface LocalTrack {
  id: string
  title: string
  artist: string
  album: string
  cover: string
  duration: number
  source: 'local'
  url: string
  path: string
  lyricPath?: string
  modifiedAt: number
}

let resolvedMusicDir = ''

function getMusicDir(): string {
  if (resolvedMusicDir) return resolvedMusicDir
  const appDir = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
  const preferred = path.join(appDir, 'music')
  try {
    fs.mkdirSync(preferred, { recursive: true })
    const probe = path.join(preferred, `.write-test-${process.pid}`)
    fs.writeFileSync(probe, '')
    fs.unlinkSync(probe)
    resolvedMusicDir = preferred
  } catch {
    resolvedMusicDir = path.join(app.getPath('userData'), 'music')
    fs.mkdirSync(resolvedMusicDir, { recursive: true })
  }
  return resolvedMusicDir
}

function mediaUrl(file: string): string {
  return `local-media://file?p=${encodeURIComponent(file.replace(/\\/g, '/'))}`
}

function findCover(file: string): string {
  const dir = path.dirname(file)
  const base = path.join(dir, path.basename(file, path.extname(file)))
  for (const candidate of [`${base}.jpg`, `${base}.jpeg`, `${base}.png`, ...COVER_NAMES.map(name => path.join(dir, name))]) {
    if (fs.existsSync(candidate)) return mediaUrl(candidate)
  }
  return ''
}

function walk(dir: string, depth = 0): string[] {
  if (depth > 4) return []
  const files: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) files.push(...walk(full, depth + 1))
      else if (AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) files.push(full)
    }
  } catch {}
  return files
}

function scanLibrary(): LocalTrack[] {
  return walk(getMusicDir()).map(file => {
    const stem = path.basename(file, path.extname(file))
    const parts = stem.split(/\s+-\s+/)
    const artist = parts.length > 1 ? parts.shift()!.trim() : '未知艺术家'
    const title = parts.length ? parts.join(' - ').trim() : stem
    const lrc = path.join(path.dirname(file), `${stem}.lrc`)
    let modifiedAt = 0
    try { modifiedAt = fs.statSync(file).mtimeMs } catch {}
    return {
      id: file, title, artist, album: path.basename(path.dirname(file)),
      cover: findCover(file), duration: 0, source: 'local' as const,
      url: mediaUrl(file), path: file,
      lyricPath: fs.existsSync(lrc) ? lrc : undefined,
      modifiedAt,
    }
  }).sort((a, b) => b.modifiedAt - a.modifiedAt || a.title.localeCompare(b.title, 'zh-CN'))
}

export function setupMusicIPC(): void {
  ipcMain.handle('music:getDirectory', () => getMusicDir())
  ipcMain.handle('music:openDirectory', () => shell.openPath(getMusicDir()))
  ipcMain.handle('music:scanLocal', () => scanLibrary())
  ipcMain.handle('music:getLocalLyric', (_e, file: string) => {
    if (!file || !path.resolve(file).startsWith(path.resolve(getMusicDir()) + path.sep)) return ''
    try { return fs.readFileSync(file, 'utf8') } catch { return '' }
  })
}
