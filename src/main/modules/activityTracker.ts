/**
 * Activity Tracker
 * Polls the foreground window every 5s via a long-running PowerShell child process.
 * Captures: process name, window title, browser URL (via UI Automation), idle time.
 * Sessions are stored next to the application in activity/YYYY-MM-DD.json.
 */
import { app, dialog, ipcMain, shell } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { dirname, join } from 'path'
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync,
  renameSync, copyFileSync,
} from 'fs'

export interface ActivitySession {
  app:   string
  title: string
  start: number  // unix ms
  end:   number  // unix ms
  url?:  string  // browser URL (if captured)
  state?: 'active' | 'idle' | 'locked' | 'sleep'
  pid?: number
  processPath?: string
  description?: string
}

export interface ActivityEvent {
  type: 'startup' | 'shutdown' | 'suspend' | 'resume' | 'lock' | 'unlock'
  time: number
}

// ── PowerShell loop ──────────────────────────────────────────────────────────
// Outputs one compact JSON object every 5 seconds.
// - url: browser address bar via Windows UI Automation (empty for non-browsers)
// - idleMs: milliseconds since last keyboard/mouse input (via GetLastInputInfo)
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'

# P/Invoke: foreground window + idle detection
$sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SxActivity {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

  [StructLayout(LayoutKind.Sequential)]
  private struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] private static extern bool GetLastInputInfo(ref LASTINPUTINFO lii);

  public static int GetIdleMs() {
    var lii = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO)) };
    if (!GetLastInputInfo(ref lii)) return 0;
    int idle = Environment.TickCount - (int)lii.dwTime;
    return idle < 0 ? 0 : idle;
  }
}
'@
Add-Type -TypeDefinition $sig -EA SilentlyContinue

# UI Automation for browser URL extraction
$uiaOk = $false
try {
    Add-Type -AssemblyName UIAutomationClient -EA Stop
    Add-Type -AssemblyName UIAutomationTypes  -EA Stop
    $uiaOk = $true
} catch {}

$browsers = [System.Collections.Generic.HashSet[string]]@(
    'chrome','msedge','firefox','brave','vivaldi','opera','whale','arc')

function Get-BrowserUrl([IntPtr]$hwnd) {
    if (-not $uiaOk) { return '' }
    try {
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
        $cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Edit)
        $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
        if (-not $el) { return '' }
        $vp  = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $val = $vp.Current.Value
        if ($val -match '^https?://') { return $val }
    } catch {}
    return ''
}

while ($true) {
    $h    = [SxActivity]::GetForegroundWindow()
    $sb   = New-Object System.Text.StringBuilder(512)
    [SxActivity]::GetWindowText($h, $sb, 512) | Out-Null
    $title = $sb.ToString()

    $pid2 = [uint32]0
    [SxActivity]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
    $p    = Get-Process -Id $pid2 -EA SilentlyContinue
    $n    = $p.ProcessName

    $idle = [SxActivity]::GetIdleMs()

    $url = ''
    if ($n -and $browsers.Contains($n) -and $idle -lt 60000) {
        $url = Get-BrowserUrl $h
    }

    $row = [PSCustomObject]@{
      app=$n; title=$title; url=$url; idleMs=$idle; pid=[int]$pid2
      processPath=$p.Path; description=$p.Description
    }
    [Console]::Out.Flush()
    [Console]::WriteLine(($row | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
    Start-Sleep -Seconds 5
}
`

// ── Storage helpers ──────────────────────────────────────────────────────────

let resolvedActivityDir = ''

function copyLegacyActivityData(target: string): void {
  const legacy = join(app.getPath('userData'), 'activity')
  if (!existsSync(legacy) || legacy.toLowerCase() === target.toLowerCase()) return
  try {
    for (const file of readdirSync(legacy)) {
      if (!/^(?:\d{4}-\d{2}-\d{2}(?:\.events)?\.json(?:\.bak)?|_settings\.json|_current\.json)$/.test(file)) continue
      const destination = join(target, file)
      if (!existsSync(destination)) copyFileSync(join(legacy, file), destination)
    }
  } catch {}
}

function getDir(): string {
  if (resolvedActivityDir) return resolvedActivityDir
  const appDir = app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
  const preferred = join(appDir, 'activity')
  try {
    mkdirSync(preferred, { recursive: true })
    const probe = join(preferred, `.write-test-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    resolvedActivityDir = preferred
    copyLegacyActivityData(preferred)
  } catch {
    const fallback = join(app.getPath('userData'), 'activity')
    mkdirSync(fallback, { recursive: true })
    resolvedActivityDir = fallback
  }
  return resolvedActivityDir
}

