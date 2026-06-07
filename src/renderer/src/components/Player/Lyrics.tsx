import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../../store/player'

/** 解析 LRC 格式歌词 */
export function parseLRC(lrc: string) {
  return lrc
    .split('\n')
    .map((line) => {
      const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/)
      if (!m) return null
      return { time: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() }
    })
    .filter((l): l is { time: number; text: string } => !!l && l.text.length > 0)
    .sort((a, b) => a.time - b.time)
}

export default function Lyrics() {
  const { lyrics, currentLyricIdx, progress } = usePlayerStore()
  const listRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLParagraphElement>(null)

  // 找当前行
  useEffect(() => {
    if (!lyrics.length) return
    let idx = 0
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= progress) idx = i
      else break
    }
    usePlayerStore.getState().setCurrentLyricIdx(idx)
  }, [progress, lyrics])

  // 自动滚动到当前行
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentLyricIdx])

  if (!lyrics.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-tiny text-secondaryLight opacity-50">暂无歌词</p>
      </div>
    )
  }

  return (
    <div ref={listRef} className="flex h-full flex-col items-center overflow-y-auto py-8 px-6 no-scrollbar">
      {lyrics.map((line, i) => {
        const isActive = i === currentLyricIdx
        const isPast = i < currentLyricIdx
        return (
          <p
            key={i}
            ref={isActive ? activeRef : null}
            className={[
              'my-1.5 text-center leading-relaxed transition-all duration-300',
              isActive
                ? 'text-body font-semibold text-secondaryDark scale-105'
                : isPast
                ? 'text-tiny text-secondaryLight opacity-40'
                : 'text-tiny text-secondary opacity-60',
            ].join(' ')}
          >
            {line.text}
          </p>
        )
      })}
    </div>
  )
}
