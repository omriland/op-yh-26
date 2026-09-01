/**
 * Keep the app shell sized to the *visual* viewport on mobile browsers.
 * iOS Safari’s layout viewport (100vh / innerHeight) often diverges from what
 * the user sees, which leaves the in-flow tab bar and sticky form actions
 * floating above a blank gap — or drifts the whole shell when focus scroll
 * moves the document.
 */

export const APP_HEIGHT_VAR = '--app-height'
export const KEYBOARD_OPEN_ATTR = 'data-keyboard-open'
export const KEYBOARD_OPEN_THRESHOLD_PX = 140

export function isVirtualKeyboardOpen(
  currentVisualHeight: number,
  restingVisualHeight: number,
  thresholdPx = KEYBOARD_OPEN_THRESHOLD_PX,
): boolean {
  if (restingVisualHeight <= 0) return false
  return restingVisualHeight - currentVisualHeight >= thresholdPx
}

type KeyboardRoot = {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

export function applyKeyboardOpenState(
  open: boolean,
  root: KeyboardRoot = document.documentElement,
): void {
  if (open) root.setAttribute(KEYBOARD_OPEN_ATTR, '')
  else root.removeAttribute(KEYBOARD_OPEN_ATTR)
}

export function shouldScrollFocusedField(
  el: { tagName: string; isContentEditable: boolean } | null,
): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function scrollFocusedFieldIntoView(): void {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || !shouldScrollFocusedField(el)) return
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
}

export function readAppViewportHeight(
  visualHeight: number | undefined,
  layoutHeight: number,
): number {
  const raw = Number.isFinite(visualHeight) ? (visualHeight as number) : layoutHeight
  return Math.max(1, Math.round(raw))
}

export function applyAppViewportHeight(
  height: number,
  root: { style: { setProperty(name: string, value: string): void } } = document.documentElement,
): void {
  root.style.setProperty(APP_HEIGHT_VAR, `${height}px`)
}

/** Reset document scroll that iOS may apply when focusing inputs. */
export function resetDocumentScroll(
  scrollToFn: (x: number, y: number) => void = (x, y) => window.scrollTo(x, y),
  readX: () => number = () => window.scrollX,
  readY: () => number = () => window.scrollY,
): void {
  if (readX() !== 0 || readY() !== 0) scrollToFn(0, 0)
}

type BindOptions = {
  getVisualHeight?: () => number | undefined
  getLayoutHeight?: () => number
  applyHeight?: (height: number) => void
  resetScroll?: () => void
  addWindowListener?: (
    type: string,
    listener: () => void,
    options?: AddEventListenerOptions,
  ) => () => void
  addVisualViewportListener?: (
    type: string,
    listener: () => void,
  ) => () => void
  applyKeyboardOpen?: (open: boolean) => void
  scrollFocusedField?: () => void
}

/**
 * Sync `--app-height` to the visual viewport and pin document scroll at origin.
 * Returns an unsubscribe function.
 */
export function bindAppViewportHeight(options: BindOptions = {}): () => void {
  const getVisualHeight =
    options.getVisualHeight ?? (() => window.visualViewport?.height)
  const getLayoutHeight = options.getLayoutHeight ?? (() => window.innerHeight)
  const applyHeight = options.applyHeight ?? ((h) => applyAppViewportHeight(h))
  const resetScroll = options.resetScroll ?? (() => resetDocumentScroll())
  const applyKeyboardOpen = options.applyKeyboardOpen ?? ((open) => applyKeyboardOpenState(open))
  const scrollFocusedField = options.scrollFocusedField ?? scrollFocusedFieldIntoView

  const addWindowListener =
    options.addWindowListener ??
    ((type, listener, listenerOptions) => {
      window.addEventListener(type, listener, listenerOptions)
      return () => window.removeEventListener(type, listener, listenerOptions)
    })

  const addVisualViewportListener =
    options.addVisualViewportListener ??
    ((type, listener) => {
      const vv = window.visualViewport
      if (!vv) return () => {}
      vv.addEventListener(type, listener)
      return () => vv.removeEventListener(type, listener)
    })

  let restingVisualHeight = 0
  let keyboardOpen = false

  const sync = () => {
    const height = readAppViewportHeight(getVisualHeight(), getLayoutHeight())
    applyHeight(height)
    resetScroll()
    keyboardOpen = isVirtualKeyboardOpen(height, restingVisualHeight)
    if (!keyboardOpen) restingVisualHeight = height
    applyKeyboardOpen(keyboardOpen)
    if (keyboardOpen) {
      const raf =
        typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => cb()
      raf(() => scrollFocusedField())
    }
  }

  const onOrientationChange = () => {
    restingVisualHeight = 0
    sync()
  }

  sync()

  const unsubs = [
    addWindowListener('resize', sync),
    addWindowListener('orientationchange', onOrientationChange),
    addWindowListener('scroll', resetScroll, { passive: true }),
    addWindowListener('focusin', () => {
      if (keyboardOpen) scrollFocusedField()
    }),
    addVisualViewportListener('resize', sync),
    addVisualViewportListener('scroll', sync),
  ]

  return () => {
    for (const unsub of unsubs) unsub()
  }
}
