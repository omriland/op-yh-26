import { Fragment, useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { formatDateTime, monoClass } from '../lib/format'
import {
  EVENT_AUDIT_LOAD_MORE_LABEL,
  eventAuditActorName,
  eventAuditEventLabel,
  eventAuditFieldDiffs,
  eventAuditOpLabel,
  eventAuditSummary,
  eventAuditTableLabel,
  fetchEventAuditPage,
  type EventAuditRow,
} from '../lib/eventAudit'
import { useIsDesktop } from '../lib/useMediaQuery'

export function EventAuditPage() {
  const isDesktop = useIsDesktop()
  const { show } = useToast()
  const [rows, setRows] = useState<EventAuditRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setRows(null)
    setFailed(false)
    setHasMore(false)
    setNextOffset(0)
    setOpenId(null)

    fetchEventAuditPage({ offset: 0 })
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
  }, [reloadKey])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const page = await fetchEventAuditPage({ offset: nextOffset })
      setRows((current) => [...(current ?? []), ...page.rows])
      setHasMore(page.hasMore)
      setNextOffset(page.nextOffset)
    } catch {
      show('טעינת היומן נכשלה. בדקו את החיבור ונסו שוב.', 'alert')
    } finally {
      setLoadingMore(false)
    }
  }

  function toggle(id: string) {
    setOpenId((current) => (current === id ? null : id))
  }

  return (
    <div className={isDesktop ? 'page--wide stack-4' : 'stack-4'}>
      <div className="page-head">
        <div>
          <h1 className="t-title">יומן שינויים</h1>
          <p className="t-caption text-muted">
            שינויים באירועים ובכוננים — מי, מתי, לפני ואחרי.
          </p>
        </div>
      </div>

      {rows === null && !failed ? (
        isDesktop ? <EventRowsSkeleton /> : <EventListSkeleton />
      ) : null}

      {failed ? (
        <EmptyState
          icon={<History size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת היומן נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : null}

      {rows && rows.length === 0 && !failed ? (
        <EmptyState
          icon={<History size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין רשומות ביומן."
        />
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="stack-4">
          {isDesktop ? (
            <EventAuditTable rows={rows} openId={openId} onToggle={toggle} />
          ) : (
            <EventAuditCards rows={rows} openId={openId} onToggle={toggle} />
          )}
          {hasMore ? (
            <Button
              variant="secondary"
              block
              loading={loadingMore}
              loadingLabel="טוען…"
              onClick={() => void loadMore()}
            >
              {EVENT_AUDIT_LOAD_MORE_LABEL}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function EventAuditTable({
  rows,
  openId,
  onToggle,
}: {
  rows: EventAuditRow[]
  openId: string | null
  onToggle: (id: string) => void
}) {
  return (
    <div className="table-wrap">
      <table className="table table--event-audit">
        <thead>
          <tr>
            <th scope="col">מתי</th>
            <th scope="col">מי</th>
            <th scope="col">פעולה</th>
            <th scope="col">טבלה</th>
            <th scope="col">אירוע</th>
            <th scope="col">שינויים</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = openId === row.id
            return (
              <Fragment key={row.id}>
                <tr
                  className={open ? 'is-open' : undefined}
                  onClick={() => onToggle(row.id)}
                  aria-expanded={open}
                >
                  <td className="num mono">{formatDateTime(row.changed_at)}</td>
                  <td>{eventAuditActorName(row)}</td>
                  <td>{eventAuditOpLabel(row.op)}</td>
                  <td>{eventAuditTableLabel(row.table_name)}</td>
                  <td className={`num ${monoClass(eventAuditEventLabel(row))}`}>
                    {eventAuditEventLabel(row)}
                  </td>
                  <td className="truncate">{eventAuditSummary(row)}</td>
                </tr>
                {open ? (
                  <tr className="is-static event-audit__detail-row">
                    <td colSpan={6}>
                      <EventAuditDiff row={row} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EventAuditCards({
  rows,
  openId,
  onToggle,
}: {
  rows: EventAuditRow[]
  openId: string | null
  onToggle: (id: string) => void
}) {
  return (
    <ul className="stack-3">
      {rows.map((row) => {
        const open = openId === row.id
        return (
          <li key={row.id} className="card">
            <button
              type="button"
              className="event-audit-card__open"
              aria-expanded={open}
              onClick={() => onToggle(row.id)}
            >
              <div className="event-audit-card__top">
                <p className="t-section">{eventAuditOpLabel(row.op)}</p>
                <p className={`t-caption num ${monoClass(eventAuditEventLabel(row))}`}>
                  {eventAuditEventLabel(row)}
                </p>
              </div>
              <p className="t-body">{eventAuditActorName(row)}</p>
              <p className="t-caption text-muted">
                {formatDateTime(row.changed_at)} · {eventAuditTableLabel(row.table_name)}
              </p>
              <p className="t-caption">{eventAuditSummary(row)}</p>
            </button>
            {open ? <EventAuditDiff row={row} /> : null}
          </li>
        )
      })}
    </ul>
  )
}

function EventAuditDiff({ row }: { row: EventAuditRow }) {
  const diffs = eventAuditFieldDiffs(row.old_row, row.new_row, row.changed_fields)
  if (row.op !== 'UPDATE' || diffs.length === 0) {
    const json = row.op === 'DELETE' ? row.old_row : row.new_row
    return (
      <pre className="event-audit__json t-caption" dir="ltr">
        {JSON.stringify(json, null, 2)}
      </pre>
    )
  }

  return (
    <dl className="event-audit__diff">
      {diffs.map((item) => (
        <div key={item.key} className="event-audit__diff-row">
          <dt className="t-caption text-muted">{item.label}</dt>
          <dd className="t-body">
            <span className="text-muted">לפני </span>
            <span>{item.before}</span>
            <span className="text-muted"> · אחרי </span>
            <span>{item.after}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
