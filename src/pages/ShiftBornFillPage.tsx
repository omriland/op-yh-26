import { useEffect, useState } from 'react'
import { ChevronRight, FileWarning } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { canEditShiftByDate } from '../lib/shifts'
import {
  fetchShiftBornFillContext,
  saveShiftBornEventFill,
  type ShiftBornFillContext,
  type ShiftBornFillDraft,
} from '../lib/shiftBornFill'
import { lastSavedByLabel, SHIFT_BORN_CHIP } from '../lib/shiftBornEvents'
import { formatDate } from '../lib/format'
import { Button } from '../components/ui/Button'
import { CounterStepper } from '../components/ui/CounterStepper'
import { EmptyState } from '../components/ui/EmptyState'
import { FormStickyFooter } from '../components/ui/FormStickyFooter'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { StampChip } from '../components/ui/StampChip'
import { TextAreaField } from '../components/ui/TextAreaField'
import { TextField } from '../components/ui/TextField'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { useDesktopFormSubmit } from '../lib/useDesktopFormSubmit'

type ShiftBornFillPageProps = {
  eventId: string
  onBack: () => void
  onCompleted?: () => void
}

export function ShiftBornFillPage({ eventId, onBack, onCompleted }: ShiftBornFillPageProps) {
  const { roles } = useAuth()
  const { show } = useToast()
  const canManage = roles.includes('admin') || roles.includes('shift_lead')
  const [ctx, setCtx] = useState<ShiftBornFillContext | null>(null)
  const [draft, setDraft] = useState<ShiftBornFillDraft | null>(null)
  const [expectedAt, setExpectedAt] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'denied'>('loading')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    let active = true
    setLoadState('loading')
    fetchShiftBornFillContext(eventId)
      .then((next) => {
        if (!active) return
        if (!next) {
          setLoadState('denied')
          return
        }
        setCtx(next)
        setDraft(next.draft)
        setExpectedAt(next.expected_updated_at)
        setLoadState('ready')
      })
      .catch(() => {
        if (active) setLoadState('denied')
      })
    return () => {
      active = false
    }
  }, [eventId])

  const shiftDate = ctx?.event.shift?.shift_date ?? ctx?.event.event_date
  const dateOk = shiftDate ? canEditShiftByDate(shiftDate) : false
  const eventDone = ctx?.event.status === 'done'
  const readOnly = eventDone ? !canManage : !(canManage || dateOk)

  function patchDraft(patch: Partial<ShiftBornFillDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  function treatedValue(kindId: string): number {
    return draft?.treated.find((row) => row.vehicle_kind_id === kindId)?.quantity ?? 0
  }

  function bumpTreated(kindId: string, delta: number) {
    if (!draft) return
    const prev = treatedValue(kindId)
    const quantity = Math.min(99, Math.max(0, prev + delta))
    const others = draft.treated.filter((row) => row.vehicle_kind_id !== kindId)
    patchDraft({
      treated: quantity > 0 ? [...others, { vehicle_kind_id: kindId, quantity }] : others,
    })
  }

  async function persist(complete: boolean) {
    if (!draft || !expectedAt) return
    const result = await saveShiftBornEventFill({
      eventId,
      expectedUpdatedAt: expectedAt,
      draft,
      complete,
    })
    if (!result.ok) {
      show(result.error, 'alert')
      if (result.error.includes('רעננו')) {
        const next = await fetchShiftBornFillContext(eventId)
        if (next) {
          setCtx(next)
          setDraft(next.draft)
          setExpectedAt(next.expected_updated_at)
        }
      }
      return false
    }
    setExpectedAt(result.updated_at)
    return true
  }

  async function onSave() {
    setSaving(true)
    const ok = await persist(false)
    setSaving(false)
    if (ok) show('האירוע נשמר', 'done')
  }

  async function onComplete() {
    setCompleting(true)
    const ok = await persist(true)
    setCompleting(false)
    if (ok) {
      show('האירוע הושלם', 'done')
      onCompleted?.()
    }
  }

  useDesktopFormSubmit(() => void onSave(), {
    enabled: loadState === 'ready' && Boolean(draft) && !readOnly && !saving && !completing,
  })

  if (loadState === 'denied') {
    return (
      <EmptyState
        icon={<FileWarning size={40} strokeWidth={1.75} />}
        title="אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים."
        action={
          <Button variant="secondary" onClick={onBack}>
            חזרה
          </Button>
        }
      />
    )
  }

  if (loadState === 'loading' || !ctx || !draft) {
    return <EventListSkeleton count={2} />
  }

  const savedLabel = lastSavedByLabel(ctx.event.last_saved?.full_name)

  return (
    <div className="responder-fill">
      <div className="event-form__panel" data-theme="field">
        <div className="event-form__head">
          <button type="button" className="event-form__back" onClick={onBack}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            חזרה
          </button>
          <div className="event-form__title-row">
            <div className="event-form__title-block">
              <h1 className="t-title">תיעוד אירוע ממשמרת</h1>
              {savedLabel ? <p className="t-caption text-muted">{savedLabel}</p> : null}
            </div>
            <StampChip label={SHIFT_BORN_CHIP} tone="draft" />
          </div>
        </div>

        <section className="card responder-fill__context">
          <Ledger>
            <LedgerRow label="תאריך" value={formatDate(ctx.event.event_date)} numeric />
            <LedgerRow label="סוג אירוע" value={ctx.event.event_type?.name ?? undefined} />
            <LedgerRow label="אחמ״ש" value={ctx.event.shift_lead?.full_name ?? undefined} />
          </Ledger>
        </section>

        <section className="form-section responder-fill__section">
          <h2 className="form-section__heading">פרטי הטיפול</h2>
          <div className="form-section__fields">
            <TextField
              label="מספר אירוע"
              numeric
              value={draft.police_event_id}
              disabled={readOnly}
              onChange={(event) => patchDraft({ police_event_id: event.target.value })}
            />
            <TextAreaField
              label="פירוט הטיפול"
              value={draft.treatment_detail}
              disabled={readOnly}
              style={{ minHeight: 120 }}
              onChange={(event) => patchDraft({ treatment_detail: event.target.value })}
            />
            <div className="assignment-card__treated">
              <p className="t-label text-secondary">רכבים שטופלו</p>
              <div className="assignment-card__steppers">
                {ctx.vehicleKinds.map((kind) => (
                  <CounterStepper
                    key={kind.id}
                    label={kind.name}
                    value={treatedValue(kind.id)}
                    disabled={readOnly}
                    onDelta={(delta) => bumpTreated(kind.id, delta)}
                  />
                ))}
              </div>
            </div>
            <TextAreaField
              label="הערות"
              value={draft.treatment_notes}
              disabled={readOnly}
              onChange={(event) => patchDraft({ treatment_notes: event.target.value })}
            />
          </div>
        </section>

        {readOnly ? null : (
          <FormStickyFooter>
            <div className="event-form__footer-actions">
              <Button loading={completing} loadingLabel="שומר…" onClick={() => void onComplete()}>
                סיום
              </Button>
              <Button
                variant="secondary"
                loading={saving}
                loadingLabel="שומר…"
                disabled={completing}
                onClick={() => void onSave()}
              >
                שמירת טיוטה
              </Button>
            </div>
          </FormStickyFooter>
        )}
      </div>
    </div>
  )
}
