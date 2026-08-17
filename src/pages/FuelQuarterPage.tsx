import { BarChart3, ChevronRight, Fuel } from 'lucide-react'
import { useState } from 'react'
import { FuelQuarterWorkbook } from '../components/admin/FuelQuarterWorkbook'
import { FuelUsagePanel } from '../components/admin/FuelUsagePanel'
import { Button } from '../components/ui/Button'

type FuelPane = 'chooser' | 'allocate' | 'usage'

export function FuelQuarterPage() {
  const [pane, setPane] = useState<FuelPane>('chooser')

  if (pane === 'allocate') {
    return (
      <div className="stack-4">
        <HubBack onBack={() => setPane('chooser')} />
        <FuelQuarterWorkbook />
      </div>
    )
  }

  if (pane === 'usage') {
    return (
      <div className="stack-4">
        <HubBack onBack={() => setPane('chooser')} />
        <FuelUsagePanel />
      </div>
    )
  }

  return (
    <div className="fuel-hub">
      <h1 className="t-title">ניהול דלק</h1>
      <p className="t-display fuel-hub__prompt">אני רוצה:</p>

      <ul className="report-catalog">
        <li>
          <button
            type="button"
            className="card report-catalog__card fuel-hub__card"
            onClick={() => setPane('allocate')}
          >
            <Fuel size={24} strokeWidth={1.75} aria-hidden="true" />
            <span className="t-section">לנהל ולהקצות כרטיסי דלק לרבעון</span>
            <span className="t-body text-secondary">
              ניהול חלוקת כרטיסי דלק לפי רבעון.
              <br />
              יתרות עוברות באופן אוטומטי לרבעון הבא.
              <br />
              ניתן להעביר יתרה שלילית או חיובית.
              <br />
              נספרים רק אירועים שתועדו במלואם.
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="card report-catalog__card fuel-hub__card"
            onClick={() => setPane('usage')}
          >
            <BarChart3 size={24} strokeWidth={1.75} aria-hidden="true" />
            <span className="t-section">לראות / לייצא שימוש בדלק</span>
            <span className="t-body text-secondary">
              ק״מ, אירועים וליטרים לפי תקופה.
              <br />
              מוצגים כל האירועים עם ק״מ, גם אם תועדו חלקית.
            </span>
          </button>
        </li>
      </ul>
    </div>
  )
}

function HubBack({ onBack }: { onBack: () => void }) {
  return (
    <div className="detail__back">
      <Button
        variant="ghost"
        onClick={onBack}
        icon={<ChevronRight size={20} strokeWidth={1.75} />}
      >
        כרטיסי דלק
      </Button>
    </div>
  )
}
