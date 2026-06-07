import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { setAutoLaunch, getAutoLaunchEnabled } from './autoLaunch'

// ── 持久化 KV Store（写到 userData/store/*.json）────────────────
const storeDir = join(app.getPath('userData'), 'store')

function storeRead(key: string): string | null {
  const f = join(storeDir, `${key}.json`)
  if (!existsSync(f)) return null
  try { return readFileSync(f, 'utf-8') } catch { return null }
}

function storeWrite(key: string, value: string) {
  mkdirSync(storeDir, { recursive: true })
  writeFileSync(join(storeDir, `${key}.json`), value, 'utf-8')
}

export function setupIPC(window: BrowserWindow): void {
  // ── 窗口控制 ────────────────────────────────────────────────────
  ipcMain.handle('window:minimize',   () => window.minimize())
  ipcMain.handle('window:maximize',   () => window.isMaximized() ? window.unmaximize() : window.maximize())
  ipcMain.handle('window:close',      () => window.hide())
  ipcMain.handle('window:isMaximized',() => window.isMaximized())

  window.on('maximize',   () => window.webContents.send('window:maximizeChange', true))
  window.on('unmaximize', () => window.webContents.send('window:maximizeChange', false))

  // ── 应用信息 ─────────────────────────────────────────────────────
  ipcMain.handle('app:version',      () => app.getVersion())
  ipcMain.handle('app:getAutoLaunch',() => getAutoLaunchEnabled())
  ipcMain.handle('app:setAutoLaunch',(_e, v: boolean) => setAutoLaunch(v))

  // ── 同步 KV Store ─────────────────────────────────────────────────
  // 用 sendSync 让渲染进程在初始化时同步读取数据（localStorage 在
  // dev/prod 因域名不同会丢失，用文件存储确保两种模式都能持久化）
  ipcMain.on('store:getSync', (event, key: string) => {
    event.returnValue = storeRead(key)
  })
  ipcMain.handle('store:set',    (_e, { key, value }: { key: string; value: string }) => storeWrite(key, value))
  ipcMain.handle('store:remove', (_e, key: string) => {
    const f = join(storeDir, `${key}.json`)
    if (existsSync(f)) unlinkSync(f)
  })
}
