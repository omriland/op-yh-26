import { useEffect, useId, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import {
  applyDateKeystroke,
  displayDateToIso,
  isoDateToDisplay,
  isCompleteDateInput,
  nativeDateValue,
  replaceCompleteDateDigits,
} from '../../lib/format'
import { FieldLabel } from './FieldLabel'

type DateFieldProps = {
  label: string
  value: string
  onChange: (isoDate: string) => void
  onBlur?: () => void
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  min?: string
  max?: string
  /** On blur, keep a typed-but-invalid date on screen with this error instead of reverting it. The value stays as last committed. */
  invalidMessage?: string
  /** Reports when that invalid state starts and ends. */
  onValidityChange?: (invalid: boolean) => void
}

/**
 * Day-first date field — digit-masked `DD.MM.YYYY` (רשומה). The visible value
 * is text so it does not follow the device mm/dd vs dd/mm preference. Stored
 * value stays ISO `YYYY-MM-DD`. The calendar icon is a real `type="date"`
 * tap target: iOS Safari will not reopen a picker on a clipped 1px input,
 * and `showPicker()` on that input throws.
 */
export function DateField({
  label,
  value,
  onChange,
  onBlur,
  required,
  disabled,
  error,
  hint,
  min,
  max,
  invalidMessage,
  onValidityChange,
}: DateFieldProps) {
  const fieldId = useId()
  const pickerRef = useRef<HTMLInputElement>(null)
  const committedIso = useRef(value)
  const [display, setDisplay] = useState(() => isoDateToDisplay(value))
  const displayRef = useRef(display)
  displayRef.current = display
  // iOS keeps a date input focused after the picker closes and will not open it
  // again. Blur is ignored in that state, so the node is replaced instead.
  const [pickerEpoch, setPickerEpoch] = useState(0)
  const [invalid, setInvalid] = useState(false)
  const shownError = error ?? (invalid ? invalidMessage : undefined)
  const onValidityRef = useRef(onValidityChange)
  onValidityRef.current = onValidityChange
  useEffect(() => {
    onValidityRef.current?.(invalid)
  }, [invalid])

  useEffect(() => {
    if (value === committedIso.current) return
    committedIso.current = value
    const next = isoDateToDisplay(value)
    displayRef.current = next
    setDisplay(next)
    setInvalid(false)
  }, [value])

  // Keep the picker aligned with a date typed in the text field. Skip while
  // it is focused — writing `.value` mid-gesture makes iOS drop the wheel.
  useEffect(() => {
    const picker = pickerRef.current
    if (!picker || document.activeElement === picker) return
    const next = nativeDateValue(value)
    if (picker.value !== next) picker.value = next
  }, [value])

  const describedBy =
    [shownError ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
      .filter(Boolean)
      .join(' ') || undefined
  const isBlank = Boolean(required) && !value

  function commitIso(iso: string) {
    committedIso.current = iso
    onChange(iso)
  }

  function commitDisplay(next: string) {
    displayRef.current = next
    setDisplay(next)
    if (!next) {
      setInvalid(false)
      commitIso('')
      return
    }
    const iso = displayDateToIso(next)
    if (iso) {
      setInvalid(false)
      commitIso(iso)
    }
  }

  function commitPicker(input: HTMLInputElement) {
    const iso = nativeDateValue(input.value)
    const nextDisplay = isoDateToDisplay(iso)
    if (iso === committedIso.current && nextDisplay === displayRef.current) return
    displayRef.current = nextDisplay
    setInvalid(false)
    setDisplay(nextDisplay)
    if (iso !== committedIso.current) commitIso(iso)
  }

  const commitPickerRef = useRef(commitPicker)
  commitPickerRef.current = commitPicker

  // React's onChange drops a `change` that follows `input` once the value
  // tracker has caught up, so the picker would stay focused and iOS would not
  // open it again. Listen to the native event and replace the node.
  useEffect(() => {
    const picker = pickerRef.current
    if (!picker) return
    const onNativeChange = () => {
      commitPickerRef.current(picker)
      setPickerEpoch((epoch) => epoch + 1)
    }
    picker.addEventListener('change', onNativeChange)
    return () => picker.removeEventListener('change', onNativeChange)
  }, [pickerEpoch])

  return (
    <div className="field">
      <FieldLabel htmlFor={fieldId} required={required}>
        {label}
      </FieldLabel>
      <div className="field__control ltr" dir="ltr">
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          className="field__input field__input--numeric field__input--with-affix ltr"
          dir="ltr"
          required={required}
          disabled={disabled}
          data-blank={isBlank ? 'true' : undefined}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
          aria-label={`${label} (יום.חודש.שנה)`}
          value={display}
          onFocus={(event) => {
            const input = event.currentTarget
            const end = input.value.length
            if (end === 0) return
            try {
              input.setSelectionRange(0, end)
            } catch {
              // iOS can reject the selection until the keyboard is up.
            }
          }}
          onBeforeInput={(event) => {
            const next = replaceCompleteDateDigits(displayRef.current, event.data ?? '')
            if (next == null) return
            event.preventDefault()
            const input = event.currentTarget
            input.value = next
            try {
              input.setSelectionRange(next.length, next.length)
            } catch {
              // Selection can fail while the caret is still settling.
            }
            commitDisplay(next)
          }}
          onChange={(event) => {
            const next = applyDateKeystroke(displayRef.current, event.target.value)
            if (event.target.value !== next) event.target.value = next
            commitDisplay(next)
          }}
          onBlur={() => {
            const current = displayRef.current
            if (current && !isCompleteDateInput(current)) {
              if (invalidMessage) {
                setInvalid(true)
              } else {
                const restored = isoDateToDisplay(committedIso.current)
                displayRef.current = restored
                setDisplay(restored)
              }
            }
            onBlur?.()
          }}
        />
        <span className="field__affix" aria-hidden="true">
          <Calendar size={20} strokeWidth={1.75} />
        </span>
        <input
          key={pickerEpoch}
          ref={pickerRef}
          type="date"
          className="field__date-picker"
          autoComplete="off"
          disabled={disabled}
          min={min}
          max={max}
          defaultValue={nativeDateValue(value) || undefined}
          aria-label={`בחירת ${label} בלוח שנה`}
          onPointerDown={(event) => {
            // iOS will not open the picker again while this input stays focused.
            if (document.activeElement === event.currentTarget) event.currentTarget.blur()
          }}
          onChange={(event) => {
            // `input` may fire per wheel notch. Don't replace the node here —
            // that closes the picker. The native `change` listener does that
            // once the choice is committed.
            if (event.nativeEvent.type === 'input') commitPicker(event.currentTarget)
          }}
          onBlur={(event) => {
            commitPicker(event.currentTarget)
          }}
        />
      </div>
      {shownError ? (
        <p id={`${fieldId}-error`} className="field__hint field__hint--error" role="alert">
          {shownError}
        </p>
      ) : null}
      {hint ? (
        <p id={`${fieldId}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
