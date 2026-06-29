import { useState } from 'react'
import { ListMusic, Plus, Pencil, Trash2, Play } from 'lucide-react'
import { usePlaylistStore, type Playlist } from '../store/playlist'
import { usePlayerStore } from '../store/player'
import TrackList from '../components/Music/TrackList'
import { getMusicUrl } from '../api/music'
import { useToastStore } from '../store/toast'

export default function Playlists() {
  const { playlists, create, remove, rename, removeTrack } = usePlaylistStore()
  const { currentTrack, setTrack, setPlaying, setQueue } = usePlayerStore()
  const toast = useToastStore()

  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [creating, setCreating]        = useState(false)
  const [newName, setNewName]          = useState('')
  const [renamingId, setRenamingId]    = useState<string | null>(null)
  const [renameVal, setRenameVal]      = useState('')
  const [loadingId, setLoadingId]      = useState<string | null>(null)

  const selected = playlists.find((p) => p.id === selectedId) ?? null

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const pl = create(name)
    setSelectedId(pl.id)
    setCreating(false)
    setNewName('')
  }

  function handleRename(id: string) {
    if (renameVal.trim()) rename(id, renameVal.trim())
    setRenamingId(null)
    setRenameVal('')
  }

  function handleRemovePlaylist(id: string) {
    if (selectedId === id) setSelectedId(null)
    remove(id)
  }

  async function handlePlay(track: typeof playlists[0]['tracks'][0]) {
    if (loadingId) return
    setLoadingId(track.id)
    try {
      const { url, cover } = await getMusicUrl(track.id)
      if (!url) { toast.show(`"${track.title}" 无法播放`, 'error'); return }
      setTrack({ ...track, url, cover: cover || track.cover })
      setPlaying(true)
    } finally {
      setLoadingId(null)
    }
  }

  function handlePlayAll(pl: Playlist) {
    if (!pl.tracks.length) return
    setQueue(pl.tracks)
    handlePlay(pl.tracks[0])
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── 左侧歌单列表 ─────────────────────────────────────────── */}
      <div className="flex w-52 flex-col border-r border-dividerLight flex-shrink-0">
        {/* 头部 */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-dividerLight">
          <span className="text-body font-medium text-secondaryDark">我的歌单</span>
          <button
            onClick={() => { setCreating(true); setSelectedId(null) }}
            className="flex h-6 w-6 items-center justify-center rounded text-secondaryLight hover:bg-primaryDark hover:text-accent transition-colors"
            title="新建歌单"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* 新建输入框 */}
        {creating && (
          <div className="flex items-center gap-1 border-b border-dividerLight px-2 py-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
              placeholder="歌单名称…"
              className="flex-1 bg-transparent text-body text-secondaryDark placeholder:text-secondaryLight focus:outline-none"
            />
            <button onClick={handleCreate} className="text-tiny text-accent hover:text-accentLight">确定</button>
          </div>
        )}

        {/* 歌单列表 */}
        <div className="flex-1 overflow-y-auto py-1">
          {playlists.length === 0 && !creating && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 px-3 text-center">
              <ListMusic size={24} className="text-dividerDark" />
              <p className="text-tiny text-secondaryLight opacity-60">点击 + 新建歌单</p>
            </div>
          )}

          {playlists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => setSelectedId(pl.id)}
              className={[
                'group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                selectedId === pl.id ? 'bg-primaryDark' : 'hover:bg-primaryDark',
              ].join(' ')}
            >
              <ListMusic size={13} className={selectedId === pl.id ? 'text-accent flex-shrink-0' : 'text-secondaryLight flex-shrink-0'} />

              {renamingId === pl.id ? (
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(pl.id); if (e.key === 'Escape') setRenamingId(null) }}
                  onBlur={() => handleRename(pl.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-transparent text-body text-secondaryDark focus:outline-none min-w-0"
                />
              ) : (
                <span className={['flex-1 truncate text-body', selectedId === pl.id ? 'text-secondaryDark' : 'text-secondary'].join(' ')}>
                  {pl.name}
                </span>
              )}

              <span className="text-tiny text-secondaryLight opacity-60 flex-shrink-0">{pl.tracks.length}</span>

              {/* 悬浮操作 */}
              <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setRenamingId(pl.id); setRenameVal(pl.name) }}
                  className="flex h-5 w-5 items-center justify-center rounded text-secondaryLight hover:text-secondary"
                >
                  <Pencil size={10} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemovePlaylist(pl.id) }}
                  className="flex h-5 w-5 items-center justify-center rounded text-secondaryLight hover:text-red-400"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 右侧歌曲列表 ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <ListMusic size={36} className="text-dividerDark" />
            <p className="text-body text-secondaryLight">选择一个歌单查看内容</p>
            {playlists.length === 0 && (
              <p className="text-tiny text-secondary opacity-60">点击左侧 + 新建第一个歌单</p>
            )}
          </div>
        ) : (
          <>
            {/* 歌单头部 */}
            <div className="flex items-center gap-3 border-b border-dividerLight px-4 py-2.5">
              <ListMusic size={16} className="text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-body font-medium text-secondaryDark">{selected.name}</span>
                <span className="ml-2 text-tiny text-secondaryLight">{selected.tracks.length} 首</span>
              </div>
              {selected.tracks.length > 0 && (
                <button
                  onClick={() => handlePlayAll(selected)}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1 text-tiny font-medium text-accent hover:bg-primaryDark transition-colors"
                >
                  <Play size={12} fill="currentColor" /> 全部播放
                </button>
              )}
            </div>

            {/* 曲目列表 */}
            <div className="flex-1 overflow-y-auto p-3">
              {selected.tracks.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-body text-secondaryLight">歌单还是空的</p>
                  <p className="text-tiny text-secondary opacity-60">在搜索结果中点击 + 添加歌曲</p>
                </div>
              ) : (
                <TrackList
                  tracks={selected.tracks}
                  activeId={currentTrack?.id ?? null}
                  loadingId={loadingId}
                  onPlay={handlePlay}
                  onRemove={(track) => removeTrack(selected.id, track.id)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
