import { app } from 'electron'

export function setupAutoLaunch(): void {
  // Do not overwrite the user's existing login preference on every launch.
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
