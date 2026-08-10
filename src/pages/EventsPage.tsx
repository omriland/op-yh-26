import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, ListChecks, Plus, Search } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  fetchEvents,
  fetchMyEvents,
  ownParticipation,
  type EventListItem,
} from '../lib/events'
import {
  EVENT_FILTERS,
  mineFillCtaLabel,
  participationStamp,
  viewerStamp,
  type EventStatus,
} from '../lib/status'
import { formatDayHeading } from '../lib/format'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Button, IconButton } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { FilterChips } from '../components/ui/FilterChips'
import { EventCard } from '../components/events/EventCard'
import { EventsTable } from '../components/events/EventsTable'

type EventsPageProps = {
  scope: 'unit' | 'mine'
  /** Command desktop renders the managerial table; every other surface uses cards. */
  asTable: boolean
  canCreate?: boolean
  onOpen: (eventId: string) => void
  onCreate?: () => void
  onFill?: (eventId: string) => void
}

export function EventsPage({
  scope,
  asTable,
  canCreate = false,
  onOpen,
  onCreate,
  onFill,
}: EventsPageProps) {
  const isDesktop = useIsDesktop()
  const { user, profile } = useAuth()
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<EventStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setEvents(null)
    setFailed(false)

    const load = scope === 'mine' && user ? fetchMyEvents(user.id) : fetchEvents()
    load
      .then((rows) => {
        if (active) setEvents(rows)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [scope, user, reloadKey])

  const stampFor = useMemo(
    () => (event: EventListItem) => {
      const mine = ownParticipation(event, user?.id)
      if (scope === 'mine') return participationStamp(mine ?? 'pending', true)
      return viewerStamp(event.status, mine)
    },
    [scope, user?.id],
  )

  const visible = useMemo(() => {
    if (!events) return []
    const needle = query.trim().toLowerCase()

    const filtered = events.filter((event) => {
      const matchesStatus = filter === 'all' || event.status === filter
      const haystack = [event.police_event_id, event.road?.name, event.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return matchesStatus && (!needle || haystack.includes(needle))
    })

    if (scope !== 'mine') return filtered

    // Open assignments first — the responder's list is a to-do list.
    return [...filtered].sort((a, b) => {
      const aOpen = ownParticipation(a, user?.id) !== 'done' ? 0 : 1
      const bOpen = ownParticipation(b, user?.id) !== 'done' ? 0 : 1
      return aOpen - bOpen
    })
  }, [events, filter, query, scope, user?.id])

  const grouped = useMemo(() => groupByDate(visible), [visible])
  const openMineCount = useMemo(() => {
    if (scope !== 'mine' || !events) return 0
    return events.filter((event) => ownParticipation(event, user?.id) !== 'done').length
  }, [events, scope, user?.id])
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || profile?.full_name?.trim() || null

  return (
    <div>
      {scope === 'mine' ? (
        <section
          className={[
            'mine-insight',
            events !== null && openMineCount === 0 ? 'mine-insight--clear' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="סיכום הדיווחים שלי"
        >
          <div className="mine-insight__stat" aria-hidden="true">
            <span className="mine-insight__count mono">
              {events === null ? '—' : openMineCount}
            </span>
          </div>
          <div className="mine-insight__body">
            <p className="mine-insight__eyebrow t-label">
              <ListChecks size={16} strokeWidth={1.75} aria-hidden="true" />
              האירועים שלי
            </p>
            <h1 className="t-title mine-insight__hello">
              {firstName ? `שלום, ${firstName}` : 'שלום'}
            </h1>
            <p className="t-body mine-insight__summary">
              {openMineSummary(openMineCount, events !== null)}
            </p>
          </div>
        </section>
      ) : (
        <div className="page-head">
          <h1 className="t-title">אירועים</h1>
          <div className="page-head__actions">
            {asTable ? (
              <label className="field__control" style={{ width: 280 }}>
                <span className="visually-hidden">חיפוש אירועים</span>
                <input
                  className="field__input field__input--with-affix"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="חיפוש לפי מספר אירוע, כביש או מיקום"
                />
                <span className="field__affix" aria-hidden="true">
                  <Search size={20} strokeWidth={1.75} />
                </span>
              </label>
            ) : null}
            {canCreate && onCreate ? (
              isDesktop ? (
                <Button onClick={onCreate} icon={<Plus size={20} strokeWidth={1.75} />}>
                  אירוע חדש
                </Button>
              ) : (
                <IconButton label="אירוע חדש" onClick={onCreate}>
                  <Plus size={20} strokeWidth={1.75} />
                </IconButton>
              )
            ) : null}
          </div>
        </div>
      )}

      {scope === 'unit' ? (
        <FilterChips
          options={EVENT_FILTERS}
          value={filter}
          onChange={setFilter}
          label="סינון לפי סטטוס תיעוד"
        />
      ) : null}

      {failed ? (
        <EmptyState
          icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת האירועים נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : !events ? (
        asTable ? (
          <EventRowsSkeleton />
        ) : (
          <EventListSkeleton />
        )
      ) : visible.length === 0 ? (
        <ListEmptyState
          scope={scope}
          filtered={filter !== 'all' || query.trim() !== ''}
          canCreate={canCreate && Boolean(onCreate)}
          onCreate={onCreate}
          onClear={() => {
            setFilter('all')
            setQuery('')
          }}
        />
      ) : asTable ? (
        <EventsTable events={visible} stampFor={stampFor} onOpen={onOpen} />
      ) : (
        <div className="stack-4">
          {grouped.map(([day, items]) => (
            <section key={day}>
              <h2 className="group-head">{formatDayHeading(day)}</h2>
              <ul className="stack-3">
                {items.map((event) => {
                  const mineStatus =
                    scope === 'mine' ? ownParticipation(event, user?.id) : null
                  const fillLabel = mineStatus ? mineFillCtaLabel(mineStatus) : null
                  return (
                    <EventCard
                      key={event.id}
                      event={event}
                      stamp={stampFor(event)}
                      onOpen={onOpen}
                      onFill={fillLabel && onFill ? onFill : undefined}
                      fillLabel={fillLabel ?? undefined}
                    />
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function ListEmptyState({
  scope,
  filtered,
  canCreate,
  onCreate,
  onClear,
}: {
  scope: 'unit' | 'mine'
  filtered: boolean
  canCreate: boolean
  onCreate?: () => void
  onClear: () => void
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
        title="אין אירועים במצב זה"
        action={
          <Button variant="ghost" onClick={onClear}>
            ניקוי סינון
          </Button>
        }
      />
    )
  }

  if (scope === 'mine') {
    return (
      <EmptyState
        icon={<CheckCircle2 size={40} strokeWidth={1.75} aria-hidden="true" />}
        title="אין דיווחים שממתינים לך"
        caption="כשתשובצו לאירוע, הוא יופיע כאן."
      />
    )
  }

  return (
    <EmptyState
      icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
      title="אין אירועים להצגה"
      caption="אירוע חדש יופיע כאן ברגע שייווצר."
      action={
        canCreate && onCreate ? (
          <Button onClick={onCreate} icon={<Plus size={20} strokeWidth={1.75} />}>
            אירוע חדש
          </Button>
        ) : undefined
      }
    />
  )
}

function openMineSummary(count: number, ready: boolean): string {
  if (!ready) return 'טוען את הדיווחים שלך…'
  if (count === 0) return 'אין אירועים שממתינים לתיעוד.'
  if (count === 1) return 'יש לך אירוע אחד לתעד.'
  if (count === 2) return 'יש לך שני אירועים לתעד.'
  return `יש לך ${count} אירועים לתעד.`
}

function groupByDate(events: EventListItem[]): [string, EventListItem[]][] {
  const groups = new Map<string, EventListItem[]>()
  for (const event of events) {
    const bucket = groups.get(event.event_date) ?? []
    bucket.push(event)
    groups.set(event.event_date, bucket)
  }
  return [...groups.entries()]
}
