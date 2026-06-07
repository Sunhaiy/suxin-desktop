import { useState, useRef, useEffect } from 'react'
import { Plus, ListMusic, Check } from 'lucide-react'
import { usePlaylistStore } from '../../store/playlist'
import { useToastStore } from '../../store/toast'
import type { Track } from '../../types'

interface Props {
  track: Track
}

export default function AddToPlaylist({ track }: Props) {
  const [open, setOpen]       = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]  = useState('')
  const ref                    = useRef<HTMLDivElement>(null)
  const inputRef               = useRef<HTMLInputElement>(null)

  const { playlists, create, addTrack } = usePlaylistStore()
  const toast = useToastStore()

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  function handleAdd(playlistId: string, playlistName: string) {
    const added = addTrack(playlistId, track)
    toast.show(added ? `已添加到「${playlistName}」` : `已在「${playlistName}」中`, added ? 'success' : 'info')
    setOpen(false)
  }

  function handleCreate() {
    if (!newName.trim()) return
    const pl = create(newName.trim())
    addTrack(pl.id, track)
    toast.show(`已创建歌单「${pl.name}」并添加`, 'success')
    setCreating(false)
    setNewName('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onMouseDown={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        title="添加到歌单"
        className="flex h-6 w-6 items-center justify-center rounded text-secondaryLight opacity-0 group-hover:opacity-100 hover:bg-primaryDark hover:text-secondary transition-all"
      >
        <Plus size={13} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 z-50 w-52 rounded border border-dividerDark bg-popover shadow-lg py-1">
          {playlists.length === 0 && !creating && (
            <p className="px-3 py-1.5 text-tiny text-secondaryLight opacity-60">暂无歌单</p>
          )}

          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => handleAdd(pl.id, pl.name)}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-primaryDark transition-colors"
            >
              <ListMusic size={12} className="flex-shrink-0 text-secondaryLight" />
              <span className="flex-1 truncate text-left text-body text-secondary">{pl.name}</span>
              {pl.tracks.some((t) => t.id === track.id) && (
                <Check size={11} className="flex-shrink-0 text-accent" />
              )}
            </button>
          ))}

          <div className="my-1 border-t border-dividerLight" />

          {creating ? (
            <div className="flex items-center gap-1 px-2 py-1">
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                placeholder="歌单名称…"
                className="flex-1 rounded border border-divider bg-transparent px-2 py-0.5 text-body text-secondaryDark placeholder:text-secondaryLight focus:border-dividerDark focus:outline-none"
              />
              <button onClick={handleCreate} className="flex-shrink-0 rounded px-1.5 py-0.5 text-tiny text-accent hover:bg-primaryDark">确定</button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-primaryDark transition-colors"
            >
              <Plus size={12} className="text-secondaryLight" />
              <span className="text-body text-secondary">新建歌单</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
