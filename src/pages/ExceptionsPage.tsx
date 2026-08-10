import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { EmptyState } from '../components/ui/EmptyState'
import {
  ExceptionsSegmentBar,
  type ExceptionsSegment,
} from '../components/exceptions/ExceptionsSegmentBar'
import { KmExceptionsPage } from './KmExceptionsPage'

type ExceptionsPageProps = {
  asTable: boolean
  onOpenEvent: (eventId: string) => void
}

export function ExceptionsPage({ asTable, onOpenEvent }: ExceptionsPageProps) {
  const [segment, setSegment] = useState<ExceptionsSegment>('km')

  return (
    <div className="stack-4">
      <div className="page-head">
        <h1 className="t-title">חריגים</h1>
      </div>
      <ExceptionsSegmentBar segment={segment} onChange={setSegment} />
      {segment === 'km' ? (
        <KmExceptionsPage asTable={asTable} onOpen={onOpenEvent} />
      ) : (
        <EmptyState
          icon={<ClipboardList size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="בקרוב"
        />
      )}
    </div>
  )
}
