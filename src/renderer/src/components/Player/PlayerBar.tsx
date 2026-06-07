import { useRef, useEffect, useCallback } from 'react'
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, MicVocal,
  List, Repeat, Shuffle, Repeat1,
} from 'lucide-react'
import { usePlayerStore, type PlayMode } from '../../store/player'
import { useToastStore } from '../../store/toast'
import { useMediaSession } from '../../hooks/useMediaSession'

function formatTime(s: number) {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

const MODE_CONFIG: Record<PlayMode, { Icon: React.ElementType; label: string; active: boolean }> = {
  sequential:  { Icon: List,    label: '顺序播放', active: false },
  loop:        { Icon: Repeat,  label: '循环播放', active: true },
  shuffle:     { Icon: Shuffle, label: '随机播放', active: true },
  'repeat-one':{ Icon: Repeat1, label: '单曲循环', active: true },
}

export default function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const {
    currentTrack, isPlaying, volume, progress, duration, showLyrics, playMode,
    setPlaying, setVolume, setProgress, setDuration, toggleLyrics, cyclePlayMode, playNext, playPrev,
  } = usePlayerStore()
  const toast = useToastStore()

  // 换曲
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (currentTrack?.url) {
      el.src = currentTrack.url
      el.volume = volume
      el.load()
      el.play().catch(() => { setPlaying(false); toast.show('播放失败', 'error') })
    } else {
      el.pause(); el.src = ''
    }
  }, [currentTrack?.id, currentTrack?.url])

  // 播放/暂停
  useEffect(() => {
    const el = audioRef.current
    if (!el || !currentTrack?.url) return
    if (isPlaying) { el.play().catch(() => setPlaying(false)) }
    else { el.pause() }
  }, [isPlaying])

  // 音量
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume }, [volume])

  // Windows 11 任务栏 / macOS Command Center 媒体控制
  useMediaSession(audioRef)

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value)
    setProgress(t)
    if (audioRef.current) audioRef.current.currentTime = t
  }, [])

  function handleEnded() {
    if (playMode === 'repeat-one' && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => setPlaying(false))
    } else {
      playNext()
    }
  }

  const pct = duration > 0 ? (progress / duration) * 100 : 0
  const { Icon: ModeIcon, label: modeLabel, active: modeActive } = MODE_CONFIG[playMode]

  return (
    <div className="flex h-16 flex-shrink-0 items-center border-t border-dividerLight bg-primary px-4 gap-4">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onEnded={handleEnded}
        onError={() => { setPlaying(false); toast.show('音频加载失败', 'error') }}
      />

      {/* 当前曲目 */}
      <div className="flex w-52 flex-shrink-0 items-center gap-3 overflow-hidden">
        {currentTrack ? (
          <>
            <img src={currentTrack.cover} alt="" className="h-9 w-9 rounded flex-shrink-0 object-cover bg-primaryDark" />
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-secondaryDark leading-body">{currentTrack.title}</p>
              <p className="truncate text-tiny text-secondary leading-body">{currentTrack.artist}</p>
            </div>
          </>
        ) : (
          <p className="text-tiny text-secondaryLight">未播放</p>
        )}
      </div>

      {/* 播放控制 + 进度 */}
      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-4">
          <button onClick={playPrev} className="text-secondary hover:text-secondaryDark">
            <SkipBack size={16} strokeWidth={2} />
          </button>

          <button
            onClick={() => setPlaying(!isPlaying)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white hover:bg-accentLight transition-colors"
          >
            {isPlaying ? <Pause size={15} fill="white" /> : <Play size={15} fill="white" className="ml-0.5" />}
          </button>

          <button onClick={playNext} className="text-secondary hover:text-secondaryDark">
            <SkipForward size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex w-full max-w-lg items-center gap-2">
          <span className="w-8 text-right text-tiny text-secondaryLight tabular-nums">{formatTime(progress)}</span>
          <div className="relative flex-1 h-1">
            <div className="absolute inset-0 rounded-full bg-dividerDark overflow-hidden">
              <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <input type="range" min={0} max={duration || 100} value={progress}
              onChange={handleSeek} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
          </div>
          <span className="w-8 text-tiny text-secondaryLight tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 右侧控制 */}
      <div className="flex flex-shrink-0 items-center gap-3">
        {/* 播放模式 */}
        <button
          onClick={cyclePlayMode}
          title={modeLabel}
          className={['transition-colors', modeActive ? 'text-accent hover:text-accentLight' : 'text-secondaryLight hover:text-secondary'].join(' ')}
        >
          <ModeIcon size={15} />
        </button>

        {/* 歌词 */}
        <button
          onClick={toggleLyrics}
          title="歌词"
          className={['transition-colors', showLyrics ? 'text-accent' : 'text-secondaryLight hover:text-secondary'].join(' ')}
        >
          <MicVocal size={15} />
        </button>

        {/* 音量 */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setVolume(volume > 0 ? 0 : 0.8)} className="text-secondaryLight hover:text-secondary">
            {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <div className="relative w-20 h-1">
            <div className="absolute inset-0 rounded-full bg-dividerDark overflow-hidden">
              <div className="h-full bg-secondary rounded-full" style={{ width: `${volume * 100}%` }} />
            </div>
            <input type="range" min={0} max={1} step={0.01} value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
