import { useEffect, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.electron?.window.isMaximized().then(setMaximized)
    window.electron?.window.onMaximizeChange(setMaximized)
  }, [])

  return (
    <div className="drag-region flex h-9 w-full items-center justify-between bg-primary border-b border-dividerLight flex-shrink-0">
      {/* 左侧：应用名 */}
      <div className="flex items-center gap-2 px-4">
        <span className="ms-icon text-accent">music_note</span>
        <span className="text-tiny font-semibold text-secondaryDark tracking-wide">SuXin Desktop</span>
      </div>

      {/* 右侧：窗口按钮 */}
      <div className="no-drag flex h-full">
        <button
          onClick={() => window.electron?.window.minimize()}
          className="flex h-full w-11 items-center justify-center text-secondary hover:bg-primaryDark hover:text-secondaryDark"
          title="最小化"
        >
          <Minus size={12} />
        </button>

        <button
          onClick={() => window.electron?.window.maximize()}
          className="flex h-full w-11 items-center justify-center text-secondary hover:bg-primaryDark hover:text-secondaryDark"
          title={maximized ? '还原' : '最大化'}
        >
          <Square size={11} />
        </button>

        <button
          onClick={() => window.electron?.window.close()}
          className="flex h-full w-11 items-center justify-center text-secondary hover:bg-red-600 hover:text-white"
          title="关闭到托盘"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
