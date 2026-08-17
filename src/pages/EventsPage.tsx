import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, ListChecks, Plus, Search } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { textIncludesQuery } from '../lib/searchQuery'
import {
  UNIT_EVENTS_LIST_LIMIT,
  fetchEvents,
  fetchEventsByIds,
  fetchMyEvents,
  filterUnitEventsForList,
  groupMineEventCards,
  mergeEventLists,
  missingSearchEventIds,
  ownParticipation,
  searchUnitEventIds,
  unitEventsListHint,
  type EventListItem,
} from '../lib/events'
import {
  EVENT_FILTERS,
  mineFillCtaLabel,
  participationStamp,
  viewerStamp,
  type EventStatus,
  type StampDescriptor,
} from '../lib/status'
import { shiftBornFillStamp } from '../lib/shiftBornEvents'
import {
  INCOMPLETE_FUEL_REFUND_NOTICE,
  shouldShowIncompleteFuelNotice,
} from '../lib/fuelAllocationPolicy'
import { formatDayHeading } from '../lib/format'
import { MINE_LOGGED_WINDOW_DAYS, partitionMineList } from '../lib/mineListSections'
import { jerusalemToday } from '../lib/shifts'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Button, IconButton } from '../components/ui/Button'
import { DateGroup, DateGroups } from '../components/ui/DateGroups'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { FilterChips } from '../components/ui/FilterChips'
import { EventCard } from '../components/events/EventCard'
import { MineShiftEventGroup } from '../components/events/MineShiftEventGroup'
import { EventsTable } from '../components/events/EventsTable'
import { useToast } from '../components/ui/Toast'

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
  const { show } = useToast()
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<EventStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [searchIds, setSearchIds] = useState<ReadonlySet<string> | null>(null)
  const [searchExtras, setSearchExtras] = useState<EventListItem[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [searching, setSearching] = useState(false)
  const [loggedWindows, setLoggedWindows] = useState(1)

  useEffect(() => {
    let active = true
    setEvents(null)
    setFailed(false)

    const load =
      scope === 'mine' && user
        ? fetchMyEvents(user.id)
        : fetchEvents(asTable ? { limit: UNIT_EVENTS_LIST_LIMIT } : undefined)
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
  }, [asTable, scope, user, reloadKey])

  useEffect(() => {
    setLoggedWindows(1)
  }, [reloadKey, scope])

  useEffect(() => {
    if (scope !== 'unit') {
      setSearchIds(null)
      setSearchExtras([])
      setSearching(false)
      return
    }

    const trimmed = query.trim()
    if (!trimmed) {
      setSearchIds(null)
      setSearchExtras([])
      setSearching(false)
      return
    }

    if (!events) return

    setSearchIds(new Set())
    setSearchExtras([])
    setSearching(true)

    let cancelled = false
    const handle = window.setTimeout(() => {
      searchUnitEventIds(trimmed)
        .then(async (ids) => {
          const missing = missingSearchEventIds(
            events.map((event) => event.id),
            new Set(ids),
          )
          let extras: EventListItem[] = []
          if (missing.length > 0) {
            try {
              extras = await fetchEventsByIds(missing)
            } catch {
              if (!cancelled) {
                show('טעינת אירועים ישנים יותר נכשלה. מוצגות תוצאות מהרשימה הנוכחית.', 'alert')
              }
            }
          }
          if (!cancelled) {
            setSearchExtras(extras)
            setSearchIds(new Set(ids))
            setSearching(false)
          }
        })
        .catch(() => {
          if (cancelled) return
          setSearchIds(null)
          setSearchExtras([])
          setSearching(false)
          show('חיפוש האירועים נכשל. נסו שוב.', 'alert')
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [events, query, scope, show])

  const stampFor = useMemo(
    () => (event: EventListItem) => {
      if (event.origin === 'shift') {
        return shiftBornFillStamp({
          status: event.status,
          police_event_id: event.police_event_id,
          treatment_detail: event.treatment_detail,
          treatment_notes: event.treatment_notes,
          location: event.location,
          road_id: event.road?.name,
          treated_count: event.shared_treated?.length ?? 0,
        })
      }
      const mine = ownParticipation(event, user?.id)
      if (scope === 'mine') return participationStamp(mine ?? 'pending', true)
      return viewerStamp(event.status, mine)
    },
    [scope, user?.id],
  )

  const visible = useMemo(() => {
    if (!events) return []

    if (scope === 'unit') {
      const source = searchIds === null ? events : mergeEventLists(events, searchExtras)
      return filterUnitEventsForList(source, { status: filter, searchIds })
    }

    const needle = query.trim()
    const filtered = events.filter((event) => {
      const matchesStatus = filter === 'all' || event.status === filter
      const haystack = [event.police_event_id, event.road?.name, event.location]
        .filter(Boolean)
        .join(' ')
      return matchesStatus && (!needle || textIncludesQuery(haystack, needle))
    })

    // Open assignments first — the responder's list is a to-do list.
    return [...filtered].sort((a, b) => {
      const aOpen = ownParticipation(a, user?.id) !== 'done' ? 0 : 1
      const bOpen = ownParticipation(b, user?.id) !== 'done' ? 0 : 1
      return aOpen - bOpen
    })
  }, [events, filter, query, scope, user?.id, searchIds, searchExtras])

  const grouped = useMemo(() => groupByDate(visible), [visible])
  const mineSections = useMemo(() => {
    if (scope !== 'mine' || !events) return null
    return partitionMineList(events, {
      dateOf: (event) => event.event_date,
      bucket: (event) =>
        ownParticipation(event, user?.id) !== 'done' ? 'pending' : 'logged',
      today: jerusalemToday(),
      windowsLoaded: loggedWindows,
    })
  }, [events, loggedWindows, scope, user?.id])
  const openMineCount = useMemo(() => {
    if (scope !== 'mine' || !events) return 0
    return events.filter((event) => ownParticipation(event, user?.id) !== 'done').length
  }, [events, scope, user?.id])
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || profile?.full_name?.trim() || null

  return (
    <div className={asTable ? 'page--wide' : undefined}>
      {scope === 'mine' ? (
        isDesktop ? (
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
              {shouldShowIncompleteFuelNotice(openMineCount) ? (
                <p className="t-body mine-insight__notice" role="note">
                  {INCOMPLETE_FUEL_REFUND_NOTICE}
                </p>
              ) : null}
            </div>
          </section>
        ) : (
          <div className="page-head">
            <div className="page-head__intro">
              <h1 className="t-title">האירועים שלי</h1>
            </div>
          </div>
        )
      ) : (
        <div className="page-head">
          <div className="page-head__intro">
            <h1 className="t-title">אירועים</h1>
            {asTable ? (
              <p className="t-caption text-muted">{unitEventsListHint(UNIT_EVENTS_LIST_LIMIT)}</p>
            ) : null}
          </div>
          <div className="page-head__actions">
            {asTable ? (
              <label className="field__control" style={{ width: 280 }}>
                <span className="visually-hidden">חיפוש אירועים</span>
                <input
                  className="field__input field__input--with-affix"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="חיפוש לפי מספר אירוע, כביש, מיקום, שם או או״ק"
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
      ) : searching ? (
        <SearchLoadingState />
      ) : scope === 'mine' && mineSections ? (
        <DateGroups>
          <DateGroup heading="אירועים הממתינים לתיעוד">
            <div className="stack-4">
              {mineSections.pending.length === 0 ? (
                <p className="t-body text-secondary mine-section-empty">
                  מברוק! אין לך עוד אירועים לתעד כרגע
                </p>
              ) : (
                <EventCards
                  events={mineSections.pending}
                  stampFor={stampFor}
                  onOpen={onOpen}
                  onFill={onFill}
                  userId={user?.id}
                  collapsibleShiftGroups
                />
              )}
            </div>
          </DateGroup>
          <DateGroup heading="אירועים שתועדו" logged>
            <div className="stack-4">
              {mineSections.logged.length === 0 ? (
                <p className="t-body text-secondary mine-section-empty">
                  אין אירועים שתועדו בתקופה זו
                </p>
              ) : (
                <EventCards
                  events={mineSections.logged}
                  stampFor={stampFor}
                  onOpen={onOpen}
                  onFill={onFill}
                  userId={user?.id}
                  collapsibleShiftGroups
                />
              )}
              {mineSections.hasMoreLogged ? (
                <Button
                  variant="secondary"
                  block
                  onClick={() => setLoggedWindows((windows) => windows + 1)}
                >
                  {`הצג ${MINE_LOGGED_WINDOW_DAYS} יום נוספים`}
                </Button>
              ) : null}
            </div>
          </DateGroup>
        </DateGroups>
      ) : visible.length === 0 ? (
        <ListEmptyState
          filtered={filter !== 'all' || query.trim() !== ''}
          canCreate={canCreate && Boolean(onCreate)}
          onCreate={onCreate}
          onClear={() => {
            setFilter('all')
            setQuery('')
          }}
        />
      ) : asTable ? (
        <EventsTable events={visible} onOpen={onOpen} />
      ) : (
        <DateGroups>
          {grouped.map(([day, items]) => (
            <DateGroup key={day} heading={formatDayHeading(day)}>
              <EventCards events={items} stampFor={stampFor} onOpen={onOpen} />
            </DateGroup>
          ))}
        </DateGroups>
      )}
    </div>
  )
}

function SearchLoadingState() {
  return (
    <div aria-busy="true" aria-live="polite">
      <EmptyState
        icon={<Search size={40} strokeWidth={1.75} aria-hidden="true" />}
        title="טוען אירועים…"
      />
    </div>
  )
}

function ListEmptyState({
  filtered,
  canCreate,
  onCreate,
  onClear,
}: {
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

function EventCards({
  events,
  stampFor,
  onOpen,
  onFill,
  userId,
  collapsibleShiftGroups = false,
}: {
  events: EventListItem[]
  stampFor: (event: EventListItem) => StampDescriptor
  onOpen: (eventId: string) => void
  onFill?: (eventId: string) => void
  userId?: string
  collapsibleShiftGroups?: boolean
}) {
  const blocks = groupMineEventCards(events)
  return (
    <ul className="stack-3">
      {blocks.map((block) => {
        if (block.kind === 'shift') {
          const groupedCards = block.events.map((event) => {
            const mineStatus = userId ? ownParticipation(event, userId) : null
            const fillLabel = mineStatus ? mineFillCtaLabel(mineStatus) : null
            return (
              <EventCard
                key={event.id}
                event={event}
                stamp={stampFor(event)}
                onOpen={onOpen}
                onFill={fillLabel && onFill ? onOpen : undefined}
                fillLabel={fillLabel ?? undefined}
              />
            )
          })
          if (collapsibleShiftGroups) {
            return (
              <MineShiftEventGroup
                key={block.key}
                title={block.title}
                eventCount={block.events.length}
              >
                {groupedCards}
              </MineShiftEventGroup>
            )
          }
          return (
            <li key={block.key} className="card stack-3">
              <p className="t-label text-secondary">{block.title}</p>
              <ul className="stack-3">{groupedCards}</ul>
            </li>
          )
        }
        const event = block.event
        const mineStatus = userId ? ownParticipation(event, userId) : null
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
  )
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
