import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { fetchMyShifts, fetchShifts, type ShiftListItem } from '../lib/shifts'
import { formatDayHeading } from '../lib/format'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Button, IconButton } from '../components/ui/Button'
import { DateGroup, DateGroups } from '../components/ui/DateGroups'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { ShiftCard } from '../components/shifts/ShiftCard'

type ShiftsPageProps = {
  scope: 'unit' | 'mine'
  canManage?: boolean
  onOpen: (shiftId: string) => void
  onCreate?: () => void
}

export function ShiftsPage({
  scope,
  canManage = false,
  onOpen,
  onCreate,
}: ShiftsPageProps) {
  const isDesktop = useIsDesktop()
  const { user } = useAuth()
  const [shifts, setShifts] = useState<ShiftListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setShifts(null)
    setFailed(false)

    const load = scope === 'mine' && user ? fetchMyShifts(user.id) : fetchShifts()
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
  }, [scope, user, reloadKey])

  const visible = useMemo(() => {
    if (!shifts) return []
    if (scope !== 'mine') return shifts
    return [...shifts].sort((a, b) => b.shift_date.localeCompare(a.shift_date))
  }, [shifts, scope])

  const grouped = useMemo(() => groupByDate(visible), [visible])

  return (
    <div>
      <div className="page-head">
        <h1 className="t-title">{scope === 'mine' ? 'המשמרות שלי' : 'משמרות'}</h1>
        {scope === 'unit' && canManage && onCreate ? (
          <div className="page-head__actions">
            {isDesktop ? (
              <Button onClick={onCreate} icon={<Plus size={20} strokeWidth={1.75} />}>
                משמרת חדשה
              </Button>
            ) : (
              <IconButton label="משמרת חדשה" onClick={onCreate}>
                <Plus size={20} strokeWidth={1.75} />
              </IconButton>
            )}
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
        <EventListSkeleton />
      ) : visible.length === 0 ? (
        <ListEmptyState
          scope={scope}
          canManage={canManage && Boolean(onCreate)}
          onCreate={onCreate}
        />
      ) : (
        <DateGroups>
          {grouped.map(([day, items]) => (
            <DateGroup key={day} heading={formatDayHeading(day)}>
              <ul className="stack-3">
                {items.map((shift) => (
                  <ShiftCard key={shift.id} shift={shift} onOpen={onOpen} />
                ))}
              </ul>
            </DateGroup>
          ))}
        </DateGroups>
      )}
    </div>
  )
}

function ListEmptyState({
  scope,
  canManage,
  onCreate,
}: {
  scope: 'unit' | 'mine'
  canManage: boolean
  onCreate?: () => void
}) {
  if (scope === 'mine') {
    return (
      <EmptyState
        icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
        title="לא שובצת למשמרות"
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
