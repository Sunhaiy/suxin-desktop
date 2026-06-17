/// <reference types="vite/client" />

interface Window {
  electron: {
    window: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
      onMaximizeChange: (cb: (maximized: boolean) => void) => void
    }
    app: {
      version: () => Promise<string>
      getAutoLaunch: () => Promise<boolean>
      setAutoLaunch: (enable: boolean) => Promise<void>
    }
    store: {
      getSync: (key: string) => string | null
      set: (key: string, value: string) => Promise<void>
      remove: (key: string) => Promise<void>
    }
    invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<T>
    /** 监听主进程推送事件，返回取消监听函数 */
    on: (channel: string, cb: (...args: unknown[]) => void) => () => void
  }
}
