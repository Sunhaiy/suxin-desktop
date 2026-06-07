import TrackItem from './TrackItem'
import type { Track } from '../../types'

interface Props {
  tracks: Track[]
  activeId: string | null
  loadingId: string | null
  onPlay: (track: Track) => void
  onRemove?: (track: Track) => void
  showAdd?: boolean
}

export default function TrackList({ tracks, activeId, loadingId, onPlay, onRemove, showAdd }: Props) {
  if (!tracks.length) return null

  return (
    <div className="flex flex-col">
      {/* 表头 */}
      <div className="flex items-center gap-3 border-b border-dividerLight px-3 pb-1.5 mb-1">
        <div className="w-6" />
        <div className="w-8" />
        <div className="flex-1 text-tiny font-semibold text-secondaryLight">标题</div>
        <div className="hidden w-36 text-tiny font-semibold text-secondaryLight md:block">专辑</div>
        <div className="w-12 text-tiny font-semibold text-secondaryLight">来源</div>
        <div className="w-10 text-right text-tiny font-semibold text-secondaryLight">时长</div>
        <div className="w-6" />
      </div>

      {tracks.map((track, i) => (
        <TrackItem
          key={track.id}
          track={track}
          index={i}
          isActive={track.id === activeId}
          isLoading={track.id === loadingId}
          onPlay={onPlay}
          onRemove={onRemove}
          showAdd={showAdd}
        />
      ))}
    </div>
  )
}
