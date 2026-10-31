// In-app "Event report archive" — the old-site ShowEventReport, reconstructed from
// the archived YP backup. Lives inside the Reports section. Lookup by call sign
// (all its events, or one date), event number or report id, then shows the report.
//
// Data comes from src/lib/reports/legacyReport.ts (fixture in the dev harness;
// Supabase `legacy.*` in production) — this view never talks to a backend directly.
// The open report is also portaled into a print-only root, so printing (button or
// browser) outputs that document alone, without the app chrome or the search.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ChevronLeft, ChevronRight, FileSearch, Printer, Search } from 'lucide-react'
import { Button } from '../ui/Button'
import { DateField } from '../ui/DateField'
import { EmptyState } from '../ui/EmptyState'
import { FilterChips } from '../ui/FilterChips'
import { TextField } from '../ui/TextField'
import { LegacyEventReport } from './LegacyEventReport'
import './LegacyEventReport.css'
import { isoDateToDisplay } from '../../lib/format'
import {
  searchByCallSign,
  searchLegacyReports,
  toDisplayDate,
  type LegacyLookup,
  type LegacyReport,
} from '../../lib/reports/legacyReport'

type Mode = 'callsignList' | 'callsign' | 'report' | 'id'

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'callsignList', label: 'אות קריאה' },
  { value: 'callsign', label: 'אות קריאה ותאריך' },
  { value: 'report', label: 'מספר אירוע' },
  { value: 'id', label: 'מזהה דוח' },
]

/** What was searched, for the result heading and the empty state. */
type Searched = { mode: Mode; text: string }

function describe(s: Searched): string {
  if (s.mode === 'report') return `אירוע מספר ${s.text}`
  if (s.mode === 'id') return `דוח עם המזהה ${s.text}`
  return `אות קריאה ${s.text}`
}

function hitsLabel(n: number): string {
  if (n === 0) return 'ללא פגיעות'
  return n === 1 ? 'פגיעה אחת' : `${n} פגיעות`
}

