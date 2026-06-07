import { app } from 'electron'

export function setupAutoLaunch(): void {
  // 仅在打包后的生产环境启用，开发模式不自启
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
    })
  }
}

export function setAutoLaunch(enable: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,
  })
}

export function getAutoLaunchEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin
}
