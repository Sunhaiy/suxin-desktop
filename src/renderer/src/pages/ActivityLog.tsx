import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, Activity, Circle, Trash2,
  Globe, Code2, Terminal, FolderOpen, MessageSquare, Mail,
  Film, Gamepad2, FileText, Image, Music2,
} from 'lucide-react'
import { useToastStore } from '../store/toast'

interface Session {
  app: string; title: string; start: number; end: number; url?: string
}

// ── Helpers ────────────────────────────────────────────────────────────

const APP_PALETTE = [
  '#ef4444','#f97316','#eab308','#22c55e','#14b8a6',
  '#3b82f6','#8b5cf6','#ec4899','#06b6d4','#84cc16',
  '#f59e0b','#10b981','#6366f1','#f43f5e','#0ea5e9',
]
function appColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0
  return APP_PALETTE[Math.abs(h) % APP_PALETTE.length]
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}秒`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}分钟`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h${r}m` : `${h}小时`
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function isToday(d: Date): boolean { return toDateStr(d) === toDateStr(new Date()) }

function getDomain(url: string): string {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

// ── App icon system ────────────────────────────────────────────────────

const APP_CATEGORY: Record<string, string> = {
  // Browsers
  chrome: 'browser', msedge: 'browser', firefox: 'browser', brave: 'browser',
  vivaldi: 'browser', opera: 'browser', whale: 'browser', arc: 'browser',
  iexplore: 'browser', microsoftedge: 'browser',
  // Code / IDE
  code: 'code', cursor: 'code', devenv: 'code', sublime_text: 'code',
  notepadplusplus: 'code', atom: 'code', webstorm: 'code', pycharm: 'code',
  idea: 'code', clion: 'code', rider: 'code', goland: 'code',
  // Terminal / Shell
  powershell: 'terminal', cmd: 'terminal', windowsterminal: 'terminal',
  wt: 'terminal', conhost: 'terminal', bash: 'terminal', mintty: 'terminal',
  // File manager
  explorer: 'folder', totalcmd: 'folder',
  // Chat / Video calls
  slack: 'chat', discord: 'chat', teams: 'chat', zoom: 'chat',
  skype: 'chat', telegram: 'chat', wechat: 'chat', dingtalk: 'chat',
  lark: 'chat', feishu: 'chat', lineclient: 'chat',
  // Email
  outlook: 'mail', thunderbird: 'mail', foxmail: 'mail',
  // Music
  spotify: 'music', foobar2000: 'music', musicbee: 'music',
  // Video
  vlc: 'video', potplayermini64: 'video', mpv: 'video', 'mpc-hc64': 'video',
  // Games
  steam: 'game',
  // Office
  winword: 'doc', wordpad: 'doc', excel: 'doc', powerpnt: 'doc',
  // Images / Design
  photoshop: 'image', gimp: 'image', mspaint: 'image', figma: 'image',
  // Notes
  notion: 'doc', obsidian: 'doc', onenote: 'doc', typora: 'doc',
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  browser:  Globe,
  code:     Code2,
  terminal: Terminal,
  folder:   FolderOpen,
  chat:     MessageSquare,
  mail:     Mail,
  music:    Music2,
  video:    Film,
  game:     Gamepad2,
  doc:      FileText,
  image:    Image,
}

function getCategory(app: string): string {
  return APP_CATEGORY[app.toLowerCase()] ?? ''
}

function FaviconImg({ domain, size }: { domain: string; size: number }) {
  const [ok, setOk] = useState(true)
  if (!ok) return (
    <div className="flex items-center justify-center rounded-[3px]"
      style={{ width: size, height: size, background: 'rgba(59,130,246,0.18)', color: 'rgba(99,162,246,0.9)' }}>
      <Globe size={Math.round(size * 0.62)} strokeWidth={1.5} />
    </div>
  )
  return (
    <div className="overflow-hidden rounded-[3px]" style={{ width: size, height: size, flexShrink: 0 }}>
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`}
        width={size} height={size}
        style={{ display: 'block' }}
        onError={() => setOk(false)}
        alt=""
      />
    </div>
  )
}

function AppIcon({ app, url, size = 16 }: { app: string; url?: string; size?: number }) {
  const domain = getDomain(url ?? '')
  const color  = appColor(app)
  const r = Math.round(size * 0.22)   // border-radius
  const i = Math.round(size * 0.60)   // inner icon size

  // Browser session → website favicon
  if (domain) return <FaviconImg domain={domain} size={size} />

  // Known category → lucide icon in tinted box
  const Icon = CATEGORY_ICON[getCategory(app)]
  if (Icon) return (
    <div className="flex flex-shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: r, background: color + '28', color }}>
      <Icon size={i} strokeWidth={1.5} />
    </div>
  )

  // Fallback → first letter badge
  return (
    <div className="flex flex-shrink-0 items-center justify-center font-bold text-white"
      style={{ width: size, height: size, borderRadius: r, background: color, fontSize: Math.round(size * 0.52) }}>
      {(app[0] ?? '?').toUpperCase()}
    </div>
  )
}

