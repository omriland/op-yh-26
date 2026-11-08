/**
 * Keyboard model of the search combobox (ARIA combobox with a listbox of grouped
 * options). Options are one flat list across groups; group titles are not options.
 * Arrow keys are direction-neutral, so RTL needs nothing special.
 */

export type ComboboxState = { open: boolean; active: number; query: string }

export type ComboboxKey = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  isComposing?: boolean
}

export type ComboboxAction =
  | { type: 'none' }
  | { type: 'move'; state: ComboboxState }
  | { type: 'pick'; index: number; state: ComboboxState }
  | { type: 'submit'; state: ComboboxState }
  | { type: 'results'; state: ComboboxState }
  | { type: 'close'; state: ComboboxState }
  | { type: 'clear'; state: ComboboxState }

/** Whether the key was handled, so the caller calls preventDefault. */
export function isHandled(action: ComboboxAction): boolean {
  return action.type !== 'none'
}

export function comboboxKeyDown(state: ComboboxState, e: ComboboxKey, optionCount: number): ComboboxAction {
  if (e.isComposing) return { type: 'none' }
  const mod = Boolean(e.metaKey || e.ctrlKey)

  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      if (e.altKey) return { type: 'none' }
      if (!state.open) return { type: 'move', state: { ...state, open: true, active: -1 } }
      if (optionCount === 0) return { type: 'move', state: { ...state, active: -1 } }
      const step = e.key === 'ArrowDown' ? 1 : -1
      // From nothing highlighted, down goes to the first and up to the last; both wrap.
      const from = state.active < 0 ? (step === 1 ? -1 : optionCount) : state.active
      const active = (from + step + optionCount) % optionCount
      return { type: 'move', state: { ...state, active } }
    }
    case 'Home':
    case 'End': {
      if (!state.open || optionCount === 0 || state.active < 0) return { type: 'none' }
      return { type: 'move', state: { ...state, active: e.key === 'Home' ? 0 : optionCount - 1 } }
    }
    case 'Enter': {
      if (mod) return { type: 'results', state: { ...state, open: false, active: -1 } }
      if (state.open && state.active >= 0 && state.active < optionCount) {
        return { type: 'pick', index: state.active, state: { ...state, open: false, active: -1 } }
      }
      return { type: 'submit', state: { ...state, open: false, active: -1 } }
    }
    case 'Escape': {
      if (state.open) return { type: 'close', state: { ...state, open: false, active: -1 } }
      if (state.query !== '') return { type: 'clear', state: { ...state, query: '', active: -1 } }
      return { type: 'none' }
    }
    case 'Tab':
      // Tab leaves the field; it never walks the options.
      return state.open ? { type: 'close', state: { ...state, open: false, active: -1 } } : { type: 'none' }
    default:
      return { type: 'none' }
  }
}

/** Typing reopens the panel and drops the highlight, since the options change. */
export function comboboxInput(query: string): ComboboxState {
  return { open: true, active: -1, query }
}
