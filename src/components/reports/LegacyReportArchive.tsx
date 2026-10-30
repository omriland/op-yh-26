// In-app "Event report archive" — the old-site ShowEventReport, reconstructed from
// the archived YP backup. Lives inside the Reports section. Lookup by report id,
// event number, or call sign (+ optional date), then renders the printable replica.
//
// Data comes from src/lib/reports/legacyReport.ts (fixture in the prototype; Supabase
// `legacy.*` in production) — this view never talks to a backend directly.

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, FileSearch, Printer, Search } from 'lucide-react'
import { Button } from '../ui/Button'
import { DateField } from '../ui/DateField'
import { EmptyState } from '../ui/EmptyState'
import { LegacyEventReport } from './LegacyEventReport'
import './LegacyEventReport.css'
import {
  searchByCallSign,
  searchLegacyReports,
  toDisplayDate,
  type LegacyLookup,
  type LegacyReport,
} from '../../lib/reports/legacyReport'

type Mode = 'id' | 'report' | 'callsign' | 'callsignList'

const MODES: ReadonlyArray<[Mode, string]> = [
  ['callsignList', 'לפי אות קריאה'],
  ['callsign', 'אות קריאה + תאריך'],
  ['report', 'לפי מספר אירוע'],
  ['id', 'לפי מזהה דוח'],
]

export function LegacyReportArchive({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('callsignList')
  const [id, setId] = useState('')
  const [reportNo, setReportNo] = useState('')
  const [callSign, setCallSign] = useState('')
  const [dateIso, setDateIso] = useState('')
  const [results, setResults] = useState<LegacyReport[] | null>(null)
  const [list, setList] = useState<LegacyReport[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const primaryRef = useRef<HTMLInputElement>(null)

  // Focus the active input whenever the search type changes.
  useEffect(() => {
    primaryRef.current?.focus()
  }, [mode])

  function switchMode(m: Mode) {
    setMode(m)
    setResults(null)
    setList(null)
    setError('')
  }

  async function run() {
    setError('')
    setList(null)

    let lookup: LegacyLookup | null = null
    if (mode === 'callsignList') {
      if (!callSign.trim()) return setError('הזן אות קריאה')
    } else if (mode === 'id') {
      if (!id.trim()) return setError('הזן מזהה דוח')
      lookup = { kind: 'id', id }
    } else if (mode === 'report') {
      if (!reportNo.trim()) return setError('הזן מספר אירוע')
      lookup = { kind: 'report', eventNumber: reportNo }
    } else {
      if (!callSign.trim() || !dateIso) return setError('הזן אות קריאה ובחר תאריך')
      lookup = { kind: 'callsign', callSign, date: toDisplayDate(dateIso) }
    }

    setLoading(true)
    try {
      if (mode === 'callsignList') {
        const found = await searchByCallSign(callSign)
        setResults(null)
        setList(found)
        if (found.length === 0) setError('לא נמצאו אירועים לאות קריאה זו')
        return
      }
      const found = await searchLegacyReports(lookup!)
      setResults(found)
      if (found.length === 0) setError('לא נמצא אירוע תואם')
    } catch {
      setError('שגיאה בטעינת הדוח. נסו שוב.')
    } finally {
      setLoading(false)
    }
  }

  const callSignField = (
    <label className="search-field">
      <Search size={20} strokeWidth={1.75} aria-hidden="true" />
      <span className="visually-hidden">אות קריאה</span>
      <input
        ref={primaryRef}
        type="search"
        inputMode="numeric"
        value={callSign}
        onChange={(e) => setCallSign(e.target.value)}
        placeholder="אות קריאה, למשל 327"
        onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
      />
    </label>
  )

  return (
    <div className="stack-4">
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

      {/* search-type selector */}
      <div className="admin-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
        {MODES.map(([m, label]) => (
          <Button key={m} variant={mode === m ? 'primary' : 'secondary'} onClick={() => switchMode(m)}>
            {label}
          </Button>
        ))}
      </div>

      {/* inputs for the active mode */}
      <div className="admin-toolbar" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {mode === 'id' && (
          <label className="search-field">
            <Search size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="visually-hidden">מזהה דוח</span>
            <input ref={primaryRef} type="search" value={id} onChange={(e) => setId(e.target.value)}
              placeholder="מזהה דוח (fld_EventFK)" onKeyDown={(e) => { if (e.key === 'Enter') void run() }} />
          </label>
        )}
        {mode === 'report' && (
          <label className="search-field">
            <Search size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="visually-hidden">מספר אירוע</span>
            <input ref={primaryRef} type="search" inputMode="numeric" value={reportNo}
              onChange={(e) => setReportNo(e.target.value)} placeholder="מספר אירוע, למשל 8717"
              onKeyDown={(e) => { if (e.key === 'Enter') void run() }} />
          </label>
        )}
        {mode === 'callsign' && (
          <>
            {callSignField}
            <div style={{ minWidth: 200 }}>
              <DateField label="תאריך האירוע" value={dateIso} onChange={setDateIso} />
            </div>
          </>
        )}
        {mode === 'callsignList' && callSignField}
        <Button onClick={() => void run()} loading={loading} loadingLabel="מחפש…" icon={<FileSearch size={20} strokeWidth={1.75} />}>
          חפש
        </Button>
      </div>

      {error && <p className="t-body" style={{ color: 'var(--danger, #b00)' }}>{error}</p>}

      {/* call-sign results: events sorted by date */}
      {list && list.length > 0 && (
        <div className="stack-2">
          <p className="t-caption text-muted">
            {list.length} אירועים לאות קריאה {callSign.trim()} (ממוינים לפי תאריך)
          </p>
          <ul className="stack-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {list.map((r) => (
              <li key={r.fk}>
                <button type="button" className="legacy-archive-row" onClick={() => setResults([r])}>
                  <span className="t-body-strong">{toDisplayDate(r.eventDate)}</span>
                  <span className="t-body">אירוע {r.eventNumber}</span>
                  <span className="t-body">{r.header.eventType || '—'}</span>
                  <span className="t-caption text-muted">{r.hits.length} פגיעות</span>
                  <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" style={{ marginInlineStart: 'auto' }} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {results && results.length === 0 && (
        <EmptyState icon={<FileSearch size={40} strokeWidth={1.75} aria-hidden="true" />} title="לא נמצא אירוע תואם" />
      )}

      {results && results.length > 1 && (
        <p className="t-caption text-muted">נמצאו {results.length} אירועים תואמים</p>
      )}

      {results?.map((r) => (
        <div key={r.fk} className="stack-2">
          <div>
            <Button variant="secondary" onClick={() => window.print()} icon={<Printer size={20} strokeWidth={1.75} />}>
              הדפסה / PDF
            </Button>
          </div>
          <LegacyEventReport report={r} />
        </div>
      ))}
    </div>
  )
}
