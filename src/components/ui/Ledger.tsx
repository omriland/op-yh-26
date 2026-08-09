import type { ReactNode } from 'react'
import { monoClass } from '../../lib/format'

/** Ledger rows are definition lists semantically — 08-accessibility.md. */
export function Ledger({ children }: { children: ReactNode }) {
  return <dl className="ledger">{children}</dl>
}

type LedgerRowProps = {
  label: string
  value?: ReactNode
  numeric?: boolean
  isolate?: boolean
}

export function LedgerRow({ label, value, numeric = false, isolate = false }: LedgerRowProps) {
  const isEmpty = value === null || value === undefined || value === ''
  // A "numeric" field can still hold Hebrew (callsigns, patrol numbers) — mono only when it can't.
  const useMono = numeric && (typeof value !== 'string' || monoClass(value) === 'mono')

  return (
    <div className="ledger__row">
      <dt className="ledger__label">{label}</dt>
      <span className="ledger__leader" aria-hidden="true" />
      <dd
        className={[
          'ledger__value',
          useMono ? 'ledger__value--numeric' : '',
          isEmpty ? 'ledger__value--empty' : '',
          isolate && !isEmpty ? 'ltr' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isEmpty ? '—' : value}
      </dd>
    </div>
  )
}
