import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { FuelQuarterWorkbook } from '../components/admin/FuelQuarterWorkbook'
import { FuelUsagePanel } from '../components/admin/FuelUsagePanel'
import { ReportCatalogCard } from '../components/reports/ReportCatalogCard'
import { Button } from '../components/ui/Button'
import {
  FUEL_ALLOCATION_INCLUDES,
  FUEL_USAGE_INCLUDES,
} from '../lib/fuelAllocationPolicy'

type FuelPane = 'chooser' | 'allocate' | 'usage'

const FUEL_ALLOCATE_INCLUDES = [
  'ניהול חלוקת כרטיסי דלק לפי רבעון.',
  'יתרות עוברות באופן אוטומטי לרבעון הבא.',
  'ניתן להעביר יתרה שלילית או חיובית.',
  FUEL_ALLOCATION_INCLUDES,
].join('\n')

const FUEL_USAGE_BODY = ['ק״מ, אירועים וליטרים לפי תקופה.', FUEL_USAGE_INCLUDES].join('\n')

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
          <ReportCatalogCard
            id="fuel_allocate"
            title="לנהל ולהקצות כרטיסי דלק לרבעון"
            includes={FUEL_ALLOCATE_INCLUDES}
            index={0}
            variant="default"
            ctaLabel="לפתיחת ניהול ההקצאה"
            onOpen={() => setPane('allocate')}
          />
        </li>
        <li>
          <ReportCatalogCard
            id="fuel_usage"
            title="לראות / לייצא שימוש בדלק"
            includes={FUEL_USAGE_BODY}
            index={1}
            variant="default"
            ctaLabel="לפתיחת דוח השימוש"
            onOpen={() => setPane('usage')}
          />
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
