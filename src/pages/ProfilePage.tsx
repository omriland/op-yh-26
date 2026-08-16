import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth, type AppRole } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { formatNumber, formatPhone, monoClass } from '../lib/format'
import { formatLifetimeStatsUpdatedAt } from '../lib/profileLifetimeStats'
import { addressKindLabel, fetchOwnAddresses, type UserAddressRow } from '../lib/userAddresses'
import { Avatar } from '../components/ui/Avatar'
import { LicensePlate } from '../components/ui/LicensePlate'
import { Button } from '../components/ui/Button'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { Skeleton } from '../components/ui/Skeleton'

const ROLE_LABELS: Partial<Record<AppRole, string>> = {
  admin: 'מנהל',
  shift_lead: 'אחמ״ש',
  responder: 'כונן',
}

function visibleRoles(roles: AppRole[]): AppRole[] {
  return roles.filter((role) => role !== 'super_admin')
}

type Vehicle = { id: string; plate_number: string; model: string; archived: boolean }

export function ProfilePage() {
  const { profile, roles, signOut } = useAuth()
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null)
  const [addresses, setAddresses] = useState<UserAddressRow[] | null>(null)

  useEffect(() => {
    if (!profile) return
    let active = true

    supabase
      .from('vehicles')
      .select('id, plate_number, model, archived')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (active) {
          setVehicles(
            ((data as Vehicle[] | null) ?? []).map((vehicle) => ({
              ...vehicle,
              archived: Boolean(vehicle.archived),
            })),
          )
        }
      })

    fetchOwnAddresses(profile.id)
      .then((rows) => {
        if (active) setAddresses(rows)
      })
      .catch(() => {
        if (active) setAddresses([])
      })

    return () => {
      active = false
    }
  }, [profile])

  if (!profile) {
    return (
      <div>
        <h1 className="t-title">פרופיל</h1>
        <div
          className="card stack-3"
          style={{ marginBlockStart: 'var(--space-10)' }}
          aria-busy="true"
          aria-label="טוען פרופיל"
        >
          <Skeleton height={40} width="55%" />
          <Skeleton height={24} />
          <Skeleton height={24} width="70%" />
        </div>
      </div>
    )
  }

  const statsUpdated = formatLifetimeStatsUpdatedAt(profile.lifetime_stats_updated_at)

  return (
    <div>
      <h1 className="t-title">פרופיל</h1>

      <div className="stack-4" style={{ marginBlockStart: 'var(--space-10)' }}>
        <section className="card stack-4">
          <div className="responder-card__head">
            <Avatar name={profile.full_name} size="lg" />
            <span className="responder-card__identity">
              <span className="t-section">{profile.full_name}</span>
              <span className="t-caption text-muted" style={{ display: 'block' }}>
                או״ק <span className={monoClass(profile.callsign)}>{profile.callsign}</span>
              </span>
            </span>
          </div>

          <Ledger>
            <LedgerRow label="דוא״ל" value={profile.email} isolate />
            <LedgerRow
              label="טלפון"
              value={profile.phone ? formatPhone(profile.phone) : undefined}
              numeric
              isolate
            />
          </Ledger>

          <div>
            <p className="t-label text-secondary" style={{ marginBlockEnd: 'var(--space-2)' }}>
              תפקידים
            </p>
            <div className="tags">
              {visibleRoles(roles).length === 0 ? (
                <span className="t-body text-muted">—</span>
              ) : (
                visibleRoles(roles).map((role) => (
                  <span key={role} className="tag">
                    {ROLE_LABELS[role]}
                  </span>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="t-section">סיכום פעילות</h2>
          <div className="profile-stats" style={{ marginBlockStart: 'var(--space-4)' }}>
            <div className="profile-stats__cell">
              <p className="t-label text-secondary">אירועים שטופלו</p>
              <span className="profile-stats__value t-num-lg">
                {formatNumber(profile.lifetime_event_count)}
              </span>
            </div>
            <div className="profile-stats__cell">
              <p className="t-label text-secondary">קילומטרים</p>
              <span className="profile-stats__value t-num-lg">
                {formatNumber(profile.lifetime_km)}
              </span>
            </div>
          </div>
          {statsUpdated ? (
            <p className="profile-stats__caption t-caption text-muted">{statsUpdated}</p>
          ) : null}
        </section>

        <section className="card">
          <div className="form-section">
            <h2 className="form-section__heading">כתובות</h2>
          </div>
          <div style={{ marginBlockStart: 'var(--space-4)' }}>
            {addresses === null ? (
              <Skeleton height={24} />
            ) : addresses.length === 0 ? (
              <p className="t-body text-muted">לא רשומות כתובות. פנו למנהל המערכת להוספת כתובת.</p>
            ) : (
              <Ledger>
                {addresses.map((address) => (
                  <LedgerRow
                    key={address.id}
                    label={addressKindLabel(address.kind, address.label)}
                    value={address.formatted_address}
                  />
                ))}
              </Ledger>
            )}
          </div>
        </section>

        <section className="card">
          <div className="form-section">
            <h2 className="form-section__heading">רכבים</h2>
          </div>
          <div style={{ marginBlockStart: 'var(--space-4)' }}>
            {vehicles === null ? (
              <Skeleton height={24} />
            ) : vehicles.length === 0 ? (
              <p className="t-body text-muted">לא רשומים רכבים. פנו למנהל המערכת להוספת רכב.</p>
            ) : (
              <Ledger>
                {vehicles.map((vehicle) => (
                  <LedgerRow
                    key={vehicle.id}
                    label={
                      vehicle.archived ? `${vehicle.model} (בארכיון)` : vehicle.model
                    }
                    value={<LicensePlate plate={vehicle.plate_number} />}
                    isolate
                  />
                ))}
              </Ledger>
            )}
          </div>
        </section>

        <Button
          variant="secondary"
          onClick={() => void signOut()}
          icon={<LogOut size={20} strokeWidth={1.75} className="icon-mirror" />}
        >
          התנתקות
        </Button>
      </div>
    </div>
  )
}
