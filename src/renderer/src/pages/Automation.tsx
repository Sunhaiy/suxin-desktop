import { useState, useCallback } from 'react'
import { Camera, Save, Copy, Loader2, Check, RefreshCw } from 'lucide-react'
import { useToastStore } from '../store/toast'

interface ScreenshotResult {
  dataURL: string
  width: number
  height: number
  timestamp: number
}

export default function Automation() {
  const [capturing, setCapturing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [screenshot, setScreenshot] = useState<ScreenshotResult | null>(null)
  const toast = useToastStore()

  const handleCapture = useCallback(async () => {
    if (capturing) return
    setCapturing(true)
    try {
      const result = await window.electron.invoke<ScreenshotResult | null>('automation:screenshot')
      if (result) {
        setScreenshot(result)
        // 主进程已自动写入剪贴板，这里同步 UI 状态
        setCopied(true)
        toast.show('截图已复制到剪贴板', 'success')
        setTimeout(() => setCopied(false), 3000)
      }
      // result 为 null = 用户取消，不报错
    } catch {
      toast.show('截图失败', 'error')
    } finally {
      setCapturing(false)
    }
  }, [capturing])

  const handleSave = useCallback(async () => {
    if (!screenshot || saving) return
    setSaving(true)
    try {
      const ok = await window.electron.invoke<boolean>('automation:saveScreenshot', screenshot.dataURL)
      if (ok) toast.show('截图已保存', 'success')
    } catch {
      toast.show('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }, [screenshot, saving])

  const handleCopy = useCallback(async () => {
    if (!screenshot) return
    try {
      const res = await fetch(screenshot.dataURL)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.show('已复制到剪贴板', 'success')
    } catch {
      toast.show('复制失败', 'error')
    }
  }, [screenshot])

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 border-b border-dividerLight px-4 py-2.5">
        <Camera size={14} className="text-accent" />
        <span className="text-body font-medium text-secondaryDark">截图工具</span>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* 截图按钮 */}
        <button
          onClick={handleCapture}
          disabled={capturing}
          className="flex w-full items-center justify-center gap-2 rounded border border-divider bg-primaryDark py-3 text-body text-secondaryDark transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {capturing
            ? <><Loader2 size={15} className="animate-spin" />选区中…</>
            : <><Camera size={15} />框选截图</>}
        </button>

        {/* 预览区 */}
        {screenshot ? (
          <div className="flex flex-col gap-2">
            {/* 元信息 + 操作按钮 */}
            <div className="flex items-center justify-between">
              <span className="text-tiny text-secondaryLight">
                {formatTime(screenshot.timestamp)}
                <span className="ml-2 opacity-50">{screenshot.width}×{screenshot.height}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCapture}
                  disabled={capturing}
                  title="重新截图"
                  className="flex items-center gap-1 rounded px-2 py-1 text-tiny text-secondary transition-colors hover:bg-primaryDark hover:text-secondaryDark disabled:opacity-50"
                >
                  <RefreshCw size={11} />
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded px-2 py-1 text-tiny text-secondary transition-colors hover:bg-primaryDark hover:text-secondaryDark"
                >
                  {copied
                    ? <><Check size={11} className="text-accent" />已复制</>
                    : <><Copy size={11} />复制</>}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 rounded px-2 py-1 text-tiny text-accent transition-colors hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving
                    ? <><Loader2 size={11} className="animate-spin" />保存中</>
                    : <><Save size={11} />保存</>}
                </button>
              </div>
            </div>

            {/* 图片预览 */}
            <div className="overflow-hidden rounded border border-divider bg-primaryDark">
              <img
                src={screenshot.dataURL}
                alt="screenshot"
                className="max-h-96 w-full object-contain"
              />
            </div>
          </div>
        ) : (
          !capturing && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
              <span className="ms-icon text-5xl text-dividerDark">screenshot</span>
              <p className="text-tiny text-secondary opacity-60">框选截图，自动复制到剪贴板</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
