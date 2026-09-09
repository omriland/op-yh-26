/** Product toast tones (`useToast().show`). HeroUI Alert uses `status`. */
export type ToastTone = 'done' | 'alert' | 'info' | 'warning'

export type ToastAlertStatus = 'success' | 'danger' | 'accent' | 'warning'

export function alertStatusForToastTone(tone: ToastTone): ToastAlertStatus {
  switch (tone) {
    case 'alert':
      return 'danger'
    case 'info':
      return 'accent'
    case 'warning':
      return 'warning'
    default:
      return 'success'
  }
}

export function isStickyToastTone(tone: ToastTone): boolean {
  return tone === 'alert'
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

/** `.` / `。` between digits (1.2) is not a sentence break. */
function hasSentenceBreak(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '?' || ch === '!') return true
    if (ch === '.' || ch === '。') {
      const prev = text[i - 1]
      const next = text[i + 1]
      if (prev && next && isDigit(prev) && isDigit(next)) continue
      return true
    }
  }
  return false
}

/** One-sentence toasts drop a trailing `.` / `。`. Multi-sentence copy stays intact. */
export function formatToastMessage(message: string): string {
  const trimmed = message.trim()
  if (!trimmed.endsWith('.') && !trimmed.endsWith('。')) return trimmed
  const body = trimmed.slice(0, -1)
  if (hasSentenceBreak(body)) return trimmed
  return body.trimEnd()
}
