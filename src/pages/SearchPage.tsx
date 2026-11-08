import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Printer, Search } from 'lucide-react'
import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import { useAuth } from '../lib/auth'
import { eventLifecycle, lifecycleStamp, lifecycleStampTip, type StatusAudience } from '../lib/eventLifecycle'
import { useFreezeViewer } from '../lib/freezeViewer'
import { downloadCsv } from '../lib/reports/csv'
import { loadLegacyReport, type LegacyReport } from '../lib/reports/legacyReport'
import { handOffPrepared, prepareQuery, takePrepared, type PreparedQuery, type SearchApi } from '../lib/search/prepareQuery'
import type { RulesVocab } from '../lib/search/searchRules'
import { canUseArchive, filterForRole, type SearchRole } from '../lib/search/searchRole'
import { searchViewState, type SearchCounts } from '../lib/searchPageState'
import { jerusalemToday } from '../lib/shifts'
import { isBlankQuery, sectionOrder, type SearchSection } from '../lib/smartSearch'
import * as smartSearchApi from '../lib/smartSearchApi'
import type { PersonHit, SearchEvent, SearchResults } from '../lib/smartSearchApi'
import { archiveCsv, eventsCsv, searchCsvFilename } from '../lib/smartSearchCsv'
import { useIsDesktop } from '../lib/useMediaQuery'
import { EventCard } from '../components/events/EventCard'
import { EventsTable } from '../components/events/EventsTable'
import { LegacyEventReport } from '../components/reports/LegacyEventReport'
import { ArchiveResultsTable } from '../components/search/ArchiveResultsTable'
import { PeopleResults } from '../components/search/PeopleResults'
import { SearchCombobox, type SearchPageLink } from '../components/search/SearchCombobox'
import { SearchFilterBar } from '../components/search/SearchFilterBar'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton, Skeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'

export type { SearchApi } from '../lib/search/prepareQuery'

const SCREEN_CAP = 200
const EXPORT_CAP = 5000

type ExportKind = 'events' | 'archive'

function countsOf(found: SearchResults): SearchCounts {
  return { events: found.events.length, archive: found.archive.length, people: found.people.length }
}

function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="search-section__head">
      <div className="search-section__rule">
        <h2 className="t-section">{title}</h2>
        <span className="search-section__line" aria-hidden="true" />
      </div>
      {action}
    </div>
  )
}

export type SearchPageProps = {
  /** The query in the URL. On desktop the top bar field holds it. */
  initialQuery: string
  onQueryChange: (q: string) => void
  role: SearchRole
  audience: StatusAudience
  onOpenEvent: (eventId: string) => void
  onOpenPerson: (person: PersonHit) => void
  onNavigate: (view: string) => void
  pages: SearchPageLink[]
  shortcuts: SearchPageLink[]
  canOpenReports: boolean
  /** An archive report picked in the top bar panel. */
  initialReportFk?: string | null
  api?: SearchApi
}

/**
 * The results page: what the search understood as editable chips, then every group
 * with full counts, CSV export and the archive report viewer. Rows come from the
 * filter run as the signed-in user, never from the model.
 */
