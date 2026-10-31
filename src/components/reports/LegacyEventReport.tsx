// The old-site ShowEventReport document, from archived data, typeset as a record:
// ledger rows, ruled sections and a damage table (06-components.md). Same fields as
// the original form; the ID number arrives masked and is masked again here.
// Printing shows this document only (see LegacyEventReport.css).

import { useMemo, type ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import { Ledger, LedgerRow } from '../ui/Ledger'
import { isoDateToDisplay } from '../../lib/format'
import { EQUIPMENT, HIT_TYPES, maskPid, type LegacyReport } from '../../lib/reports/legacyReport'
import './LegacyEventReport.css'

const CARS = [1, 2, 3, 4] as const

function yn(v: boolean): string {
  return v ? 'כן' : 'לא'
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="form-section lgr__section">
      <h3 className="form-section__heading">{title}</h3>
      <div className="lgr__section-body">{children}</div>
    </section>
  )
}

function TextBlock({ label, text }: { label: string; text: string }) {
  const empty = !text.trim()
  return (
    <div className="lgr__text-field">
      <p className="t-label text-secondary">{label}</p>
      <p className={['lgr__text', empty ? 'lgr__text--empty' : ''].filter(Boolean).join(' ')}>
        {empty ? '—' : text}
      </p>
    </div>
  )
}

