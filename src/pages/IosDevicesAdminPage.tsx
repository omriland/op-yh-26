import { useEffect, useMemo, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { formatDateTime, monoClass } from '../lib/format'
import {
  IOS_DEVICE_CAP,
  approveIosDevice,
  budgetTone,
  countBudgetUsed,
  listAllIosDevices,
  rejectIosDevice,
  retireIosDevice,
  type IosDeviceAdminRow,
  type IosDeviceStatus,
} from '../lib/iosDevices'

type FilterId = 'pending' | 'approved' | 'registered' | 'closed'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'pending', label: 'ממתינים' },
  { id: 'approved', label: 'מאושרים (בתור)' },
  { id: 'registered', label: 'רשומים' },
  { id: 'closed', label: 'נדחו / הוצאו' },
]

function matchesFilter(status: IosDeviceStatus, filter: FilterId): boolean {
  if (filter === 'closed') return status === 'rejected' || status === 'retired'
  return status === filter
}

export function IosDevicesAdminPage() {
  const { show } = useToast()
  const [filter, setFilter] = useState<FilterId>('pending')
  const [items, setItems] = useState<IosDeviceAdminRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setItems(null)
    setFailed(false)
    listAllIosDevices()
      .then((rows) => {
        if (active) setItems(rows)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  const used = useMemo(
    () => (items ? countBudgetUsed(items.map((row) => row.status)) : 0),
    [items],
  )
  const tone = budgetTone(used)
  const approvedQueued = useMemo(
    () => (items ? items.filter((row) => row.status === 'approved').length : 0),
    [items],
  )
  const visible = useMemo(
    () => (items ? items.filter((row) => matchesFilter(row.status, filter)) : []),
    [items, filter],
  )

  async function runAction(
    id: string,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    doneMessage: string,
  ) {
    setBusyId(id)
    const result = await action()
    setBusyId(null)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show(doneMessage, 'done')
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="stack-4">
      <div className="page-head">
        <h1 className="t-title">מכשירי iOS</h1>
        <p className={`t-body ${tone === 'ok' ? 'text-secondary' : ''}`}>
          מכסה שנתית: {used} / {IOS_DEVICE_CAP}
          {tone === 'warn' ? ' — מתקרבים למכסה.' : ''}
          {tone === 'critical' ? ' — כמעט מלאה.' : ''}
        </p>
        {approvedQueued > 0 ? (
          <p className="t-caption text-muted">{approvedQueued} ממתינים לפרסום (הרצת הסקריפט במק).</p>
        ) : null}
      </div>

      <div className="chips" role="tablist" aria-label="סינון מכשירי iOS">
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

      {items === null && !failed ? <EventListSkeleton /> : null}

      {failed ? (
        <EmptyState
          icon={<Smartphone size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת המכשירים נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : null}

      {items && visible.length === 0 && !failed ? (
        <EmptyState
          icon={<Smartphone size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין מכשירים בקטגוריה הזו."
        />
      ) : null}

      {visible.length > 0 ? (
        <ul className="stack-3">
          {visible.map((row) => (
            <li key={row.id} className="card stack-2">
              <p className="t-section">
                {row.profile_name ?? 'משתמש'}
                {row.callsign ? (
                  <>
                    {' '}
                    · או״ק <span className={monoClass(row.callsign)}>{row.callsign}</span>
                  </>
                ) : null}
              </p>
              <p className="t-caption text-muted">
                {row.device_name || row.product_type || 'מכשיר'} · {formatDateTime(row.requested_at)}
              </p>
              <p className="t-caption" dir="ltr">
                {row.udid}
              </p>
              {row.status === 'pending' ? (
                <div className="cluster">
                  <Button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() =>
                      void runAction(row.id, () => approveIosDevice(row.id), 'המכשיר אושר.')
                    }
                  >
                    אשר
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === row.id}
                    onClick={() =>
                      void runAction(row.id, () => rejectIosDevice(row.id), 'הבקשה נדחתה.')
                    }
                  >
                    דחה
                  </Button>
                </div>
              ) : null}
              {row.status === 'registered' || row.status === 'approved' ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busyId === row.id}
                  onClick={() =>
                    void runAction(row.id, () => retireIosDevice(row.id), 'המכשיר הוצא משימוש.')
                  }
                >
                  הוצאה משימוש
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
