import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { textIncludesQuery } from '../lib/searchQuery'
import {
  UNIT_EVENTS_LIST_LIMIT,
  UNIT_EVENTS_LOAD_MORE_LABEL,
  UNIT_EVENTS_RECENT_EMPTY_TITLE,
  UNIT_EVENTS_WINDOW_DAYS,
  fetchEvents,
  fetchEventsByIds,
  fetchMyEvents,
  filterUnitEventsForList,
  groupMineEventCards,
  mergeEventLists,
  missingSearchEventIds,
  ownFillCompletableAt,
  ownParticipation,
  partitionUnitEventsByWindow,
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
import {
  MINE_LOGGED_EMPTY_TITLE,
  MINE_PENDING_EMPTY_CAPTION,
  MINE_PENDING_EMPTY_TITLE,
  MINE_PENDING_EMPTY_VIEW_LOGGED,
  MINE_PENDING_TAB_LABEL,
  mineEventMatchesQuery,
  mineLoggedNoResultsTitle,
  shiftGroupPendingCaption,
  shiftGroupShouldStartOpen,
  type MineInboxTab,
} from '../lib/mineInbox'
import { isMineFillOverdue } from '../lib/overdueFill'
import { jerusalemToday } from '../lib/shifts'
import { Button } from '../components/ui/Button'
import { DateGroup, DateGroups } from '../components/ui/DateGroups'
import { EmptyState } from '../components/ui/EmptyState'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { FilterChips } from '../components/ui/FilterChips'
import { EventCard } from '../components/events/EventCard'
import { MineInboxTabs } from '../components/events/MineInboxTabs'
import { MineLoggedEventRow } from '../components/events/MineLoggedEventRow'
import { MineShiftEventGroup } from '../components/events/MineShiftEventGroup'
import { EventsTable } from '../components/events/EventsTable'
import { Toggle } from '../components/ui/Toggle'
import { useToast } from '../components/ui/Toast'
import {
  SHOW_OTHERS_CREATED_EVENTS_LABEL,
  readShowOthersCreatedEvents,
  shouldFilterUnitEventsToOwnCreated,
  unitEventsCreatedByFilter,
  writeShowOthersCreatedEvents,
} from '../lib/unitEventsScope'

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
  const { user, roles } = useAuth()
  const { show } = useToast()
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<EventStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [showOthersCreated, setShowOthersCreated] = useState(readShowOthersCreatedEvents)
  const showOthersControl = shouldFilterUnitEventsToOwnCreated(roles)
  const createdById = unitEventsCreatedByFilter({
    roles,
    showOthersCreated,
    userId: user?.id,
  })
  const [searchIds, setSearchIds] = useState<ReadonlySet<string> | null>(null)
  const [searchExtras, setSearchExtras] = useState<EventListItem[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [searching, setSearching] = useState(false)
  const [loggedWindows, setLoggedWindows] = useState(1)
  const [unitWindows, setUnitWindows] = useState(1)
  const [mineTab, setMineTab] = useState<MineInboxTab>('pending')
  const [loggedQuery, setLoggedQuery] = useState('')

  useEffect(() => {
    let active = true
    setEvents(null)
    setFailed(false)

    const load =
      scope === 'mine' && user
        ? fetchMyEvents(user.id)
        : // The card list is the phone's path. It gets the same 200-row cap as
          // the desktop table — an uncapped select pulls every event with its
          // nested responders over the worst connection in the product, and
          // search already queries the full database for older records.
          fetchEvents({ limit: UNIT_EVENTS_LIST_LIMIT, shiftLeadId: createdById })
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
  }, [createdById, scope, user, reloadKey])

  useEffect(() => {
    setLoggedWindows(1)
    setUnitWindows(1)
    setMineTab('pending')
    setLoggedQuery('')
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
      searchUnitEventIds(trimmed, { shiftLeadId: createdById })
        .then(async (ids) => {
          const missing = missingSearchEventIds(
            events.map((event) => event.id),
            new Set(ids),
          )
          let extras: EventListItem[] = []
          if (missing.length > 0) {
            try {
              extras = await fetchEventsByIds(missing, { shiftLeadId: createdById })
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
  }, [createdById, events, query, scope, show])

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

  const unitWindow = useMemo(() => {
    if (scope !== 'unit' || !events) return null
    const source = searchIds === null ? events : mergeEventLists(events, searchExtras)
    if (searchIds !== null) {
      return { inWindow: source, hasMore: false }
    }
    const partitioned = partitionUnitEventsByWindow(source, {
      dateOf: (event) => event.event_date,
      today: jerusalemToday(),
      windowsLoaded: unitWindows,
    })
    return { inWindow: partitioned.visible, hasMore: partitioned.hasMore }
  }, [events, scope, searchExtras, searchIds, unitWindows])

  const visible = useMemo(() => {
    if (!events) return []

    if (scope === 'unit') {
      if (!unitWindow) return []
      return filterUnitEventsForList(unitWindow.inWindow, { status: filter, searchIds })
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
  }, [events, filter, query, scope, user?.id, searchIds, unitWindow])

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
  const loggedVisible = useMemo(() => {
    if (!mineSections) return []
    return mineSections.logged.filter((event) => mineEventMatchesQuery(event, loggedQuery))
  }, [loggedQuery, mineSections])
  const openMineCount = useMemo(() => {
    if (scope !== 'mine' || !events) return 0
    return events.filter((event) => ownParticipation(event, user?.id) !== 'done').length
  }, [events, scope, user?.id])

  return (
    <div className={asTable ? 'page--wide' : undefined}>
      {scope === 'mine' ? (
        // One document header on every width. The record surface gets a title and
        // a ledger line, not a greeting and a counter tile — 01-identity.md.
        <header className="mine-head">
          <h1 className="t-title">האירועים שלי</h1>
          <Ledger>
            <LedgerRow
              label={MINE_PENDING_TAB_LABEL}
              value={
                events === null ? null : (
                  <span className="t-num-lg">{openMineCount}</span>
                )
              }
            />
          </Ledger>
          {shouldShowIncompleteFuelNotice(openMineCount) ? (
            <p className="t-caption text-muted mine-head__notice" role="note">
              {INCOMPLETE_FUEL_REFUND_NOTICE}
            </p>
          ) : null}
        </header>
      ) : (
        <div className="page-head">
          <div className="page-head__intro">
            <h1 className="t-title">אירועים</h1>
            <p className="t-caption text-muted">{unitEventsListHint(UNIT_EVENTS_WINDOW_DAYS)}</p>
          </div>
          {canCreate && onCreate ? (
            <div className="page-head__actions">
              <Button
                className="events-page__create"
                onClick={onCreate}
                icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
              >
                אירוע חדש
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {scope === 'unit' ? (
        <>
          <label className="field__control events-search">
            <span className="visually-hidden">חיפוש אירועים</span>
            <input
              className="field__input field__input--with-affix"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="אירוע, כביש, מיקום או שם"
            />
            <span className="field__affix" aria-hidden="true">
              <Search size={20} strokeWidth={1.75} />
            </span>
          </label>
          {showOthersControl ? (
            <div className="events-others-toggle">
              <Toggle
                label={SHOW_OTHERS_CREATED_EVENTS_LABEL}
                checked={showOthersCreated}
                onChange={(next) => {
                  setShowOthersCreated(next)
                  writeShowOthersCreatedEvents(next)
                }}
              />
            </div>
          ) : null}
          <FilterChips
            options={EVENT_FILTERS}
            value={filter}
            onChange={setFilter}
            label="סינון לפי סטטוס תיעוד"
          />
        </>
      ) : (
        <MineInboxTabs
          tab={mineTab}
          pendingCount={openMineCount}
          onChange={(next) => {
            setMineTab(next)
            if (next !== 'logged') setLoggedQuery('')
          }}
        />
      )}

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
        mineTab === 'pending' ? (
          mineSections.pending.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
              title={MINE_PENDING_EMPTY_TITLE}
              caption={MINE_PENDING_EMPTY_CAPTION}
              action={
                mineSections.logged.length > 0 || mineSections.hasMoreLogged ? (
                  <Button variant="ghost" onClick={() => setMineTab('logged')}>
                    {MINE_PENDING_EMPTY_VIEW_LOGGED}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EventCards
              events={mineSections.pending}
              stampFor={stampFor}
              onOpen={onOpen}
              onFill={onFill}
              userId={user?.id}
              mode="inbox"
              collapsibleShiftGroups
            />
          )
        ) : (
          <MineLoggedList
            events={loggedVisible}
            query={loggedQuery}
            onQueryChange={setLoggedQuery}
            stampFor={stampFor}
            onOpen={onOpen}
            hasMore={mineSections.hasMoreLogged}
            onLoadMore={() => setLoggedWindows((windows) => windows + 1)}
          />
        )
      ) : visible.length === 0 ? (
        <ListEmptyState
          filtered={filter !== 'all' || query.trim() !== ''}
          recentWindowEmpty={
            scope === 'unit' &&
            unitWindow != null &&
            unitWindow.inWindow.length === 0 &&
            unitWindow.hasMore
          }
          canCreate={canCreate && Boolean(onCreate)}
          onCreate={onCreate}
          onClear={() => {
            setFilter('all')
            setQuery('')
          }}
          onLoadMore={() => setUnitWindows((windows) => windows + 1)}
        />
      ) : asTable ? (
        <div className="stack-4">
          <EventsTable events={visible} onOpen={onOpen} />
          {scope === 'unit' && unitWindow?.hasMore ? (
            <Button variant="secondary" block onClick={() => setUnitWindows((windows) => windows + 1)}>
              {UNIT_EVENTS_LOAD_MORE_LABEL}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="stack-4">
          <DateGroups>
            {grouped.map(([day, items]) => (
              <DateGroup key={day} heading={formatDayHeading(day)}>
                <EventCards events={items} stampFor={stampFor} onOpen={onOpen} />
              </DateGroup>
            ))}
          </DateGroups>
          {scope === 'unit' && unitWindow?.hasMore ? (
            <Button variant="secondary" block onClick={() => setUnitWindows((windows) => windows + 1)}>
              {UNIT_EVENTS_LOAD_MORE_LABEL}
            </Button>
          ) : null}
        </div>
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
  recentWindowEmpty = false,
  canCreate,
  onCreate,
  onClear,
  onLoadMore,
}: {
  filtered: boolean
  recentWindowEmpty?: boolean
  canCreate: boolean
  onCreate?: () => void
  onClear: () => void
  onLoadMore?: () => void
}) {
  if (recentWindowEmpty) {
    return (
      <EmptyState
        icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
        title={UNIT_EVENTS_RECENT_EMPTY_TITLE}
        action={
          onLoadMore ? (
            <Button variant="secondary" onClick={onLoadMore}>
              {UNIT_EVENTS_LOAD_MORE_LABEL}
            </Button>
          ) : undefined
        }
      />
    )
  }

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

function MineLoggedList({
  events,
  query,
  onQueryChange,
  stampFor,
  onOpen,
  hasMore,
  onLoadMore,
}: {
  events: EventListItem[]
  query: string
  onQueryChange: (value: string) => void
  stampFor: (event: EventListItem) => StampDescriptor
  onOpen: (eventId: string) => void
  hasMore: boolean
  onLoadMore: () => void
}) {
  const trimmed = query.trim()
  return (
    <div className="stack-4">
      <div className="admin-toolbar">
        <label className="search-field">
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">חיפוש אירועים שתועדו</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="אירוע, כביש או מיקום"
          />
        </label>
      </div>
      <p className="t-caption text-muted mine-logged-caption">
        {`תועדו · ${MINE_LOGGED_WINDOW_DAYS} יום אחרונים`}
      </p>
      {events.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
          title={trimmed ? mineLoggedNoResultsTitle(trimmed) : MINE_LOGGED_EMPTY_TITLE}
          action={
            trimmed ? (
              <Button variant="ghost" onClick={() => onQueryChange('')}>
                ניקוי חיפוש
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="list-rows">
          {events.map((event) => (
            <MineLoggedEventRow
              key={event.id}
              event={event}
              stamp={stampFor(event)}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
      {hasMore ? (
        <Button variant="secondary" block onClick={onLoadMore}>
          {`הצג ${MINE_LOGGED_WINDOW_DAYS} יום נוספים`}
        </Button>
      ) : null}
    </div>
  )
}

function EventCards({
  events,
  stampFor,
  onOpen,
  onFill,
  userId,
  collapsibleShiftGroups = false,
  mode = 'default',
}: {
  events: EventListItem[]
  stampFor: (event: EventListItem) => StampDescriptor
  onOpen: (eventId: string) => void
  onFill?: (eventId: string) => void
  userId?: string
  collapsibleShiftGroups?: boolean
  mode?: 'default' | 'inbox'
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
                onFill={fillLabel && onFill ? onFill : undefined}
                fillLabel={fillLabel ?? undefined}
                mode={mode}
                overdue={
                  mode === 'inbox' &&
                  isMineFillOverdue({
                    isCancelled: event.is_cancelled,
                    participationStatus: mineStatus,
                    fillCompletableAt: ownFillCompletableAt(event, userId),
                  })
                }
              />
            )
          })
          if (collapsibleShiftGroups) {
            const pendingCount = block.events.length
            return (
              <MineShiftEventGroup
                key={block.key}
                title={block.title}
                caption={
                  mode === 'inbox'
                    ? shiftGroupPendingCaption(pendingCount)
                    : `${pendingCount} אירועים`
                }
                defaultOpen={shiftGroupShouldStartOpen(pendingCount)}
              >
                {groupedCards}
              </MineShiftEventGroup>
            )
          }
          return (
            <li key={block.key} className="stack-3">
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
            mode={mode}
            overdue={
              mode === 'inbox' &&
              isMineFillOverdue({
                isCancelled: event.is_cancelled,
                participationStatus: mineStatus,
                fillCompletableAt: ownFillCompletableAt(event, userId),
              })
            }
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
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a))
}
