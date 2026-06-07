import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useToastStore, type ToastType } from '../../store/toast'

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
}
const COLORS: Record<ToastType, string> = {
  success: 'text-accent',
  error: 'text-red-400',
  info: 'text-secondary',
}

export default function Toaster() {
  const { toasts, dismiss } = useToastStore()

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 rounded border border-dividerDark bg-popover px-3 py-2 shadow-lg fade-enter"
          >
            <Icon size={14} className={COLORS[t.type]} />
            <span className="text-body text-secondaryDark max-w-xs">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 text-secondaryLight hover:text-secondary">
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
