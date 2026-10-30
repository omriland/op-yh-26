// DEV-ONLY harness to view the legacy event-report feature in isolation, with no
// auth and no backend. Served at /legacy-report-dev.html by Vite in dev. Not part
// of the app bundle. Lets us see "where and how" the archive report looks/works
// before wiring it into the (auth-gated) Reports section against Supabase.

import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LegacyEventReport } from '../components/reports/LegacyEventReport'
import { DateField } from '../components/ui/DateField'
import {
  __setLegacyFixtureProvider,
  allLegacyReports,
  searchByCallSign,
  searchLegacyReports,
  toDisplayDate,
  type LegacyLookup,
  type LegacyReport,
} from '../lib/reports/legacyReport'
import fixture from '../lib/reports/__fixtures__/legacyReports.sample.json'
import '../index.css'
import '../components/reports/LegacyEventReport.css'

// Dev-only: feed the local sample dataset into the data layer.
__setLegacyFixtureProvider(async () => fixture as unknown as LegacyReport[])

type Mode = 'id' | 'report' | 'callsign' | 'callsignList'

const MODES: ReadonlyArray<[Mode, string]> = [
  ['id', 'לפי מזהה דוח'],
  ['report', 'לפי מספר אירוע'],
  ['callsign', 'לפי אות קריאה + תאריך'],
  ['callsignList', 'לפי אות קריאה'],
]