export function LegacyEventReport({ report }: { report: LegacyReport }) {
  const h = report.header
  const hitSet = useMemo(() => new Set(report.hits.map(([c, o]) => `${c}:${o}`)), [report.hits])
  const plate = (i: number) => report.cars.find((c) => c.index === i)?.plate.trim() ?? ''
  // Only cars that were recorded, and only damage locations that were marked.
  const cars = CARS.filter((car) => plate(car) || report.hits.some(([c]) => c === car))
  const hitRows = HIT_TYPES.filter(({ order }) => cars.some((car) => hitSet.has(`${car}:${order}`)))
  const noEquipment = !EQUIPMENT.some((e) => report.equipment[e.key]) && !h.otherEquipment.trim()
  const date = isoDateToDisplay(report.eventDate)
  const pid = maskPid(h.pid)

  return (
    <article className="lgr" dir="rtl" lang="he" aria-label={`דוח אירוע ${report.eventNumber}`}>
      <header className="lgr__head">
        <p className="t-label text-secondary">יחפ״צ — היחידה הארצית לפינוי צירים</p>
        <h2 className="t-section">
          דוח אירוע <span className="mono">{report.eventNumber || '—'}</span>
        </h2>
        <p className="t-caption text-muted">
          {date ? <span className="mono">{date}</span> : 'ללא תאריך'}
          {report.callSign ? (
            <>
              {' · '}אות קריאה <span className="mono">{report.callSign}</span>
            </>
          ) : null}
        </p>
      </header>

      <Section title="פרטי המתנדב">
        <Ledger>
          <LedgerRow label="שם המתנדב" value={h.volName} />
          <LedgerRow label="אות קריאה" value={report.callSign} numeric />
          <LedgerRow label="מספר ת״ז" value={pid} numeric isolate />
          <LedgerRow label="מספר רכב" value={h.carNumber} numeric isolate />
        </Ledger>
      </Section>

      <Section title="פרטי האירוע">
        <Ledger>
          <LedgerRow label="תאריך האירוע" value={date} numeric />
          <LedgerRow label="מספר אירוע" value={report.eventNumber} numeric />
          <LedgerRow label="סוג האירוע" value={h.eventType} />
          <LedgerRow label="שלוחה" value={h.branch} />
          <LedgerRow label="מס׳ כביש" value={h.roadNumber} numeric />
          <LedgerRow label="מיקום" value={h.location} />
          <LedgerRow label="אות קריאה ניידת באירוע" value={h.policeCallSign} numeric />
          <LedgerRow label="שם השוטר" value={h.officerName} />
          <LedgerRow label="מתאם פעילות" value={h.coordinator} />
          <LedgerRow label="קצין מאשר" value={h.approvingOfficer} />
          <LedgerRow label="שעת התחלה" value={h.startHour} numeric />
          <LedgerRow label="שעת סיום" value={h.endHour} numeric />
          <LedgerRow label="במסגרת משמרת" value={yn(h.inShift)} />
        </Ledger>
      </Section>

      <Section title="נסיעה">
        <Ledger>
          <LedgerRow label="נסיעה מבצעית" value={yn(h.siren)} />
          <LedgerRow label="קצין מאשר נסיעה מבצעית" value={h.specialApprovingOfficer} />
          <LedgerRow label="ק״מ התחלה" value={h.startKM} numeric />
          <LedgerRow label="ק״מ סיום" value={h.endKM} numeric />
          <LedgerRow label="סה״כ ק״מ" value={h.totalKM} numeric />
          <LedgerRow label="נסיעה בשוליים" value={yn(h.shool)} />
        </Ledger>
        <TextBlock label="מסלול הנסיעה" text={h.route} />
      </Section>

      <Section title="הטיפול">
        <TextBlock label="אופן הטיפול ופעולות שבוצעו" text={h.actionsTaken} />
      </Section>

      <Section title="כלי הרכב שטופלו">
        {cars.length === 0 ? (
          <p className="t-body text-muted">לא נרשמו כלי רכב.</p>
        ) : (
          <div className="lgr__table-wrap">
            <table className="lgr__table">
              <caption className="visually-hidden">סוג הרכב ומיקומי הפגיעה שסומנו לכל רכב</caption>
              <thead>
                <tr>
                  <th scope="col">מיקום הפגיעה</th>
                  {cars.map((car) => (
                    <th key={car} scope="col">
                      רכב {car}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="lgr__table-types">
                  <th scope="row">סוג וצבע</th>
                  {cars.map((car) => (
                    <td key={car}>{plate(car) || '—'}</td>
                  ))}
                </tr>
                {hitRows.map(({ order, label }) => (
                  <tr key={order}>
                    <th scope="row">{label}</th>
                    {cars.map((car) => (
                      <td key={car} className="lgr__hit">
                        {hitSet.has(`${car}:${order}`) ? (
                          <>
                            <Check size={20} strokeWidth={1.75} aria-hidden="true" />
                            <span className="visually-hidden">פגיעה</span>
                          </>
                        ) : (
                          <span className="visually-hidden">ללא פגיעה</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cars.length > 0 && hitRows.length === 0 ? (
          <p className="t-body text-muted">לא סומנו מיקומי פגיעה.</p>
        ) : null}
      </Section>

      <Section title="ציוד שהיה בו שימוש">
        <ul className="lgr__equipment">
          {EQUIPMENT.map((e) => {
            const on = report.equipment[e.key]
            return (
              <li key={e.key} className={on ? 'is-used' : undefined}>
                {on ? (
                  <Check size={20} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Minus size={20} strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>{e.label}</span>
                <span className="visually-hidden">{on ? 'בשימוש' : 'לא בשימוש'}</span>
              </li>
            )
          })}
          {noEquipment ? (
            <li className="is-used">
              <Check size={20} strokeWidth={1.75} aria-hidden="true" />
              <span>לא נעשה שימוש בציוד</span>
            </li>
          ) : null}
        </ul>
        <Ledger>
          <LedgerRow label="ציוד אחר" value={h.otherEquipment} />
        </Ledger>
      </Section>

      <Section title="תקלות ופערים">
        <TextBlock label="פירוט" text={h.problems} />
        <Ledger>
          <LedgerRow label="דווח ל" value={h.problemsReportedTo} />
        </Ledger>
      </Section>

      <p className="lgr__note t-caption text-muted">
        שוחזר מגיבוי המערכת הישנה · מזהה דוח <span className="mono ltr">{report.fk}</span>
      </p>
    </article>
  )
}
