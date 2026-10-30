// Faithful replica of the old-site ShowEventReport.aspx document, from archived data.
// Ported from the offline exporter (yp_report.py). Rendered as a printable document
// (dir="rtl"); the surrounding app chrome is hidden on print.

import { useMemo } from 'react'
import {
  EQUIPMENT,
  HIT_TYPES,
  maskPid,
  toDisplayDate,
  type LegacyReport,
} from '../../lib/reports/legacyReport'
import './LegacyEventReport.css'

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <>
      <td className="lgr-lbl">{label}</td>
      <td className="lgr-val">{value || '—'}</td>
    </>
  )
}

function Box({ text }: { text: string }) {
  return <div className="lgr-box">{text || ' '}</div>
}

function yn(v: boolean): string {
  return v ? 'כן' : 'לא'
}

export function LegacyEventReport({ report }: { report: LegacyReport }) {
  const h = report.header
  const hitSet = useMemo(() => new Set(report.hits.map(([c, o]) => `${c}:${o}`)), [report.hits])
  const plate = (i: number) => report.cars.find((c) => c.index === i)?.plate ?? ''
  const noEquipment =
    !EQUIPMENT.some((e) => report.equipment[e.key]) && !h.otherEquipment.trim()

  return (
    <div className="lgr" dir="rtl" lang="he">
      <div className="lgr-hdr">
        יחפ"צ — היחידה הארצית לפינוי צירים
        <br />
        <span className="lgr-hdr-sub">דוח ארוע</span>
      </div>

      <table className="lgr-info">
        <tbody>
          <tr>
            <Cell label="שם המתנדב" value={h.volName} />
            <Cell label="אות קריאה" value={report.callSign} />
          </tr>
          <tr>
            <Cell label="מספר ת.ז." value={maskPid(h.pid)} />
            <Cell label="מספר רכב" value={h.carNumber} />
          </tr>
          <tr>
            <Cell label="תאריך הארוע" value={toDisplayDate(report.eventDate)} />
            <Cell label="מספר ארוע" value={report.eventNumber} />
          </tr>
          <tr>
            <Cell label="שלוחה" value={h.branch} />
            <Cell label="קצין מאשר" value={h.approvingOfficer} />
          </tr>
          <tr>
            <Cell label="אות קריאה ניידת בארוע" value={h.policeCallSign} />
            <Cell label="מס' כביש" value={h.roadNumber} />
          </tr>
          <tr>
            <Cell label="מיקום" value={h.location} />
            <Cell label="מתאם פעילות" value={h.coordinator} />
          </tr>
          <tr>
            <Cell label="סוג הארוע" value={h.eventType} />
            <Cell label="האם במסגרת משמרת" value={yn(h.inShift)} />
          </tr>
          <tr>
            <Cell label="שעת התחלה" value={h.startHour} />
            <Cell label="שעת סיום" value={h.endHour} />
          </tr>
          <tr>
            <Cell label="נסיעה בשוליים" value={yn(h.shool)} />
            <Cell label="נסיעה מבצעית" value={yn(h.siren)} />
          </tr>
          <tr>
            <Cell label="ק. מאשר נסיעה מבצעית" value={h.specialApprovingOfficer} />
            <td className="lgr-lbl">&nbsp;</td>
            <td>&nbsp;</td>
          </tr>
          <tr>
            <td className="lgr-lbl lgr-blue">שם השוטר</td>
            <td className="lgr-val">{h.officerName || '—'}</td>
            <td className="lgr-lbl lgr-red">ק"מ התחלה</td>
            <td className="lgr-val">{h.startKM || '—'}</td>
          </tr>
          <tr>
            <td className="lgr-lbl lgr-red">ק"מ סיום</td>
            <td className="lgr-val">{h.endKM || '—'}</td>
            <td className="lgr-lbl">סה"כ ק"מ</td>
            <td className="lgr-val">{h.totalKM || '—'}</td>
          </tr>
        </tbody>
      </table>

      <div className="lgr-sec lgr-red">מסלול הנסיעה</div>
      <Box text={h.route} />
      <div className="lgr-sec lgr-red">אופן הטיפול ופעולות שבוצעו</div>
      <Box text={h.actionsTaken} />

      <table className="lgr-cars">
        <tbody>
          <tr>
            <td>סוג וצבע רכב 1</td>
            <td>סוג וצבע רכב 2</td>
            <td>סוג וצבע רכב 3</td>
            <td>סוג וצבע רכב 4</td>
          </tr>
          <tr>
            <td className="lgr-val">{plate(1) || '—'}</td>
            <td className="lgr-val">{plate(2) || '—'}</td>
            <td className="lgr-val">{plate(3) || '—'}</td>
            <td className="lgr-val">{plate(4) || '—'}</td>
          </tr>
        </tbody>
      </table>

      <div className="lgr-sec">מצב כלי הרכב שטופלו</div>
      <table className="lgr-grid">
        <thead>
          <tr>
            <th>מיקום הפגיעה</th>
            <th>רכב 1</th>
            <th>רכב 2</th>
            <th>רכב 3</th>
            <th>רכב 4</th>
          </tr>
        </thead>
        <tbody>
          {HIT_TYPES.map(({ order, label }) => (
            <tr key={order}>
              <td className="lgr-hit">{label}</td>
              {[1, 2, 3, 4].map((car) => (
                <td key={car} className="lgr-c">
                  <input type="checkbox" disabled checked={hitSet.has(`${car}:${order}`)} readOnly />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="lgr-sec">ציוד שהיה בו שימוש:</div>
      <table className="lgr-eq">
        <tbody>
          <tr>
            {EQUIPMENT.map((e) => (
              <td key={e.key}>
                <input type="checkbox" disabled checked={report.equipment[e.key]} readOnly />{' '}
                <label>{e.label}</label>
              </td>
            ))}
            <td>
              <input type="checkbox" disabled checked={noEquipment} readOnly />{' '}
              <label>לא השתמשתי בציוד כלשהו</label>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="lgr-eq lgr-other">
        אחר: <span className="lgr-val">{h.otherEquipment || '—'}</span>
      </div>

      <div className="lgr-sec">תקלות ופערים</div>
      <Box text={h.problems} />
      <div className="lgr-eq">
        דווח ל: <span className="lgr-val">{h.problemsReportedTo || '—'}</span>
      </div>

      <div className="lgr-note">שוחזר מגיבוי מקומי · fld_EventFK={report.fk}</div>
    </div>
  )
}
