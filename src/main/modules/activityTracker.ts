/**
 * Activity Tracker
 * Polls the foreground window every 5s via a long-running PowerShell child process.
 * Captures: process name, window title, browser URL (via UI Automation), idle time.
 * Sessions are stored as JSON files in userData/activity/YYYY-MM-DD.json.
 */
import { app, ipcMain } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs'
import { getDataBase } from './paths'

export interface ActivitySession {
  app:   string
  title: string
  start: number  // unix ms
  end:   number  // unix ms
  url?:  string  // browser URL (if captured)
}

// ── PowerShell loop ──────────────────────────────────────────────────────────
// Outputs "processName|windowTitle|url|idleMs" every 5 seconds.
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
    $n    = (Get-Process -Id $pid2 -EA SilentlyContinue).ProcessName

    $idle = [SxActivity]::GetIdleMs()

    $url = ''
    if ($n -and $browsers.Contains($n) -and $idle -lt 60000) {
        $url = Get-BrowserUrl $h
    }

    [Console]::Out.Flush()
    [Console]::WriteLine("$n|$title|$url|$idle")
    [Console]::Out.Flush()
    Start-Sleep -Seconds 5
}
`

// ── Storage helpers ──────────────────────────────────────────────────────────

function getDir(): string {
  const d = join(getDataBase(), 'activity')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function dateKey(ts = Date.now()): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadDay(date: string): ActivitySession[] {
  const f = join(getDir(), `${date}.json`)
  if (!existsSync(f)) return []
  try { return JSON.parse(readFileSync(f, 'utf8')) as ActivitySession[] } catch { return [] }
}

function appendSession(s: ActivitySession) {
  const date = dateKey(s.start)
  const list  = loadDay(date)
  list.push(s)
  writeFileSync(join(getDir(), `${date}.json`), JSON.stringify(list))
}

// ── Tracker state ────────────────────────────────────────────────────────────

let proc:    ChildProcess | null = null
let current: { app: string; title: string; url: string; start: number } | null = null
let enabled  = true

function flush(end = Date.now()) {
  if (current && end - current.start > 4000) {
    const s: ActivitySession = { app: current.app, title: current.title, start: current.start, end }
    if (current.url) s.url = current.url
    appendSession(s)
  }
  current = null
}

function handleLine(line: string) {
  const parts  = line.split('|')
  if (parts.length < 2) return
  const appName = (parts[0] ?? '').trim()
  const title   = (parts[1] ?? '').trim()
  const url     = (parts[2] ?? '').trim()
  const idleMs  = Math.max(0, parseInt(parts[3] ?? '0', 10) || 0)

  if (!appName) return

  const now = Date.now()

  // Treat as idle if no input for > 60 s — flush but don't start a new session
  if (idleMs > 60_000) {
    flush(now)
    return
  }

  if (!current || current.app !== appName || current.title !== title || current.url !== url) {
    flush(now)
    current = { app: appName, title, url, start: now }
  }
}

function startProcess() {
  if (proc || !enabled) return

  const scriptPath = join(getDataBase(), 'sx-activity-tracker.ps1')
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
    if (enabled) setTimeout(startProcess, 5000)
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

export function startTracking()  { enabled = true;  startProcess() }
export function stopTracking()   { enabled = false; flush(); proc?.kill(); proc = null }
export function isTracking()     { return enabled && proc !== null }
export function flushAndStop()   { stopTracking() }

// ── IPC handlers ─────────────────────────────────────────────────────────────

export function setupActivityIPC(): void {
  ipcMain.handle('activity:getDay', (_e, date: string) => loadDay(date))

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
    const f = join(getDir(), `${date}.json`)
    if (existsSync(f)) unlinkSync(f)
  })

  ipcMain.handle('activity:getHeatmap', () => {
    try {
      const result: Record<string, number> = {}
      const files = readdirSync(getDir()).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      for (const file of files) {
        const date    = file.replace('.json', '')
        const totalMs = loadDay(date).reduce((s, session) => s + (session.end - session.start), 0)
        if (totalMs > 0) result[date] = totalMs
      }
      return result
    } catch { return {} }
  })
}
