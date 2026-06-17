import { app, BrowserWindow, ipcMain, desktopCapturer, screen as electronScreen, dialog, shell, clipboard, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { execFileSync } from 'child_process'
import { setAutoLaunch, getAutoLaunchEnabled } from './autoLaunch'
import { openScreenshotEditor, closeScreenshotEditor, cropToRegion, resizeToAnnotation, resetToFullScreen } from './screenshotOverlay'
import { getVisibleWindowRects } from './windowBounds'
import { pinImageToDesktop } from './pinWindow'

// 等待截图编辑器回调
let pendingResolve: ((v: { dataURL: string; timestamp: number; width: number; height: number } | null) => void) | null = null

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

  // ── 截图（打开标注覆盖层）──────────────────────────────────────
  ipcMain.handle('automation:screenshot', async () => {
    const wasVisible = window.isVisible()
    if (wasVisible) window.hide()
    await new Promise(r => setTimeout(r, 300))

    try {
      const display = electronScreen.getPrimaryDisplay()
      const sf = display.scaleFactor || 1
      // Request at physical pixel resolution so the crop stays crisp on HiDPI displays
      const physW = Math.round(display.bounds.width  * sf)
      const physH = Math.round(display.bounds.height * sf)
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: physW, height: physH },
      })
      const src = sources.find(s => s.display_id === String(display.id)) ?? sources[0]
      if (!src) { if (wasVisible) window.show(); return null }

      return new Promise<{ dataURL: string; timestamp: number } | null>((resolve) => {
        pendingResolve = resolve
        openScreenshotEditor(src.thumbnail.toDataURL())
      })
    } catch {
      if (wasVisible) window.show()
      return null
    }
  })

  // 标注器：确认（合并后的图片 dataURL）—— 自动写入剪贴板
  ipcMain.handle('se:confirm', (_e, dataURL: string) => {
    closeScreenshotEditor()
    window.show()
    try {
      const img = nativeImage.createFromDataURL(dataURL)
      clipboard.writeImage(img)
      const { width, height } = img.getSize()
      pendingResolve?.({ dataURL, timestamp: Date.now(), width, height })
    } catch {
      pendingResolve?.({ dataURL, timestamp: Date.now(), width: 0, height: 0 })
    }
    pendingResolve = null
  })

  // 标注器：取消
  ipcMain.handle('se:cancel', () => {
    closeScreenshotEditor()
    window.show()
    pendingResolve?.(null)
    pendingResolve = null
  })

  // ── 新增：窗口矩形（用于截图 snap-to-window）────────────────────
  ipcMain.handle('automation:getWindowRects', () => getVisibleWindowRects())

  // ── 新增：选区确认 → 裁剪图片 + 收缩覆盖层窗口 ────────────────────
  ipcMain.handle('se:regionCommitted', (_e, sel: { x:number; y:number; w:number; h:number }) => {
    const croppedURL = cropToRegion(sel)
    resizeToAnnotation(sel)
    return croppedURL
  })

  // ── 新增：重新选区 → 覆盖层重置回全屏 ─────────────────────────────
  ipcMain.handle('se:reselect', () => { resetToFullScreen() })

  // ── 新增：钉在桌面 ─────────────────────────────────────────────
  ipcMain.handle('automation:pinToDesktop', (_e, dataURL: string) => {
    pinImageToDesktop(dataURL)
  })

  // ── Windows OCR（使用 WinRT Windows.Media.Ocr，Windows 10+ 内置）─
  ipcMain.handle('automation:ocr', async (_e, dataURL: string) => {
    const tmpPng = join(app.getPath('temp'), `sxocr-${Date.now()}.png`)
    try {
      writeFileSync(tmpPng, Buffer.from(dataURL.replace(/^data:image\/\w+;base64,/, ''), 'base64'))
      const fp = tmpPng.replace(/\\/g, '/')

      // PowerShell 5 正确调用 WinRT 异步 API：先 AsTask() 再 GetAwaiter().GetResult()
      const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$ext=[System.WindowsRuntimeSystemExtensions]
function Await($op){
  $m=$ext.GetMethods()|Where-Object{$_.Name-eq'AsTask'-and$_.GetParameters().Count-eq1}|Select-Object -First 1
  $m.MakeGenericMethod($op.GetType().GetGenericArguments()[0]).Invoke($null,@($op)).GetAwaiter().GetResult()
}
$f=Await([Windows.Storage.StorageFile]::GetFileFromPathAsync('${fp}'))
$s=Await($f.OpenAsync([Windows.Storage.FileAccessMode]::Read))
$d=Await([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s))
$b=Await($d.GetSoftwareBitmapAsync())
$e=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if(-not $e){$e=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage(([Windows.Globalization.Language,Windows.Foundation,ContentType=WindowsRuntime]::new('zh-Hans-CN')))}
if(-not $e){$e=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage(([Windows.Globalization.Language,Windows.Foundation,ContentType=WindowsRuntime]::new('en-US')))}
if(-not $e){Write-Output '';exit 0}
(Await($e.RecognizeAsync($b))).Text`

      const out = execFileSync('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', ps],
        { encoding: 'utf8', timeout: 15000 }
      )
      return out.trim()
    } catch (err) {
      // 返回错误说明而不是空字符串，方便用户排查
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('language')) return '未找到 OCR 语言包，请在 Windows 设置 → 语言 → 中文(简体) 中添加"光学字符识别"功能包'
      return ''
    }
    finally { try { unlinkSync(tmpPng) } catch { /* ignore */ } }
  })

  // ── 翻译（Google 非官方 API，带超时）──────────────────────────
  ipcMain.handle('automation:translate', async (_e, text: string) => {
    if (!text?.trim()) return ''
    const qs  = new URLSearchParams({ client:'gtx', sl:'auto', tl:'zh-CN', dt:'t', q: text })
    const url = `https://translate.googleapis.com/translate_a/single?${qs}`
    const ac  = new AbortController()
    const timer = setTimeout(() => ac.abort(), 10000)
    try {
      const res  = await fetch(url, { signal: ac.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as unknown[][]
      return (data[0] as unknown[][]).map((x: unknown[]) => x[0]).join('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('abort') || msg.includes('timeout')) return '翻译超时，请检查网络连接'
      return `翻译失败: ${msg || '网络错误'}`
    } finally { clearTimeout(timer) }
  })

  // 截图直接保存（不经过标注器，或从标注器内保存）
  ipcMain.handle('automation:saveScreenshot', async (_e, dataURL: string) => {
    const ts = new Date().toISOString().replace(/[T:]/g, '-').slice(0, 19)
    const { filePath } = await dialog.showSaveDialog(window, {
      title: '保存截图',
      defaultPath: join(app.getPath('pictures'), `screenshot-${ts}.png`),
      filters: [{ name: 'PNG', extensions: ['png'] }],
    })
    if (!filePath) return false
    const base64 = dataURL.replace(/^data:image\/png;base64,/, '')
    writeFileSync(filePath, Buffer.from(base64, 'base64'))
    shell.showItemInFolder(filePath)
    return true
  })
}