export function SearchPage({
  initialQuery,
  onQueryChange,
  role,
  audience,
  onOpenEvent,
  onOpenPerson,
  onNavigate,
  pages,
  shortcuts,
  canOpenReports,
  initialReportFk = null,
  api = smartSearchApi,
}: SearchPageProps) {
  const isDesktop = useIsDesktop()
  const { user } = useAuth()
  const freezeViewer = useFreezeViewer()
  const { show } = useToast()
  const runId = useRef(0)
  const [field, setField] = useState(initialQuery)
  const [vocab, setVocab] = useState<RulesVocab | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [prepared, setPrepared] = useState<PreparedQuery | null>(null)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [firstNewEventDate, setFirstNewEventDate] = useState<string | null>(null)
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [report, setReport] = useState<{ fk: string; data: LegacyReport | null } | null>(null)
  const [addRequest, setAddRequest] = useState(0)
  const archive = canUseArchive(role)

  async function rerun(next: PreparedQuery, after?: (found: SearchResults) => void) {
    const id = ++runId.current
    setPrepared(next)
    setFailed(false)
    setResults(null)
    if (next.interpretation.error || next.interpretation.filter.intent === 'unsupported_question') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const found = await api.runSearch(next.filter, SCREEN_CAP, { role })
      if (id !== runId.current) return
      setResults(found)
      after?.(found)
    } catch {
      if (id === runId.current) setFailed(true)
    } finally {
      if (id === runId.current) setLoading(false)
    }
  }

  async function search(q: string, forceModel = false) {
    const id = ++runId.current
    setFailed(false)
    setPrepared(null)
    setResults(null)
    if (isBlankQuery(q) || !vocab) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const handed = forceModel ? null : takePrepared(q)
      const next = handed ?? (await prepareQuery(q, { role, vocab, forceModel }, api))
      if (id !== runId.current) return
      await rerun(next, (found) => {
        void next.interpretation.logId
          .then((logId) => (logId ? api.reportCounts(logId, countsOf(found)) : undefined))
          .catch(() => {})
      })
    } catch {
      if (id === runId.current) {
        setFailed(true)
        setLoading(false)
      }
    }
  }

  function editFilter(next: SmartSearchFilter, removed: boolean) {
    if (!prepared) return
    const { filter, dropped } = filterForRole(next, role)
    const logId = prepared.interpretation.logId
    void rerun({ ...prepared, filter, dropped }, () => {
      if (removed) void logId.then((id) => (id ? api.reportChipRemoved(id) : undefined)).catch(() => {})
    })
  }

  function showMatchingEvents() {
    if (!prepared) return
    const filter = { ...prepared.filter, intent: 'find' as const }
    void rerun({ ...prepared, filter, interpretation: { ...prepared.interpretation, filter } })
  }

  async function exportCsv(kind: ExportKind) {
    if (!prepared) return
    setExporting(kind)
    try {
      // Only the side being exported runs, so an events export writes no archive audit row.
      const scoped: SmartSearchFilter = { ...prepared.filter, entity: 'events', source: kind === 'events' ? 'new' : 'archive' }
      const found = await api.runSearch(scoped, EXPORT_CAP, { role })
      const csv = kind === 'events' ? eventsCsv(found.events) : archiveCsv(found.archive)
      downloadCsv(searchCsvFilename(kind, jerusalemToday()), csv)
      show('הקובץ יוצא', 'done')
    } catch {
      show('הייצוא נכשל. בדקו את החיבור ונסו שוב.', 'alert')
    } finally {
      setExporting(null)
    }
  }

  async function openArchiveReport(fk: string) {
    setReport({ fk, data: null })
    try {
      const data = await loadLegacyReport(fk)
      if (!data) throw new Error('not found')
      setReport((current) => (current?.fk === fk ? { fk, data } : current))
    } catch {
      setReport((current) => (current?.fk === fk ? null : current))
      show('טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב.', 'alert')
    }
  }

  useEffect(() => {
    let active = true
    void api.fetchSearchVocab().then((v) => {
      if (active) setVocab(v)
    })
    api
      .fetchFirstNewEventDate()
      .then((date) => {
        if (active) setFirstNewEventDate(date)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api])

  // The URL query (a submit here, the top bar, reload, back/forward) runs the search.
  useEffect(() => {
    setField(initialQuery)
    if (vocab) void search(initialQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per URL query, once the lists load
  }, [initialQuery, vocab])

  useEffect(() => {
    if (initialReportFk && archive) void openArchiveReport(initialReportFk)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a report picked in the top bar
  }, [initialReportFk])

  const counts = results ? countsOf(results) : null
  const state = searchViewState({
    query: initialQuery,
    loading: loading || (!vocab && !isBlankQuery(initialQuery)),
    error: failed,
    interpretation: prepared ? { ...prepared.interpretation, filter: prepared.filter } : null,
    counts,
  })
  const lane = prepared?.interpretation.lane
  const visible: SearchSection[] =
    results && prepared
      ? sectionOrder(prepared.filter, firstNewEventDate).filter(
          (section) => results[section].length > 0 && (archive || section !== 'archive'),
        )
      : []
  const canExport = (kind: ExportKind) => (kind === 'archive' ? archive : role !== 'responder')
  const primaryExport: ExportKind | null =
    state === 'results' && prepared?.filter.intent === 'export'
      ? (['events', 'archive'] as const).find((kind) => visible.includes(kind) && canExport(kind)) ?? null
      : null

  function exportButton(kind: ExportKind) {
    if (!canExport(kind)) return undefined
    return (
      <Button
        variant={primaryExport === kind ? 'primary' : 'secondary'}
        onClick={() => void exportCsv(kind)}
        loading={exporting === kind}
        loadingLabel="מייצא…"
        disabled={exporting !== null && exporting !== kind}
      >
        ייצוא ל־CSV
      </Button>
    )
  }

  function capCaption(rows: number) {
    return rows >= SCREEN_CAP ? (
      <p className="t-caption text-muted">מוצגות 200 התוצאות הראשונות. צמצמו את החיפוש{role !== 'responder' ? ' או ייצאו ל־CSV' : ''}.</p>
    ) : null
  }

  function eventRows(rows: SearchEvent[]) {
    // A כונן never sees a טיוטה; RLS already holds them back, this keeps it so on screen.
    const shown = audience === 'responder' ? rows.filter((event) => eventLifecycle(event).status !== 'draft') : rows
    if (isDesktop && audience === 'lead') {
      return (
        <EventsTable
          events={shown}
          defaultSort={null}
          partialSortNote={shown.length >= SCREEN_CAP ? 'המיון כולל רק את 200 התוצאות המוצגות.' : undefined}
          onOpen={onOpenEvent}
          viewer={freezeViewer}
          foundBy={(event) => (event as SearchEvent).found_by}
        />
      )
    }
    return (
      <ul className="stack-3">
        {shown.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            stamp={lifecycleStamp(eventLifecycle(event), audience)}
            stampTip={lifecycleStampTip(event, audience, user?.id)}
            viewer={freezeViewer}
            onOpen={onOpenEvent}
            foundBy={event.found_by}
          />
        ))}
      </ul>
    )
  }

  function renderSection(section: SearchSection) {
    if (!results) return null
    if (section === 'events') {
      return (
        <section key={section} className="search-section" aria-label="אירועים">
          <SectionHead title={`אירועים · נמצאו ${results.events.length}`} action={exportButton('events')} />
          {capCaption(results.events.length)}
          {eventRows(results.events)}
        </section>
      )
    }
    if (section === 'archive') {
      return (
        <section key={section} className="search-section" aria-label="ארכיון האתר הישן">
          <SectionHead title={`ארכיון האתר הישן · נמצאו ${results.archive.length}`} action={exportButton('archive')} />
          {capCaption(results.archive.length)}
          <ArchiveResultsTable
            rows={results.archive}
            asTable={isDesktop}
            onOpen={(fk) => void openArchiveReport(fk)}
            partialSortNote={results.archive.length >= SCREEN_CAP ? 'המיון כולל רק את 200 התוצאות המוצגות.' : undefined}
          />
        </section>
      )
    }
    return (
      <section key={section} className="search-section" aria-label="אנשים">
        <SectionHead title={`אנשים · נמצאו ${results.people.length}`} />
        <PeopleResults people={results.people} asTable={isDesktop} full={role === 'admin'} onOpen={onOpenPerson} />
      </section>
    )
  }

  function renderBody() {
    if (state === 'idle') {
      return (
        <EmptyState
          icon={<Search size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="חפשו אירוע, אדם או עמוד"
          caption={
            isDesktop
              ? 'כתבו בשדה החיפוש למעלה. אפשר לכתוב כמו שמספרים: ״תאונות בכביש 6 בשבוע שעבר״, מספר אירוע או לוחית.'
              : 'אפשר לכתוב כמו שמספרים: ״תאונות בכביש 6 בשבוע שעבר״, מספר אירוע או לוחית.'
          }
        />
      )
    }
    if (state === 'loading') {
      return (
        <div className="stack-4" aria-busy="true" aria-label="מחפשים">
          {prepared ? null : (
            <div className="search-chips" aria-hidden="true">
              <Skeleton height={36} width="96px" />
              <Skeleton height={36} width="128px" />
              <Skeleton height={36} width="96px" />
            </div>
          )}
          {isDesktop ? <EventRowsSkeleton rows={6} /> : <EventListSkeleton count={5} />}
        </div>
      )
    }
    if (state === 'error') {
      return (
        <EmptyState
          icon={<Search size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="החיפוש נכשל. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => (prepared ? void rerun(prepared) : void search(initialQuery))}>
              רענון
            </Button>
          }
        />
      )
    }
    if (state === 'too_long') {
      return (
        <p className="banner banner--alert t-body" role="alert">
          החיפוש ארוך מדי. נסו לקצר ל־300 תווים לכל היותר.
        </p>
      )
    }
    if (state === 'unsupported') {
      return (
        <div className="stack-4">
          <p className="banner banner--info t-body" role="status">
            החיפוש מוצא רשומות ולא מחשב סכומים.
          </p>
          {canOpenReports ? (
            <div>
              <Button variant="secondary" onClick={() => onNavigate('reports')}>
                מעבר לדוחות
              </Button>
            </div>
          ) : null}
          <div>
            <Button variant="ghost" onClick={showMatchingEvents}>
              הצגת האירועים המתאימים
            </Button>
          </div>
        </div>
      )
    }
    if (state === 'empty') {
      return (
        <EmptyState
          icon={<Search size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="לא נמצאו תוצאות לכל המסננים יחד"
          caption="אפשר להסיר מסנן אחד מלמעלה ולנסות שוב, או לבדוק את האיות."
        />
      )
    }
    return <div className="stack-8">{visible.map(renderSection)}</div>
  }

  const understood =
    prepared && !prepared.interpretation.error && state !== 'idle' ? (
      <div className="stack-3">
        {lane === 'fallback' ? (
          <div className="banner banner--info search-fallback" role="status">
            <p className="t-body">לא הצלחנו לפענח את המשפט, חיפשנו לפי המילים.</p>
            <div className="search-fallback__actions">
              <Button variant="secondary" onClick={() => void search(initialQuery, true)} disabled={loading}>
                נסו שוב
              </Button>
              <Button variant="ghost" onClick={() => setAddRequest((n) => n + 1)}>
                הוספת מסנן
              </Button>
            </div>
          </div>
        ) : null}
        {lane === 'direct' ? <p className="t-caption text-muted">חיפוש ישיר לפי מספר</p> : null}
        <SearchFilterBar
          filter={prepared.filter}
          role={role}
          audience={audience}
          vocab={vocab ?? { eventTypes: [], districts: [] }}
          ambiguity={prepared.ambiguity}
          dropped={prepared.dropped}
          disabled={loading}
          addRequest={addRequest}
          onChange={(next, change) => editFilter(next, Boolean(change.removed))}
        />
      </div>
    ) : null

  return (
    <div className={['search-page', isDesktop ? 'page--wide' : ''].filter(Boolean).join(' ')}>
      <div className="page-head">
        <div className="page-head__intro">
          <h1 className="t-title">חיפוש</h1>
          {isDesktop && !isBlankQuery(initialQuery) ? (
            <p className="t-caption text-muted search-page__query">״{initialQuery}״</p>
          ) : null}
        </div>
      </div>

      {isDesktop ? null : (
        <SearchCombobox
          variant="page"
          role={role}
          audience={audience}
          query={field}
          onQueryChange={setField}
          onSubmit={(q, ready) => {
            if (ready) handOffPrepared(ready)
            if (q === initialQuery) void search(q)
            else onQueryChange(q)
          }}
          onOpenEvent={onOpenEvent}
          onOpenPerson={onOpenPerson}
          onOpenArchive={(fk) => void openArchiveReport(fk)}
          onNavigate={onNavigate}
          pages={pages}
          shortcuts={shortcuts}
          canOpenReports={canOpenReports}
          api={api}
          autoFocus={isBlankQuery(initialQuery)}
          placeholder="אירוע, אדם, לוחית או משפט"
        />
      )}

      {report ? (
        <div className="stack-4">
          <div className="search-report__actions">
            <Button variant="ghost" onClick={() => setReport(null)} icon={<ChevronRight size={20} strokeWidth={1.75} />}>
              תוצאות החיפוש
            </Button>
            {report.data ? (
              <Button variant="secondary" onClick={() => window.print()} icon={<Printer size={20} strokeWidth={1.75} />}>
                הדפסה / PDF
              </Button>
            ) : null}
          </div>
          {report.data ? (
            <>
              <LegacyEventReport report={report.data} />
              {createPortal(
                <div className="legacy-print-root">
                  <LegacyEventReport report={report.data} />
                </div>,
                document.body,
              )}
            </>
          ) : (
            <div className="card stack-3" aria-busy="true" aria-label="טוען דוח">
              <Skeleton height={24} width="40%" />
              <Skeleton height={20} width="70%" />
              <Skeleton height={20} width="55%" />
              <Skeleton height={20} width="65%" />
            </div>
          )}
        </div>
      ) : (
        <>
          {understood}
          {renderBody()}
        </>
      )}
    </div>
  )
}