function dateKey(ts = Date.now()): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadDay(date: string): ActivitySession[] {
  const f = join(getDir(), `${date}.json`)
  if (!existsSync(f)) return []
  try { return JSON.parse(readFileSync(f, 'utf8')) as ActivitySession[] }
  catch {
    try { return JSON.parse(readFileSync(`${f}.bak`, 'utf8')) as ActivitySession[] }
    catch { return [] }
  }
}

function loadEvents(date: string): ActivityEvent[] {
  const file = join(getDir(), `${date}.events.json`)
  if (!existsSync(file)) return []
  try { return JSON.parse(readFileSync(file, 'utf8')) as ActivityEvent[] }
  catch {
    try { return JSON.parse(readFileSync(`${file}.bak`, 'utf8')) as ActivityEvent[] }
    catch { return [] }
  }
}

function writeJsonAtomic(file: string, value: unknown, backup = false): void {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value), 'utf8')
  if (backup && existsSync(file)) {
    try { copyFileSync(file, `${file}.bak`) } catch {}
  }
  renameSync(tmp, file)
}

function nextMidnight(ts: number): number {
  const d = new Date(ts)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

function splitSessionByDay(s: ActivitySession): ActivitySession[] {
  const result: ActivitySession[] = []
  let start = s.start
  while (start < s.end) {
    const end = Math.min(s.end, nextMidnight(start))
    result.push({ ...s, start, end })
    start = end
  }
  return result
}

function appendSession(s: ActivitySession): void {
  for (const part of splitSessionByDay(s)) {
    if (part.end - part.start <= 4000) continue
    const date = dateKey(part.start)
    const list = loadDay(date)
    list.push(part)
    writeJsonAtomic(join(getDir(), `${date}.json`), list, true)
  }
}

function appendEvent(event: ActivityEvent): void {
  const date = dateKey(event.time)
  const file = join(getDir(), `${date}.events.json`)
  const events = loadEvents(date)
  const previous = events[events.length - 1]
  if (previous?.type === event.type && Math.abs(previous.time - event.time) < 2000) return
  events.push(event)
  writeJsonAtomic(file, events, true)
}

function settingsPath(): string { return join(getDir(), '_settings.json') }
function checkpointPath(): string { return join(getDir(), '_current.json') }

function loadTrackingEnabled(): boolean {
  try { return JSON.parse(readFileSync(settingsPath(), 'utf8')).enabled !== false }
  catch { return true }
}

function saveTrackingEnabled(value: boolean): void {
  writeJsonAtomic(settingsPath(), { enabled: value })
}

function cleanupOldData(retentionDays = 365): void {
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - retentionDays)
  for (const file of readdirSync(getDir())) {
    const match = file.match(/^(\d{4}-\d{2}-\d{2})(?:\.events)?\.json(?:\.bak)?$/)
    if (!match) continue
    const date = new Date(`${match[1]}T00:00:00`)
    if (date < cutoff) try { unlinkSync(join(getDir(), file)) } catch {}
  }
}

// ── Tracker state ────────────────────────────────────────────────────────────

