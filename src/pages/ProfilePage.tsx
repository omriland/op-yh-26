import { useEffect, useRef, useState } from 'react'
import { ArchiveRestore, Check, LogOut, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useAuth, type AppRole } from '../lib/auth'
import { formatDateTime, formatNumber, formatPhone, formatPlate, monoClass } from '../lib/format'
import { formatLifetimeStatsUpdatedAt } from '../lib/profileLifetimeStats'
import { addressKindLabel, fetchOwnAddresses, type UserAddressRow } from '../lib/userAddresses'
import { fetchPartnerGrants, revokePartnerGrant, type PartnerGrant } from '../lib/partnerApi'
import { canChooseDefaultVehicle } from '../lib/defaultVehicle'
import {
  DEFAULT_VEHICLE_LABEL,
  SET_DEFAULT_VEHICLE_LABEL,
  VEHICLE_ARCHIVE_CONFIRM,
  VEHICLE_DELETE_CONFIRM,
  archiveVehicle,
  createOwnVehicle,
  deleteVehicle,
  fetchOwnVehicles,
  isProfileVehicleEditing,
  isVehicleAttachedToEvents,
  setDefaultVehicle,
  unarchiveVehicle,
  updateOwnVehicle,
  vehicleFieldsForSave,
  vehicleRemoveMode,
  type VehicleRemoveMode,
} from '../lib/vehicles'
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

type VehicleDraft = {
  key: string
  id?: string
  plate_number: string
  model: string
  archived: boolean
  is_default: boolean
}

function sortProfileVehicles(vehicles: VehicleDraft[]): VehicleDraft[] {
  return [...vehicles].sort((a, b) => {
    if (Boolean(a.id) !== Boolean(b.id)) return a.id ? -1 : 1
    if (a.archived !== b.archived) return a.archived ? 1 : -1
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1
    return a.model.localeCompare(b.model, 'he')
  })
}

function toDraft(vehicle: {
  id: string
  plate_number: string
  model: string
  archived: boolean
  is_default: boolean
}): VehicleDraft {
  return {
    key: vehicle.id,
    id: vehicle.id,
    plate_number: vehicle.plate_number,
    model: vehicle.model,
    archived: Boolean(vehicle.archived),
    is_default: Boolean(vehicle.is_default),
  }
}