// ── Heatmap ────────────────────────────────────────────────────────────

const HEAT = [
  'rgba(255,255,255,0.05)',
  'rgba(20,184,166,0.22)',
  'rgba(20,184,166,0.45)',
  'rgba(20,184,166,0.70)',
  'rgba(20,184,166,0.95)',
]

function heatLevel(ms: number): number {
  if (ms === 0)            return 0
  if (ms < 30 * 60_000)   return 1
  if (ms < 2 * 3_600_000) return 2
  if (ms < 5 * 3_600_000) return 3
  return 4
}

interface HeatCell { date: string; ms: number; ghost: boolean }

function buildGrid(): HeatCell[][] {
  const today = new Date(); today.setHours(0,0,0,0)
  const start = new Date(today)
  start.setDate(start.getDate() - 52 * 7)
  while (start.getDay() !== 1) start.setDate(start.getDate() - 1)
  const cells: HeatCell[] = []
  const cur = new Date(start)
  while (cur <= today) {
    cells.push({ date: toDateStr(cur), ms: 0, ghost: false })
    cur.setDate(cur.getDate() + 1)
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: toDateStr(cur), ms: 0, ghost: true })
    cur.setDate(cur.getDate() + 1)
  }
  const weeks: HeatCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function ActivityHeatmap({ data, selectedDate, onSelect }: {
  data: Record<string, number>; selectedDate: string; onSelect: (d: string) => void
}) {
  const weeks    = buildGrid()
  const todayStr = toDateStr(new Date())
  const CELL = 11, GAP = 2, STEP = CELL + GAP

  weeks.forEach(week => week.forEach(cell => { if (!cell.ghost) cell.ms = data[cell.date] ?? 0 }))

  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const first = week.find(c => !c.ghost)
    if (!first) return
    const m = parseInt(first.date.slice(5, 7)) - 1
    if (m !== lastMonth) {
      monthLabels.push({ label: new Date(first.date + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'short' }), col: wi })
      lastMonth = m
    }
  })

  const totalDays = Object.keys(data).length
  const totalMs   = Object.values(data).reduce((a, v) => a + v, 0)

  return (
    <div className="flex-shrink-0 px-4 pt-4 pb-3 select-none">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-secondaryDark">活动热力图</span>
          <span className="text-[11px] text-secondary">
            {totalDays > 0
              ? `过去一年 ${totalDays} 天 · ${fmtDuration(totalMs)}`
              : '开启追踪后数据将显示在这里'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-secondary">
          <span>少</span>
          {HEAT.map((c, i) => (
            <div key={i} className="rounded-[2px]" style={{ width: 10, height: 10, background: c }} />
          ))}
          <span>多</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div style={{ width: weeks.length * STEP + 24, minWidth: 400 }}>
          <div className="relative ml-6" style={{ height: 16 }}>
            {monthLabels.map(({ label, col }) => (
              <span key={col} className="absolute text-[10px] text-secondary leading-none"
                style={{ left: col * STEP }}>{label}</span>
            ))}
          </div>
          <div className="flex" style={{ gap: GAP }}>
            <div className="flex flex-col items-end justify-between pr-1.5" style={{ width: 16, gap: GAP }}>
              {['一','二','三','四','五','六','日'].map((lbl, i) => (
                <div key={i} className="text-[9px] text-secondary leading-none flex items-center"
                  style={{ height: CELL, opacity: i === 0 || i === 2 || i === 4 ? 1 : 0 }}>{lbl}</div>
              ))}
            </div>
            <div className="flex" style={{ gap: GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                  {week.map((cell, di) => {
                    const sel     = cell.date === selectedDate
                    const current = cell.date === todayStr
                    const level   = heatLevel(cell.ms)
                    return (
                      <button key={di} disabled={cell.ghost}
                        onClick={() => !cell.ghost && onSelect(cell.date)}
                        title={cell.ghost ? '' : cell.ms > 0 ? `${cell.date}  ${fmtDuration(cell.ms)}` : `${cell.date}  无记录`}
                        className="rounded-[2px] transition-opacity hover:opacity-70"
                        style={{
                          width: CELL, height: CELL,
                          background: cell.ghost ? 'transparent' : HEAT[level],
                          cursor: cell.ghost ? 'default' : 'pointer',
                          outline: sel ? '1.5px solid rgba(255,255,255,0.75)'
                                 : current ? '1.5px solid rgba(255,255,255,0.30)' : 'none',
                          outlineOffset: 1.5,
                        }} />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Day detail components ──────────────────────────────────────────────

function DayTimeline({ sessions, date }: { sessions: Session[]; date: Date }) {
  const DAY_MS   = 86_400_000
  const dayStart = new Date(date).setHours(0, 0, 0, 0)
  const has      = sessions.length > 0
  const rawFirst = has ? Math.min(...sessions.map(s => s.start)) : dayStart + 8 * 3_600_000
  const rawLast  = has ? Math.max(...sessions.map(s => s.end))   : dayStart + 22 * 3_600_000
  const vStart   = Math.max(dayStart, rawFirst - 20 * 60_000)
  const vEnd     = Math.min(dayStart + DAY_MS, rawLast + 20 * 60_000)
  const span     = vEnd - vStart || 1
  const ticks: number[] = []
  for (let h = 0; h <= 24; h++) {
    const ts = dayStart + h * 3_600_000
    if (ts >= vStart && ts <= vEnd) ticks.push(h)
  }
  return (
    <div className="px-4 py-3">
      <div className="relative mb-1" style={{ height: 16 }}>
        {ticks.map(h => (
          <span key={h} className="absolute -translate-x-1/2 text-[10px] text-secondary select-none"
            style={{ left: `${((dayStart + h * 3_600_000 - vStart) / span) * 100}%` }}>
            {String(h).padStart(2,'0')}
          </span>
        ))}
      </div>
      <div className="relative h-8 overflow-hidden rounded-lg border border-white/8 bg-white/5">
        {sessions.map((s, i) => {
          const l     = Math.max(0, ((s.start - vStart) / span) * 100)
          const w     = Math.max(0.15, ((s.end - s.start) / span) * 100)
          const label = s.url ? getDomain(s.url) || s.app : s.app
          return (
            <div key={i} className="absolute inset-y-0 cursor-default transition-opacity hover:opacity-70"
              title={`${label}\n${s.title}\n${fmtTime(s.start)} – ${fmtTime(s.end)}  ${fmtDuration(s.end - s.start)}`}
              style={{ left: `${l}%`, width: `${w}%`, background: appColor(s.app) }} />
          )
        })}
      </div>
    </div>
  )
}

function AppStats({ sessions }: { sessions: Session[] }) {
  const map = new Map<string, number>()
  for (const s of sessions) map.set(s.app, (map.get(s.app) ?? 0) + (s.end - s.start))
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (!sorted.length) return null
  const maxMs = sorted[0][1]
  return (
    <div className="px-4 pb-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-secondary">应用用时</p>
      <div className="space-y-2">
        {sorted.map(([name, ms]) => (
          <div key={name} className="flex items-center gap-2.5">
            <AppIcon app={name} size={14} />
            <span className="w-28 flex-shrink-0 truncate text-[12px] text-secondaryDark">{name}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(ms/maxMs)*100}%`, background: appColor(name) }} />
            </div>
            <span className="w-16 flex-shrink-0 text-right text-[11px] tabular-nums text-secondary">
              {fmtDuration(ms)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SiteStats({ sessions }: { sessions: Session[] }) {
  const map = new Map<string, number>()
  for (const s of sessions) {
    const domain = getDomain(s.url ?? '')
    if (!domain) continue
    map.set(domain, (map.get(domain) ?? 0) + (s.end - s.start))
  }
  if (!map.size) return null
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxMs  = sorted[0][1]
  return (
    <div className="px-4 pb-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-secondary">网站用时</p>
      <div className="space-y-2">
        {sorted.map(([domain, ms]) => (
          <div key={domain} className="flex items-center gap-2.5">
            <div className="h-2 w-2 flex-shrink-0 rounded-full bg-accent/60" />
            <span className="w-44 flex-shrink-0 truncate text-[12px] text-secondaryDark">{domain}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-accent/60 transition-all duration-500"
                style={{ width: `${(ms/maxMs)*100}%` }} />
            </div>
            <span className="w-16 flex-shrink-0 text-right text-[11px] tabular-nums text-secondary">
              {fmtDuration(ms)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SessionRow({ s }: { s: Session }) {
  const domain = getDomain(s.url ?? '')
  return (
    <div className="flex items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-white/3">
      <AppIcon app={s.app} url={s.url} size={16} />
      <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
        <span className="text-[12px] font-medium text-secondaryDark flex-shrink-0">{s.app}</span>
        {domain
          ? <span className="text-[11px] text-accent/70 truncate">{domain}</span>
          : s.title && s.title !== s.app
            ? <span className="text-[11px] text-secondary truncate max-w-[200px]">{s.title}</span>
            : null}
      </div>
      <span className="flex-shrink-0 tabular-nums text-[11px] text-secondary">
        {fmtTime(s.start)}–{fmtTime(s.end)}
      </span>
      <span className="w-16 flex-shrink-0 text-right tabular-nums text-[11px] text-accent">
        {fmtDuration(s.end - s.start)}
      </span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────

export default function ActivityLog() {
  const [date,        setDate]        = useState(new Date())
  const [sessions,    setSessions]    = useState<Session[]>([])
  const [tracking,    setTracking]    = useState(false)
  const [heatmapData, setHeatmapData] = useState<Record<string, number>>({})
  const toast = useToastStore()

  const loadSessions = useCallback(async () => {
    const data = await window.electron.invoke<Session[]>('activity:getDay', toDateStr(date))
    setSessions(data ?? [])
  }, [date])

  const loadHeatmap = useCallback(async () => {
    const data = await window.electron.invoke<Record<string, number>>('activity:getHeatmap')
    setHeatmapData(data ?? {})
  }, [])

  useEffect(() => {
    loadSessions()
    loadHeatmap()
    window.electron.invoke<boolean>('activity:getStatus').then(v => setTracking(v ?? false))
  }, [loadSessions, loadHeatmap])

  useEffect(() => {
    if (!isToday(date)) return
    const t = setInterval(() => { loadSessions(); loadHeatmap() }, 15_000)
    return () => clearInterval(t)
  }, [date, loadSessions, loadHeatmap])

  function selectDay(dateStr: string) {
    setDate(new Date(dateStr + 'T00:00:00'))
  }

  function shiftDay(delta: number) {
    setDate(d => { const r = new Date(d); r.setDate(r.getDate() + delta); return r })
  }

  async function toggleTracking() {
    const next = !tracking
    await window.electron.invoke('activity:setEnabled', next)
    setTracking(next)
    toast.show(next ? '记录已开启' : '记录已暂停', 'info')
  }

  async function clearDay() {
    await window.electron.invoke('activity:deleteDay', toDateStr(date))
    setSessions([])
    setHeatmapData(prev => { const n = { ...prev }; delete n[toDateStr(date)]; return n })
    toast.show('已清除当天记录', 'info')
  }

  const totalMs  = sessions.reduce((a, s) => a + (s.end - s.start), 0)
  const reversed = [...sessions].reverse()
  const hasSites = sessions.some(s => s.url)

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Heatmap */}
      <ActivityHeatmap data={heatmapData} selectedDate={toDateStr(date)} onSelect={selectDay} />

      {/* Day strip */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-b border-dividerLight bg-primary/60 px-4 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftDay(-1)}
            className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-primaryDark hover:text-secondaryDark">
            <ChevronLeft size={14} />
          </button>
          <span className="w-32 text-center text-[13px] font-semibold tabular-nums text-secondaryDark">
            {date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' })}
            {isToday(date) && <span className="ml-1.5 text-[10px] font-normal text-accent">今天</span>}
          </span>
          <button onClick={() => shiftDay(1)} disabled={isToday(date)}
            className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-primaryDark hover:text-secondaryDark disabled:opacity-25">
            <ChevronRight size={14} />
          </button>
          {!isToday(date) && (
            <button onClick={() => setDate(new Date())}
              className="ml-1 rounded border border-accent/30 px-2 py-0.5 text-[11px] text-accent transition-colors hover:bg-accent/10">
              今天
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalMs > 0 && (
            <span className="text-[11px] text-secondary">{fmtDuration(totalMs)}</span>
          )}
          {sessions.length > 0 && (
            <button onClick={clearDay} title="清除本日记录"
              className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-red-500/15 hover:text-red-400">
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={toggleTracking}
            className={[
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all',
              tracking
                ? 'border-accent/25 bg-accent/10 text-accent'
                : 'border-divider bg-primaryDark text-secondary hover:text-secondaryDark',
            ].join(' ')}>
            <Circle size={7} fill={tracking ? 'currentColor' : 'none'}
              className={tracking ? 'animate-pulse' : ''} />
            {tracking ? '记录中' : '已暂停'}
          </button>
        </div>
      </div>

      {/* Scrollable day content */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 text-center">
            <Activity size={34} className="text-white/10" />
            <p className="text-[13px] text-secondary">
              {isToday(date)
                ? tracking ? '记录中，稍后会出现数据…' : '追踪已暂停，点右上角开启'
                : '这天没有记录'}
            </p>
          </div>
        ) : (
          <>
            <DayTimeline sessions={sessions} date={date} />

            <div className="mx-4 border-t border-dividerLight" />
            <div className="pt-3">
              <AppStats sessions={sessions} />
            </div>

            {hasSites && (
              <>
                <div className="mx-4 border-t border-dividerLight" />
                <div className="pt-3">
                  <SiteStats sessions={sessions} />
                </div>
              </>
            )}

            <div className="mx-4 border-t border-dividerLight" />
            <div className="py-2">
              <p className="px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                详细记录 · {sessions.length} 条
              </p>
              {reversed.map(s => <SessionRow key={s.start} s={s} />)}
              <div className="h-4" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
