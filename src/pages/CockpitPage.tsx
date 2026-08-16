import { useEffect, useState } from 'react'
import { Plus, Radar, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  cockpitDeleteBlock,
  cockpitDeleteHint,
  cockpitReelCaption,
  cockpitReelLead,
  cockpitReelPlace,
  cockpitReelTitle,
  cockpitReelType,
  fetchCockpitReel,
  insertCockpitDraft,
  type CockpitDeleteHintKind,
  type CockpitReelItem,
} from '../lib/cockpit'
import { deleteEvent } from '../lib/events'
import { monoClass } from '../lib/format'
import { cancelledStamp, eventStamp } from '../lib/status'
import { Button, IconButton } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { StampChip } from '../components/ui/StampChip'
import { useToast } from '../components/ui/Toast'
import { EventFormPage } from './EventFormPage'

type CockpitPageProps = {
  selectedEventId?: string
  onSelectEvent: (eventId: string | undefined) => void
}

export function CockpitPage({ selectedEventId, onSelectEvent }: CockpitPageProps) {
  const { user } = useAuth()
  const { show } = useToast()
  const [reel, setReel] = useState<CockpitReelItem[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [creating, setCreating] = useState(false)
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)
  const [deleteHint, setDeleteHint] = useState<{
    id: string
    kind: CockpitDeleteHintKind
  } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function clearDeletePrompt() {
    setArmedDeleteId(null)
    setDeleteHint(null)
  }

  async function reloadReel() {
    const rows = await fetchCockpitReel()
    setReel(rows)
    return rows
  }

  useEffect(() => {
    if (!deleteHint || deleteHint.kind === 'confirm') return
    const row = reel.find((event) => event.id === deleteHint.id)
    if (!row || cockpitDeleteBlock(row) !== deleteHint.kind) {
      setDeleteHint(null)
    }
  }, [reel, deleteHint])

  useEffect(() => {
    let active = true
    fetchCockpitReel()
      .then((rows) => {
        if (!active) return
        setReel(rows)
        setLoadState('ready')
        if (!selectedEventId && rows[0]) onSelectEvent(rows[0].id)
      })
      .catch(() => {
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
    // First paint only — selection after that is inbox-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createNew() {
    if (!user) return
    setCreating(true)
    const result = await insertCockpitDraft(user.id)
    setCreating(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    onSelectEvent(result.eventId)
    void reloadReel().catch(() => {})
  }

  async function confirmDelete(event: CockpitReelItem) {
    const block = cockpitDeleteBlock(event)
    if (block) {
      setArmedDeleteId(null)
      setDeleteHint({ id: event.id, kind: block })
      return
    }
    if (armedDeleteId !== event.id) {
      setArmedDeleteId(event.id)
      setDeleteHint({ id: event.id, kind: 'confirm' })
      return
    }
    setDeletingId(event.id)
    const result = await deleteEvent(event.id)
    setDeletingId(null)
    clearDeletePrompt()
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show('האירוע נמחק', 'done')
    const remaining = reel.filter((row) => row.id !== event.id)
    setReel(remaining)
    if (selectedEventId === event.id) {
      onSelectEvent(remaining[0]?.id)
    }
  }

  return (
    <div className="cockpit">
      <aside className="cockpit__reel" aria-label="גלגלת">
        <div className="cockpit__reel-head">
          <h1 className="t-section">גלגלת</h1>
          <Button
            block
            icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
            loading={creating}
            loadingLabel="יוצר…"
            onClick={() => void createNew()}
          >
            אירוע חדש
          </Button>
        </div>
        {loadState === 'loading' ? (
          <div className="cockpit__reel-body">
            <EventListSkeleton count={3} />
          </div>
        ) : loadState === 'error' ? (
          <div className="cockpit__reel-body">
            <EmptyState
              icon={<Radar size={40} strokeWidth={1.75} aria-hidden="true" />}
              title="לא ניתן לטעון את הגלגלת"
              caption="בדקו את החיבור ונסו שוב."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLoadState('loading')
                    void reloadReel()
                      .then(() => setLoadState('ready'))
                      .catch(() => setLoadState('error'))
                  }}
                >
                  נסיון נוסף
                </Button>
              }
            />
          </div>
        ) : reel.length === 0 ? (
          <div className="cockpit__reel-body">
            <p className="t-caption text-muted cockpit__reel-empty">
              אין אירועים מהשעתיים האחרונות.
            </p>
          </div>
        ) : (
          <ul className="cockpit__list">
            {reel.map((event) => {
              const current = event.id === selectedEventId
              const stamp = event.is_cancelled ? cancelledStamp() : eventStamp(event.status)
              const typeName = cockpitReelType(event)
              const place = cockpitReelPlace(event)
              const lead = cockpitReelLead(event)
              const armed = armedDeleteId === event.id
              const hint =
                deleteHint?.id === event.id ? cockpitDeleteHint(deleteHint.kind) : null
              return (
                <li
                  key={event.id}
                  className={['cockpit__row', current ? 'is-current' : ''].join(' ')}
                >
                  <button
                    type="button"
                    className="cockpit__item"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => {
                      clearDeletePrompt()
                      onSelectEvent(event.id)
                    }}
                  >
                    <span className="cockpit__item-top">
                      <span
                        className={[
                          'cockpit__item-title',
                          event.police_event_id?.trim() ? 'mono t-body-strong' : 't-body-strong',
                        ].join(' ')}
                      >
                        {cockpitReelTitle(event)}
                      </span>
                    </span>
                    <span className="cockpit__item-stamp">
                      <StampChip {...stamp} />
                      {lead ? (
                        <span className="t-caption text-secondary">
                          {lead.full_name}
                          {lead.callsign ? (
                            <>
                              {' · '}
                              <span className={monoClass(lead.callsign)}>{lead.callsign}</span>
                            </>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                    {typeName ? <span className="t-body">{typeName}</span> : null}
                    {place ? <span className="t-body text-secondary">{place}</span> : null}
                    <span className="t-caption text-muted">{cockpitReelCaption(event)}</span>
                    {hint ? (
                      <span className="t-caption cockpit__delete-hint">{hint}</span>
                    ) : null}
                  </button>
                  <IconButton
                    className="cockpit__delete"
                    variant={armed ? 'destructive' : 'ghost'}
                    label={armed ? 'אישור מחיקה' : 'מחיקת אירוע'}
                    disabled={deletingId === event.id}
                    onClick={() => void confirmDelete(event)}
                  >
                    <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
      <section className="cockpit__stage" aria-label="טופס אירוע">
        {selectedEventId ? (
          <EventFormPage
            key={selectedEventId}
            variant="cockpit"
            eventId={selectedEventId}
            onCancel={() => undefined}
            onSaved={() => undefined}
            onSavedAndCreateNew={() => undefined}
            onPersisted={() => {
              void reloadReel().catch(() => {})
            }}
          />
        ) : loadState === 'ready' && reel.length === 0 ? (
          <EmptyState
            icon={
              <picture>
                <source
                  srcSet="/cockpit-quiet-koala.webp"
                  type="image/webp"
                  media="(prefers-reduced-motion: no-preference)"
                />
                <img
                  className="empty__media"
                  src="/cockpit-quiet-koala.png"
                  alt=""
                  width={320}
                  height={320}
                />
              </picture>
            }
            title="אני רואה שהמשמרת שקטה ;)"
            action={
              <Button
                className="btn--compact-icon"
                icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
                loading={creating}
                loadingLabel="יוצר…"
                onClick={() => void createNew()}
              >
                אירוע חדש
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Radar size={40} strokeWidth={1.75} aria-hidden="true" />}
            title="אין אירוע נבחר"
            caption="לחצו על אירוע חדש או בחרו שורה בגלגלת."
            action={
              <Button
                icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
                loading={creating}
                loadingLabel="יוצר…"
                onClick={() => void createNew()}
              >
                אירוע חדש
              </Button>
            }
          />
        )}
      </section>
    </div>
  )
}
