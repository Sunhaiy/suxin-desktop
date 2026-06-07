import { Terminal, Plus } from 'lucide-react'

export default function Automation() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-dividerLight px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-accent" />
          <span className="text-body font-medium text-secondaryDark">自动化脚本</span>
        </div>
        <button className="flex items-center gap-1.5 rounded px-2.5 py-1 text-tiny font-medium text-accent hover:bg-primaryDark transition-colors">
          <Plus size={13} />
          新建脚本
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <span className="ms-icon text-4xl text-dividerDark">code</span>
          <p className="text-body text-secondaryLight">运行 JavaScript 自动化任务</p>
          <p className="text-tiny text-secondary opacity-60">
            截图、键盘操作、定时任务等
          </p>
        </div>
      </div>
    </div>
  )
}
