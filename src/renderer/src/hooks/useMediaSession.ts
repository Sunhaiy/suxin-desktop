import { useEffect } from 'react'
import { usePlayerStore } from '../store/player'

/**
 * 注册 Web Media Session API
 * - Windows 11：任务栏左下角显示封面 + 控制条
 * - macOS：Command Center / Touch Bar / 通知中心
 * - 系统媒体键（F7/F8/F9）控制播放
 */
export function useMediaSession(audioRef: React.RefObject<HTMLAudioElement>) {
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    setPlaying,
    setProgress,
    playNext,
    playPrev,
  } = usePlayerStore()

  const supported = typeof navigator !== 'undefined' && 'mediaSession' in navigator

  // ── 曲目元数据 ────────────────────────────────────────────────
  useEffect(() => {
    if (!supported) return

    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      return
    }

    // 封面：尽量用大图（网易云把 param 换成 300y300，其他平台原图）
    const artworkSrc = currentTrack.cover
      ? currentTrack.cover
          .replace('?param=64y64', '?param=300y300')
          .replace('?param=130y130', '?param=300y300')
      : ''

    navigator.mediaSession.metadata = new MediaMetadata({
      title:  currentTrack.title,
      artist: currentTrack.artist,
      album:  currentTrack.album,
      artwork: artworkSrc
        ? [{ src: artworkSrc, sizes: '300x300', type: 'image/jpeg' }]
        : [],
    })
  }, [currentTrack?.id, supported])

  // ── 播放状态 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!supported) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying, supported])

  // ── 进度条（每秒更新一次，避免频繁触发）─────────────────────
  useEffect(() => {
    if (!supported || !duration) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(progress, 0), duration),
      })
    } catch {
      // 某些状态下（duration=0）会抛，忽略
    }
  }, [Math.floor(progress), duration, supported]) // Math.floor → 每秒触发一次

  // ── 操作回调（媒体键 / 系统控制条点击）────────────────────────
  useEffect(() => {
    if (!supported) return

    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play',           () => setPlaying(true)],
      ['pause',          () => setPlaying(false)],
      ['previoustrack',  playPrev],
      ['nexttrack',      playNext],
      ['seekto', (details) => {
        if (details.seekTime != null && audioRef.current) {
          audioRef.current.currentTime = details.seekTime
          setProgress(details.seekTime)
        }
      }],
      ['seekforward', (details) => {
        const skip = details.seekOffset ?? 10
        const el = audioRef.current
        if (el) { el.currentTime = Math.min(el.currentTime + skip, el.duration || 0) }
      }],
      ['seekbackward', (details) => {
        const skip = details.seekOffset ?? 10
        const el = audioRef.current
        if (el) { el.currentTime = Math.max(el.currentTime - skip, 0) }
      }],
    ]

    handlers.forEach(([action, handler]) => {
      try { navigator.mediaSession.setActionHandler(action, handler) } catch {}
    })

    return () => {
      handlers.forEach(([action]) => {
        try { navigator.mediaSession.setActionHandler(action, null) } catch {}
      })
    }
  }, [setPlaying, setProgress, playNext, playPrev, supported])
}