export function LegacyReportArchive({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('callsignList')
  const [id, setId] = useState('')
  const [reportNo, setReportNo] = useState('')
  const [callSign, setCallSign] = useState('')
  const [dateIso, setDateIso] = useState('')
  const [fieldError, setFieldError] = useState<{ field: 'value' | 'date'; text: string } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [found, setFound] = useState<LegacyReport[] | null>(null)
  const [searched, setSearched] = useState<Searched | null>(null)
  const [selectedFk, setSelectedFk] = useState<string | null>(null)

  const reportRef = useRef<HTMLDivElement>(null)

  const selected = found?.find((r) => r.fk === selectedFk) ?? null
  // A list whenever there is a choice to make; a call-sign search always lists.
  const showList = Boolean(found && (found.length > 1 || searched?.mode === 'callsignList'))

  useEffect(() => {
    if (selectedFk && found && found.length > 1) reportRef.current?.scrollIntoView({ block: 'start' })
  }, [selectedFk, found])

  function switchMode(m: Mode) {
    setMode(m)
    setFound(null)
    setSearched(null)
    setSelectedFk(null)
    setFieldError(null)
    setLoadError('')
  }

  async function run() {
    setFieldError(null)
    setLoadError('')

    const cs = callSign.trim()
    let lookup: LegacyLookup | null = null
    let text = ''
    if (mode === 'callsignList' || mode === 'callsign') {
      if (!cs) return setFieldError({ field: 'value', text: 'יש להזין אות קריאה' })
      if (mode === 'callsign') {
        if (!dateIso) return setFieldError({ field: 'date', text: 'יש לבחור תאריך' })
        lookup = { kind: 'callsign', callSign: cs, date: toDisplayDate(dateIso) }
      }
      text = cs
    } else if (mode === 'report') {
      if (!reportNo.trim()) return setFieldError({ field: 'value', text: 'יש להזין מספר אירוע' })
      lookup = { kind: 'report', eventNumber: reportNo }
      text = reportNo.trim()
    } else {
      if (!id.trim()) return setFieldError({ field: 'value', text: 'יש להזין מזהה דוח' })
      lookup = { kind: 'id', id }
      text = id.trim()
    }

    setLoading(true)
    try {
      const results = lookup ? await searchLegacyReports(lookup) : await searchByCallSign(cs)
      setFound(results)
      setSearched({ mode, text: mode === 'callsign' ? `${text} בתאריך ${isoDateToDisplay(dateIso)}` : text })
      setSelectedFk(results.length === 1 ? results[0].fk : null)
    } catch {
      setFound(null)
      setLoadError('טעינת הדוחות נכשלה. בדקו את החיבור ונסו שוב.')
    } finally {
      setLoading(false)
    }
  }

  const valueError = fieldError?.field === 'value' ? fieldError.text : undefined
  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') void run()
  }

  return (
    <div className="stack-4 legacy-archive">
      <div>
        <Button variant="ghost" onClick={onBack} icon={<ChevronRight size={20} strokeWidth={1.75} />}>
          דוחות
        </Button>
      </div>

      <div className="page-head">
        <div>
          <h1 className="t-title">ארכיון דוחות אירוע</h1>
          <p className="t-caption text-muted">שחזור דוח אירוע מהמערכת הישנה מתוך גיבוי הנתונים</p>
        </div>
      </div>

      <section className="card legacy-archive__search" aria-label="חיפוש בארכיון">
        <div className="legacy-archive__modes">
          <p className="t-label text-secondary" aria-hidden="true">
            חיפוש לפי
          </p>
          <FilterChips options={MODES} value={mode} onChange={switchMode} label="חיפוש לפי" />
        </div>

        <div className={['legacy-archive__fields', mode === 'callsign' ? 'legacy-archive__fields--date' : ''].join(' ')}>
          {mode === 'callsignList' || mode === 'callsign' ? (
            <TextField
              key="callsign"
              label="אות קריאה"
              value={callSign}
              onChange={(e) => setCallSign(e.target.value)}
              onKeyDown={onEnter}
              placeholder="למשל: 000"
              inputMode="numeric"
              autoComplete="off"
              numeric
              error={valueError}
            />
          ) : mode === 'report' ? (
            <TextField
              key="report"
              label="מספר אירוע"
              value={reportNo}
              onChange={(e) => setReportNo(e.target.value)}
              onKeyDown={onEnter}
              placeholder="למשל: 8717"
              inputMode="numeric"
              autoComplete="off"
              numeric
              error={valueError}
            />
          ) : (
            <TextField
              key="id"
              label="מזהה דוח"
              value={id}
              onChange={(e) => setId(e.target.value)}
              onKeyDown={onEnter}
              autoComplete="off"
              numeric
              isolate
              error={valueError}
            />
          )}
          {mode === 'callsign' ? (
            <DateField
              label="תאריך האירוע"
              value={dateIso}
              onChange={setDateIso}
              error={fieldError?.field === 'date' ? fieldError.text : undefined}
            />
          ) : null}
          <Button
            onClick={() => void run()}
            loading={loading}
            loadingLabel="מחפשים…"
            icon={<Search size={20} strokeWidth={1.75} />}
            className="legacy-archive__submit"
          >
            חיפוש
          </Button>
        </div>
      </section>

      {loadError ? (
        <p className="t-body text-danger" role="alert">
          {loadError}
        </p>
      ) : null}

      {!found && !loadError ? (
        <EmptyState
          icon={<Archive size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="חיפוש דוח בארכיון"
          caption="הזינו אות קריאה כדי לראות את כל האירועים שלה, או חפשו לפי מספר אירוע או מזהה דוח."
        />
      ) : null}

      {found && found.length === 0 && searched ? (
        <EmptyState
          icon={<FileSearch size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="לא נמצאו דוחות"
          caption={`אין בארכיון ${describe(searched)}. בדקו את הערך ונסו שוב.`}
        />
      ) : null}

      {showList && found && found.length > 0 && searched ? (
        <section className="legacy-archive__results" aria-label="תוצאות החיפוש">
          <p className="t-caption text-muted" aria-live="polite">
            {found.length === 1 ? 'אירוע אחד' : `${found.length} אירועים`} · {describe(searched)} · לפי תאריך
          </p>
          <ul className="legacy-archive__rows">
            {found.map((r) => {
              const current = r.fk === selectedFk
              return (
                <li key={r.fk}>
                  <button
                    type="button"
                    className="legacy-archive__row"
                    data-archive-row
                    aria-current={current ? 'true' : undefined}
                    onClick={() => setSelectedFk(r.fk)}
                  >
                    <span className="legacy-archive__row-event t-body-strong">
                      אירוע <span className="mono">{r.eventNumber || '—'}</span>
                    </span>
                    <span className="legacy-archive__row-date t-num">{isoDateToDisplay(r.eventDate) || '—'}</span>
                    <span className="legacy-archive__row-type t-body">{r.header.eventType || '—'}</span>
                    <span className="legacy-archive__row-hits t-caption">{hitsLabel(r.hits.length)}</span>
                    <ChevronLeft className="legacy-archive__row-go" size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {selected ? (
        <div className="legacy-archive__report stack-3" ref={reportRef}>
          <div className="legacy-archive__report-actions">
            <Button variant="secondary" onClick={() => window.print()} icon={<Printer size={20} strokeWidth={1.75} />}>
              הדפסה / PDF
            </Button>
          </div>
          <LegacyEventReport report={selected} />
          {createPortal(
            <div className="legacy-print-root">
              <LegacyEventReport report={selected} />
            </div>,
            document.body,
          )}
        </div>
      ) : null}
    </div>
  )
}
