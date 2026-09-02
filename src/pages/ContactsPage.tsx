import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Phone, Search, UserRound } from 'lucide-react'
import {
  fetchUnitContacts,
  filterContacts,
  toTelHref,
  toWhatsAppHref,
  type UnitContact,
} from '../lib/contacts'
import { formatPhone, monoClass } from '../lib/format'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { HoverTip } from '../components/ui/HoverTip'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { WhatsAppIcon } from '../components/ui/WhatsAppIcon'

export function ContactsPage() {
  const isDesktop = useIsDesktop()
  const [contacts, setContacts] = useState<UnitContact[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setContacts(null)
    setFailed(false)
    fetchUnitContacts()
      .then((rows) => {
        if (active) setContacts(rows)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  const filtered = useMemo(
    () => filterContacts(contacts ?? [], query),
    [contacts, query],
  )

  return (
    <>
      <div className="page-head">
        <h1 className="t-title">אנשי קשר</h1>
      </div>
      <div className="admin-toolbar">
        <label className="search-field">
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">חיפוש אנשי קשר</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="שם, או״ק, טלפון או דוא״ל"
          />
        </label>
      </div>

      {contacts === null && !failed ? (
        isDesktop ? (
          <EventRowsSkeleton />
        ) : (
          <EventListSkeleton />
        )
      ) : null}

      {failed ? (
        <EmptyState
          icon={<UserRound size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת אנשי הקשר נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : null}

      {contacts && filtered.length === 0 && query.trim() ? (
        <EmptyState
          icon={<Search size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="לא נמצאו אנשי קשר תואמים"
          action={
            <Button variant="ghost" onClick={() => setQuery('')}>
              ניקוי חיפוש
            </Button>
          }
        />
      ) : null}

      {contacts && filtered.length === 0 && !query.trim() ? (
        <EmptyState
          icon={<UserRound size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="אין אנשי קשר להצגה"
        />
      ) : null}

      {contacts && filtered.length > 0 && isDesktop ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>שם מלא</th>
                <th>או״ק</th>
                <th>טלפון</th>
                <th>דוא״ל</th>
                <th>
                  <span className="visually-hidden">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <tr key={contact.id} className="is-static">
                  <td>{contact.full_name}</td>
                  <td className={monoClass(contact.callsign)}>{contact.callsign}</td>
                  <td className="num table-cell--nowrap">
                    {contact.phone ? (
                      <span className={`ltr ${monoClass(contact.phone)}`}>
                        {formatPhone(contact.phone)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <a className="ltr" href={`mailto:${contact.email}`}>
                      {contact.email}
                    </a>
                  </td>
                  <td>
                    <ContactActions contact={contact} labeled={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {contacts && filtered.length > 0 && !isDesktop ? (
        <ul className="stack-3">
          {filtered.map((contact) => (
            <li key={contact.id} className="card contact-card">
              <div className="contact-card__head">
                <Avatar name={contact.full_name} size="lg" />
                <div className="contact-card__identity">
                  <p className="t-section">{contact.full_name}</p>
                  <p className={`t-caption text-muted ${monoClass(contact.callsign)}`}>
                    {contact.callsign}
                  </p>
                </div>
              </div>
              <Ledger>
                <LedgerRow
                  label="טלפון"
                  numeric
                  isolate
                  value={contact.phone ? formatPhone(contact.phone) : undefined}
                />
                <LedgerRow
                  label="דוא״ל"
                  isolate
                  value={
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                  }
                />
              </Ledger>
              <ContactActions contact={contact} labeled />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

function ContactActions({
  contact,
  labeled,
}: {
  contact: UnitContact
  labeled: boolean
}) {
  const tel = toTelHref(contact.phone)
  const whatsapp = toWhatsAppHref(contact.phone)
  if (!tel && !whatsapp) return null

  return (
    <div className={labeled ? 'contact-actions contact-actions--stack' : 'contact-actions'}>
      {tel ? (
        <ContactActionLink
          href={tel}
          label={`חיוג ל${contact.full_name}`}
          caption="התקשרות"
          labeled={labeled}
        >
          <Phone size={20} strokeWidth={1.75} aria-hidden="true" />
        </ContactActionLink>
      ) : null}
      {whatsapp ? (
        <ContactActionLink
          href={whatsapp}
          label={`שליחת וואטסאפ אל ${contact.full_name}`}
          caption="וואטסאפ"
          labeled={labeled}
          external
        >
          <WhatsAppIcon />
        </ContactActionLink>
      ) : null}
    </div>
  )
}

function ContactActionLink({
  href,
  label,
  caption,
  labeled,
  external,
  children,
}: {
  href: string
  label: string
  caption: string
  labeled: boolean
  external?: boolean
  children: ReactNode
}) {
  return (
    <HoverTip
      text={label}
      mode="always"
      className="contact-actions__tip"
    >
      <a
        className={['btn', labeled ? 'btn--secondary' : 'btn--ghost btn--icon'].join(' ')}
        href={href}
        aria-label={label}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
        {labeled ? caption : null}
      </a>
    </HoverTip>
  )
}