let proc:    ChildProcess | null = null
type CurrentActivity = {
  app: string; title: string; url: string; start: number; lastActiveAt: number
  pid?: number; processPath?: string; description?: string
}
type InactiveActivity = { state: 'idle' | 'locked' | 'sleep'; start: number }

let current: CurrentActivity | null = null
let inactive: InactiveActivity | null = null
let lastSampleAt = 0
let enabled  = false
let restartTimer: NodeJS.Timeout | null = null

const SAMPLE_GRACE_MS = 6500

function saveCheckpoint(): void {
  if (current || inactive) writeJsonAtomic(checkpointPath(), { current, inactive, lastSampleAt })
}

function removeCheckpoint(): void {
  try { if (existsSync(checkpointPath())) unlinkSync(checkpointPath()) } catch {}
}

function recoverCheckpoint(): void {
  if (!existsSync(checkpointPath())) return
  try {
    const raw = JSON.parse(readFileSync(checkpointPath(), 'utf8')) as {
      current?: CurrentActivity | null; inactive?: InactiveActivity | null; lastSampleAt?: number
      app?: string; title?: string; url?: string; start?: number; lastActiveAt?: number
    }
    const saved = raw.current ?? (raw.app && raw.start && raw.lastActiveAt ? raw as CurrentActivity : null)
    if (saved) {
      const end = Math.min(Date.now(), saved.lastActiveAt + SAMPLE_GRACE_MS)
      if (end - saved.start > 4000) {
        const session: ActivitySession = {
          app: saved.app, title: saved.title, start: saved.start, end, state: 'active',
          pid: saved.pid, processPath: saved.processPath, description: saved.description,
        }
        if (saved.url) session.url = saved.url
        appendSession(session)
      }
    }
    if (raw.inactive) {
      const end = Math.min(Date.now(), (raw.lastSampleAt || raw.inactive.start) + SAMPLE_GRACE_MS)
      if (end - raw.inactive.start > 4000) appendInactiveSession(raw.inactive, end)
    }
  } catch {}
  removeCheckpoint()
}

const INACTIVE_LABELS = { idle: '空闲', locked: '锁屏', sleep: '休眠' } as const

function appendInactiveSession(value: InactiveActivity, end: number): void {
  if (end - value.start <= 4000) return
  appendSession({
    app: 'System', title: INACTIVE_LABELS[value.state], state: value.state,
    start: value.start, end,
  })
}

function flushInactive(end = Date.now()): void {
  if (inactive) appendInactiveSession(inactive, end)
  inactive = null
  removeCheckpoint()
}

function startInactive(state: InactiveActivity['state'], start = Date.now()): void {
  if (inactive?.state === state) return
  flush(start)
  flushInactive(start)
  inactive = { state, start }
  saveCheckpoint()
}

function sanitizeUrl(raw: string): string {
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    return parsed.hostname ? `https://${parsed.hostname}` : ''
  } catch { return '' }
}

function flush(end = Date.now()) {
  if (current) {
    // Never count a suspend, lock, power loss or long polling gap as active use.
    const safeEnd = Math.min(end, current.lastActiveAt + SAMPLE_GRACE_MS)
    const s: ActivitySession = {
      app: current.app, title: current.title, start: current.start, end: safeEnd,
      state: 'active', pid: current.pid, processPath: current.processPath,
      description: current.description,
    }
    if (current.url) s.url = current.url
    if (safeEnd - current.start > 4000) appendSession(s)
  }
  current = null
  removeCheckpoint()
}

