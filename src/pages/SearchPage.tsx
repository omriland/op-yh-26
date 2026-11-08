import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Printer, Search } from 'lucide-react'
import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import { useAuth } from '../lib/auth'
import { leadFacingMissingKm } from '../lib/eventIncomplete'
import { ownParticipation, ownResponderKm, type EventListItem } from '../lib/events'
import { useFreezeViewer } from '../lib/freezeViewer'
import { downloadCsv } from '../lib/reports/csv'
import { loadLegacyReport, type LegacyReport } from '../lib/reports/legacyReport'
import { searchViewState, type SearchCounts } from '../lib/searchPageState'
import { isSearchShortcut } from '../lib/searchShortcut'
import { shiftBornFillStamp } from '../lib/shiftBornEvents'
import { jerusalemToday } from '../lib/shifts'
import { chipsForFilter, isBlankQuery, removeChip, sectionOrder, type SearchChip, type SearchSection } from '../lib/smartSearch'
import * as smartSearchApi from '../lib/smartSearchApi'
import type { Interpretation } from '../lib/smartSearchApi'
import { archiveCsv, eventsCsv, searchCsvFilename } from '../lib/smartSearchCsv'
import { overlayMissingKmOnDoneStamp, viewerStamp, type StampDescriptor } from '../lib/status'
import { useIsDesktop } from '../lib/useMediaQuery'
import { EventCard } from '../components/events/EventCard'
import { EventsTable } from '../components/events/EventsTable'
import { LegacyEventReport } from '../components/reports/LegacyEventReport'
import { ArchiveResultsTable } from '../components/search/ArchiveResultsTable'
import { PeopleResults } from '../components/search/PeopleResults'
import { SearchChips } from '../components/search/SearchChips'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton, Skeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'

const SCREEN_CAP = 200
const EXPORT_CAP = 5000

const PLACEHOLDERS = [
  'למשל: אירוע בכביש 531 בשבוע שעבר',
  'למשל: סוזוקי שנפגעה בינואר',
  'למשל: 12-345-67',
]

/** The data boundary of this page. The dev harness passes a stub; the app uses the real module. */
export type SearchApi = Pick<
  typeof smartSearchApi,
  'interpretQuery' | 'runSearch' | 'reportCounts' | 'reportChipRemoved' | 'fetchFirstNewEventDate'
>

type Results = Awaited<ReturnType<SearchApi['runSearch']>>
type SearchEvent = Results['events'][number]
type ExportKind = 'events' | 'archive'

function countsOf(found: Results): SearchCounts {
  return { events: found.events.length, archive: found.archive.length, people: found.people.length }
}

