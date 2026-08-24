import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth, type AppRole } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { formatDateTime, formatNumber, formatPhone, monoClass } from '../lib/format'
import { formatLifetimeStatsUpdatedAt } from '../lib/profileLifetimeStats'
import { addressKindLabel, fetchOwnAddresses, type UserAddressRow } from '../lib/userAddresses'
import {
  connectPartnerApp,
  createPartnerClient,
  fetchPartnerApps,
  fetchPartnerClients,
  fetchPartnerGrants,
  revokePartnerGrant,
  rotatePartnerClientSecret,
  type PartnerApp,
  type PartnerClient,
  type PartnerGrant,
} from '../lib/partnerApi'
import { isTelegramBotUsername, liveGrantForBot, normalizeTelegramBotUsername } from '../lib/partnerOAuth'
import { isImpersonating } from '../lib/impersonationStash'
import { Avatar } from '../components/ui/Avatar'
import { LicensePlate } from '../components/ui/LicensePlate'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Ledger, LedgerRow } from '../components/ui/Ledger'
import { Skeleton } from '../components/ui/Skeleton'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'

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
  const { show } = useToast()
  const isAdmin = roles.includes('admin')
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null)
  const [addresses, setAddresses] = useState<UserAddressRow[] | null>(null)
  const [grants, setGrants] = useState<PartnerGrant[] | null>(null)
  const [apps, setApps] = useState<PartnerApp[] | null>(null)
  const [grantError, setGrantError] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [clients, setClients] = useState<PartnerClient[] | null>(null)
  const [appName, setAppName] = useState('')
  const [botUsername, setBotUsername] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [secretOnce, setSecretOnce] = useState<{
    title: string
    clientId: string
    secret: string
    authorizeUrl?: string
  } | null>(null)

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

    fetchPartnerApps().then((result) => {
      if (!active) return
      if (result.ok) setApps(result.apps)
      else setApps([])
    })

    return () => {
      active = false
    }
  }, [profile])

  useEffect(() => {
    if (!profile || !isAdmin) return
    let active = true
    fetchPartnerClients().then((result) => {
      if (!active) return
      if (result.ok) setClients(result.clients)
      else setClients([])
    })
    return () => {
      active = false
    }
  }, [profile, isAdmin])

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

  async function onConnectApp(app: PartnerApp) {
    if (isImpersonating()) {
      show('לא ניתן לחבר יישום בזמן התחזות.')
      return
    }
    setConnectingId(app.client_id)
    const result = await connectPartnerApp(app)
    if (!result.ok) {
      setConnectingId(null)
      show(result.error)
      return
    }
    window.location.assign(result.redirect)
  }

  async function onCreateClient() {
    const name = appName.trim()
    const bot = normalizeTelegramBotUsername(botUsername)
    if (!name) {
      setCreateError('יש להזין שם יישום.')
      return
    }
    if (!isTelegramBotUsername(bot)) {
      setCreateError('שם המשתמש של הבוט אינו תקין.')
      return
    }
    setCreating(true)
    setCreateError(null)
    const result = await createPartnerClient({ name, telegramBotUsername: bot })
    setCreating(false)
    if (!result.ok) {
      setCreateError(result.error)
      return
    }
    setAppName('')
    setBotUsername('')
    setSecretOnce({
      title: 'הסוד יוצג פעם אחת בלבד',
      clientId: result.clientId,
      secret: result.clientSecret,
      authorizeUrl: result.authorizeUrl,
    })
    const listed = await fetchPartnerClients()
    if (listed.ok) setClients(listed.clients)
  }

  async function onRotateSecret(clientId: string) {
    const result = await rotatePartnerClientSecret(clientId)
    if (!result.ok) {
      show(result.error)
      return
    }
    setSecretOnce({
      title: 'הסוד החדש יוצג פעם אחת בלבד',
      clientId,
      secret: result.clientSecret,
    })
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

        <section className="card">
          <h2 className="t-section">חיבורים</h2>
          <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-2)' }}>
            חיבור לבוט בטלגרם להשלמת דיווחים בצ׳אט.
          </p>
          <div style={{ marginBlockStart: 'var(--space-4)' }}>
            {grants === null || apps === null ? (
              <Skeleton height={24} />
            ) : grantError ? (
              <p className="t-body text-muted">{grantError}</p>
            ) : apps.length === 0 && grants.length === 0 ? (
              <p className="t-body text-muted">
                החיבור לבוט ייפתח כאן אחרי שהמנהל ירשום אותו.
              </p>
            ) : apps.length === 0 ? (
              <div className="stack-4">
                {grants.map((grant) => (
                  <div key={grant.id} className="stack-3">
                    <Ledger>
                      <LedgerRow label="יישום" value={grant.name} />
                      <LedgerRow label="בתוקף עד" value={formatDateTime(grant.expires_at)} />
                    </Ledger>
                    <Button variant="destructive" onClick={() => setRevokeId(grant.id)}>
                      בטל גישה
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stack-4">
                {apps.map((app) => {
                  const live = liveGrantForBot(grants, app.telegram_bot_username)
                  const connectLabel = apps.length === 1 ? 'חבר לטלגרם' : `חבר את ${app.name}`
                  return (
                    <div key={app.client_id} className="stack-3">
                      <Ledger>
                        <LedgerRow label="יישום" value={app.name} />
                        {live ? (
                          <LedgerRow label="בתוקף עד" value={formatDateTime(live.expires_at)} />
                        ) : (
                          <LedgerRow label="מצב" value="לא מחובר" />
                        )}
                      </Ledger>
                      {live ? (
                        <Button variant="destructive" onClick={() => setRevokeId(live.id)}>
                          בטל גישה
                        </Button>
                      ) : (
                        <Button
                          disabled={Boolean(connectingId) || isImpersonating()}
                          loading={connectingId === app.client_id}
                          loadingLabel="מחבר…"
                          onClick={() => void onConnectApp(app)}
                        >
                          {connectLabel}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {isAdmin ? (
          <section className="card stack-4">
            <h2 className="t-section">רישום בוט</h2>
            <p className="t-caption text-muted">
              פעם אחת ליחידה, למי שבונה את הבוט. הכוננים מתחברים למעלה, בלי סודות.
            </p>
            {clients === null ? (
              <Skeleton height={24} />
            ) : clients.length === 0 ? (
              <p className="t-body text-muted">עדיין לא רשום בוט.</p>
            ) : (
              <div className="stack-4">
                {clients.map((client) => (
                  <div key={client.id} className="stack-3">
                    <Ledger>
                      <LedgerRow label="שם" value={client.name} />
                      <LedgerRow label="מזהה" value={client.client_id} isolate />
                      <LedgerRow
                        label="בוט"
                        value={`@${client.telegram_bot_username}`}
                        isolate
                      />
                    </Ledger>
                    <Button
                      variant="secondary"
                      onClick={() => void onRotateSecret(client.client_id)}
                    >
                      חידוש סוד
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="stack-3">
              <TextField
                label="שם היישום"
                required
                value={appName}
                onChange={(event) => setAppName(event.target.value)}
              />
              <TextField
                label="שם משתמש בטלגרם"
                hint="בלי @"
                isolate
                required
                value={botUsername}
                onChange={(event) => setBotUsername(event.target.value)}
              />
              {createError ? (
                <p className="alert alert--error" role="alert">
                  {createError}
                </p>
              ) : null}
              <Button
                variant="secondary"
                loading={creating}
                loadingLabel="יוצר…"
                onClick={() => void onCreateClient()}
              >
                יצירת יישום
              </Button>
            </div>
          </section>
        ) : null}

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
        <p className="t-body">הבוט לא יוכל להשלים דיווחים בשמך עד שתאשרו מחדש.</p>
      </Dialog>

      <Dialog
        open={Boolean(secretOnce)}
        title={secretOnce?.title ?? 'סוד יישום'}
        onClose={() => setSecretOnce(null)}
        footer={
          <Button variant="primary" onClick={() => setSecretOnce(null)}>
            הבנתי
          </Button>
        }
      >
        {secretOnce ? (
          <div className="stack-3">
            <p className="t-body text-secondary">שמרו את הסוד אצל מי שבונה את הבוט. הכוננים לא צריכים אותו.</p>
            <Ledger>
              <LedgerRow label="מזהה" value={secretOnce.clientId} isolate />
              <LedgerRow label="סוד" value={secretOnce.secret} isolate />
            </Ledger>
            {secretOnce.authorizeUrl ? (
              <p className="t-caption text-muted" style={{ overflowWrap: 'anywhere' }}>
                {secretOnce.authorizeUrl}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
