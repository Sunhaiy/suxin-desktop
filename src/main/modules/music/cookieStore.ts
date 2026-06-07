import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const FILE = join(app.getPath('userData'), 'cookies.json')

interface CookieStore {
  netease?: string
  qq?: string
}

let cache: CookieStore | null = null

function load(): CookieStore {
  if (existsSync(FILE)) {
    try { return JSON.parse(readFileSync(FILE, 'utf-8')) } catch {}
  }
  return {}
}

function save(data: CookieStore) {
  writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export function get(platform: keyof CookieStore): string | undefined {
  if (!cache) cache = load()
  return cache[platform]
}

export function set(platform: keyof CookieStore, cookie: string) {
  if (!cache) cache = load()
  cache = { ...cache, [platform]: cookie }
  save(cache)
}

export function clear(platform: keyof CookieStore) {
  if (!cache) cache = load()
  delete cache[platform]
  save(cache)
}

/** 从 cookie 字符串里提取 __csrf token（网易云 WeAPI 需要） */
export function extractCSRF(cookie: string): string {
  return cookie.match(/__csrf=([^;]+)/)?.[1] ?? ''
}
