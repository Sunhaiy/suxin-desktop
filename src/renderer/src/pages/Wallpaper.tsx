import { useState, useEffect, useCallback } from 'react'
import { Monitor, Play, Pause, Volume2, VolumeX, FolderOpen, Power } from 'lucide-react'
import { useToastStore } from '../store/toast'

interface Theme {
  id: string; name: string; desc: string; colors: string[]
}

interface EngineConfig {
  enabled: boolean
  source?: { type: 'theme' | 'video'; id: string; path?: string }
  volume: number
}

// ── Theme card ─────────────────────────────────────────────────────────

function ThemeCard({
  theme, active, onClick,
}: {
  theme: Theme; active: boolean; onClick: () => void
}) {
  const gradient = `linear-gradient(135deg, ${theme.colors.join(', ')})`

  return (
    <button
      onClick={onClick}
      className={[
        'group relative overflow-hidden rounded-xl border text-left transition-all duration-200',
        active
          ? 'border-accent ring-1 ring-accent/40'
          : 'border-white/8 hover:border-white/20',
      ].join(' ')}
    >
      {/* Animated gradient preview */}
      <div className="relative h-24 w-full" style={{ background: gradient }}>
        {/* Shimmer to suggest animation */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[1.5s]" />
        {active && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span className="text-[10px] font-medium text-white">运行中</span>
            </div>
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-medium text-secondaryDark">{theme.name}</p>
        <p className="text-[11px] text-secondary">{theme.desc}</p>
      </div>
    </button>
  )
}

// ── Video card ─────────────────────────────────────────────────────────

function VideoCard({
  filePath, active, onPlay, onRemove,
}: {
  filePath: string; active: boolean
  onPlay: () => void; onRemove: () => void
}) {
  const name = filePath.split(/[\\/]/).pop() ?? filePath
  const ext  = name.split('.').pop()?.toUpperCase() ?? ''

  return (
    <div className={[
      'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all',
      active ? 'border-accent/50 bg-accent/5' : 'border-white/8 hover:border-white/15',
    ].join(' ')}>
      <div className="flex h-10 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-[10px] font-bold text-secondary">
        {ext}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-secondaryDark">{name}</p>
        <p className="truncate text-[11px] text-secondary opacity-60">{filePath}</p>
      </div>
      {active && <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-accent" />}
      <button onClick={onPlay}
        className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] text-accent transition-colors hover:bg-accent/10">
        {active ? '重启' : '播放'}
      </button>
      <button onClick={onRemove}
        className="flex-shrink-0 text-[11px] text-secondary transition-colors hover:text-red-400">
        移除
      </button>
    </div>
  )
}

// ── Playback controls ──────────────────────────────────────────────────

function PlaybackBar({
  paused, volume,
  onTogglePause, onVolumeChange,
}: {
  paused: boolean; volume: number
  onTogglePause: () => void; onVolumeChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onTogglePause}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-dividerLight text-secondary transition-colors hover:border-accent/40 hover:text-accent"
      >
        {paused ? <Play size={13} /> : <Pause size={13} />}
      </button>

      <div className="flex items-center gap-2">
        <button onClick={() => onVolumeChange(volume > 0 ? 0 : 0.5)}
          className="text-secondary transition-colors hover:text-secondaryDark">
          {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={e => onVolumeChange(parseFloat(e.target.value))}
          className="h-1 w-20 cursor-pointer accent-accent"
        />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────

export default function Wallpaper() {
  const [themes,     setThemes]     = useState<Theme[]>([])
  const [config,     setConfig]     = useState<EngineConfig>({ enabled: false, volume: 0 })
  const [paused,     setPausedState]= useState(false)
  const [tab,        setTab]        = useState<'theme' | 'video'>('theme')
  const [recentVids, setRecentVids] = useState<string[]>([])
  const toast = useToastStore()

  const refresh = useCallback(async () => {
    const [ts, status] = await Promise.all([
      window.electron.invoke<Theme[]>('wallpaper:getThemes'),
      window.electron.invoke<{ active: boolean; paused: boolean; config: EngineConfig }>('wallpaper:getStatus'),
    ])
    setThemes(ts ?? [])
    if (status?.config) setConfig(status.config)
    if (status)         setPausedState(status.paused)
  }, [])

  useEffect(() => {
    refresh()
    const saved = localStorage.getItem('wallpaper:recentVids')
    if (saved) try { setRecentVids(JSON.parse(saved)) } catch {}
  }, [refresh])

  function addRecentVid(p: string) {
    setRecentVids(prev => {
      const next = [p, ...prev.filter(v => v !== p)].slice(0, 10)
      localStorage.setItem('wallpaper:recentVids', JSON.stringify(next))
      return next
    })
  }

  function removeRecentVid(p: string) {
    setRecentVids(prev => {
      const next = prev.filter(v => v !== p)
      localStorage.setItem('wallpaper:recentVids', JSON.stringify(next))
      return next
    })
  }

  async function setThemeSource(id: string) {
    await window.electron.invoke('wallpaper:setSource', { type: 'theme', id })
    setConfig(c => ({ ...c, enabled: true, source: { type: 'theme', id } }))
    toast.show(`已启用「${themes.find(t => t.id === id)?.name}」动态壁纸`, 'success')
  }

  async function setVideoSource(filePath: string) {
    await window.electron.invoke('wallpaper:setSource', { type: 'video', id: filePath, path: filePath })
    setConfig(c => ({ ...c, enabled: true, source: { type: 'video', id: filePath, path: filePath } }))
    addRecentVid(filePath)
    toast.show('视频壁纸已启动', 'success')
  }

  async function pickVideo() {
    const p = await window.electron.invoke<string | null>('wallpaper:pickVideo')
    if (p) await setVideoSource(p)
  }

  async function toggleEnabled() {
    const next = !config.enabled
    await window.electron.invoke('wallpaper:setEnabled', next)
    setConfig(c => ({ ...c, enabled: next }))
    if (!next) toast.show('动态壁纸已关闭', 'info')
  }

  async function togglePause() {
    const next = !paused
    await window.electron.invoke('wallpaper:setPaused', next)
    setPausedState(next)
  }

  async function handleVolume(v: number) {
    setConfig(c => ({ ...c, volume: v }))
    await window.electron.invoke('wallpaper:setVolume', v)
  }

  const isVideoSource = config.source?.type === 'video'
  const activeThemeId = config.enabled && config.source?.type === 'theme' ? config.source.id : null
  const activeVideo   = config.enabled && config.source?.type === 'video'  ? config.source.path : null

  return (
    <div className="flex h-full flex-col">

      {/* ── Header ── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-dividerLight px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Monitor size={16} className="text-secondary" />
          <span className="text-[13px] font-semibold text-secondaryDark">动态壁纸</span>
          {config.enabled && (
            <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              运行中
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Playback controls — only when video is active */}
          {config.enabled && isVideoSource && (
            <PlaybackBar
              paused={paused}
              volume={config.volume}
              onTogglePause={togglePause}
              onVolumeChange={handleVolume}
            />
          )}

          {/* Power toggle */}
          <button
            onClick={toggleEnabled}
            className={[
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all',
              config.enabled
                ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20',
            ].join(' ')}
          >
            <Power size={12} />
            {config.enabled ? '关闭壁纸' : '启用壁纸'}
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex flex-shrink-0 gap-0 border-b border-dividerLight">
        {(['theme', 'video'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-5 py-2.5 text-[12px] font-medium transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-secondary hover:text-secondaryDark',
            ].join(' ')}
          >
            {t === 'theme' ? '内置主题' : '本地视频'}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* Built-in themes grid */}
        {tab === 'theme' && (
          <div className="grid grid-cols-3 gap-3">
            {themes.map(theme => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                active={activeThemeId === theme.id}
                onClick={() => setThemeSource(theme.id)}
              />
            ))}
          </div>
        )}

        {/* Local video */}
        {tab === 'video' && (
          <div className="flex flex-col gap-3">
            {/* Drop zone / picker */}
            <button
              onClick={pickVideo}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-8 text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            >
              <FolderOpen size={18} />
              <span className="text-[13px]">选择视频文件</span>
              <span className="text-[11px] opacity-50">mp4 · webm · mkv · mov</span>
            </button>

            {/* Recent / current videos */}
            {recentVids.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">最近使用</p>
                {recentVids.map(p => (
                  <VideoCard
                    key={p}
                    filePath={p}
                    active={activeVideo === p}
                    onPlay={() => setVideoSource(p)}
                    onRemove={() => removeRecentVid(p)}
                  />
                ))}
              </div>
            )}

            {recentVids.length === 0 && (
              <p className="text-center text-[12px] text-secondary opacity-50">
                支持 MP4、WebM、MKV、MOV 格式，视频将循环播放
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