function handleLine(line: string) {
  let row: {
    app?: string; title?: string; url?: string; idleMs?: number
    pid?: number; processPath?: string; description?: string
  }
  try { row = JSON.parse(line) } catch { return }
  const appName = String(row.app ?? '').trim()
  const title   = String(row.title ?? '').trim()
  const url     = sanitizeUrl(String(row.url ?? '').trim())
  const idleMs  = Math.max(0, Number(row.idleMs) || 0)

  if (!appName) return

  const now = Date.now()

  // A long gap means the polling process was suspended with the computer.
  if (lastSampleAt && now - lastSampleAt > 30_000 && inactive?.state !== 'locked') {
    const gapStart = lastSampleAt + SAMPLE_GRACE_MS
    flush(gapStart)
    flushInactive(gapStart)
    if (now - gapStart > 4000) appendInactiveSession({ state: 'sleep', start: gapStart }, now)
  }
  lastSampleAt = now

  if (['lockapp', 'logonui'].includes(appName.toLowerCase())) {
    startInactive('locked', now)
    return
  }
  // Treat as idle if no input for > 60 s — flush but don't start a new session
  if (idleMs > 60_000) {
    if (!inactive || inactive.state === 'idle') startInactive('idle', now)
    saveCheckpoint()
    return
  }

  if (inactive) flushInactive(now)

  if (!current || current.app !== appName || current.title !== title || current.url !== url) {
    flush(now)
    current = {
      app: appName, title, url, start: now, lastActiveAt: now,
      pid: Number(row.pid) || undefined,
      processPath: String(row.processPath ?? '').trim() || undefined,
      description: String(row.description ?? '').trim() || undefined,
    }
  } else {
    current.lastActiveAt = now
  }
  saveCheckpoint()
}

