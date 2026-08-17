import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  availabilityLabel,
  availabilityReturnCaption,
  effectiveAvailability,
  israelToday,
  parseAvailabilityStatus,
  type AvailabilityStatus,
} from '../../lib/availability'
import { saveAvailability } from '../../lib/availabilityApi'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toast'
import { AvailabilityEditor } from './AvailabilityEditor'
import { AvailabilityStatusMark } from './AvailabilityDot'

type Target = {
  id: string
  availability: AvailabilityStatus
  available_from: string | null
}

function triggerLabel(status: AvailabilityStatus, caption: string | null) {
  const label = `זמינות: ${availabilityLabel(status)}`
  return caption ? `${label}, ${caption}` : label
}

export function AvailabilityTrigger({
  target,
  disabled = false,
  disabledCaption,
  compact = false,
  onSaved,
}: {
  target: Target
  disabled?: boolean
  disabledCaption?: string
  compact?: boolean
  onSaved: (next: Target) => void
}) {
  const { show } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const today = israelToday()
  const status = effectiveAvailability(
    parseAvailabilityStatus(target.availability),
    target.available_from,
    today,
  )
  const caption =
    status === 'unavailable' ? availabilityReturnCaption(target.available_from) : null

  async function persist(write: {
    availability: AvailabilityStatus
    available_from: string | null
  }) {
    setSaving(true)
    const result = await saveAvailability(target.id, {
      status: write.availability,
      availableFrom: write.available_from,
    })
    setSaving(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show('הזמינות עודכנה.', 'done')
    setOpen(false)
    onSaved({
      id: target.id,
      availability: write.availability,
      available_from: write.available_from,
    })
  }

  return (
    <>
      <button
        type="button"
        className={compact ? 'availability-trigger availability-trigger--compact' : 'availability-trigger'}
        aria-label={triggerLabel(status, caption)}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <AvailabilityStatusMark status={status} caption={caption} />
      </button>
      {open ? (
        <AvailabilityDialog
          target={target}
          disabled={disabled}
          disabledCaption={disabledCaption}
          saving={saving}
          onSave={(write) => void persist(write)}
          onClose={() => !saving && setOpen(false)}
        />
      ) : null}
    </>
  )
}

export function AvailabilityPopoverTrigger({
  target,
  disabled = false,
  disabledCaption,
  onSaved,
}: {
  target: Target
  disabled?: boolean
  disabledCaption?: string
  onSaved: (next: Target) => void
}) {
  const { show } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; insetInlineEnd: number } | null>(null)
  const today = israelToday()
  const status = effectiveAvailability(
    parseAvailabilityStatus(target.availability),
    target.available_from,
    today,
  )
  const caption =
    status === 'unavailable' ? availabilityReturnCaption(target.available_from) : null

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null)
      return
    }

    function place() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const pad = 8
      const gap = 4
      const rtl = document.documentElement.dir === 'rtl'
      setCoords({
        top: Math.max(pad, rect.bottom + gap),
        insetInlineEnd: Math.max(pad, rtl ? rect.left : window.innerWidth - rect.right),
      })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const node = event.target as Node
      if (triggerRef.current?.contains(node) || panelRef.current?.contains(node)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function persist(write: {
    availability: AvailabilityStatus
    available_from: string | null
  }) {
    setSaving(true)
    const result = await saveAvailability(target.id, {
      status: write.availability,
      availableFrom: write.available_from,
    })
    setSaving(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show('הזמינות עודכנה.', 'done')
    setOpen(false)
    onSaved({
      id: target.id,
      availability: write.availability,
      available_from: write.available_from,
    })
  }

  return (
    <div className="menu-anchor">
      <button
        ref={triggerRef}
        type="button"
        className="availability-trigger availability-trigger--compact"
        aria-label={triggerLabel(status, caption)}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        <AvailabilityStatusMark status={status} caption={caption} />
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={panelRef}
              className="menu availability-popover"
              role="dialog"
              aria-label="זמינות"
              style={{ top: coords.top, insetInlineEnd: coords.insetInlineEnd }}
            >
              <AvailabilityEditor
                initialStatus={parseAvailabilityStatus(target.availability)}
                initialAvailableFrom={target.available_from}
                disabled={disabled}
                disabledCaption={disabledCaption}
                saving={saving}
                onSave={(write) => void persist(write)}
                onCancel={() => setOpen(false)}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function AvailabilityDialog({
  target,
  disabled,
  disabledCaption,
  saving,
  onSave,
  onClose,
}: {
  target: Target
  disabled: boolean
  disabledCaption?: string
  saving: boolean
  onSave: (write: { availability: AvailabilityStatus; available_from: string | null }) => void
  onClose: () => void
}) {
  return (
    <Dialog
      open
      title="זמינות"
      onClose={onClose}
      footer={
        <>
          <Button
            type="submit"
            form="availability-form"
            loading={saving}
            disabled={disabled || saving}
          >
            שמירה
          </Button>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            ביטול
          </Button>
        </>
      }
    >
      <AvailabilityEditor
        initialStatus={parseAvailabilityStatus(target.availability)}
        initialAvailableFrom={target.available_from}
        disabled={disabled}
        disabledCaption={disabledCaption}
        saving={saving}
        showActions={false}
        onSave={onSave}
      />
    </Dialog>
  )
}
