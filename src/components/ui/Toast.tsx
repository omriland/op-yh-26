import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

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
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const ms = item.tone === 'alert' ? 6000 : 4000
    const timer = window.setTimeout(() => onDismiss(item.id), ms)
    return () => window.clearTimeout(timer)
  }, [item, onDismiss])

  const Icon = item.tone === 'alert' ? AlertCircle : CheckCircle2

  return (
    <div
      className={['toast', `toast--${item.tone}`].join(' ')}
      role={item.tone === 'alert' ? 'alert' : 'status'}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      <p className="toast__message">{item.message}</p>
      {item.tone === 'alert' ? (
        <button
          type="button"
          className="toast__close"
          aria-label="סגירה"
          onClick={() => onDismiss(item.id)}
        >
          <X size={16} strokeWidth={1.75} />
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
