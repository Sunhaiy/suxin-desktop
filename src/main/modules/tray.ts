import { app, Menu, Tray, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'

export function setupTray(window: BrowserWindow, onQuit: () => void): void {
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(join(process.resourcesPath, 'resources/tray.png'))
    if (icon.isEmpty()) throw new Error('empty')
  } catch {
    // 用一个 1x1 的绿色像素作为占位图标
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
        'AABjkB6QAAAABJRU5ErkJggg=='
    )
  }

  const tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        window.show()
        window.focus()
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        onQuit()
        app.quit()
      },
    },
  ])

  tray.setToolTip('SuXin Desktop')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (window.isVisible()) {
      window.focus()
    } else {
      window.show()
      window.focus()
    }
  })
}
