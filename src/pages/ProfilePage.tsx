import { useEffect, useState } from 'react'
import { LogOut, Star } from 'lucide-react'
import { useAuth, type AppRole } from '../lib/auth'
import { formatDateTime, formatNumber, formatPhone, monoClass } from '../lib/format'
import { formatLifetimeStatsUpdatedAt } from '../lib/profileLifetimeStats'
import { addressKindLabel, fetchOwnAddresses, type UserAddressRow } from '../lib/userAddresses'
import { fetchPartnerGrants, revokePartnerGrant, type PartnerGrant } from '../lib/partnerApi'
import { canChooseDefaultVehicle } from '../lib/defaultVehicle'
import { fetchOwnVehicles, setDefaultVehicle } from '../lib/vehicles'
import { Avatar } from '../components/ui/Avatar'
import { LicensePlate } from '../components/ui/LicensePlate'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { Skeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'

const ROLE_LABELS: Partial<Record<AppRole, string>> = {
  admin: 'מנהל',
  shift_lead: 'אחמ״ש',
  responder: 'כונן',
}

function visibleRoles(roles: AppRole[]): AppRole[] {
  return roles.filter((role) => role !== 'super_admin')
}

type Vehicle = {
  id: string
  plate_number: string
  model: string
  archived: boolean
  is_default: boolean
}

function sortProfileVehicles(vehicles: Vehicle[]): Vehicle[] {
  return [...vehicles].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1
    return a.model.localeCompare(b.model, 'he')
  })
}

export function ProfilePage({ onOpenBotSettings }: { onOpenBotSettings?: () => void }) {
  const { profile, roles, signOut } = useAuth()
  const { show } = useToast()
  const isAdmin = roles.includes('admin')
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null)
  const [vehicleError, setVehicleError] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<UserAddressRow[] | null>(null)
  const [grants, setGrants] = useState<PartnerGrant[] | null>(null)
  const [grantError, setGrantError] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [starringId, setStarringId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let active = true

    fetchOwnVehicles(profile.id)
      .then((rows) => {
        if (!active) return
        setVehicleError(null)
        setVehicles(
          sortProfileVehicles(
            rows.map((vehicle) => ({
              ...vehicle,
              archived: Boolean(vehicle.archived),
              is_default: Boolean(vehicle.is_default),
            })),
          ),
        )
      })
      .catch(() => {
        if (!active) return
        setVehicleError('טעינת הרכבים נכשלה.')
        setVehicles([])
      })

    fetchOwnAddresses(profile.id)
      .then((rows) => {
        if (active) setAddresses(rows)
      })
      .catch(() => {
        if (active) setAddresses([])
      })

    fetchPartnerGrants().then((result) => {
      if (!active) return
      if (result.ok) {
        setGrants(result.grants)
        setGrantError(null)
      } else {
        setGrants([])
        setGrantError(result.error)
      }
    })

    return () => {
      active = false
    }
  }, [profile])

  async function onRevokeGrant() {
    if (!revokeId) return
    setRevoking(true)
    const result = await revokePartnerGrant(revokeId)
    setRevoking(false)
    if (!result.ok) {
      show(result.error)
      return
    }
    setGrants((current) => (current ?? []).filter((row) => row.id !== revokeId))
    setRevokeId(null)
    show('הגישה בוטלה')
  }

  async function onStarVehicle(vehicle: Vehicle) {
    if (vehicle.archived || vehicle.is_default || starringId) return
    setStarringId(vehicle.id)
    const result = await setDefaultVehicle(vehicle.id)
    setStarringId(null)
    if (result.error) {
      show(result.error)
      return
    }
    setVehicles((current) =>
      sortProfileVehicles(
        (current ?? []).map((row) => ({
          ...row,
          is_default: !row.archived && row.id === vehicle.id,
        })),
      ),
    )
    show('הרכב הראשי עודכן.')
  }

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
          <div className="responder-card__head responder-card__head--flush">
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

        <section className="card card--disabled" aria-disabled="true" inert>
          <h2 className="t-section">חיבורים</h2>
          <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-2)' }}>
            חיבור חד־פעמי לבוט בטלגרם. אחרי האישור אפשר לדווח אירועים בצ׳אט.
          </p>
          <div style={{ marginBlockStart: 'var(--space-4)' }}>
            {grants === null ? (
              <Skeleton height={24} />
            ) : grantError ? (
              <p className="t-body text-muted">{grantError}</p>
            ) : grants.length === 0 ? (
              <div className="stack-3">
                <p className="t-body">עדיין לא מחוברים.</p>
                <p className="t-caption text-muted">
                  פתחו את הבוט בטלגרם ושלחו קישור חיבור. אחרי האישור יופיע כאן החיבור לביטול.
                </p>
                {isAdmin && onOpenBotSettings ? (
                  <Button disabled onClick={onOpenBotSettings}>
                    רישום בוט
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="stack-4">
                {grants.map((grant) => (
                  <div key={grant.id} className="stack-3">
                    <Ledger>
                      <LedgerRow label="יישום" value={grant.name} />
                      <LedgerRow label="בתוקף עד" value={formatDateTime(grant.expires_at)} />
                    </Ledger>
                    <Button variant="destructive" disabled onClick={() => setRevokeId(grant.id)}>
                      בטל גישה
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
          <h2 className="t-section">כתובות</h2>
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
          <h2 className="t-section">רכבים</h2>
          {vehicles && canChooseDefaultVehicle(vehicles) ? (
            <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-2)' }}>
              לחצו על הכוכב כדי לבחור רכב ראשי לאירועים ולמשמרות.
            </p>
          ) : null}
          <div style={{ marginBlockStart: 'var(--space-4)' }}>
            {vehicles === null ? (
              <Skeleton height={24} />
            ) : vehicleError ? (
              <p className="t-body text-muted">{vehicleError}</p>
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
                    value={
                      <span className="profile-vehicle">
                        <LicensePlate plate={vehicle.plate_number} />
                        {!vehicle.archived && canChooseDefaultVehicle(vehicles) ? (
                          <button
                            type="button"
                            className="icon-btn profile-vehicle__star"
                            aria-label={vehicle.is_default ? 'רכב ראשי' : 'הגדר כרכב ראשי'}
                            aria-pressed={vehicle.is_default}
                            title={vehicle.is_default ? 'רכב ראשי' : 'הגדר כרכב ראשי'}
                            disabled={starringId !== null}
                            onClick={() => void onStarVehicle(vehicle)}
                          >
                            <Star
                              size={20}
                              strokeWidth={1.75}
                              fill={vehicle.is_default ? 'currentColor' : 'none'}
                            />
                          </button>
                        ) : null}
                      </span>
                    }
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

      <Dialog
        open={Boolean(revokeId)}
        title="לבטל את הגישה?"
        onClose={() => !revoking && setRevokeId(null)}
        footer={
          <>
            <Button
              variant="destructive"
              loading={revoking}
              loadingLabel="מבטל…"
              onClick={() => void onRevokeGrant()}
            >
              בטל גישה
            </Button>
            <Button variant="secondary" disabled={revoking} onClick={() => setRevokeId(null)}>
              ביטול
            </Button>
          </>
        }
      >
        <p className="t-body">הבוט לא יוכל להשלים דיווחים בשמך עד שתאשרו מחדש מטלגרם.</p>
      </Dialog>
    </div>
  )
}
