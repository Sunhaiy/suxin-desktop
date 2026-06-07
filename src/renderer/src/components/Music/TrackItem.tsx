import { useState } from 'react'
import { Play, Loader2, Trash2 } from 'lucide-react'
import AddToPlaylist from './AddToPlaylist'
import type { Track } from '../../types'

const SOURCE_LABEL: Record<string, string> = {
  netease: '网易云', qq: 'QQ', kugou: '酷狗', kuwo: '酷我', bilibili: 'B站', migu: '咪咕',
}

function formatDuration(s: number) {
  if (!s) return '--:--'
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Props {
  track: Track
  index: number
  isActive: boolean
  isLoading: boolean
  onPlay: (track: Track) => void
  onRemove?: (track: Track) => void  // 歌单内删除
  showAdd?: boolean                   // 搜索结果里显示"+"
}

export default function TrackItem({ track, index, isActive, isLoading, onPlay, onRemove, showAdd }: Props) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => onPlay(track)}
      className={[
        'group flex items-center gap-3 rounded px-3 py-2 cursor-pointer transition-colors duration-100',
        isActive ? 'bg-primaryDark' : 'hover:bg-primaryDark',
      ].join(' ')}
    >
      {/* 序号 / 播放 */}
      <div className="w-6 flex-shrink-0 flex items-center justify-center">
        {isLoading ? (
          <Loader2 size={13} className="animate-spin text-accent" />
        ) : hovered || isActive ? (
          <button onClick={() => onPlay(track)} className="text-secondary hover:text-accent transition-colors">
            <Play size={13} fill="currentColor" />
          </button>
        ) : (
          <span className={['text-tiny tabular-nums', isActive ? 'text-accent' : 'text-secondaryLight'].join(' ')}>
            {index + 1}
          </span>
        )}
      </div>

      {/* 封面 */}
      <div className="h-8 w-8 flex-shrink-0 rounded overflow-hidden bg-primaryDark">
        {track.cover ? (
          <img src={track.cover} alt={track.album} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <span className="ms-icon text-dividerDark text-body">music_note</span>
          </div>
        )}
      </div>

      {/* 标题 + 艺人 */}
      <div className="flex-1 min-w-0">
        <p className={['truncate text-body leading-body', isActive ? 'text-accent' : 'text-secondaryDark'].join(' ')}>
          {track.title}
        </p>
        <p className="truncate text-tiny text-secondary leading-body">{track.artist}</p>
      </div>

      {/* 专辑 */}
      <p className="hidden w-36 truncate text-tiny text-secondary md:block">{track.album}</p>

      {/* 来源 */}
      <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-tiny text-secondaryLight border border-divider">
        {SOURCE_LABEL[track.source] ?? track.source}
      </span>

      {/* 时长 */}
      <span className="w-10 flex-shrink-0 text-right text-tiny text-secondaryLight tabular-nums">
        {formatDuration(track.duration)}
      </span>

      {/* 操作按钮 */}
      <div className="w-6 flex-shrink-0 flex items-center justify-center">
        {showAdd && <AddToPlaylist track={track} />}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(track) }}
            title="从歌单移除"
            className="flex h-6 w-6 items-center justify-center rounded text-secondaryLight opacity-0 group-hover:opacity-100 hover:bg-primaryDark hover:text-red-400 transition-all"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
