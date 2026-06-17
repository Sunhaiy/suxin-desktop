import { BrowserWindow, nativeImage, screen as electronScreen } from 'electron'
import { join } from 'path'
import { networkInterfaces } from 'os'

function getLanIP(): string {
  const nets = networkInterfaces()
  for (const iface of Object.values(nets ?? {})) {
    for (const net of iface ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return 'localhost'
}

let overlayWin: BrowserWindow | null = null
let fullScreenshotDataURL = ''
let displayScaleFactor = 1   // physical-to-logical ratio; set when editor opens

const TOOLBAR_H = 56 // 工具栏高度（logical px）

// ── 打开全屏选区覆盖层 ─────────────────────────────────────────────
export function openScreenshotEditor(screenshotDataURL: string): void {
  fullScreenshotDataURL = screenshotDataURL

  if (overlayWin && !overlayWin.isDestroyed()) { overlayWin.close(); overlayWin = null }

  const display = electronScreen.getPrimaryDisplay()
  displayScaleFactor = display.scaleFactor || 1
  const { bounds } = display

  overlayWin = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    frame: false, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  })

  const url = process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL'].replace('localhost', getLanIP())}?sxeditor=1`
    : undefined

  if (url) {
    overlayWin.loadURL(url)
  } else {
    overlayWin.loadFile(join(__dirname, '../renderer/index.html'), { query: { sxeditor: '1' } })
  }

  overlayWin.webContents.once('did-finish-load', () => {
    overlayWin?.webContents.send('se:init', screenshotDataURL)
  })

  overlayWin.once('closed', () => { overlayWin = null })
}

// ── 裁剪选区 ──────────────────────────────────────────────────────
export function cropToRegion(sel: { x: number; y: number; w: number; h: number }): string {
  if (!fullScreenshotDataURL) return ''
  try {
    const img = nativeImage.createFromDataURL(fullScreenshotDataURL)
    const { width: iw, height: ih } = img.getSize()
    const x = Math.max(0, Math.round(sel.x))
    const y = Math.max(0, Math.round(sel.y))
    const w = Math.max(1, Math.min(Math.round(sel.w), iw - x))
    const h = Math.max(1, Math.min(Math.round(sel.h), ih - y))
    return img.crop({ x, y, width: w, height: h }).toDataURL()
  } catch { return '' }
}

// ── 选区确认后：将覆盖层窗口收缩为选区大小 ────────────────────────────
export function resizeToAnnotation(sel: { x: number; y: number; w: number; h: number }): void {
  if (!overlayWin || overlayWin.isDestroyed()) return
  const { bounds } = electronScreen.getPrimaryDisplay()

  // sel is in physical pixels (canvas-native coords from the physical-res screenshot).
  // setBounds expects logical pixels, so divide by the stored scale factor.
  const sf = displayScaleFactor
  const lx = Math.round(sel.x / sf)
  const ly = Math.round(sel.y / sf)
  const lw = Math.max(160, Math.round(sel.w / sf))
  const lh = Math.round(sel.h / sf) + TOOLBAR_H

  let winX = bounds.x + lx
  let winY = bounds.y + ly

  if (winY + lh > bounds.y + bounds.height) winY = bounds.y + bounds.height - lh
  winX = Math.max(bounds.x, Math.min(winX, bounds.x + bounds.width - lw))
  winY = Math.max(bounds.y, winY)

  overlayWin.hide()
  overlayWin.setResizable(true)
  overlayWin.setMovable(true)
  overlayWin.setBounds({ x: winX, y: winY, width: lw, height: lh })
  overlayWin.show()
  overlayWin.focus()
}

// ── 重置回全屏选择模式（用户点"重新选择"时）──────────────────────────
export function resetToFullScreen(): void {
  if (!overlayWin || overlayWin.isDestroyed()) return
  const { bounds } = electronScreen.getPrimaryDisplay()
  overlayWin.hide()
  overlayWin.setResizable(false)
  overlayWin.setMovable(false)
  overlayWin.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
  overlayWin.show()
  overlayWin.focus()
  // 重发原始截图让渲染进程重置到选区阶段
  overlayWin.webContents.send('se:reset', fullScreenshotDataURL)
}

// ── 关闭 ────────────────────────────────────────────────────────
export function closeScreenshotEditor(): void {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close()
  overlayWin = null
  fullScreenshotDataURL = ''
}
