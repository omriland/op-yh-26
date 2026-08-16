import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { useAuth } from '../lib/auth'
import {
  UNIT_SHIFTS_LIST_LIMIT,
  fetchMyShifts,
  fetchShifts,
  fetchShiftsByIds,
  filterUnitShiftsForList,
  isShiftFuture,
  isShiftPendingLog,
  jerusalemToday,
  mergeShiftLists,
  missingSearchShiftIds,
  searchUnitShiftIds,
  unitShiftsListHint,
  type ShiftListItem,
} from '../lib/shifts'
import { formatDayHeading } from '../lib/format'
import { MINE_LOGGED_WINDOW_DAYS, partitionMineList } from '../lib/mineListSections'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Button, IconButton } from '../components/ui/Button'
import { DateGroup, DateGroups } from '../components/ui/DateGroups'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { ShiftCard } from '../components/shifts/ShiftCard'
import { ShiftsTable } from '../components/shifts/ShiftsTable'
import { useToast } from '../components/ui/Toast'

type ShiftsPageProps = {
  scope: 'unit' | 'mine'
  /** Command desktop renders the managerial table; every other surface uses cards. */
  asTable: boolean
  canManage?: boolean
  onOpen: (shiftId: string) => void
  onCreate?: () => void
}

export function ShiftsPage({
  scope,
  asTable,
  canManage = false,
  onOpen,
  onCreate,
}: ShiftsPageProps) {
  const isDesktop = useIsDesktop()
  const { user } = useAuth()
  const { show } = useToast()
  const [shifts, setShifts] = useState<ShiftListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [searchIds, setSearchIds] = useState<ReadonlySet<string> | null>(null)
  const [searchExtras, setSearchExtras] = useState<ShiftListItem[]>([])
  const [searching, setSearching] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [loggedWindows, setLoggedWindows] = useState(1)

  useEffect(() => {
    let active = true
    setShifts(null)
    setFailed(false)

    const load =
      scope === 'mine' && user
        ? fetchMyShifts(user.id)
        : fetchShifts(asTable ? { limit: UNIT_SHIFTS_LIST_LIMIT } : undefined)
    load
      .then((rows) => {
        if (active) setShifts(rows)
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

    if (!shifts) return

    setSearchIds(new Set())
    setSearchExtras([])
    setSearching(true)

    let cancelled = false
    const handle = window.setTimeout(() => {
      searchUnitShiftIds(trimmed)
        .then(async (ids) => {
          const missing = missingSearchShiftIds(
            shifts.map((shift) => shift.id),
            new Set(ids),
          )
          let extras: ShiftListItem[] = []
          if (missing.length > 0) {
            try {
              extras = await fetchShiftsByIds(missing)
            } catch {
              if (!cancelled) {
                show('טעינת משמרות ישנות יותר נכשלה. מוצגות תוצאות מהרשימה הנוכחית.', 'alert')
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
          show('חיפוש המשמרות נכשל. נסו שוב.', 'alert')
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [query, scope, shifts, show])

  const visible = useMemo(() => {
    if (!shifts) return []
    if (scope === 'unit') {
      const source = searchIds === null ? shifts : mergeShiftLists(shifts, searchExtras)
      return filterUnitShiftsForList(source, { searchIds })
    }
    return [...shifts].sort((a, b) => b.shift_date.localeCompare(a.shift_date))
  }, [scope, searchExtras, searchIds, shifts])

  const grouped = useMemo(() => groupByDate(visible), [visible])
  const mineSections = useMemo(() => {
    if (scope !== 'mine' || !shifts) return null
    const today = jerusalemToday()
    return partitionMineList(shifts, {
      dateOf: (shift) => shift.shift_date,
      bucket: (shift) => {
        if (isShiftFuture(shift.shift_date, today)) return 'future'
        return isShiftPendingLog(shift, today) ? 'pending' : 'logged'
      },
      today,
      windowsLoaded: loggedWindows,
    })
  }, [loggedWindows, scope, shifts])

  return (
    <div className={asTable ? 'page--wide' : undefined}>
      <div className="page-head">
        {scope === 'unit' ? (
          <div className="page-head__intro">
            <h1 className="t-title">משמרות</h1>
            {asTable ? (
              <p className="t-caption text-muted">{unitShiftsListHint(UNIT_SHIFTS_LIST_LIMIT)}</p>
            ) : null}
          </div>
        ) : (
          <h1 className="t-title">המשמרות שלי</h1>
        )}
        {asTable || (scope === 'unit' && canManage && onCreate) ? (
          <div className="page-head__actions">
            {asTable ? (
              <label className="field__control" style={{ width: 280 }}>
                <span className="visually-hidden">חיפוש משמרות</span>
                <input
                  className="field__input field__input--with-affix"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="חיפוש לפי שם משמרת, רכב, מספר אירוע, שם או או״ק"
                />
                <span className="field__affix" aria-hidden="true">
                  <Search size={20} strokeWidth={1.75} />
                </span>
              </label>
            ) : null}
            {scope === 'unit' && canManage && onCreate ? (
              isDesktop ? (
                <Button onClick={onCreate} icon={<Plus size={20} strokeWidth={1.75} />}>
                  משמרת חדשה
                </Button>
              ) : (
                <IconButton label="משמרת חדשה" onClick={onCreate}>
                  <Plus size={20} strokeWidth={1.75} />
                </IconButton>
              )
            ) : null}
          </div>
        ) : null}
      </div>

      {failed ? (
        <EmptyState
          icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת המשמרות נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : !shifts ? (
        asTable ? (
          <EventRowsSkeleton />
        ) : (
          <EventListSkeleton />
        )
      ) : searching ? (
        <SearchLoadingState />
      ) : scope === 'mine' && mineSections ? (
        <DateGroups>
          <DateGroup heading="משמרות ממתינות לתיעוד">
            <div className="stack-4">
              {mineSections.pending.length === 0 ? (
                <p className="t-body text-secondary mine-section-empty">
                  מברוק! אין לך עוד משמרות לתעד כרגע
                </p>
              ) : (
                <ShiftCards shifts={mineSections.pending} onOpen={onOpen} />
              )}
            </div>
          </DateGroup>
          {mineSections.future.length > 0 ? (
            <DateGroup heading="משמרות עתידיות">
              <ShiftCards shifts={mineSections.future} onOpen={onOpen} />
            </DateGroup>
          ) : null}
          <DateGroup heading="משמרות שתועדו">
            <div className="stack-4">
              {mineSections.logged.length === 0 ? (
                <p className="t-body text-secondary mine-section-empty">
                  אין משמרות שתועדו בתקופה זו
                </p>
              ) : (
                <ShiftCards shifts={mineSections.logged} onOpen={onOpen} />
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
          filtered={query.trim() !== ''}
          canManage={canManage && Boolean(onCreate)}
          onCreate={onCreate}
          onClear={() => setQuery('')}
        />
      ) : asTable ? (
        <ShiftsTable shifts={visible} onOpen={onOpen} />
      ) : (
        <DateGroups>
          {grouped.map(([day, items]) => (
            <DateGroup key={day} heading={formatDayHeading(day)}>
              <ShiftCards shifts={items} onOpen={onOpen} />
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
        title="טוען משמרות…"
      />
    </div>
  )
}

function ShiftCards({
  shifts,
  onOpen,
}: {
  shifts: ShiftListItem[]
  onOpen: (shiftId: string) => void
}) {
  return (
    <ul className="stack-3">
      {shifts.map((shift) => (
        <ShiftCard key={shift.id} shift={shift} onOpen={onOpen} />
      ))}
    </ul>
  )
}

function ListEmptyState({
  filtered,
  canManage,
  onCreate,
  onClear,
}: {
  filtered: boolean
  canManage: boolean
  onCreate?: () => void
  onClear: () => void
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
        title="אין משמרות במצב זה"
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
      title="אין משמרות עדיין"
      action={
        canManage && onCreate ? (
          <Button onClick={onCreate} icon={<Plus size={20} strokeWidth={1.75} />}>
            משמרת חדשה
          </Button>
        ) : undefined
      }
    />
  )
}

function groupByDate(shifts: ShiftListItem[]): [string, ShiftListItem[]][] {
  const groups = new Map<string, ShiftListItem[]>()
  for (const shift of shifts) {
    const bucket = groups.get(shift.shift_date) ?? []
    bucket.push(shift)
    groups.set(shift.shift_date, bucket)
  }
  return [...groups.entries()]
}
