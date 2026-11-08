import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import {
  fetchDuplicateClusters,
  type DuplicateCluster,
  type DuplicateMember,
} from '../lib/duplicateEventsReport'
import { formatDate, formatTime, monoClass } from '../lib/format'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { EventTypeLabel } from '../components/events/EventTypeLabel'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { isoSortValue } from '../lib/tableSort'

type DuplicateEventsPageProps = {
  asTable: boolean
  onOpen: (eventId: string) => void
}

export function DuplicateEventsPage({ asTable, onOpen }: DuplicateEventsPageProps) {
  const [clusters, setClusters] = useState<DuplicateCluster[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setClusters(null)
    setFailed(false)

    fetchDuplicateClusters()
      .then((next) => {
        if (active) setClusters(next)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  if (failed) {
    return (
      <EmptyState
        icon={<Copy size={40} strokeWidth={1.75} aria-hidden="true" />}
        title="טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב."
        action={
          <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
            רענון
          </Button>
        }
      />
    )
  }

  if (!clusters) {
    return asTable ? <EventRowsSkeleton /> : <EventListSkeleton />
  }

  if (clusters.length === 0) {
    return (
      <EmptyState
        icon={<Copy size={40} strokeWidth={1.75} aria-hidden="true" />}
        title="אין אירועים כפולים להצגה"
      />
    )
  }

  return (
    <div className="stack-4">
      {clusters.map((cluster) => (
        <section key={cluster.id} className="stack-3">
          <div className="row-between">
            <h2 className="group-head">{formatDate(cluster.event_date)}</h2>
            <span className="t-caption text-muted">{cluster.sizeLabel}</span>
          </div>
          <DuplicateTable members={cluster.members} asTable={asTable} onOpen={onOpen} />
        </section>
      ))}
    </div>
  )
}

function DuplicateCard({
  member,
  onOpen,
}: {
  member: DuplicateMember
  onOpen: (eventId: string) => void
}) {
  const responder = [member.full_name, member.callsign].filter(Boolean).join(' · ')
  const place = [member.road_name, member.location].filter(Boolean).join(' · ')

  return (
    <li className="card">
      <button type="button" className="event-card" onClick={() => onOpen(member.event_id)}>
        <span className="event-card__top">
          <EventTypeLabel
            event={{
              event_type: member.event_type_name ? { name: member.event_type_name } : null,
              is_cancelled: member.is_cancelled,
            }}
            as="section"
            fallback="אירוע"
          />
          <span className="mono t-caption">{formatTime(member.started_at)}</span>
        </span>
        <span className="t-body">{responder || '—'}</span>
        <span className="t-body text-secondary">{place || '—'}</span>
        <span className="event-card__meta">
          <span className="mono">{formatDate(member.event_date)}</span>
          {member.police_event_id ? (
            <span>
              · אירוע{' '}
              <span className={monoClass(member.police_event_id)}>{member.police_event_id}</span>
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}

function memberResponder(member: DuplicateMember): string {
  return [member.full_name, member.callsign].filter(Boolean).join(' · ')
}

function memberPlace(member: DuplicateMember): string {
  return [member.road_name, member.location].filter(Boolean).join(' · ')
}

const DUPLICATE_COLUMNS: DataTableColumn<DuplicateMember>[] = [
  {
    id: 'time',
    header: 'שעה',
    className: 'num mono',
    sortValue: (member) => isoSortValue(member.started_at),
    cell: (member) => formatTime(member.started_at) ?? '—',
  },
  {
    id: 'responder',
    header: 'מתנדב',
    sortValue: memberResponder,
    cell: (member) => memberResponder(member) || '—',
  },
  {
    id: 'type',
    header: 'סוג אירוע',
    sortValue: (member) => member.event_type_name,
    cell: (member) => (
      <EventTypeLabel
        event={{
          event_type: member.event_type_name ? { name: member.event_type_name } : null,
          is_cancelled: member.is_cancelled,
        }}
      />
    ),
  },
  {
    id: 'place',
    header: 'כביש / מיקום',
    className: 'truncate',
    sortValue: memberPlace,
    cell: (member) => memberPlace(member) || '—',
  },
  {
    id: 'police',
    header: 'מספר אירוע',
    className: (member) => `num ${monoClass(member.police_event_id)}`,
    sortValue: (member) => member.police_event_id,
    cell: (member) => member.police_event_id ?? '—',
  },
]

function DuplicateTable({
  members,
  asTable,
  onOpen,
}: {
  members: DuplicateMember[]
  asTable: boolean
  onOpen: (eventId: string) => void
}) {
  return (
    <DataTable
      rows={members}
      columns={DUPLICATE_COLUMNS}
      rowKey={(member) => member.event_id}
      asTable={asTable}
      renderCard={(member) => <DuplicateCard member={member} onOpen={onOpen} />}
      defaultSort={{ columnId: 'time', direction: 'asc' }}
      onRowClick={(member) => onOpen(member.event_id)}
      rowLabel={(member) => `פתיחת אירוע ${member.police_event_id ?? memberResponder(member)}`}
    />
  )
}
