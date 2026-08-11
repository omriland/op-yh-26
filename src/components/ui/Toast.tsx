import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type ToastTone = 'done' | 'alert' | 'info'

type ToastItem = {
  id: number
  message: string
  tone: ToastTone
}

type ToastApi = {
  show: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Exit opacity duration — matches `--duration-base` (180ms). */
const TOAST_EXIT_MS = 180

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const show = useCallback((message: string, tone: ToastTone = 'done') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setItems((prev) => [...prev, { id, message, tone }])
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" data-theme="command" aria-live="polite">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false)

  const beginDismiss = useCallback(() => {
    setLeaving(true)
  }, [])

  useEffect(() => {
    const ms = item.tone === 'alert' ? 6000 : 4000
    const timer = window.setTimeout(beginDismiss, ms)
    return () => window.clearTimeout(timer)
  }, [item, beginDismiss])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => onDismiss(item.id), TOAST_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, item.id, onDismiss])

  const Icon = item.tone === 'alert' ? AlertCircle : item.tone === 'info' ? Info : CheckCircle2

  return (
    <div
      className={['toast', `toast--${item.tone}`, leaving ? 'toast--leaving' : ''].filter(Boolean).join(' ')}
      role={item.tone === 'alert' ? 'alert' : 'status'}
    >
      <Icon className="toast__icon" size={20} strokeWidth={1.75} aria-hidden="true" />
      <p className="toast__message">{item.message}</p>
      {item.tone === 'alert' ? (
        <button
          type="button"
          className="toast__close"
          aria-label="סגירה"
          onClick={beginDismiss}
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
