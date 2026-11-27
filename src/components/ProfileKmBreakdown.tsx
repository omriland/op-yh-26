import { useState } from 'react'
import type { OwnKmBreakdownState } from '../lib/useOwnKmBreakdown'
import { formatNumber } from '../lib/format'
import { FilterChips } from './ui/FilterChips'
import { Ledger, LedgerRow } from './ui/Ledger'
import { Skeleton } from './ui/Skeleton'

type GroupBy = 'quarter' | 'month'

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'quarter', label: 'לפי רבעון' },
  { value: 'month', label: 'לפי חודש' },
]

const NOT_FINAL_NOTE = 'הנתונים מתעדכנים פעמיים ביום. הם אינם סופיים, והחזר הדלק בפועל עשוי להיות שונה.'

export function ProfileKmBreakdown({ state }: { state: OwnKmBreakdownState }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('quarter')

  return (
    <div className="stack-3" style={{ marginBlockStart: 'var(--space-4)' }}>
      {state.status === 'loading' ? (
        <div role="status" aria-busy="true" aria-label="טוען פירוט קילומטרים">
          <Skeleton height={24} />
        </div>
      ) : state.status === 'error' ? (
        <p className="t-body text-muted" role="alert">
          טעינת פירוט הקילומטרים נכשלה. נסו לרענן את הדף.
        </p>
      ) : state.breakdown.months.length === 0 ? (
        <p className="t-body text-muted">עדיין אין ק״מ רשומים</p>
      ) : (
        <>
          <FilterChips
            label="חלוקת קילומטרים"
            options={GROUP_OPTIONS}
            value={groupBy}
            onChange={setGroupBy}
            className="chips--field-height"
          />
          <Ledger>
            {(groupBy === 'quarter' ? state.breakdown.quarters : state.breakdown.months).map(
              (item) => (
                <LedgerRow key={item.key} label={item.label} value={formatNumber(item.km)} numeric />
              ),
            )}
          </Ledger>
        </>
      )}
      <p className="t-caption text-muted">{NOT_FINAL_NOTE}</p>
    </div>
  )
}