/** Same stamp as the unit events list. */
function cardStamp(event: EventListItem, userId?: string): StampDescriptor {
  const missingKm = leadFacingMissingKm(event, userId)
  if (event.origin === 'shift') {
    const stamp = shiftBornFillStamp({
      status: event.status,
      police_event_id: event.police_event_id,
      treatment_detail: event.treatment_detail,
      treatment_notes: event.treatment_notes,
      location: event.location,
      road_id: event.road?.name,
      treated_count: event.shared_treated?.length ?? 0,
    })
    return overlayMissingKmOnDoneStamp(stamp, missingKm)
  }
  return overlayMissingKmOnDoneStamp(
    viewerStamp(event.status, ownParticipation(event, userId), ownResponderKm(event, userId)),
    missingKm,
  )
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

export function SearchPage({
  initialQuery,
  onQueryChange,
  onOpenEvent,
  onOpenUser,
  api = smartSearchApi,
}: {
  initialQuery: string
  onQueryChange: (q: string) => void
  onOpenEvent: (eventId: string) => void
  onOpenUser: (userId: string) => void
  api?: SearchApi
}) {
  const isDesktop = useIsDesktop()
  const { user } = useAuth()
  const freezeViewer = useFreezeViewer()
  const { show } = useToast()
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)])
  const inputRef = useRef<HTMLInputElement>(null)
  const runId = useRef(0)
  const lastRun = useRef<string | null>(null)

  const [query, setQuery] = useState(initialQuery)
  const [submitted, setSubmitted] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null)
  const [filter, setFilter] = useState<SmartSearchFilter | null>(null)
  const [results, setResults] = useState<Results | null>(null)
  const [firstNewEventDate, setFirstNewEventDate] = useState<string | null>(null)
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [report, setReport] = useState<{ fk: string; data: LegacyReport | null } | null>(null)

  async function search(q: string) {
    const id = ++runId.current
    lastRun.current = q
    setSubmitted(q)
    setFailed(false)
    setInterpretation(null)
    setFilter(null)
    setResults(null)
    setReport(null)
    if (isBlankQuery(q)) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const next = await api.interpretQuery(q)
      if (id !== runId.current) return
      setInterpretation(next)
      setFilter(next.filter)
      if (next.error || next.filter.intent === 'unsupported_question') return
      const found = await api.runSearch(next.filter, SCREEN_CAP)
      if (id !== runId.current) return
      setResults(found)
      void next.logId.then((logId) => (logId ? api.reportCounts(logId, countsOf(found)) : undefined)).catch(() => {})
    } catch {
      if (id === runId.current) setFailed(true)
    } finally {
      if (id === runId.current) setLoading(false)
    }
  }

  /** Re-runs the database search only. No AI call. */
  async function rerun(next: SmartSearchFilter, after?: (found: Results) => void) {
    const id = ++runId.current
    setFilter(next)
    setFailed(false)
    setResults(null)
    setReport(null)
    setLoading(true)
    try {
      const found = await api.runSearch(next, SCREEN_CAP)
      if (id !== runId.current) return
      setResults(found)
      after?.(found)
    } catch {
      if (id === runId.current) setFailed(true)
    } finally {
      if (id === runId.current) setLoading(false)
    }
  }

  function submit() {
    const q = query.trim()
    void search(q)
    onQueryChange(q)
  }

  function clearSearch() {
    setQuery('')
    void search('')
    onQueryChange('')
    inputRef.current?.focus()
  }

  function retry() {
    if (interpretation && filter) void rerun(filter)
    else void search(submitted)
  }

  function onRemoveChip(key: SearchChip['key']) {
    if (!filter) return
    const logId = interpretation?.logId
    void rerun(removeChip(filter, key), () => {
      void logId?.then((id) => (id ? api.reportChipRemoved(id) : undefined)).catch(() => {})
    })
  }

  function showMatchingEvents() {
    if (!filter) return
    const logId = interpretation?.logId
    void rerun({ ...filter, intent: 'find' }, (found) => {
      void logId?.then((id) => (id ? api.reportCounts(id, countsOf(found)) : undefined)).catch(() => {})
    })
  }

  async function exportCsv(kind: ExportKind) {
    if (!filter) return
    setExporting(kind)
    try {
      // Only the side being exported runs, so an events export writes no archive audit row.
      const scoped: SmartSearchFilter = { ...filter, entity: 'events', source: kind === 'events' ? 'new' : 'archive' }
      const found = await api.runSearch(scoped, EXPORT_CAP)
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

  // Mount, reload and back/forward: run the query in the URL. A submit sets lastRun
  // first, so its own URL update does not run the search twice.
  useEffect(() => {
    if (initialQuery === lastRun.current) return
    setQuery(initialQuery)
    void search(initialQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per URL query only
  }, [initialQuery])

  useEffect(() => {
    inputRef.current?.focus()
    let active = true
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

  // ⌘K / Ctrl+K while already here: focus the field. Capture phase, so App's
  // bubble-phase shortcut sees defaultPrevented and does not navigate.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isSearchShortcut(event)) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const viewInterpretation = interpretation && filter ? { ...interpretation, filter } : interpretation
  const counts = results ? countsOf(results) : null
  const state = searchViewState({ query: submitted, loading, error: failed, interpretation: viewInterpretation, counts })
  const lane = interpretation?.lane
  const chips = filter ? chipsForFilter(filter) : []
  const visible: SearchSection[] =
    results && filter
      ? sectionOrder(filter, firstNewEventDate).filter((section) => results[section].length > 0)
      : []
  const primaryExport: ExportKind | null =
    state === 'results' && filter?.intent === 'export'
      ? (['events', 'archive'] as const).find((kind) => visible.includes(kind)) ?? null
      : null
  const tooLong = state === 'too_long'

  function exportButton(kind: ExportKind) {
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
      <p className="t-caption text-muted">מוצגות 200 התוצאות הראשונות. צמצמו את החיפוש או ייצאו ל־CSV.</p>
    ) : null
  }

  function renderSection(section: SearchSection) {
    if (!results) return null
    if (section === 'events') {
      const rows = results.events
      return (
        <section key={section} className="search-section" aria-label="אירועים">
          <SectionHead title={`אירועים · נמצאו ${rows.length}`} action={exportButton('events')} />
          {capCaption(rows.length)}
          {isDesktop ? (
            <EventsTable
              events={rows}
              defaultSort={null}
              partialSortNote={rows.length >= SCREEN_CAP ? 'המיון כולל רק את 200 התוצאות המוצגות.' : undefined}
              onOpen={onOpenEvent}
              viewer={freezeViewer}
              viewerId={user?.id}
              foundBy={(event) => (event as SearchEvent).found_by}
            />
          ) : (
            <ul className="stack-3">
              {rows.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  stamp={cardStamp(event, user?.id)}
                  viewer={freezeViewer}
                  onOpen={onOpenEvent}
                  foundBy={event.found_by}
                />
              ))}
            </ul>
          )}
        </section>
      )
    }
    if (section === 'archive') {
      const rows = results.archive
      return (
        <section key={section} className="search-section" aria-label="ארכיון האתר הישן">
          <SectionHead title={`ארכיון האתר הישן · נמצאו ${rows.length}`} action={exportButton('archive')} />
          {capCaption(rows.length)}
          <ArchiveResultsTable
            rows={rows}
            asTable={isDesktop}
            onOpen={(fk) => void openArchiveReport(fk)}
            partialSortNote={rows.length >= SCREEN_CAP ? 'המיון כולל רק את 200 התוצאות המוצגות.' : undefined}
          />
        </section>
      )
    }
    return (
      <section key={section} className="search-section" aria-label="אנשים">
        <SectionHead title={`אנשים · נמצאו ${results.people.length}`} />
        <PeopleResults people={results.people} asTable={isDesktop} onOpen={onOpenUser} />
      </section>
    )
  }

  function renderBody() {
    if (state === 'idle') {
      return (
        <EmptyState
          icon={<Search size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="חפשו אירוע או אדם"
          caption='אפשר לכתוב כמו שמספרים: "רכב סוזוקי שנפגע בינואר", מספר אירוע או לוחית.'
        />
      )
    }
    if (state === 'loading') {
      return (
        <div className="stack-4" aria-busy="true">
          {interpretation ? null : (
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
            <Button variant="secondary" onClick={retry}>
              רענון
            </Button>
          }
        />
      )
    }
    if (state === 'too_long') return null
    if (state === 'unsupported') {
      return (
        <div className="stack-4">
          <p className="banner banner--info t-body" role="status">
            שאלות כמו &quot;כמה&quot; עדיין לא נתמכות. אפשר לחפש אירועים או אנשים.
          </p>
          {chips.length > 0 ? <SearchChips chips={chips} /> : null}
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
          title="לא נמצאו תוצאות"
          caption="נסו להסיר אחד מהתנאים למעלה."
          action={
            <Button variant="ghost" onClick={clearSearch}>
              ניקוי החיפוש
            </Button>
          }
        />
      )
    }
    return <div className="stack-8">{visible.map(renderSection)}</div>
  }

  // What the search understood: chips on the AI lane, a caption on the others.
  const understood =
    state === 'unsupported' || state === 'too_long' || state === 'error' || !interpretation ? null : lane ===
      'direct' ? (
      <p className="t-caption text-muted">חיפוש ישיר לפי מספר</p>
    ) : lane === 'fallback' ? (
      <p className="t-caption text-muted">החיפוש החכם אינו זמין כרגע. מוצגות תוצאות חיפוש טקסט.</p>
    ) : chips.length > 0 ? (
      <SearchChips chips={chips} onRemove={loading ? undefined : onRemoveChip} />
    ) : null

  return (
    <div className={['search-page', isDesktop ? 'page--wide' : ''].filter(Boolean).join(' ')}>
      <div className="page-head">
        <div className="page-head__intro">
          <h1 className="t-title">חיפוש</h1>
          <p className="t-caption text-muted">חיפוש אירועים ואנשים בשפה חופשית, מספר אירוע או לוחית רישוי.</p>
        </div>
      </div>

      <form
        role="search"
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="field search-bar__field">
          <label className="field__control">
            <span className="visually-hidden">חיפוש אירועים ואנשים</span>
            <input
              ref={inputRef}
              className="field__input search-bar__input"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              aria-invalid={tooLong ? true : undefined}
              aria-describedby={tooLong ? 'search-too-long' : undefined}
            />
            <span className="field__affix search-bar__affix" aria-hidden="true">
              <Search size={20} strokeWidth={1.75} />
            </span>
          </label>
          {tooLong ? (
            <p id="search-too-long" className="field__hint field__hint--error" role="alert">
              החיפוש ארוך מדי. נסו לקצר.
            </p>
          ) : null}
        </div>
        <Button type="submit" variant={primaryExport ? 'secondary' : 'primary'} loading={loading} loadingLabel="מחפש…">
          חיפוש
        </Button>
      </form>

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