function Harness() {
  const [mode, setMode] = useState<Mode>('id')
  const [id, setId] = useState('')
  const [reportNo, setReportNo] = useState('')
  const [callSign, setCallSign] = useState('')
  const [dateIso, setDateIso] = useState('')
  const [results, setResults] = useState<LegacyReport[] | null>(null)
  const [list, setList] = useState<LegacyReport[] | null>(null)
  const [error, setError] = useState('')
  const [sample, setSample] = useState<LegacyReport[]>([])

  const primaryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    allLegacyReports().then(setSample).catch(() => setSample([]))
  }, [])

  // Requirement 2: focus the input whenever the search type changes.
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
    if (mode === 'callsignList') {
      if (!callSign.trim()) return setError('הזן אות קריאה')
      const found = await searchByCallSign(callSign)
      setResults(null)
      setList(found)
      if (found.length === 0) setError('לא נמצאו אירועים לאות קריאה זו במאגר הדגימה')
      return
    }
    let lookup: LegacyLookup
    if (mode === 'id') {
      if (!id.trim()) return setError('הזן מזהה דוח (fld_EventFK)')
      lookup = { kind: 'id', id }
    } else if (mode === 'report') {
      if (!reportNo.trim()) return setError('הזן מספר אירוע')
      lookup = { kind: 'report', eventNumber: reportNo }
    } else {
      if (!callSign.trim() || !dateIso) return setError('הזן אות קריאה ובחר תאריך')
      lookup = { kind: 'callsign', callSign, date: toDisplayDate(dateIso) }
    }
    const found = await searchLegacyReports(lookup)
    setResults(found)
    if (found.length === 0) setError('לא נמצא אירוע תואם במאגר הדגימה')
  }

  return (
    <div dir="rtl" style={{ fontFamily: 'Arial, sans-serif', padding: 24, background: '#eef0f4', minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ background: '#fffae6', border: '1px solid #e6d98a', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          ⚙️ מסך פיתוח בלבד (ללא התחברות) — תצוגה מקדימה של "ארכיון דוחות אירוע". הנתונים: מאגר דגימה מקומי.
        </div>
        <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>ארכיון דוחות אירוע (מערכת ישנה)</h1>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {MODES.map(([m, label]) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                border: mode === m ? '2px solid #4a3c8c' : '1px solid #bbb',
                background: mode === m ? '#4a3c8c' : '#fff', color: mode === m ? '#fff' : '#333',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 6, flexWrap: 'wrap' }}>
          {mode === 'id' && (
            <input ref={primaryRef} value={id} onChange={(e) => setId(e.target.value)}
              placeholder="fld_EventFK, למשל 80434" autoComplete="off" style={inp} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} />
          )}
          {mode === 'report' && (
            <input ref={primaryRef} value={reportNo} onChange={(e) => setReportNo(e.target.value)}
              placeholder="מספר אירוע, למשל 8717" autoComplete="off" style={inp} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} />
          )}
          {mode === 'callsign' && (
            <>
              <input ref={primaryRef} value={callSign} onChange={(e) => setCallSign(e.target.value)}
                placeholder="אות קריאה, למשל 327" autoComplete="off" style={inp} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} />
              <div style={{ minWidth: 200 }}>
                <DateField label="תאריך האירוע" value={dateIso} onChange={setDateIso} />
              </div>
            </>
          )}
          {mode === 'callsignList' && (
            <input ref={primaryRef} value={callSign} onChange={(e) => setCallSign(e.target.value)}
              placeholder="אות קריאה, למשל 327" autoComplete="off" style={inp} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} />
          )}
          <button onClick={() => void run()} style={{ ...btn, background: '#4a3c8c', color: '#fff' }}>חפש</button>
        </div>

        {error && <div style={{ color: '#b00', marginBottom: 10 }}>{error}</div>}

        <details style={{ marginBottom: 16, fontSize: 13, color: '#555' }}>
          <summary style={{ cursor: 'pointer' }}>מאגר דגימה ({sample.length} אירועים) — לחץ לרשימה</summary>
          <ul style={{ margin: '8px 0', lineHeight: 1.7 }}>
            {sample.map((r) => (
              <li key={r.fk}>
                <button onClick={() => { switchMode('id'); setId(r.fk); setResults([r]) }} style={linkBtn}>
                  fk {r.fk}
                </button>
                {' · '}אירוע {r.eventNumber} · א.ק {r.callSign} · {toDisplayDate(r.eventDate)} · {r.header.eventType || '—'} · פגיעות {r.hits.length}
              </li>
            ))}
          </ul>
        </details>

        {/* Call-sign list: events for that call sign, sorted by date, click to open. */}
        {list && list.length > 0 && (
          <div style={{ marginBottom: 20, background: '#fff', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: '#f3f1fa', fontWeight: 'bold', fontSize: 14 }}>
              {list.length} אירועים לאות קריאה {callSign.trim()} (ממוינים לפי תאריך)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'right', color: '#666', fontSize: 12 }}>
                  <th style={th}>תאריך</th>
                  <th style={th}>מספר אירוע</th>
                  <th style={th}>סוג</th>
                  <th style={th}>פגיעות</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.fk} style={{ borderTop: '1px solid #eee' }}>
                    <td style={td}>{toDisplayDate(r.eventDate)}</td>
                    <td style={td}>{r.eventNumber}</td>
                    <td style={td}>{r.header.eventType || '—'}</td>
                    <td style={td}>{r.hits.length}</td>
                    <td style={td}>
                      <button onClick={() => setResults([r])} style={{ ...btn, padding: '4px 10px', background: '#4a3c8c', color: '#fff' }}>
                        פתח דוח
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {results && results.length > 1 && (
          <div style={{ marginBottom: 10, fontSize: 13 }}>נמצאו {results.length} אירועים תואמים:</div>
        )}

        {results?.map((r) => (
          <div key={r.fk} style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 6 }}>
              <button onClick={() => window.print()} style={btn}>🖨️ הדפסה / PDF</button>
            </div>
            <LegacyEventReport report={r} />
          </div>
        ))}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: '1px solid #bbb', fontSize: 14, minWidth: 180, height: 38, boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '7px 14px', borderRadius: 6, border: '1px solid #bbb', background: '#fff', cursor: 'pointer', fontSize: 14 }
const linkBtn: React.CSSProperties = { border: 'none', background: 'none', color: '#4a3c8c', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }
const th: React.CSSProperties = { padding: '6px 12px', fontWeight: 'normal' }
const td: React.CSSProperties = { padding: '7px 12px', textAlign: 'right' }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
