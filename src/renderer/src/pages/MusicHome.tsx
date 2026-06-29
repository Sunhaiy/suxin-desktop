import { useEffect, useState, useCallback } from 'react'
import { Play, Loader2, RefreshCw, ChevronRight, Headphones } from 'lucide-react'
import { getDiscover, getMusicUrl, type DiscoverData, type ChartCard, type PlaylistCard } from '../api/music'
import { usePlayerStore } from '../store/player'
import { useToastStore } from '../store/toast'
import type { Track } from '../types'

// ── Helpers ────────────────────────────────────────────────────────
function fmt(s: number) {
  if (!s) return '--:--'
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function fmtCount(n: number) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`
  if (n >= 1e4) return `${Math.floor(n / 1e4)}万`
  return String(n)
}

// Per-chart accent gradients so each card looks distinct
const CHART_GRADIENTS = [
  'from-red-600/70 to-orange-500/50',
  'from-blue-600/70 to-cyan-500/50',
  'from-purple-600/70 to-pink-500/50',
  'from-green-600/70 to-emerald-500/50',
  'from-yellow-600/70 to-amber-500/50',
  'from-rose-600/70 to-red-500/50',
]

// ── Skeleton ───────────────────────────────────────────────────────
function Sk({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/5 ${className}`} />
}

