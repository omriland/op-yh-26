import { highestRoleLabel } from '../../lib/appRoles'
import type { AppRole } from '../../lib/auth'
import { formatDateTime, monoClass } from '../../lib/format'
import type { PersonHit } from '../../lib/smartSearchApi'
import { presenceFromLastActive } from '../../lib/userPresence'
import { volunteerStatusLabel } from '../../lib/volunteerStatus'
import { UserPresenceDot } from '../admin/UserPresenceDot'
import { Avatar } from '../ui/Avatar'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { isoSortValue } from '../../lib/tableSort'

function presenceOf(person: PersonHit) {
  return presenceFromLastActive(person.last_active_at, Date.now(), { active: true, invite_pending: false })
}

function lastActive(person: PersonHit): string {
  return person.last_active_at ? formatDateTime(person.last_active_at) : '—'
}

function RoleChip({ role }: { role: string }) {
  const label = highestRoleLabel([role as AppRole])
  return label ? <span className="tag">{label}</span> : null
}

function personCard(person: PersonHit, onOpen: (userId: string) => void) {
  const presence = presenceOf(person)
  return (
    <button type="button" className="card user-card search-person-card" onClick={() => onOpen(person.id)}>
      <span className="user-card__identity-btn">
        {presence ? <UserPresenceDot status={presence} /> : null}
        <Avatar name={person.full_name} size="lg" />
        <span className="user-card__identity">
          <span className="t-section">{person.full_name}</span>
          <span className="t-caption text-muted">
            או״ק <span className={monoClass(person.callsign)}>{person.callsign}</span>
          </span>
        </span>
      </span>
      <span className="tags">
        <RoleChip role={person.highest_role} />
        <span className="tag">{volunteerStatusLabel(person.volunteer_status)}</span>
      </span>
      <span className="t-caption text-muted">
        פעיל לאחרונה <span className={person.last_active_at ? 'mono' : undefined}>{lastActive(person)}</span>
      </span>
    </button>
  )
}

const PEOPLE_COLUMNS: DataTableColumn<PersonHit>[] = [
  {
    id: 'name',
    header: 'שם מלא',
    sortValue: (person) => person.full_name,
    cell: (person) => {
      const presence = presenceOf(person)
      return (
        <span className="user-name-with-presence">
          {presence ? <UserPresenceDot status={presence} /> : null}
          {person.full_name}
        </span>
      )
    },
  },
  {
    id: 'callsign',
    header: 'או״ק',
    className: (person) => monoClass(person.callsign),
    sortValue: (person) => person.callsign,
    cell: (person) => person.callsign,
  },
  {
    id: 'role',
    header: 'תפקיד',
    sortValue: (person) => highestRoleLabel([person.highest_role as AppRole]),
    cell: (person) => <RoleChip role={person.highest_role} />,
  },
  {
    id: 'status',
    header: 'סטטוס',
    sortValue: (person) => volunteerStatusLabel(person.volunteer_status),
    cell: (person) => volunteerStatusLabel(person.volunteer_status),
  },
  {
    id: 'active',
    header: 'פעיל לאחרונה',
    className: (person) => `table-cell--nowrap ${person.last_active_at ? 'mono' : 'text-muted'}`,
    sortValue: (person) => isoSortValue(person.last_active_at),
    cell: lastActive,
  },
]

/** People rows in the משתמשים list style. A row opens that user's edit dialog. */
export function PeopleResults({
  people,
  asTable,
  onOpen,
}: {
  people: PersonHit[]
  asTable: boolean
  onOpen: (userId: string) => void
}) {
  return (
    <DataTable
      rows={people}
      columns={PEOPLE_COLUMNS}
      rowKey={(person) => person.id}
      asTable={asTable}
      renderCard={(person) => personCard(person, onOpen)}
      cards={{ as: 'div', className: 'stack-3' }}
      onRowClick={(person) => onOpen(person.id)}
      rowLabel={(person) => `עריכת ${person.full_name}`}
    />
  )
}
