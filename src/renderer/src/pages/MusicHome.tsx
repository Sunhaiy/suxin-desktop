import { useEffect, useState, useCallback } from 'react'
import { Play, Loader2, RefreshCw, ChevronRight } from 'lucide-react'
import { getDiscover, getMusicUrl, type DiscoverData, type ChartCard } from '../api/music'
import { usePlayerStore } from '../store/player'
import { useToastStore } from '../store/toast'
import type { Track } from '../types'

// ── Helpers ────────────────────────────────────────────────────────
function fmt(s: number) {
  if (!s) return '--:--'
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── Skeleton ───────────────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/5 ${className}`} />
}

function ChartSkeleton() {
  return (
    <div className="flex-shrink-0 w-56 rounded-2xl overflow-hidden bg-primaryDark border border-dividerLight">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="p-3 space-y-2.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-sm flex-shrink-0" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}

function NewSongSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2">
      <Skeleton className="h-11 w-11 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
  )
}

// ── Chart Card ─────────────────────────────────────────────────────
function ChartCardView({
  chart,
  activeId,
  loadingId,
  onPlay,
  onPlayAll,
}: {
  chart: ChartCard
  activeId: string | null
  loadingId: string | null
  onPlay: (track: Track, queue: Track[]) => void
  onPlayAll: (chart: ChartCard) => void
}) {
  return (
    <div className="flex-shrink-0 w-56 rounded-2xl overflow-hidden bg-primaryDark
                    border border-dividerLight hover:border-divider transition-colors group">
      {/* Cover */}
      <div className="relative h-40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/30 to-primaryDark" />
        {chart.cover && (
          <img
            src={chart.cover}
            alt={chart.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        {/* Play all button */}
        <button
          onClick={() => onPlayAll(chart)}
          className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full
                     bg-accent shadow-lg opacity-0 group-hover:opacity-100 transition-all
                     duration-200 hover:scale-110 hover:bg-accent/90"
        >
          <Play size={15} fill="white" className="text-white ml-0.5" />
        </button>
        {/* Chart name */}
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
              {/* Rank */}
              <span className={[
                'w-4 flex-shrink-0 text-center text-[11px] font-bold tabular-nums',
                i === 0 ? 'text-[#f5a623]' : i === 1 ? 'text-[#b0b0b0]' : i === 2 ? 'text-[#c4783f]' : 'text-secondary',
              ].join(' ')}>
                {isLoading ? <Loader2 size={10} className="animate-spin inline" /> : i + 1}
              </span>
              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className={[
                  'truncate text-[12px] leading-tight',
                  isActive ? 'text-accent' : 'text-secondaryDark',
                ].join(' ')}>
                  {track.title}
                </p>
                <p className="truncate text-[11px] text-secondary leading-tight mt-0.5">
                  {track.artist}
                </p>
              </div>
              {/* Duration */}
              <span className="flex-shrink-0 text-[10px] text-secondary tabular-nums">
                {fmt(track.duration)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── New Song Card (in grid) ────────────────────────────────────────
function NewSongCard({
  track,
  isActive,
  isLoading,
  onPlay,
}: {
  track: Track
  isActive: boolean
  isLoading: boolean
  onPlay: (track: Track) => void
}) {
  return (
    <button
      onClick={() => onPlay(track)}
      className={[
        'flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors group',
        isActive ? 'bg-white/8' : 'hover:bg-white/5',
      ].join(' ')}
    >
      {/* Cover */}
      <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl">
        {track.cover ? (
          <img src={track.cover} alt={track.album}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" />
        ) : (
          <div className="h-full w-full bg-primaryDark flex items-center justify-center">
            <span className="ms-icon text-[16px] text-dividerDark">music_note</span>
          </div>
        )}
        {/* Play icon on hover */}
        <div className="absolute inset-0 flex items-center justify-center
                        bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          {isLoading
            ? <Loader2 size={14} className="animate-spin text-white" />
            : <Play size={14} fill="white" className="text-white ml-0.5" />}
        </div>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className={[
          'truncate text-[13px] font-medium leading-tight',
          isActive ? 'text-accent' : 'text-secondaryDark',
        ].join(' ')}>
          {track.title}
        </p>
        <p className="truncate text-[11px] text-secondary mt-0.5">
          {track.artist}
        </p>
      </div>

      {/* Duration */}
      <span className="flex-shrink-0 text-[11px] text-secondary tabular-nums opacity-60">
        {fmt(track.duration)}
      </span>
    </button>
  )
}

// ── Section header ─────────────────────────────────────────────────
function SectionHeader({ title, onMore }: { title: string; onMore?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[14px] font-semibold text-secondaryDark">{title}</h2>
      {onMore && (
        <button
          onClick={onMore}
          className="flex items-center gap-0.5 text-[12px] text-secondary hover:text-accent transition-colors"
        >
          更多 <ChevronRight size={13} />
        </button>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────
interface Props {
  onSearch?: (query: string) => void
}

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

  // Play a single track (with an optional surrounding queue)
  const handlePlay = useCallback(async (track: Track, queue?: Track[]) => {
    if (loadingId) return
    setLoadingId(track.id)
    try {
      const { url, cover } = await getMusicUrl(track.id)
      if (!url) {
        toast.show(`"${track.title}" 无法播放`, 'error')
        return
      }
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

  // ── Loading skeleton ──────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="h-full overflow-y-auto px-4 py-4 space-y-6">
        <div>
          <Skeleton className="h-4 w-16 mb-3" />
          <div className="flex gap-3 overflow-hidden">
            {[...Array(3)].map((_, i) => <ChartSkeleton key={i} />)}
          </div>
        </div>
        <div>
          <Skeleton className="h-4 w-20 mb-3" />
          <div className="grid grid-cols-2 gap-x-2">
            {[...Array(12)].map((_, i) => <NewSongSkeleton key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-body text-secondary">加载失败</p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-divider px-4 py-1.5
                     text-tiny text-secondary hover:bg-primaryDark hover:text-secondaryDark transition-colors"
        >
          <RefreshCw size={12} /> 重试
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-4 space-y-6">

        {/* ── Charts ── */}
        {data.charts.length > 0 && (
          <section>
            <SectionHeader title="排行榜" />
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {data.charts.map(chart => (
                <ChartCardView
                  key={chart.id}
                  chart={chart}
                  activeId={currentTrack?.id ?? null}
                  loadingId={loadingId}
                  onPlay={handlePlay}
                  onPlayAll={handlePlayAll}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── New Songs ── */}
        {data.newSongs.length > 0 && (
          <section>
            <SectionHeader
              title="新歌推荐"
              onMore={onSearch ? () => onSearch('新歌推荐') : undefined}
            />
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

        {/* Bottom padding so last item clears the player bar */}
        <div className="h-2" />
      </div>
    </div>
  )
}
