import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { orderEventTypesForNewEvent } from '../../lib/currentShift'
import { fetchEventLookups } from '../../lib/eventForm'
import { supabase } from '../../lib/supabase'

type EventTypeOption = { id: string; name: string }

type NewShiftEventSheetProps = {
  open: boolean
  shiftId: string
  onClose: () => void
  onCreated: (eventId: string) => void
}

export const NEW_SHIFT_EVENT_HINT =
  'לחיצה פותחת את האירוע ואת הדיווח. פתחת אירוע בטעות? ניתן למחוק אותו כל עוד לא הוזנו בו נתונים'

async function createShiftEvent(shiftId: string, eventTypeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_shift_event', {
    p_shift_id: shiftId,
    p_event_type_id: eventTypeId,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export function NewShiftEventSheet({ open, shiftId, onClose, onCreated }: NewShiftEventSheetProps) {
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>([])
  const [creating, setCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setErrorMessage(null)
    fetchEventLookups()
      .then((lookups) => {
        if (active) setEventTypes(lookups.eventTypes)
      })
      .catch((error: Error) => {
        if (active) setErrorMessage(error.message)
      })
    return () => {
      active = false
    }
  }, [open])

  async function pickEventType(eventTypeId: string) {
    if (creating) return
    setCreating(true)
    setErrorMessage(null)
    try {
      onCreated(await createShiftEvent(shiftId, eventTypeId))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'פתיחת האירוע נכשלה.')
    } finally {
      setCreating(false)
    }
  }

  const { primary, more } = orderEventTypesForNewEvent(eventTypes)

  return (
    <Dialog
      open={open}
      title="איזה אירוע?"
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          סגירה
        </Button>
      }
    >
      <div className="stack-4">
        <div className="new-event-tiles">
          {primary.map((type) => (
            <button
              key={type.id}
              type="button"
              className="new-event-tile"
              disabled={creating}
              onClick={() => void pickEventType(type.id)}
            >
              {type.name}
            </button>
          ))}
        </div>
        {more.length > 0 ? (
          <div className="stack-3">
            <h3 className="t-label text-secondary">סוגים נוספים</h3>
            <div className="new-event-more">
              {more.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className="new-event-more__button"
                  disabled={creating}
                  onClick={() => void pickEventType(type.id)}
                >
                  {type.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {errorMessage ? (
          <p className="t-body" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <p className="t-caption text-muted">{NEW_SHIFT_EVENT_HINT}</p>
      </div>
    </Dialog>
  )
}
