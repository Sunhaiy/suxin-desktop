import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { Search, Loader2, AlertCircle, ChevronsDown } from 'lucide-react'
import { searchMusic, getMusicUrl, type SearchSource } from '../api/music'
import TrackList from '../components/Music/TrackList'
import MusicHome from './MusicHome'
import { usePlayerStore } from '../store/player'
import { useToastStore } from '../store/toast'
import type { Track } from '../types'

const SOURCES: { id: SearchSource; label: string }[] = [
  { id: 'all',     label: '全部' },
  { id: 'netease', label: '网易云' },
  { id: 'qq',      label: 'QQ音乐' },
  { id: 'kugou',   label: '酷狗' },
]

// ── 会话持久化（localStorage，key 固定不变）──────────────────────
const SESSION_KEY = 'suxin-search-session'

interface Session {
  query: string
  source: SearchSource
  tracks: Track[]
  offsets: Record<string, number>  // per-source offset
}

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : { query: '', source: 'all', tracks: [], offsets: {} }
  } catch {
    return { query: '', source: 'all', tracks: [], offsets: {} }
  }
}

function saveSession(s: Session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch {}
}

type Status = 'idle' | 'loading' | 'loadingMore' | 'done' | 'error'

export default function Music() {
  const session = useMemo(loadSession, [])

  const [query, setQuery]         = useState(session.query)
  const [source, setSource]       = useState<SearchSource>(session.source)
  const [allTracks, setAllTracks] = useState<Track[]>(session.tracks)
  const [status, setStatus]       = useState<Status>(session.tracks.length > 0 ? 'done' : 'idle')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [offsets, setOffsets]     = useState<Record<string, number>>(session.offsets ?? {})

  const { currentTrack, setTrack, setPlaying, setQueue } = usePlayerStore()
  const toast = useToastStore()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    saveSession({ query, source, tracks: allTracks, offsets })
  }, [query, source, allTracks, offsets])

  const filteredTracks = useMemo<Track[]>(() => {
    if (source === 'all') return allTracks
    return allTracks.filter((t) => t.source === source)
  }, [allTracks, source])

  const handleSearch = useCallback(async (q = query) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setStatus('loading')
    setAllTracks([])
    setOffsets({})
    try {
      const results = await searchMusic(trimmed, 'all', 0)
      setAllTracks(results)
      setQueue(results)
      setOffsets({ netease: 30, qq: 30, kugou: 30 })
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }, [query])

  const handleLoadMore = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed || status === 'loadingMore') return
    const activeSource = source === 'all' ? 'all' : source
    const offset = offsets[activeSource] ?? 30
    setStatus('loadingMore')
    try {
      const more = await searchMusic(trimmed, activeSource, offset)
      if (more.length === 0) {
        toast.show('没有更多结果了', 'info')
        setStatus('done')
        return
      }
      setAllTracks((prev) => {
        const existingIds = new Set(prev.map((t) => t.id))
        const fresh = more.filter((t) => !existingIds.has(t.id))
        const next = [...prev, ...fresh]
        setQueue(next)
        return next
      })
      setOffsets((prev) => ({ ...prev, [activeSource]: offset + 30 }))
      setStatus('done')
    } catch {
      setStatus('done')
      toast.show('加载失败，请重试', 'error')
    }
  }, [query, source, offsets, status])

  async function handlePlay(track: Track) {
    if (loadingId) return
    setLoadingId(track.id)
    try {
      const { url, cover } = await getMusicUrl(track.id)
      if (!url) { toast.show(`"${track.title}" 无法播放（可能是付费歌曲，请登录后重试）`, 'error'); return }
      setTrack({ ...track, url, cover: cover || track.cover })
      setPlaying(true)
    } finally {
      setLoadingId(null)
    }
  }

  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = { all: allTracks.length }
    for (const s of ['netease','qq','kugou']) m[s] = allTracks.filter(t => t.source === s).length
    return m
  }, [allTracks])

  const handleHomeSearch = useCallback((q: string) => {
    setQuery(q)
    handleSearch(q)
  }, [handleSearch])

  // 有搜索结果（或正在搜索/出错）时显示结果区，否则显示首页
  const showResults = status !== 'idle' || allTracks.length > 0

  function clearSearch() {
    setQuery(''); setAllTracks([]); setStatus('idle'); setOffsets({})
    inputRef.current?.focus()
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── 顶栏：始终显示的搜索框 ────────────────────────────── */}
      <div className="flex flex-col gap-2 border-b border-dividerLight px-4 py-3">
        <div className="flex items-center gap-2 rounded border border-divider bg-primaryDark px-3 py-2 focus-within:border-dividerDark transition-colors">
          {status === 'loading'
            ? <Loader2 size={13} className="flex-shrink-0 animate-spin text-accent" />
            : <Search size={13} className="flex-shrink-0 text-secondaryLight" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            type="text"
            placeholder="搜索歌曲、艺人、专辑…"
            className="flex-1 bg-transparent text-body text-secondaryDark placeholder:text-secondary placeholder:opacity-50 focus:outline-none"
          />
          {query && (
            <button onClick={clearSearch} className="text-secondaryLight hover:text-secondary text-tiny">✕</button>
          )}
        </div>

        {/* 来源过滤（仅有搜索结果时显示） */}
        {showResults && (
          <div className="flex items-center gap-1">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className={[
                  'flex items-center gap-1 rounded px-2.5 py-1 text-tiny transition-colors',
                  source === s.id ? 'bg-primaryDark text-accent' : 'text-secondary hover:bg-primaryDark hover:text-secondaryDark',
                ].join(' ')}
              >
                {s.label}
                {status === 'done' && sourceCounts[s.id] > 0 && (
                  <span className={['tabular-nums', source === s.id ? 'text-accent opacity-70' : 'opacity-40'].join(' ')}>
                    {sourceCounts[s.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 内容区 ────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* 首页发现（空搜索时） */}
        {!showResults && <MusicHome onSearch={handleHomeSearch} />}

        {/* 搜索结果 */}
        {showResults && (
        <div className="flex flex-1 flex-col overflow-y-auto">
        {status === 'loading' && (
          <div className="flex flex-1 h-full items-center justify-center">
            <Loader2 size={20} className="animate-spin text-accent" />
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-1 h-full flex-col items-center justify-center gap-2 text-center">
            <AlertCircle size={24} className="text-secondaryLight" />
            <p className="text-body text-secondary">搜索失败，请稍后重试</p>
          </div>
        )}

        {(status === 'done' || status === 'loadingMore') && filteredTracks.length === 0 && (
          <div className="flex flex-1 h-full flex-col items-center justify-center gap-2">
            <p className="text-body text-secondaryLight">
              {source === 'all' ? '没有找到相关结果' : `${SOURCES.find(s => s.id === source)?.label} 暂无结果`}
            </p>
          </div>
        )}

        {(status === 'done' || status === 'loadingMore') && filteredTracks.length > 0 && (
          <div className="p-4">
            <p className="mb-3 text-tiny text-secondaryLight">
              {source !== 'all' && <span className="text-accent mr-1">{SOURCES.find(s => s.id === source)?.label}</span>}
              共 <span className="text-accent">{filteredTracks.length}</span> 条，双击播放
            </p>
            <TrackList
              tracks={filteredTracks}
              activeId={currentTrack?.id ?? null}
              loadingId={loadingId}
              onPlay={handlePlay}
              showAdd
            />
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={status === 'loadingMore'}
                className="flex items-center gap-1.5 rounded px-4 py-1.5 text-tiny text-secondary border border-divider hover:bg-primaryDark hover:text-secondaryDark disabled:opacity-50 transition-colors"
              >
                {status === 'loadingMore'
                  ? <><Loader2 size={12} className="animate-spin" /> 加载中…</>
                  : <><ChevronsDown size={13} /> 加载更多</>}
              </button>
            </div>
          </div>
        )}
        </div>
        )}
      </div>
    </div>
  )
}
