import { Alert, CloseButton } from '@heroui/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  alertStatusForToastTone,
  formatToastMessage,
  isStickyToastTone,
  type ToastTone,
} from '../../lib/toastAlert'

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
    setItems((prev) => [...prev, { id, message: formatToastMessage(message), tone }])
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="toast-stack light"
        dir="rtl"
        lang="he"
        data-theme="light"
        data-vibrant-palette="true"
        aria-live="polite"
      >
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
    const ms = isStickyToastTone(item.tone) ? 6000 : 4000
    const timer = window.setTimeout(beginDismiss, ms)
    return () => window.clearTimeout(timer)
  }, [item, beginDismiss])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => onDismiss(item.id), TOAST_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, item.id, onDismiss])

  const sticky = isStickyToastTone(item.tone)

  return (
    <div
      className={['toast', leaving ? 'toast--leaving' : ''].filter(Boolean).join(' ')}
      dir="rtl"
    >
      <Alert dir="rtl" status={alertStatusForToastTone(item.tone)} role={sticky ? 'alert' : 'status'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{item.message}</Alert.Title>
        </Alert.Content>
        {sticky ? <CloseButton aria-label="סגירה" onPress={beginDismiss} /> : null}
      </Alert>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
