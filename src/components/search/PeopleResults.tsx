import { highestRoleLabel } from '../../lib/appRoles'
import type { AppRole } from '../../lib/auth'
import { formatDate, formatDateTime, monoClass } from '../../lib/format'
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

function RoleChip({ role }: { role: string | null | undefined }) {
  const label = role ? highestRoleLabel([role as AppRole]) : null
  return label ? <span className="tag">{label}</span> : null
}

function personCard(person: PersonHit, onOpen: (person: PersonHit) => void, full: boolean) {
  const presence = full ? presenceOf(person) : null
  return (
    <button type="button" className="card user-card search-person-card" onClick={() => onOpen(person)}>
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
        {full ? <RoleChip role={person.highest_role} /> : null}
        <span className="tag">{volunteerStatusLabel(person.volunteer_status)}</span>
      </span>
      {full ? (
        <span className="t-caption text-muted">
          פעיל לאחרונה <span className={person.last_active_at ? 'mono' : undefined}>{lastActive(person)}</span>
        </span>
      ) : null}
      {person.last_shift_date !== undefined ? (
        <span className="t-caption text-muted">{lastShift(person)}</span>
      ) : null}
    </button>
  )
}

function lastShift(person: PersonHit): string {
  return person.last_shift_date ? `משמרת אחרונה ${formatDate(person.last_shift_date)}` : 'אין משמרת קודמת'
}

const ADMIN_ONLY_COLUMNS = new Set(['role', 'active'])

const PEOPLE_COLUMNS: DataTableColumn<PersonHit>[] = [
  {
    id: 'name',
    header: 'שם מלא',
    sortValue: (person) => person.full_name,
    cell: (person) => {
      const presence = person.last_active_at !== undefined ? presenceOf(person) : null
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

const SHIFT_COLUMN: DataTableColumn<PersonHit> = {
  id: 'last_shift',
  header: 'משמרת אחרונה',
  className: (person) => (person.last_shift_date ? 'mono' : 'text-muted'),
  sortValue: (person) => isoSortValue(person.last_shift_date ?? null),
  cell: (person) => (person.last_shift_date ? formatDate(person.last_shift_date) : 'אין'),
}

/**
 * People rows in the משתמשים list style. Admins get role and last activity and a row
 * opens the edit dialog; other roles get name, או״ק and status.
 */
export function PeopleResults({
  people,
  asTable,
  full,
  onOpen,
}: {
  people: PersonHit[]
  asTable: boolean
  /** Admin columns (role, last activity). */
  full: boolean
  onOpen: (person: PersonHit) => void
}) {
  const columns = [
    ...PEOPLE_COLUMNS.filter((column) => full || !ADMIN_ONLY_COLUMNS.has(column.id)),
    ...(people.some((person) => person.last_shift_date !== undefined) ? [SHIFT_COLUMN] : []),
  ]
  return (
    <DataTable
      rows={people}
      columns={columns}
      rowKey={(person) => person.id}
      asTable={asTable}
      renderCard={(person) => personCard(person, onOpen, full)}
      cards={{ as: 'div', className: 'stack-3' }}
      onRowClick={onOpen}
      rowLabel={(person) => (full ? `עריכת ${person.full_name}` : `פתיחת ${person.full_name} באנשי קשר`)}
    />
  )
}
