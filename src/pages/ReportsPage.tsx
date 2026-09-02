import { useMemo, useState } from 'react'
import { BarChart3, Search } from 'lucide-react'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { ReportRunner } from '../components/reports/ReportRunner'
import { useAuth } from '../lib/auth'
import { visibleReportKinds } from '../lib/reports/access'
import { filterReportCatalog } from '../lib/reports/librarySearch'
import { REPORT_KINDS, reportKindById } from '../lib/reports/registry'

type ReportsPageProps = {
  asTable: boolean
  onOpenEvent: (eventId: string) => void
}

export function ReportsPage({ asTable, onOpenEvent }: ReportsPageProps) {
  const { roles, profile, user } = useAuth()
  const [reportId, setReportId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const kinds = visibleReportKinds(REPORT_KINDS, roles)
  const kind = reportId ? reportKindById(reportId) : undefined
  const allowed = Boolean(kind && kinds.some((item) => item.id === kind.id))
  const filtered = useMemo(() => filterReportCatalog(kinds, query), [kinds, query])
  const isAdmin = roles.includes('admin')
  const viewer = useMemo(
    () => ({
      userId: profile?.id ?? user?.id ?? '',
      isAdmin,
    }),
    [profile?.id, user?.id, isAdmin],
  )

  if (allowed && kind) {
    return (
      <ReportRunner
        key={kind.id}
        kind={kind}
        viewer={viewer}
        asTable={asTable}
        onBack={() => setReportId(null)}
        onOpenEvent={onOpenEvent}
      />
    )
  }

  return (
    <div className="stack-4">
      <div className="page-head">
        <div>
          <h1 className="t-title">דוחות וסטטיסטיקות</h1>
        </div>
      </div>

      {kinds.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין דוחות להצגה"
        />
      ) : (
        <>
          <div className="admin-toolbar">
            <label className="search-field">
              <Search size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="visually-hidden">חיפוש דוחות</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="שם דוח או תיאור"
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={40} strokeWidth={1.75} aria-hidden="true" />}
              title="לא נמצאו דוחות תואמים"
              action={
                <Button variant="ghost" onClick={() => setQuery('')}>
                  ניקוי חיפוש
                </Button>
              }
            />
          ) : (
            <ul className="report-catalog">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="card report-catalog__card"
                    onClick={() => setReportId(item.id)}
                  >
                    <span className="t-section">{item.title}</span>
                    <span className="t-body text-secondary">{item.includes}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
