import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { EventLocationsList } from '../components/events/EventLocationsList'
import { useIsDesktop } from '../lib/useMediaQuery'
import {
  applyEventLocationPlace,
  EVENT_LOCATIONS_LOAD_MORE_LABEL,
  fetchEventLocationsPage,
  updateEventLocationPlace,
  type EventLocationRow,
  type EventLocationsFilter,
} from '../lib/eventLocationsQueue'
import type { LocationPlaceFields } from '../lib/systemDistricts'

const FILTERS: { id: EventLocationsFilter; label: string }[] = [
  { id: 'all', label: 'הכול' },
  { id: 'missing', label: 'חסר מיקום' },
]

type EventLocationsPageProps = {
  onOpenEvent: (eventId: string) => void
}

export function EventLocationsPage({ onOpenEvent }: EventLocationsPageProps) {
  const isDesktop = useIsDesktop()
  const { show } = useToast()
  const [filter, setFilter] = useState<EventLocationsFilter>('all')
  const [rows, setRows] = useState<EventLocationRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, LocationPlaceFields>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setRows(null)
    setFailed(false)
    setDrafts({})
    setHasMore(false)
    setNextOffset(0)

    fetchEventLocationsPage({ offset: 0, filter })
      .then((page) => {
        if (!active) return
        setRows(page.rows)
        setHasMore(page.hasMore)
        setNextOffset(page.nextOffset)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [filter, reloadKey])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const page = await fetchEventLocationsPage({ offset: nextOffset, filter })
      setRows((current) => [...(current ?? []), ...page.rows])
      setHasMore(page.hasMore)
      setNextOffset(page.nextOffset)
    } catch {
      show('טעינת האירועים נכשלה. בדקו את החיבור ונסו שוב.', 'alert')
    } finally {
      setLoadingMore(false)
    }
  }

  async function commitPlace(row: EventLocationRow, place: LocationPlaceFields) {
    if (savingId === row.id) return
    const previous = row
    setSavingId(row.id)
    setRows((current) =>
      (current ?? []).map((item) => (item.id === row.id ? applyEventLocationPlace(item, place) : item)),
    )
    setDrafts((current) => {
      const next = { ...current }
      delete next[row.id]
      return next
    })

    const result = await updateEventLocationPlace(row.id, place)
    setSavingId(null)
    if (!result.ok) {
      setRows((current) =>
        (current ?? []).map((item) => (item.id === row.id ? previous : item)),
      )
      show(result.error, 'alert')
      return
    }

    show('המיקום עודכן.', 'done')
  }

  const emptyTitle =
    filter === 'missing' ? 'אין אירועים חסרי מיקום.' : 'אין אירועים להצגה.'

  return (
    <div className={isDesktop ? 'page--wide stack-4' : 'stack-4'}>
      <div className="page-head">
        <div>
          <h1 className="t-title">השלמת מיקומים במפה</h1>
          <p className="t-caption text-muted">
            אירועים בלי נקודה ב-Google Maps מודגשים. אפשר לחבר או לערוך כתובת בשורה.
          </p>
        </div>
      </div>

      <div className="chips" role="tablist" aria-label="סינון מיקומים">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="chip"
            aria-selected={filter === item.id}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {rows === null && !failed ? (
        isDesktop ? <EventRowsSkeleton /> : <EventListSkeleton />
      ) : null}

      {failed ? (
        <EmptyState
          icon={<MapPin size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת האירועים נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : null}

      {rows && rows.length === 0 && !failed ? (
        <EmptyState
          icon={<MapPin size={40} strokeWidth={1.75} aria-hidden="true" />}
          title={emptyTitle}
        />
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="stack-4">
          <EventLocationsList
            rows={rows}
            asTable={isDesktop}
            drafts={drafts}
            onDraftChange={(eventId, next) =>
              setDrafts((current) => ({ ...current, [eventId]: next }))
            }
            onPlaceCommit={(item, place) => void commitPlace(item, place)}
            onOpen={onOpenEvent}
          />
          {hasMore ? (
            <Button
              variant="secondary"
              block
              loading={loadingMore}
              loadingLabel="טוען…"
              onClick={() => void loadMore()}
            >
              {EVENT_LOCATIONS_LOAD_MORE_LABEL}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
