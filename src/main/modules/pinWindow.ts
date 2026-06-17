import { app, BrowserWindow, nativeImage, screen as eScreen } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'

const pins: BrowserWindow[] = []

export function pinImageToDesktop(dataURL: string): void {
  const img = nativeImage.createFromDataURL(dataURL)
  const { width: iw, height: ih } = img.getSize()
  if (iw < 1 || ih < 1) return

  const { workAreaSize } = eScreen.getPrimaryDisplay()
  const ratio = Math.min(workAreaSize.width * 0.8 / iw, workAreaSize.height * 0.8 / ih, 1)
  const w = Math.max(80, Math.round(iw * ratio))
  const h = Math.max(60, Math.round(ih * ratio))

  // Write PNG to temp — avoids huge data: URL in HTML string
  const tmpPng = join(app.getPath('temp'), `sxpin-${Date.now()}.png`)
  writeFileSync(tmpPng, img.toPNG())

  const htmlSrc = `file:///${tmpPng.replace(/\\/g, '/')}`
  const html = `<!DOCTYPE html>
<html style="margin:0;padding:0;overflow:hidden;background:#000">
<body style="margin:0;padding:0">
  <img id="i" src="${htmlSrc}"
       style="width:100vw;height:100vh;object-fit:contain;display:block;-webkit-app-region:drag"
       draggable="false"/>
  <button
    onclick="window.close()"
    style="position:fixed;top:4px;right:4px;background:rgba(30,30,30,.75);
           color:#fff;border:none;border-radius:50%;width:22px;height:22px;
           font-size:14px;line-height:22px;cursor:pointer;-webkit-app-region:no-drag">
    ×
  </button>
</body></html>`

  const win = new BrowserWindow({
    width: w, height: h,
    frame: false, transparent: false,
    resizable: true, movable: true,
    alwaysOnTop: true, skipTaskbar: false,
    title: '截图钉图',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  pins.push(win)
  win.on('closed', () => { const i = pins.indexOf(win); if (i >= 0) pins.splice(i, 1) })
}
