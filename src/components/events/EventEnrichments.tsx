import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Star } from 'lucide-react'
import {
  ENRICHMENT_ADDED,
  ENRICHMENT_ADD_ERROR,
  ENRICHMENT_GOLD_ERROR,
  ENRICHMENT_INPUT_LABEL,
  ENRICHMENT_SAVING_LABEL,
  ENRICHMENT_SUBMIT_LABEL,
  ENRICHMENTS_EMPTY,
  ENRICHMENTS_LABEL,
  ENRICHMENTS_LOADING,
  ENRICHMENTS_LOAD_ERROR,
  ENRICHMENTS_RETRY_LABEL,
  addEventEnrichment,
  canSubmitEnrichment,
  enrichmentAuthorLabel,
  enrichmentsHeading,
  formatEnrichmentTimestamp,
  goldToggleLabel,
  listEventEnrichments,
  setEnrichmentGold,
  setEventEnrichmentGold,
  validateEnrichmentBody,
  type EventEnrichment,
} from '../../lib/eventEnrichments'
import { Button, IconButton } from '../ui/Button'
import { FieldLabel } from '../ui/FieldLabel'
import { useToast } from '../ui/Toast'

type LoadState = 'loading' | 'error' | 'ready'

/** העשרות: plain-text comments on an event, any time, with an optional gold star. */
export function EventEnrichments({ eventId }: { eventId: string }) {
  const { show } = useToast()
  const [items, setItems] = useState<EventEnrichment[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyGoldIds, setBusyGoldIds] = useState<ReadonlySet<string>>(new Set())
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    void listEventEnrichments(eventId).then((rows) => {
      if (cancelled) return
      if (rows) setItems(rows)
      setLoadState(rows ? 'ready' : 'error')
    })
    return () => {
      cancelled = true
    }
  }, [eventId, reloadKey])

  const reload = useCallback(() => {
    setLoadState('loading')
    setReloadKey((key) => key + 1)
  }, [])

  function growInput(element: HTMLTextAreaElement) {
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const checked = validateEnrichmentBody(draft)
    if (!checked.ok || saving) return
    setSaving(true)
    const saved = await addEventEnrichment(eventId, checked.body)
    setSaving(false)
    if (!saved) {
      show(ENRICHMENT_ADD_ERROR, 'alert')
      return
    }
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    show(ENRICHMENT_ADDED, 'done')
    reload()
  }

  function markGoldBusy(id: string, busy: boolean) {
    setBusyGoldIds((current) => {
      const next = new Set(current)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function toggleGold(item: EventEnrichment) {
    if (busyGoldIds.has(item.id)) return
    const next = !item.is_gold
    markGoldBusy(item.id, true)
    setItems((current) => setEnrichmentGold(current, item.id, next))
    const saved = await setEventEnrichmentGold(item.id, next)
    markGoldBusy(item.id, false)
    if (!saved) {
      setItems((current) => setEnrichmentGold(current, item.id, item.is_gold))
      show(ENRICHMENT_GOLD_ERROR, 'alert')
      return
    }
    reload()
  }

  const countIsKnown = loadState === 'ready' || items.length > 0

  return (
    <section className="stack-4 enrichments" aria-labelledby="enrichments-heading">
      <h2 id="enrichments-heading" className="t-section">
        {countIsKnown ? enrichmentsHeading(items.length) : ENRICHMENTS_LABEL}
      </h2>

      {loadState === 'loading' && items.length === 0 ? (
        <p className="card t-body text-secondary" role="status">
          {ENRICHMENTS_LOADING}
        </p>
      ) : null}

      {loadState === 'error' ? (
        <div className="card stack-3" role="alert">
          <p className="t-body">{ENRICHMENTS_LOAD_ERROR}</p>
          <Button variant="secondary" onClick={reload}>
            {ENRICHMENTS_RETRY_LABEL}
          </Button>
        </div>
      ) : null}

      {loadState === 'ready' && items.length === 0 ? (
        <p className="enrichments__empty t-body text-secondary">{ENRICHMENTS_EMPTY}</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="enrichments__list">
          {items.map((item) => (
            <li key={item.id} className="enrichment" data-gold={item.is_gold ? 'true' : undefined}>
              <div className="enrichment__head">
                <p className="enrichment__meta">
                  <span className="enrichment__author t-body-strong">
                    {enrichmentAuthorLabel(item)}
                  </span>
                  <span className="enrichment__time t-caption mono">
                    {formatEnrichmentTimestamp(item.created_at)}
                  </span>
                </p>
                <IconButton
                  label={goldToggleLabel(item.is_gold)}
                  aria-pressed={item.is_gold}
                  disabled={busyGoldIds.has(item.id)}
                  className="enrichment__star"
                  onClick={() => void toggleGold(item)}
                >
                  <Star
                    size={20}
                    aria-hidden="true"
                    fill={item.is_gold ? 'currentColor' : 'none'}
                  />
                </IconButton>
              </div>
              <p className="enrichment__body t-body" dir="auto">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="enrichments__form stack-3" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <FieldLabel htmlFor="enrichment-input">{ENRICHMENT_INPUT_LABEL}</FieldLabel>
          <div className="field__control">
            <textarea
              id="enrichment-input"
              ref={inputRef}
              className="field__input enrichments__input"
              dir="rtl"
              rows={3}
              placeholder="מה כדאי שהבאים אחריכם ידעו על האירוע?"
              value={draft}
              readOnly={saving}
              onChange={(event) => {
                setDraft(event.target.value)
                growInput(event.target)
              }}
            />
          </div>
        </div>
        <Button
          type="submit"
          disabled={!canSubmitEnrichment(draft, saving)}
          loading={saving}
          loadingLabel={ENRICHMENT_SAVING_LABEL}
        >
          {ENRICHMENT_SUBMIT_LABEL}
        </Button>
      </form>
    </section>
  )
}