export function ProfilePage({ onOpenBotSettings }: { onOpenBotSettings?: () => void }) {
  const { profile, roles, signOut } = useAuth()
  const { show } = useToast()
  const isAdmin = roles.includes('admin')
  const [vehicles, setVehicles] = useState<VehicleDraft[] | null>(null)
  const [vehicleError, setVehicleError] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<UserAddressRow[] | null>(null)
  const [grants, setGrants] = useState<PartnerGrant[] | null>(null)
  const [grantError, setGrantError] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [starringId, setStarringId] = useState<string | null>(null)
  const [vehicleBusyKey, setVehicleBusyKey] = useState<string | null>(null)
  const [vehicleConfirm, setVehicleConfirm] = useState<null | {
    mode: VehicleRemoveMode
    vehicle: VehicleDraft
  }>(null)
  const [vehicleSaving, setVehicleSaving] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const vehiclesRef = useRef<VehicleDraft[] | null>(null)
  vehiclesRef.current = vehicles
  const persistingKeys = useRef(new Set<string>())

  useEffect(() => {
    if (!profile) return
    let active = true

    fetchOwnVehicles(profile.id)
      .then((rows) => {
        if (!active) return
        setVehicleError(null)
        setVehicles(sortProfileVehicles(rows.map(toDraft)))
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

  async function reloadSavedVehicles() {
    if (!profile) return
    const unsaved = (vehiclesRef.current ?? []).filter((vehicle) => !vehicle.id)
    try {
      const rows = await fetchOwnVehicles(profile.id)
      setVehicleError(null)
      setVehicles(sortProfileVehicles([...rows.map(toDraft), ...unsaved]))
    } catch {
      setVehicleError('טעינת הרכבים נכשלה.')
    }
  }

  function patchVehicle(key: string, patch: Partial<VehicleDraft>) {
    setVehicles((current) =>
      (current ?? []).map((row) => (row.key === key ? { ...row, ...patch } : row)),
    )
  }

  async function persistVehicle(vehicle: VehicleDraft, announceIncomplete = false) {
    if (!profile || vehicle.archived) return
    if (persistingKeys.current.has(vehicle.key)) return
    const fields = vehicleFieldsForSave(vehicle.plate_number, vehicle.model)
    if ('error' in fields) {
      if (vehicle.id || announceIncomplete) show(fields.error)
      return
    }

    persistingKeys.current.add(vehicle.key)
    setVehicleBusyKey(vehicle.key)
    try {
      if (!vehicle.id) {
        const result = await createOwnVehicle(profile.id, fields.plate_number, fields.model)
        if (result.error) {
          show(result.error)
          return
        }
        setVehicles((current) => (current ?? []).filter((row) => row.key !== vehicle.key))
        setEditingKey(null)
        await reloadSavedVehicles()
        show('הרכב נשמר.')
        return
      }

      const result = await updateOwnVehicle(vehicle.id, fields.plate_number, fields.model)
      if (result.error) {
        show(result.error)
        return
      }
      patchVehicle(vehicle.key, {
        plate_number: fields.plate_number,
        model: fields.model,
      })
      setEditingKey(null)
    } finally {
      persistingKeys.current.delete(vehicle.key)
      setVehicleBusyKey(null)
    }
  }

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

  async function onStarVehicle(vehicle: VehicleDraft) {
    if (!vehicle.id || vehicle.archived || vehicle.is_default || starringId) return
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

  function addVehicleRow() {
    const current = vehiclesRef.current ?? []
    const emptyNew = current.find(
      (row) => !row.id && !row.plate_number.trim() && !row.model.trim(),
    )
    if (emptyNew) {
      setEditingKey(emptyNew.key)
      return
    }
    const pending = current.find((row) => {
      if (row.id || row.archived) return false
      return !('error' in vehicleFieldsForSave(row.plate_number, row.model))
    })
    if (pending) void persistVehicle(pending)
    const blank: VehicleDraft = {
      key: `new-${Date.now()}`,
      plate_number: '',
      model: '',
      archived: false,
      is_default: false,
    }
    setVehicles((current) => [...(current ?? []), blank])
    setEditingKey(blank.key)
  }

  async function requestRemoveVehicle(vehicle: VehicleDraft) {
    if (!profile || vehicle.archived) return
    if (!vehicle.id) {
      setVehicleConfirm({ mode: 'delete', vehicle })
      return
    }

    setVehicleBusyKey(vehicle.key)
    try {
      const attached = await isVehicleAttachedToEvents(
        profile.id,
        vehicle.id,
        vehicle.plate_number,
      )
      setVehicleConfirm({ mode: vehicleRemoveMode(attached), vehicle })
    } catch {
      show('בדיקת קישור הרכב לאירועים נכשלה. נסו שוב.')
    } finally {
      setVehicleBusyKey(null)
    }
  }

  async function confirmVehicleAction() {
    if (!vehicleConfirm) return
    const { mode, vehicle } = vehicleConfirm

    if (!vehicle.id) {
      setVehicles((current) => (current ?? []).filter((row) => row.key !== vehicle.key))
      setEditingKey(null)
      setVehicleConfirm(null)
      return
    }

    setVehicleSaving(true)
    try {
      if (mode === 'archive') {
        const result = await archiveVehicle(vehicle.id)
        if (result.error) {
          show(result.error)
          return
        }
        show('הרכב הועבר לארכיון')
      } else {
        const result = await deleteVehicle(vehicle.id)
        if (result.error) {
          show(result.error)
          return
        }
        show('הרכב נמחק')
      }
      setVehicleConfirm(null)
      setEditingKey(null)
      await reloadSavedVehicles()
    } finally {
      setVehicleSaving(false)
    }
  }

  async function restoreVehicle(vehicle: VehicleDraft) {
    if (!vehicle.id || !vehicle.archived) return
    setVehicleBusyKey(vehicle.key)
    try {
      const result = await unarchiveVehicle(vehicle.id)
      if (result.error) {
        show(result.error)
        return
      }
      show('הרכב שוחזר מהארכיון')
      await reloadSavedVehicles()
    } finally {
      setVehicleBusyKey(null)
    }
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
  const canStar = vehicles ? canChooseDefaultVehicle(vehicles) : false

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
          <div className="profile-vehicles__head">
            <h2 className="t-section">רכבים</h2>
            <Button
              variant="ghost"
              icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
              onClick={addVehicleRow}
            >
              הוספת רכב
            </Button>
          </div>
          {canStar ? (
            <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-2)' }}>
              לחצו על הכוכב כדי לבחור רכב ראשי לאירועים ולמשמרות.
            </p>
          ) : null}
          <div className="stack-4" style={{ marginBlockStart: 'var(--space-4)' }}>
            {vehicles === null ? (
              <Skeleton height={24} />
            ) : vehicleError ? (
              <p className="t-body text-muted">{vehicleError}</p>
            ) : vehicles.length === 0 ? (
              <p className="t-body text-muted">עדיין לא רשומים רכבים.</p>
            ) : (
              vehicles.map((vehicle) => {
                const editing = isProfileVehicleEditing(vehicle, editingKey)
                if (!editing) {
                  return (
                    <Ledger key={vehicle.key}>
                      <LedgerRow
                        label={
                          vehicle.archived ? `${vehicle.model} (בארכיון)` : vehicle.model
                        }
                        value={
                          <span className="profile-vehicle">
                          <LicensePlate plate={vehicle.plate_number} />
                          {!vehicle.archived && canStar ? (
                            <button
                              type="button"
                              className="icon-btn profile-vehicle__star"
                              aria-label={
                                vehicle.is_default
                                  ? DEFAULT_VEHICLE_LABEL
                                  : SET_DEFAULT_VEHICLE_LABEL
                              }
                              aria-pressed={vehicle.is_default}
                              title={
                                vehicle.is_default
                                  ? DEFAULT_VEHICLE_LABEL
                                  : SET_DEFAULT_VEHICLE_LABEL
                              }
                              disabled={starringId !== null || vehicleBusyKey === vehicle.key}
                              onClick={() => void onStarVehicle(vehicle)}
                            >
                              <Star
                                size={20}
                                strokeWidth={1.75}
                                fill={vehicle.is_default ? 'currentColor' : 'none'}
                              />
                            </button>
                          ) : null}
                          {vehicle.archived ? (
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="שחזור מהארכיון"
                              title="שחזור מהארכיון"
                              disabled={vehicleBusyKey === vehicle.key}
                              onClick={() => void restoreVehicle(vehicle)}
                            >
                              <ArchiveRestore size={20} strokeWidth={1.75} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="עריכת רכב"
                              title="עריכת רכב"
                              disabled={vehicleBusyKey === vehicle.key}
                              onClick={() => setEditingKey(vehicle.key)}
                            >
                              <Pencil size={20} strokeWidth={1.75} />
                            </button>
                          )}
                        </span>
                        }
                      />
                    </Ledger>
                  )
                }
                return (
                  <div
                    key={vehicle.key}
                    className={[
                      'vehicle-row',
                      vehicle.archived ? 'vehicle-row--archived' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="vehicle-row__fields">
                      <TextField
                        label="לוחית רישוי"
                        numeric
                        isolate
                        autoFocus={!vehicle.id}
                        disabled={vehicle.archived}
                        value={vehicle.plate_number}
                        onChange={(event) =>
                          patchVehicle(vehicle.key, {
                            plate_number: formatPlate(event.target.value),
                          })
                        }
                        onBlur={(event) => {
                          const latest =
                            vehiclesRef.current?.find((row) => row.key === vehicle.key) ??
                            vehicle
                          void persistVehicle({
                            ...latest,
                            plate_number: formatPlate(event.target.value),
                          })
                        }}
                      />
                      <TextField
                        label="דגם"
                        disabled={vehicle.archived}
                        value={vehicle.model}
                        onChange={(event) =>
                          patchVehicle(vehicle.key, { model: event.target.value })
                        }
                        onBlur={(event) => {
                          const latest =
                            vehiclesRef.current?.find((row) => row.key === vehicle.key) ??
                            vehicle
                          void persistVehicle({
                            ...latest,
                            model: event.target.value,
                          })
                        }}
                      />
                      <div className="vehicle-row__actions">
                        {vehicle.archived ? (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="שחזור מהארכיון"
                            title="שחזור מהארכיון"
                            disabled={vehicleBusyKey === vehicle.key}
                            onClick={() => void restoreVehicle(vehicle)}
                          >
                            <ArchiveRestore size={20} strokeWidth={1.75} />
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="שמירת רכב"
                              title="שמירת רכב"
                              disabled={vehicleBusyKey === vehicle.key}
                              onClick={() => {
                                const latest =
                                  vehiclesRef.current?.find((row) => row.key === vehicle.key) ??
                                  vehicle
                                void persistVehicle(latest, true)
                              }}
                            >
                              <Check size={20} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label="הסרת רכב"
                              title="הסרת רכב"
                              disabled={vehicleBusyKey === vehicle.key}
                              onClick={() => void requestRemoveVehicle(vehicle)}
                            >
                              <Trash2 size={20} strokeWidth={1.75} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {vehicle.archived ? (
                      <p className="vehicle-row__status t-caption text-secondary">
                        בארכיון — לא ניתן לשייך לאירועים חדשים
                      </p>
                    ) : null}
                  </div>
                )
              })
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

      <Dialog
        open={vehicleConfirm !== null}
        title={vehicleConfirm?.mode === 'archive' ? 'העברה לארכיון' : 'מחיקת רכב'}
        onClose={() => !vehicleSaving && setVehicleConfirm(null)}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={vehicleSaving}
              onClick={() => setVehicleConfirm(null)}
            >
              ביטול
            </Button>
            <Button
              variant={vehicleConfirm?.mode === 'archive' ? 'primary' : 'destructive'}
              loading={vehicleSaving}
              onClick={() => void confirmVehicleAction()}
            >
              {vehicleConfirm?.mode === 'archive' ? 'העברה לארכיון' : 'מחיקה'}
            </Button>
          </>
        }
      >
        <p className="t-body">
          {vehicleConfirm?.mode === 'archive' ? VEHICLE_ARCHIVE_CONFIRM : VEHICLE_DELETE_CONFIRM}
        </p>
      </Dialog>
    </div>
  )
}
