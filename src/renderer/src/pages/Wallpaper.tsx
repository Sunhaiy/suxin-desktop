import { useState, useEffect, useCallback } from 'react'
import {
  Monitor, Play, Pause, Volume2, VolumeX, FolderOpen, Power, Loader2, RefreshCw,
} from 'lucide-react'
import { useToastStore } from '../store/toast'

// ── Types ────────────────────────────────────────────────────────────────────

interface Theme {
  id: string; name: string; desc: string; colors: string[]
}

interface EngineConfig {
  enabled: boolean
  source?: { type: 'theme' | 'video' | 'web'; id: string; path?: string }
  volume: number
}

interface LocalImage {
  name: string
  path: string
  url: string
}

interface WorkshopItem {
  id: string
  title: string
  type: 'video' | 'web'
  file: string
  preview: string
  tags: string[]
  description: string
}

interface WorkshopScanResult {
  directory: string
  items: WorkshopItem[]
}

// ── ThemeCard ─────────────────────────────────────────────────────────────────

function ThemeCard({ theme, active, onClick }: { theme: Theme; active: boolean; onClick: () => void }) {
  const gradient = `linear-gradient(135deg, ${theme.colors.join(', ')})`
  return (
    <button onClick={onClick}
      className={['group relative overflow-hidden rounded-xl border text-left transition-all duration-200',
        active ? 'border-accent ring-1 ring-accent/40' : 'border-white/8 hover:border-white/20'].join(' ')}>
      <div className="relative h-24 w-full" style={{ background: gradient }}>
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

// ── LocalImageCard ────────────────────────────────────────────────────────────

function LocalImageCard({ image, setting, onSet }: {
  image: LocalImage; setting: boolean; onSet: () => void
}) {
  return (
    <button onClick={onSet} disabled={setting}
      className="group relative overflow-hidden rounded-xl border border-white/8 hover:border-white/20 text-left transition-all duration-200 disabled:opacity-60">
      <div className="relative h-28 w-full overflow-hidden bg-primaryDark">
        <img src={image.url} alt={image.name} loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/35">
          {setting ? (
            <Loader2 size={20} className="animate-spin text-white" />
          ) : (
            <div className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 shadow-lg">
              <Monitor size={11} className="text-white" />
              <span className="text-[11px] text-white font-medium">设为壁纸</span>
            </div>
          )}
        </div>
      </div>
      <p className="truncate px-2 py-1.5 text-[11px] text-secondary">{image.name}</p>
    </button>
  )
}

// ── VideoCard ─────────────────────────────────────────────────────────────────

function VideoCard({ filePath, active, onPlay, onRemove }: {
  filePath: string; active: boolean; onPlay: () => void; onRemove: () => void
}) {
  const name = filePath.split(/[\\/]/).pop() ?? filePath
  const ext  = name.split('.').pop()?.toUpperCase() ?? ''
  return (
    <div className={['flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all',
      active ? 'border-accent/50 bg-accent/5' : 'border-white/8 hover:border-white/15'].join(' ')}>
      <div className="flex h-10 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-[10px] font-bold text-secondary">{ext}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-secondaryDark">{name}</p>
        <p className="truncate text-[11px] text-secondary opacity-60">{filePath}</p>
      </div>
      {active && <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-accent" />}
      <button onClick={onPlay} className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] text-accent transition-colors hover:bg-accent/10">
        {active ? '重启' : '播放'}
      </button>
      <button onClick={onRemove} className="flex-shrink-0 text-[11px] text-secondary transition-colors hover:text-red-400">移除</button>
    </div>
  )
}

function WorkshopCard({ item, active, busy, onApply }: {
  item: WorkshopItem; active: boolean; busy: boolean; onApply: () => void
}) {
  const typeLabel = item.type === 'web' ? '网页' : '视频'
  return (
    <button onClick={onApply} disabled={busy}
      className={['group overflow-hidden rounded-xl text-left transition-all disabled:cursor-wait disabled:opacity-70',
        active ? 'ring-2 ring-accent/60' : 'hover:bg-white/[0.025]'].join(' ')}>
      <div className="relative h-28 overflow-hidden bg-primaryDark">
        {item.preview ? (
          <img src={item.preview} alt={item.title} loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center"><Monitor size={24} className="text-secondary opacity-30" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
        <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">{typeLabel}</span>
        {active && <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] text-white">运行中</span>}
        {busy && <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/65 text-[11px] text-white"><Loader2 size={14} className="animate-spin" />首次兼容处理中…</div>}
        <span className="absolute bottom-2 left-2 right-2 line-clamp-2 text-[12px] font-medium text-white">{item.title}</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="truncate text-[10px] text-secondary">Workshop #{item.id}</span>
        <span className="flex-shrink-0 text-[11px] text-accent">
          {busy ? '处理中' : active ? '重新应用' : '应用'}
        </span>
      </div>
    </button>
  )
}

// ── PlaybackBar ───────────────────────────────────────────────────────────────

function PlaybackBar({ paused, volume, onTogglePause, onVolumeChange }: {
  paused: boolean; volume: number; onTogglePause: () => void; onVolumeChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onTogglePause}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-dividerLight text-secondary transition-colors hover:border-accent/40 hover:text-accent">
        {paused ? <Play size={13} /> : <Pause size={13} />}
      </button>
      <div className="flex items-center gap-2">
        <button onClick={() => onVolumeChange(volume > 0 ? 0 : 0.5)} className="text-secondary transition-colors hover:text-secondaryDark">
          {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <input type="range" min={0} max={1} step={0.01} value={volume}
          onChange={e => onVolumeChange(parseFloat(e.target.value))}
          className="h-1 w-20 cursor-pointer accent-accent" />
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'theme' | 'workshop' | 'local' | 'video'

export default function Wallpaper() {
  const [themes,      setThemes]     = useState<Theme[]>([])
  const [config,      setConfig]     = useState<EngineConfig>({ enabled: false, volume: 0 })
  const [paused,      setPausedState] = useState(false)
  const [tab,         setTab]        = useState<Tab>('theme')
  const [recentVids,  setRecentVids] = useState<string[]>([])
  const [workshop, setWorkshop] = useState<WorkshopScanResult>({ directory: '', items: [] })
  const [workshopStatus, setWorkshopStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [convertingId, setConvertingId] = useState<string | null>(null)

  // 本地壁纸状态
  const [localFolder,    setLocalFolder]    = useState('')
  const [localImages,    setLocalImages]    = useState<LocalImage[]>([])
  const [localStatus,    setLocalStatus]    = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [localSettingId, setLocalSettingId] = useState<string | null>(null)

  const toast = useToastStore()

  const refresh = useCallback(async () => {
    const [ts, status] = await Promise.all([
      window.electron.invoke<Theme[]>('wallpaper:getThemes'),
      window.electron.invoke<{ active: boolean; paused: boolean; config: EngineConfig }>('wallpaper:getStatus'),
    ])
    setThemes(ts ?? [])
    if (status?.config) setConfig(status.config)
    if (status) setPausedState(status.paused)
  }, [])

  useEffect(() => {
    refresh()
    const saved = localStorage.getItem('wallpaper:recentVids')
    if (saved) try { setRecentVids(JSON.parse(saved)) } catch {}
    // 恢复上次选的文件夹
    window.electron.invoke<string>('local-wallpaper:get-folder').then(folder => {
      if (folder) { setLocalFolder(folder); doLoadImages(folder) }
    })
  }, [refresh])

  useEffect(() => {
    if (tab === 'workshop' && workshopStatus === 'idle') void scanWorkshop()
  }, [tab, workshopStatus])

  async function scanWorkshop() {
    setWorkshopStatus('loading')
    try {
      const result = await window.electron.invoke<WorkshopScanResult>('wallpaper:scanWorkshop')
      setWorkshop(result ?? { directory: '', items: [] })
      setWorkshopStatus('done')
    } catch {
      setWorkshopStatus('error')
    }
  }

  // ── 本地壁纸 ──────────────────────────────────────────────────────

  async function doLoadImages(folder: string) {
    setLocalStatus('loading')
    try {
      const images = await window.electron.invoke<LocalImage[]>('local-wallpaper:list', folder)
      setLocalImages(images ?? [])
      setLocalStatus('done')
    } catch {
      setLocalStatus('error')
    }
  }

  async function pickLocalFolder() {
    const folder = await window.electron.invoke<string | null>('local-wallpaper:pick-folder')
    if (folder) { setLocalFolder(folder); doLoadImages(folder) }
  }

  async function setLocalWallpaper(image: LocalImage) {
    if (localSettingId !== null) return
    setLocalSettingId(image.path)
    try {
      await window.electron.invoke('local-wallpaper:set', image.path)
      toast.show('桌面壁纸已设置', 'success')
    } catch {
      toast.show('设置失败', 'error')
    } finally {
      setLocalSettingId(null)
    }
  }

  // ── 视频壁纸 ──────────────────────────────────────────────────────

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

  async function setWorkshopSource(item: WorkshopItem) {
    if (convertingId) return
    setConvertingId(item.id)
    try {
      const source = { type: item.type, id: `workshop:${item.id}`, path: item.file }
      const prepared = await window.electron.invoke<EngineConfig['source']>('wallpaper:setSource', source)
      setConfig(c => ({ ...c, enabled: true, source: prepared ?? source }))
      toast.show(`已应用「${item.title}」`, 'success')
    } catch (error) {
      toast.show(error instanceof Error ? error.message : '应用创意工坊壁纸失败', 'error')
    } finally {
      setConvertingId(null)
    }
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

  const isVideoLike   = config.source?.type === 'video' || config.source?.type === 'web'
  const activeThemeId = config.enabled && config.source?.type === 'theme' ? config.source.id : null
  const activeVideo   = config.enabled && config.source?.type === 'video'  ? config.source.path : null

  const TABS: { id: Tab; label: string }[] = [
    { id: 'theme', label: '内置主题' },
    { id: 'workshop', label: '创意工坊' },
    { id: 'local', label: '本地壁纸' },
    { id: 'video', label: '本地视频' },
  ]

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
          {config.enabled && isVideoLike && (
            <PlaybackBar paused={paused} volume={config.volume}
              onTogglePause={togglePause} onVolumeChange={handleVolume} />
          )}
          <button onClick={toggleEnabled}
            className={['flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all',
              config.enabled
                ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20'].join(' ')}>
            <Power size={12} />
            {config.enabled ? '关闭壁纸' : '启用壁纸'}
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex flex-shrink-0 border-b border-dividerLight">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={['px-5 py-2.5 text-[12px] font-medium transition-colors border-b-2 -mb-px',
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-secondaryDark'].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* 内置主题 */}
        {tab === 'theme' && (
          <div className="grid grid-cols-3 gap-3">
            {themes.map(theme => (
              <ThemeCard key={theme.id} theme={theme}
                active={activeThemeId === theme.id}
                onClick={() => setThemeSource(theme.id)} />
            ))}
          </div>
        )}

        {/* Steam 创意工坊 */}
        {tab === 'workshop' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-secondaryDark">Wallpaper Engine 本地创意工坊</p>
                <p className="truncate text-[10px] text-secondary opacity-60">
                  {workshop.directory || '未检测到 Steam 创意工坊目录'}
                </p>
              </div>
              <button onClick={scanWorkshop} disabled={workshopStatus === 'loading'}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-dividerLight px-3 py-1.5 text-[11px] text-secondary transition-colors hover:text-accent disabled:opacity-50">
                <RefreshCw size={11} className={workshopStatus === 'loading' ? 'animate-spin' : ''} /> 重新扫描
              </button>
            </div>

            {workshopStatus === 'loading' && (
              <div className="flex items-center justify-center gap-2 py-16 text-secondary">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-[12px]">正在读取 project.json…</span>
              </div>
            )}

            {workshopStatus === 'error' && (
              <div className="py-16 text-center text-[12px] text-red-400">扫描失败，请确认 Steam 目录可访问</div>
            )}

            {workshopStatus === 'done' && !workshop.directory && (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-secondary">
                <FolderOpen size={28} className="opacity-25" />
                <p className="text-[12px]">未找到 steamapps/workshop/content/431960</p>
                <p className="text-[10px] opacity-50">会自动读取 Steam 注册表路径和全部库目录</p>
              </div>
            )}

            {workshopStatus === 'done' && workshop.directory && workshop.items.length === 0 && (
              <div className="py-16 text-center text-[12px] text-secondary">目录中没有可识别的动态壁纸</div>
            )}

            {workshopStatus === 'done' && workshop.items.length > 0 && (
              <>
                <p className="text-[10px] text-secondary opacity-60">
                  已识别 {workshop.items.length} 个可独立运行的视频或网页壁纸，不会启动 Wallpaper Engine。
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {workshop.items.map(item => (
                    <WorkshopCard key={item.id} item={item}
                      active={config.enabled && config.source?.id === `workshop:${item.id}`}
                      busy={convertingId === item.id}
                      onApply={() => setWorkshopSource(item)} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 本地壁纸 */}
        {tab === 'local' && (
          <div className="flex flex-col gap-3">

            {/* 文件夹选择栏 */}
            <div className="flex items-center gap-2">
              <button onClick={pickLocalFolder}
                className="flex flex-shrink-0 items-center gap-2 rounded-lg border border-dashed border-white/15 px-4 py-2 text-[12px] text-secondary transition-colors hover:border-accent/40 hover:text-accent">
                <FolderOpen size={14} />
                {localFolder ? '更换文件夹' : '选择壁纸文件夹'}
              </button>
              {localFolder && (
                <>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-secondary opacity-60">{localFolder}</span>
                  <button onClick={() => doLoadImages(localFolder)}
                    className="flex flex-shrink-0 items-center gap-1 text-[11px] text-secondary transition-colors hover:text-accent">
                    <RefreshCw size={11} /> 刷新
                  </button>
                </>
              )}
            </div>

            {/* 未选文件夹 */}
            {!localFolder && (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-secondary text-center">
                <Monitor size={30} className="opacity-25" />
                <p className="text-[13px]">选择一个文件夹来浏览本地壁纸</p>
                <p className="text-[11px] opacity-50">支持 JPG · PNG · WebP · BMP</p>
              </div>
            )}

            {/* 加载中 */}
            {localFolder && localStatus === 'loading' && (
              <div className="flex items-center justify-center gap-2 py-16 text-secondary">
                <Loader2 size={18} className="animate-spin" />
                <p className="text-[12px]">扫描图片…</p>
              </div>
            )}

            {/* 读取失败 */}
            {localFolder && localStatus === 'error' && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <p className="text-[13px] text-secondary">读取失败</p>
                <button onClick={() => doLoadImages(localFolder)}
                  className="flex items-center gap-1.5 rounded-lg border border-divider px-4 py-1.5 text-[12px] text-secondary transition-colors hover:bg-primaryDark hover:text-secondaryDark">
                  <RefreshCw size={12} /> 重试
                </button>
              </div>
            )}

            {/* 图片网格 */}
            {localStatus === 'done' && localImages.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {localImages.map(img => (
                  <LocalImageCard key={img.path} image={img}
                    setting={localSettingId === img.path}
                    onSet={() => setLocalWallpaper(img)} />
                ))}
              </div>
            )}

            {/* 空文件夹 */}
            {localStatus === 'done' && localImages.length === 0 && localFolder && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-secondary text-center">
                <p className="text-[13px]">该文件夹没有图片</p>
                <p className="text-[11px] opacity-50">支持 JPG · PNG · WebP · BMP</p>
              </div>
            )}
          </div>
        )}

        {/* 本地视频 */}
        {tab === 'video' && (
          <div className="flex flex-col gap-3">
            <button onClick={pickVideo}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-8 text-secondary transition-colors hover:border-accent/40 hover:text-accent">
              <FolderOpen size={18} />
              <span className="text-[13px]">选择视频文件</span>
              <span className="text-[11px] opacity-50">mp4 · webm · mkv · mov</span>
            </button>

            {recentVids.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">最近使用</p>
                {recentVids.map(p => (
                  <VideoCard key={p} filePath={p} active={activeVideo === p}
                    onPlay={() => setVideoSource(p)} onRemove={() => removeRecentVid(p)} />
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