function LoadingSkeleton() {
  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-6">
      {/* playlists */}
      <div>
        <Sk className="h-4 w-20 mb-3" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => (
            <div key={i}>
              <Sk className="w-full aspect-square rounded-xl mb-2" />
              <Sk className="h-3 w-full mb-1" />
              <Sk className="h-2.5 w-2/3" />
            </div>
          ))}
        </div>
      </div>
      {/* charts */}
      <div>
        <Sk className="h-4 w-16 mb-3" />
        <div className="flex gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-56 rounded-2xl overflow-hidden bg-primaryDark border border-dividerLight">
              <Sk className="h-40 w-full rounded-none" />
              <div className="p-3 space-y-2.5">
                {[...Array(5)].map((_, j) => <Sk key={j} className="h-3" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Cover image with fallback ──────────────────────────────────────
function CoverImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [ok, setOk] = useState(true)
  useEffect(() => { setOk(true) }, [src])
  if (!src || !ok) return null
  return (
    <img
      src={src} alt={alt}
      className={className}
      onError={() => setOk(false)}
    />
  )
}

// ── Playlist card ──────────────────────────────────────────────────
function PlaylistCardView({
  pl, onClick,
}: {
  pl: PlaylistCard
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="group text-left w-full">
      {/* Cover */}
      <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-primaryDark">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-primaryDark" />
        <CoverImg
          src={pl.cover} alt={pl.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Play count badge */}
        {pl.playCount > 0 && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-black/55 backdrop-blur-sm">
            <Headphones size={9} className="text-white/80" />
            <span className="text-[10px] text-white/90 font-medium">{fmtCount(pl.playCount)}</span>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent shadow-lg">
            <Play size={16} fill="white" className="text-white ml-0.5" />
          </div>
        </div>
        {/* Description strip at bottom */}
        {pl.description && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-4">
            <p className="text-[10px] text-white/80 line-clamp-1">{pl.description}</p>
          </div>
        )}
      </div>
      {/* Title */}
      <p className="mt-1.5 text-[12px] text-secondaryDark leading-snug line-clamp-2 px-0.5">{pl.name}</p>
    </button>
  )
}

// ── Chart card ─────────────────────────────────────────────────────
function ChartCardView({
  chart, index, activeId, loadingId, onPlay, onPlayAll,
}: {
  chart: ChartCard; index: number
  activeId: string | null; loadingId: string | null
  onPlay: (track: Track, queue: Track[]) => void
  onPlayAll: (chart: ChartCard) => void
}) {
  const grad = CHART_GRADIENTS[index % CHART_GRADIENTS.length]

  return (
    <div className="flex-shrink-0 w-56 rounded-2xl overflow-hidden bg-primaryDark border border-dividerLight hover:border-divider transition-colors group">
      {/* Cover */}
      <div className={`relative h-40 overflow-hidden bg-gradient-to-br ${grad}`}>
        <CoverImg
          src={chart.cover} alt={chart.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <button
          onClick={() => onPlayAll(chart)}
          className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full
                     bg-accent shadow-lg opacity-0 group-hover:opacity-100 transition-all
                     duration-200 hover:scale-110 hover:bg-accent/90"
        >
          <Play size={15} fill="white" className="text-white ml-0.5" />
        </button>
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
          <p className="text-[13px] font-semibold text-white drop-shadow">{chart.name}</p>
        </div>
      </div>

      {/* Track list */}
      <div className="py-1.5">
        {chart.tracks.map((track, i) => {
          const isActive  = activeId === track.id
          const isLoading = loadingId === track.id
          return (
            <button
              key={track.id}
              onClick={() => onPlay(track, chart.tracks)}
              className={[
                'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
                isActive ? 'bg-white/5' : 'hover:bg-white/5',
              ].join(' ')}
            >
              <span className={[
                'w-4 flex-shrink-0 text-center text-[11px] font-bold tabular-nums',
                i === 0 ? 'text-[#f5a623]' : i === 1 ? 'text-[#b0b0b0]' : i === 2 ? 'text-[#c4783f]' : 'text-secondary',
              ].join(' ')}>
                {isLoading ? <Loader2 size={10} className="animate-spin inline" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={['truncate text-[12px] leading-tight', isActive ? 'text-accent' : 'text-secondaryDark'].join(' ')}>
                  {track.title}
                </p>
                <p className="truncate text-[11px] text-secondary leading-tight mt-0.5">{track.artist}</p>
              </div>
              <span className="flex-shrink-0 text-[10px] text-secondary tabular-nums">{fmt(track.duration)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── New song card ──────────────────────────────────────────────────
function NewSongCard({
  track, isActive, isLoading, onPlay,
}: {
  track: Track; isActive: boolean; isLoading: boolean; onPlay: (t: Track) => void
}) {
  return (
    <button
      onClick={() => onPlay(track)}
      className={['flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors group', isActive ? 'bg-white/8' : 'hover:bg-white/5'].join(' ')}
    >
      <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl bg-primaryDark">
        <CoverImg src={track.cover ?? ''} alt={track.album ?? ''}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" />
        {!track.cover && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[16px] text-dividerDark">♪</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          {isLoading ? <Loader2 size={14} className="animate-spin text-white" /> : <Play size={14} fill="white" className="text-white ml-0.5" />}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className={['truncate text-[13px] font-medium leading-tight', isActive ? 'text-accent' : 'text-secondaryDark'].join(' ')}>{track.title}</p>
        <p className="truncate text-[11px] text-secondary mt-0.5">{track.artist}</p>
      </div>
      <span className="flex-shrink-0 text-[11px] text-secondary tabular-nums opacity-60">{fmt(track.duration)}</span>
    </button>
  )
}

// ── Section header ─────────────────────────────────────────────────
function SectionHeader({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[14px] font-semibold text-secondaryDark">{title}</h2>
      {onMore && (
        <button onClick={onMore} className="flex items-center gap-0.5 text-[12px] text-secondary hover:text-accent transition-colors">
          更多 <ChevronRight size={13} />
        </button>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────
interface Props { onSearch?: (query: string) => void }

export default function MusicHome({ onSearch }: Props) {
  const [data,      setData]      = useState<DiscoverData | null>(null)
  const [status,    setStatus]    = useState<'loading' | 'done' | 'error'>('loading')
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const { currentTrack, setTrack, setPlaying, setQueue } = usePlayerStore()
  const toast = useToastStore()

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const d = await getDiscover()
      setData(d)
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handlePlay = useCallback(async (track: Track, queue?: Track[]) => {
    if (loadingId) return
    setLoadingId(track.id)
    try {
      const { url, cover } = await getMusicUrl(track.id)
      if (!url) { toast.show(`"${track.title}" 无法播放`, 'error'); return }
      if (queue?.length) setQueue(queue)
      setTrack({ ...track, url, cover: cover ?? track.cover })
      setPlaying(true)
    } catch {
      toast.show('播放失败', 'error')
    } finally {
      setLoadingId(null)
    }
  }, [loadingId])

  const handlePlayAll = useCallback(async (chart: ChartCard) => {
    if (!chart.tracks.length) return
    handlePlay(chart.tracks[0], chart.tracks)
  }, [handlePlay])

  if (status === 'loading') return <LoadingSkeleton />

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-[13px] text-secondary">加载失败</p>
        <button onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-divider px-4 py-1.5 text-[12px] text-secondary hover:bg-primaryDark hover:text-secondaryDark transition-colors">
          <RefreshCw size={12} /> 重试
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-4 space-y-7">

        {/* ── Recommended playlists ── */}
        {(data.playlists?.length ?? 0) > 0 && (
          <section>
            <SectionHeader title="推荐歌单" onMore={onSearch ? () => onSearch('推荐歌单') : undefined} />
            <div className="grid grid-cols-3 gap-3">
              {data.playlists.map(pl => (
                <PlaylistCardView
                  key={pl.id}
                  pl={pl}
                  onClick={() => toast.show('歌单播放功能开发中', 'info')}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Charts ── */}
        {data.charts.length > 0 && (
          <section>
            <SectionHeader title="排行榜" />
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {data.charts.map((chart, i) => (
                <ChartCardView
                  key={chart.id}
                  chart={chart}
                  index={i}
                  activeId={currentTrack?.id ?? null}
                  loadingId={loadingId}
                  onPlay={handlePlay}
                  onPlayAll={handlePlayAll}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── New songs ── */}
        {data.newSongs.length > 0 && (
          <section>
            <SectionHeader title="新歌推荐" onMore={onSearch ? () => onSearch('新歌推荐') : undefined} />
            <div className="grid grid-cols-2 gap-x-1">
              {data.newSongs.map(track => (
                <NewSongCard
                  key={track.id}
                  track={track}
                  isActive={currentTrack?.id === track.id}
                  isLoading={loadingId === track.id}
                  onPlay={t => handlePlay(t, data.newSongs)}
                />
              ))}
            </div>
          </section>
        )}

        <div className="h-2" />
      </div>
    </div>
  )
}
