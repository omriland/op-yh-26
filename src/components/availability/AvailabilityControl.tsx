import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  availabilityLabel,
  availabilityReturnCaption,
  effectiveAvailability,
  isSameAvailabilityWrite,
  israelToday,
  parseAvailabilityStatus,
  shouldCloseAvailabilityEditor,
  type AvailabilityStatus,
} from '../../lib/availability'
import { saveAvailability } from '../../lib/availabilityApi'
import {
  AVAILABILITY_POPOVER_FALLBACK_HEIGHT,
  AVAILABILITY_POPOVER_FALLBACK_WIDTH,
  placeAvailabilityPopover,
} from '../../lib/availabilityPopoverPlacement'
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
    if (isSameAvailabilityWrite(target, write)) {
      if (shouldCloseAvailabilityEditor(write.availability)) setOpen(false)
      return
    }
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
    if (shouldCloseAvailabilityEditor(write.availability)) setOpen(false)
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
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(
    null,
  )
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
      const panel = panelRef.current
      const next = placeAvailabilityPopover({
        trigger: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        panel: {
          width: panel?.offsetWidth || AVAILABILITY_POPOVER_FALLBACK_WIDTH,
          height: panel?.scrollHeight || AVAILABILITY_POPOVER_FALLBACK_HEIGHT,
        },
        rtl: document.documentElement.dir === 'rtl',
      })
      setCoords((current) =>
        current &&
        current.top === next.top &&
        current.left === next.left &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      )
    }

    place()
    const panel = panelRef.current
    const observer = panel ? new ResizeObserver(place) : null
    if (panel) observer?.observe(panel)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const node = event.target as Node
      if (triggerRef.current?.contains(node) || panelRef.current?.contains(node)) return
      if (saving) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, saving])

  async function persist(write: {
    availability: AvailabilityStatus
    available_from: string | null
  }) {
    if (isSameAvailabilityWrite(target, write)) {
      if (shouldCloseAvailabilityEditor(write.availability)) setOpen(false)
      return
    }
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
    if (shouldCloseAvailabilityEditor(write.availability)) setOpen(false)
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
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="menu availability-popover"
              data-theme="command"
              role="dialog"
              aria-label="זמינות"
              style={
                coords
                  ? { top: coords.top, left: coords.left, maxHeight: coords.maxHeight }
                  : { visibility: 'hidden', top: 0, left: 0 }
              }
            >
              <AvailabilityEditor
                initialStatus={parseAvailabilityStatus(target.availability)}
                initialAvailableFrom={target.available_from}
                disabled={disabled}
                disabledCaption={disabledCaption}
                saving={saving}
                onSave={(write) => void persist(write)}
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
    <Dialog open title="זמינות" onClose={onClose}>
      <AvailabilityEditor
        initialStatus={parseAvailabilityStatus(target.availability)}
        initialAvailableFrom={target.available_from}
        disabled={disabled}
        disabledCaption={disabledCaption}
        saving={saving}
        onSave={onSave}
      />
    </Dialog>
  )
}
