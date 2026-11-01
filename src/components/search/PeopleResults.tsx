import type { KeyboardEvent } from 'react'
import { highestRoleLabel } from '../../lib/appRoles'
import type { AppRole } from '../../lib/auth'
import { formatDateTime, monoClass } from '../../lib/format'
import type { PersonHit } from '../../lib/smartSearchApi'
import { presenceFromLastActive } from '../../lib/userPresence'
import { volunteerStatusLabel } from '../../lib/volunteerStatus'
import { UserPresenceDot } from '../admin/UserPresenceDot'
import { Avatar } from '../ui/Avatar'

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
  if (!asTable) {
    return (
      <div className="stack-3">
        {people.map((person) => {
          const presence = presenceOf(person)
          return (
            <button
              key={person.id}
              type="button"
              className="card user-card search-person-card"
              onClick={() => onOpen(person.id)}
            >
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
        })}
      </div>
    )
  }

  const onKey = (person: PersonHit) => (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    onOpen(person.id)
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">שם מלא</th>
            <th scope="col">או״ק</th>
            <th scope="col">תפקיד</th>
            <th scope="col">סטטוס</th>
            <th scope="col">פעיל לאחרונה</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const presence = presenceOf(person)
            return (
              <tr
                key={person.id}
                tabIndex={0}
                role="button"
                aria-label={`עריכת ${person.full_name}`}
                onClick={() => onOpen(person.id)}
                onKeyDown={onKey(person)}
              >
                <td>
                  <span className="user-name-with-presence">
                    {presence ? <UserPresenceDot status={presence} /> : null}
                    {person.full_name}
                  </span>
                </td>
                <td className={monoClass(person.callsign)}>{person.callsign}</td>
                <td>
                  <RoleChip role={person.highest_role} />
                </td>
                <td>{volunteerStatusLabel(person.volunteer_status)}</td>
                <td className={`table-cell--nowrap ${person.last_active_at ? 'mono' : 'text-muted'}`}>
                  {lastActive(person)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