function startProcess() {
  if (proc || !enabled) return

  const scriptPath = join(getDir(), 'sx-activity-tracker.ps1')
  writeFileSync(scriptPath, PS_SCRIPT)

  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  })

  let buf = ''
  proc.stdout?.on('data', (chunk: Buffer) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const l of lines) { const t = l.trim(); if (t) handleLine(t) }
  })

  proc.on('exit', () => {
    flush()
    proc = null
    if (enabled) restartTimer = setTimeout(startProcess, 5000)
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

export function recordSystemEvent(type: ActivityEvent['type']): void {
  if (!enabled) return
  const now = Date.now()
  appendEvent({ type, time: now })
  if (type === 'suspend') startInactive('sleep', now)
  else if (type === 'lock') startInactive('locked', now)
  else if (type === 'resume' || type === 'unlock') {
    flushInactive(now)
    lastSampleAt = now
  }
}

export function initializeTracking() {
  recoverCheckpoint()
  cleanupOldData()
  enabled = loadTrackingEnabled()
  if (enabled) {
    appendEvent({ type: 'startup', time: Date.now() })
    startProcess()
  }
}
export function startTracking()  {
  enabled = true
  saveTrackingEnabled(true)
  startProcess()
}
export function stopTracking()   {
  enabled = false
  saveTrackingEnabled(false)
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = null
  flush()
  flushInactive()
  proc?.kill()
  proc = null
}
export function isTracking()     { return enabled && proc !== null }
export function flushAndStop()   {
  const wasEnabled = enabled
  enabled = false
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = null
  flush()
  flushInactive()
  if (wasEnabled) appendEvent({ type: 'shutdown', time: Date.now() })
  proc?.kill()
  proc = null
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

function loadDayWithCurrent(date: string): ActivitySession[] {
  const sessions = loadDay(date)
  if (current) {
    const end = Math.min(Date.now(), current.lastActiveAt + SAMPLE_GRACE_MS)
    const live: ActivitySession = {
      app: current.app, title: current.title, start: current.start, end, state: 'active',
      pid: current.pid, processPath: current.processPath, description: current.description,
      ...(current.url ? { url: current.url } : {}),
    }
    const part = splitSessionByDay(live).find(s => dateKey(s.start) === date)
    if (part && part.end > part.start) sessions.push(part)
  }
  if (inactive) {
    const live: ActivitySession = {
      app: 'System', title: INACTIVE_LABELS[inactive.state], state: inactive.state,
      start: inactive.start, end: Date.now(),
    }
    const part = splitSessionByDay(live).find(s => dateKey(s.start) === date)
    if (part && part.end > part.start) sessions.push(part)
  }
  return sessions
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function setupActivityIPC(): void {
  ipcMain.handle('activity:getDataDir', () => getDir())
  ipcMain.handle('activity:openDataDir', () => shell.openPath(getDir()))
  ipcMain.handle('activity:getDay', (_e, date: string) => loadDayWithCurrent(date))
  ipcMain.handle('activity:getDayDetails', (_e, date: string) => ({
    sessions: loadDayWithCurrent(date), events: loadEvents(date),
  }))

  ipcMain.handle('activity:exportDay', async (_e, { date, format }: { date: string; format: 'json' | 'csv' }) => {
    const details = { date, sessions: loadDayWithCurrent(date), events: loadEvents(date) }
    const result = await dialog.showSaveDialog({
      title: '导出活动记录', defaultPath: `activity-${date}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })
    if (result.canceled || !result.filePath) return false
    if (format === 'json') writeFileSync(result.filePath, JSON.stringify(details, null, 2), 'utf8')
    else {
      const rows = [
        ['状态', '应用', '说明', '窗口标题', '网站域名', '开始', '结束', '时长秒', '进程路径'],
        ...details.sessions.map(s => [
          s.state ?? 'active', s.app, s.description ?? '', s.title, s.url ?? '',
          new Date(s.start).toLocaleString('zh-CN'), new Date(s.end).toLocaleString('zh-CN'),
          Math.round((s.end - s.start) / 1000), s.processPath ?? '',
        ]),
      ]
      writeFileSync(result.filePath, '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'utf8')
    }
    return true
  })

  ipcMain.handle('activity:getDays', () => {
    try {
      return readdirSync(getDir())
        .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map(f => f.replace('.json', ''))
        .sort()
        .reverse()
    } catch { return [] }
  })

  ipcMain.handle('activity:getStatus', () => isTracking())

  ipcMain.handle('activity:setEnabled', (_e, on: boolean) => {
    if (on) startTracking()
    else     stopTracking()
  })

  ipcMain.handle('activity:deleteDay', (_e, date: string) => {
    if (current && splitSessionByDay({
      app: current.app, title: current.title, start: current.start,
      end: Math.min(Date.now(), current.lastActiveAt + SAMPLE_GRACE_MS),
    }).some(s => dateKey(s.start) === date)) flush()
    const f = join(getDir(), `${date}.json`)
    if (existsSync(f)) unlinkSync(f)
    if (existsSync(`${f}.bak`)) unlinkSync(`${f}.bak`)
    const eventsFile = join(getDir(), `${date}.events.json`)
    if (existsSync(eventsFile)) unlinkSync(eventsFile)
    if (existsSync(`${eventsFile}.bak`)) unlinkSync(`${eventsFile}.bak`)
  })

  ipcMain.handle('activity:getHeatmap', () => {
    try {
      const result: Record<string, number> = {}
      const files = readdirSync(getDir()).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      for (const file of files) {
        const date    = file.replace('.json', '')
        const totalMs = loadDayWithCurrent(date)
          .filter(session => !session.state || session.state === 'active')
          .reduce((s, session) => s + (session.end - session.start), 0)
        if (totalMs > 0) result[date] = totalMs
      }
      if (current) {
        for (const date of new Set(splitSessionByDay({
          app: current.app, title: current.title, start: current.start,
          end: Math.min(Date.now(), current.lastActiveAt + SAMPLE_GRACE_MS),
        }).map(s => dateKey(s.start)))) {
          const totalMs = loadDayWithCurrent(date)
            .filter(session => !session.state || session.state === 'active')
            .reduce((sum, session) => sum + (session.end - session.start), 0)
          if (totalMs > 0) result[date] = totalMs
        }
      }
      return result
    } catch { return {} }
  })
}
