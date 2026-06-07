import { contextBridge, ipcRenderer } from 'electron'

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb: (v: boolean) => void) =>
      ipcRenderer.on('window:maximizeChange', (_e, v) => cb(v)),
  },
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    getAutoLaunch: (): Promise<boolean> => ipcRenderer.invoke('app:getAutoLaunch'),
    setAutoLaunch: (v: boolean): Promise<void> => ipcRenderer.invoke('app:setAutoLaunch', v),
  },
  // 同步文件 KV（用于初始化时读取持久化数据）
  store: {
    getSync: (key: string): string | null => ipcRenderer.sendSync('store:getSync', key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('store:set', { key, value }),
    remove: (key: string): Promise<void> => ipcRenderer.invoke('store:remove', key),
  },
  invoke: <T = unknown>(channel: string, payload?: unknown): Promise<T> =>
    ipcRenderer.invoke(channel, payload) as Promise<T>,
}

contextBridge.exposeInMainWorld('electron', api)

export type ElectronAPI = typeof api
