import { useEffect, useMemo, useRef, useState } from 'react'
import { ArchiveRestore, Plus, Search, Trash2, UserRound } from 'lucide-react'
import {
  archiveAdminVehicle,
  deleteAdminUser,
  deleteAdminVehicle,
  fetchAdminUsers,
  inviteAdminUser,
  saveAdminUser,
  setAdminUserActive,
  unarchiveAdminVehicle,
  type AdminUserRow,
} from '../lib/adminUsers'
import { useAuth, type AppRole } from '../lib/auth'
import {
  findDuplicatePlate,
  formatLastLogin,
  formatPhone,
  formatPlate,
  isValidPhone,
  monoClass,
  phoneDigits,
} from '../lib/format'
import { isVehicleAttachedToEvents } from '../lib/vehicles'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Avatar } from '../components/ui/Avatar'
import { Button, IconButton } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { OverflowMenu } from '../components/ui/OverflowMenu'
import { TextField } from '../components/ui/TextField'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { useDesktopFormSubmit } from '../lib/useDesktopFormSubmit'

const ROLE_OPTIONS: { role: AppRole; label: string }[] = [
  { role: 'admin', label: 'מנהל' },
  { role: 'shift_lead', label: 'אחמ״ש' },
  { role: 'responder', label: 'כונן' },
]

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'מנהל',
  shift_lead: 'אחמ״ש',
  responder: 'כונן',
}

type DraftVehicle = {
  key: string
  id?: string
  plate_number: string
  model: string
  archived: boolean
}

const VEHICLE_DELETE_CONFIRM =
  'האם למחוק את הרכב הזה? לא ניתן לשחזר אותו לאחר המחיקה.'

const VEHICLE_ARCHIVE_CONFIRM =
  'לא ניתן למחוק רכב זה כי הוא מקושר לאירוע קיים. האם להעביר אותו לארכיון כדי שאיש לא יוכל להשתמש בו יותר במערכת?'

type Draft = {
  id?: string
  full_name: string
  email: string
  callsign: string
  phone: string
  roles: AppRole[]
  vehicles: DraftVehicle[]
}

function emptyDraft(): Draft {
  return {
    full_name: '',
    email: '',
    callsign: '',
    phone: '',
    roles: ['responder'],
    vehicles: [],
  }
}

function draftFromUser(user: AdminUserRow): Draft {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    callsign: user.callsign,
    phone: user.phone ? formatPhone(user.phone) : '',
    roles: [...user.roles],
    vehicles: user.vehicles.map((vehicle) => ({
      key: vehicle.id,
      id: vehicle.id,
      plate_number: formatPlate(vehicle.plate_number),
      model: vehicle.model,
      archived: vehicle.archived,
    })),
  }
}

export function AdminUsersPage() {
  const isDesktop = useIsDesktop()
  const { user } = useAuth()
  const { show } = useToast()
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminUserRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminUserRow | null>(null)
  const [menuUserId, setMenuUserId] = useState<string | null>(null)
  const [vehicleBusyKey, setVehicleBusyKey] = useState<string | null>(null)
  const [vehicleConfirm, setVehicleConfirm] = useState<
    null | { mode: 'delete' | 'archive'; vehicle: DraftVehicle }
  >(null)
  const draftRootRef = useRef<HTMLDivElement>(null)

  useDesktopFormSubmit(() => void submitDraft(), {
    enabled:
      draft !== null &&
      !saving &&
      confirmDeactivate === null &&
      confirmDelete === null &&
      vehicleConfirm === null,
    rootRef: draftRootRef,
  })

  useEffect(() => {
    let active = true
    setUsers(null)
    setFailed(false)
    fetchAdminUsers()
      .then((rows) => {
        if (active) setUsers(rows)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  const filtered = useMemo(() => {
    if (!users) return []
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (user) =>
        user.full_name.toLowerCase().includes(q) ||
        user.callsign.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q),
    )
  }, [users, query])

  async function submitDraft() {
    if (!draft) return
    setFormError(null)

    if (!draft.full_name.trim() || !draft.callsign.trim()) {
      setFormError('יש למלא שם מלא ואו״ק.')
      return
    }
    if (!draft.id && !draft.email.trim()) {
      setFormError('יש למלא דוא״ל.')
      return
    }
    if (draft.roles.length === 0) {
      setFormError('יש לבחור לפחות תפקיד אחד.')
      return
    }
    if (!isValidPhone(draft.phone)) {
      setFormError('יש להזין מספר טלפון בן 10 ספרות.')
      return
    }
    if (findDuplicatePlate(draft.vehicles)) {
      setFormError('לא ניתן לשייך את אותה לוחית רישוי יותר מפעם אחת לאותו משתמש.')
      return
    }
    if (draft.id && draft.id === user?.id && !draft.roles.includes('admin')) {
      setFormError('לא ניתן להסיר מעצמך את תפקיד המנהל.')
      return
    }

    const phone = phoneDigits(draft.phone)

    setSaving(true)
    try {
      if (!draft.id) {
        const result = await inviteAdminUser({
          full_name: draft.full_name,
          email: draft.email,
          callsign: draft.callsign,
          phone,
          roles: draft.roles,
          vehicles: draft.vehicles
            .filter((vehicle) => !vehicle.archived)
            .map((v) => ({
              plate_number: v.plate_number,
              model: v.model,
            })),
        })
        if (!result.ok) {
          setFormError(result.error)
          return
        }
        show(result.message ?? 'המשתמש נוצר ונשלחה הזמנה בדוא״ל', 'done')
      } else {
        const result = await saveAdminUser({
          id: draft.id,
          full_name: draft.full_name,
          callsign: draft.callsign,
          phone,
          roles: draft.roles,
          vehicles: draft.vehicles.map((vehicle) => ({
            id: vehicle.id,
            plate_number: vehicle.plate_number,
            model: vehicle.model,
            archived: vehicle.archived,
          })),
        })
        if (result.error) {
          setFormError(result.error)
          return
        }
        show('המשתמש נשמר', 'done')
      }
      setDraft(null)
      setReloadKey((value) => value + 1)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeactivateUser() {
    if (!confirmDeactivate) return
    setSaving(true)
    const result = await setAdminUserActive(confirmDeactivate.id, false)
    setSaving(false)
    setConfirmDeactivate(null)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show(result.message ?? 'המשתמש הושבת', 'done')
    setReloadKey((value) => value + 1)
  }

  async function reactivateUser(user: AdminUserRow) {
    const result = await setAdminUserActive(user.id, true)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show(result.message ?? 'המשתמש הופעל מחדש', 'done')
    setReloadKey((value) => value + 1)
  }

  async function confirmDeleteUser() {
    if (!confirmDelete) return
    const target = confirmDelete
    if (target.id === user?.id) {
      show('לא ניתן למחוק את המשתמש המחובר כעת.', 'alert')
      setConfirmDelete(null)
      return
    }
    setSaving(true)
    const result = await deleteAdminUser(target.id)
    setSaving(false)
    setConfirmDelete(null)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show(result.message ?? 'המשתמש נמחק', 'done')
    if (draft?.id === target.id) setDraft(null)
    setReloadKey((value) => value + 1)
  }

  async function requestRemoveVehicle(vehicle: DraftVehicle) {
    if (!draft || vehicle.archived) return

    // Unsaved row — confirm then drop from draft only.
    if (!vehicle.id || !draft.id) {
      setVehicleConfirm({ mode: 'delete', vehicle })
      return
    }

    setVehicleBusyKey(vehicle.key)
    setFormError(null)
    try {
      const attached = await isVehicleAttachedToEvents(
        draft.id,
        vehicle.id,
        vehicle.plate_number,
      )
      setVehicleConfirm({ mode: attached ? 'archive' : 'delete', vehicle })
    } catch {
      setFormError('בדיקת קישור הרכב לאירועים נכשלה. נסו שוב.')
    } finally {
      setVehicleBusyKey(null)
    }
  }

  async function confirmVehicleAction() {
    if (!draft || !vehicleConfirm) return
    const { mode, vehicle } = vehicleConfirm

    if (!vehicle.id || !draft.id) {
      setDraft({
        ...draft,
        vehicles: draft.vehicles.filter((row) => row.key !== vehicle.key),
      })
      setVehicleConfirm(null)
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (mode === 'archive') {
        const result = await archiveAdminVehicle(vehicle.id)
        if (result.error) {
          setFormError(result.error)
          return
        }
        setDraft({
          ...draft,
          vehicles: draft.vehicles.map((row) =>
            row.key === vehicle.key ? { ...row, archived: true } : row,
          ),
        })
        show('הרכב הועבר לארכיון', 'done')
      } else {
        const result = await deleteAdminVehicle(vehicle.id)
        if (result.error) {
          setFormError(result.error)
          return
        }
        setDraft({
          ...draft,
          vehicles: draft.vehicles.filter((row) => row.key !== vehicle.key),
        })
        show('הרכב נמחק', 'done')
      }
      setVehicleConfirm(null)
      setReloadKey((value) => value + 1)
    } finally {
      setSaving(false)
    }
  }

  async function unarchiveDraftVehicle(vehicle: DraftVehicle) {
    if (!draft || !vehicle.id || !vehicle.archived) return
    setVehicleBusyKey(vehicle.key)
    setFormError(null)
    try {
      const result = await unarchiveAdminVehicle(vehicle.id)
      if (result.error) {
        setFormError(result.error)
        return
      }
      setDraft({
        ...draft,
        vehicles: draft.vehicles.map((row) =>
          row.key === vehicle.key ? { ...row, archived: false } : row,
        ),
      })
      show('הרכב שוחזר מהארכיון', 'done')
      setReloadKey((value) => value + 1)
    } finally {
      setVehicleBusyKey(null)
    }
  }

  return (
    <div>
      <div className="row-between" style={{ marginBlockEnd: 'var(--space-6)' }}>
        <h1 className="t-title">משתמשים</h1>
        {isDesktop ? (
          <Button
            onClick={() => {
              setFormError(null)
              setDraft(emptyDraft())
            }}
            icon={<Plus size={20} strokeWidth={1.75} />}
          >
            משתמש חדש
          </Button>
        ) : (
          <IconButton
            label="משתמש חדש"
            onClick={() => {
              setFormError(null)
              setDraft(emptyDraft())
            }}
          >
            <Plus size={20} strokeWidth={1.75} />
          </IconButton>
        )}
      </div>

      <div className="admin-toolbar">
        <label className="search-field">
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">חיפוש משתמשים</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש לפי שם, או״ק או דוא״ל"
          />
        </label>
      </div>

      {users === null && !failed ? (
        isDesktop ? (
          <EventRowsSkeleton />
        ) : (
          <EventListSkeleton />
        )
      ) : null}

      {failed ? (
        <EmptyState
          icon={<UserRound size={40} strokeWidth={1.75} />}
          title="טעינת המשתמשים נכשלה"
          caption="בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((v) => v + 1)}>
              רענון
            </Button>
          }
        />
      ) : null}

      {users && filtered.length === 0 && query ? (
        <EmptyState
          icon={<Search size={40} strokeWidth={1.75} />}
          title="לא נמצאו משתמשים תואמים"
          action={
            <Button variant="ghost" onClick={() => setQuery('')}>
              ניקוי חיפוש
            </Button>
          }
        />
      ) : null}

      {users && filtered.length === 0 && !query ? (
        <EmptyState
          icon={<UserRound size={40} strokeWidth={1.75} />}
          title="אין משתמשים להצגה"
          caption="משתמש חדש יופיע כאן ברגע שיוזמן."
          action={
            <Button onClick={() => setDraft(emptyDraft())}>משתמש חדש</Button>
          }
        />
      ) : null}

      {users && filtered.length > 0 && isDesktop ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>שם מלא</th>
                <th>או״ק</th>
                <th>דוא״ל</th>
                <th>טלפון</th>
                <th>תפקידים</th>
                <th>רכבים</th>
                <th>כניסה אחרונה</th>
                <th>
                  <span className="visually-hidden">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  className={!user.active ? 'is-muted' : ''}
                  onClick={() => {
                    setFormError(null)
                    setDraft(draftFromUser(user))
                  }}
                >
                  <td>{user.full_name}</td>
                  <td className={monoClass(user.callsign)}>{user.callsign}</td>
                  <td>
                    <span className="ltr">{user.email}</span>
                  </td>
                  <td className="num">
                    {user.phone ? (
                      <span className={`ltr ${monoClass(user.phone)}`}>
                        {formatPhone(user.phone)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="tags">
                      {user.roles.map((role) => (
                        <span key={role} className="tag">
                          {ROLE_LABEL[role]}
                        </span>
                      ))}
                      {!user.active ? <span className="tag tag--alert">מושבת</span> : null}
                    </div>
                  </td>
                  <td className="num mono">
                    {user.vehicles.filter((vehicle) => !vehicle.archived).length}
                  </td>
                  <td>
                    {user.last_sign_in_at ? (
                      formatLastLogin(user.last_sign_in_at)
                    ) : (
                      <span className="text-muted">טרם התחבר</span>
                    )}
                  </td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <OverflowMenu
                      open={menuUserId === user.id}
                      onOpenChange={(next) => setMenuUserId(next ? user.id : null)}
                      items={[
                        {
                          label: 'עריכה',
                          onSelect: () => {
                            setFormError(null)
                            setDraft(draftFromUser(user))
                          },
                        },
                        user.active
                          ? {
                              label: 'השבתת משתמש',
                              danger: true,
                              onSelect: () => setConfirmDeactivate(user),
                            }
                          : {
                              label: 'הפעלה מחדש',
                              onSelect: () => void reactivateUser(user),
                            },
                        {
                          label: 'מחיקת משתמש',
                          danger: true,
                          onSelect: () => setConfirmDelete(user),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {users && filtered.length > 0 && !isDesktop ? (
        <div className="stack-3">
          {filtered.map((user) => (
            <button
              key={user.id}
              type="button"
              className={['card', 'user-card', !user.active ? 'is-muted' : ''].join(' ')}
              onClick={() => {
                setFormError(null)
                setDraft(draftFromUser(user))
              }}
            >
              <div className="responder-card__head">
                <Avatar name={user.full_name} size="lg" />
                <span className="responder-card__identity">
                  <span className="t-section">{user.full_name}</span>
                  <span className="t-caption text-muted">
                    או״ק <span className={monoClass(user.callsign)}>{user.callsign}</span>
                  </span>
                </span>
              </div>
              <div className="tags" style={{ marginBlockStart: 'var(--space-3)' }}>
                {user.roles.map((role) => (
                  <span key={role} className="tag">
                    {ROLE_LABEL[role]}
                  </span>
                ))}
                {!user.active ? <span className="tag tag--alert">מושבת</span> : null}
              </div>
              <p className="t-caption text-muted" style={{ marginBlockStart: 'var(--space-2)' }}>
                <span className="ltr">{user.email}</span>
              </p>
            </button>
          ))}
        </div>
      ) : null}

      <Dialog
        open={draft !== null}
        title={draft?.id ? 'עריכת משתמש' : 'משתמש חדש'}
        form
        onClose={() => !saving && setDraft(null)}
        footer={
          <>
            {draft?.id && draft.id !== user?.id ? (
              <Button
                variant="destructive"
                disabled={saving}
                onClick={() => {
                  const row = users?.find((entry) => entry.id === draft.id)
                  if (row) setConfirmDelete(row)
                }}
              >
                מחיקה
              </Button>
            ) : null}
            <Button variant="secondary" disabled={saving} onClick={() => setDraft(null)}>
              ביטול
            </Button>
            <Button loading={saving} onClick={() => void submitDraft()}>
              שמירת משתמש
            </Button>
          </>
        }
      >
        {draft ? (
          <div ref={draftRootRef} className="stack-8">
            <section className="stack-4">
              <div className="form-section">
                <h3 className="form-section__heading">פרטים</h3>
              </div>
              <TextField
                label="שם מלא"
                required
                value={draft.full_name}
                onChange={(event) => setDraft({ ...draft, full_name: event.target.value })}
              />
              <TextField
                label="דוא״ל"
                required={!draft.id}
                type="email"
                autoComplete="email"
                isolate
                disabled={Boolean(draft.id)}
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                hint={draft.id ? 'לא ניתן לשנות דוא״ל לאחר יצירה.' : 'נשלחת הזמנה לכתובת זו.'}
              />
              <TextField
                label="או״ק"
                required
                value={draft.callsign}
                onChange={(event) => setDraft({ ...draft, callsign: event.target.value })}
              />
              <TextField
                label="טלפון"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                isolate
                required
                numeric
                value={draft.phone}
                onChange={(event) =>
                  setDraft({ ...draft, phone: formatPhone(event.target.value) })
                }
                hint="10 ספרות, למשל: 050-1234567"
              />
            </section>

            <section className="stack-4">
              <div className="form-section">
                <h3 className="form-section__heading">תפקידים</h3>
              </div>
              <p className="t-caption text-muted">ניתן לשלב תפקידים.</p>
              {ROLE_OPTIONS.map((option) => {
                const lockOwnAdmin =
                  Boolean(draft.id) &&
                  draft.id === user?.id &&
                  option.role === 'admin' &&
                  draft.roles.includes('admin')
                return (
                  <Checkbox
                    key={option.role}
                    id={`role-${option.role}`}
                    label={option.label}
                    checked={draft.roles.includes(option.role)}
                    disabled={lockOwnAdmin}
                    onChange={(checked) => {
                      setDraft({
                        ...draft,
                        roles: checked
                          ? [...draft.roles, option.role]
                          : draft.roles.filter((role) => role !== option.role),
                      })
                    }}
                  />
                )
              })}
            </section>

            <section className="stack-4">
              <div className="form-section">
                <h3 className="form-section__heading">רכבים</h3>
              </div>
              {draft.vehicles.map((vehicle, index) => (
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
                      disabled={vehicle.archived}
                      value={vehicle.plate_number}
                      onChange={(event) => {
                        const vehicles = [...draft.vehicles]
                        vehicles[index] = {
                          ...vehicle,
                          plate_number: formatPlate(event.target.value),
                        }
                        setDraft({ ...draft, vehicles })
                      }}
                    />
                    <TextField
                      label="דגם"
                      disabled={vehicle.archived}
                      value={vehicle.model}
                      onChange={(event) => {
                        const vehicles = [...draft.vehicles]
                        vehicles[index] = { ...vehicle, model: event.target.value }
                        setDraft({ ...draft, vehicles })
                      }}
                    />
                    {vehicle.archived ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="שחזור מהארכיון"
                        title="שחזור מהארכיון"
                        disabled={vehicleBusyKey === vehicle.key}
                        onClick={() => void unarchiveDraftVehicle(vehicle)}
                      >
                        <ArchiveRestore size={20} strokeWidth={1.75} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="הסרת רכב"
                        disabled={vehicleBusyKey === vehicle.key}
                        onClick={() => void requestRemoveVehicle(vehicle)}
                      >
                        <Trash2 size={20} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                  {vehicle.archived ? (
                    <p className="vehicle-row__status t-caption text-secondary">
                      בארכיון — לא ניתן לשייך לאירועים חדשים
                    </p>
                  ) : null}
                </div>
              ))}
              <Button
                variant="ghost"
                onClick={() =>
                  setDraft({
                    ...draft,
                    vehicles: [
                      ...draft.vehicles,
                      {
                        key: `new-${Date.now()}`,
                        plate_number: '',
                        model: '',
                        archived: false,
                      },
                    ],
                  })
                }
              >
                הוספת רכב
              </Button>
            </section>

            {formError ? (
              <p className="form-alert" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmDeactivate !== null}
        title={
          confirmDeactivate
            ? `להשבית את המשתמש ${confirmDeactivate.full_name}?`
            : 'השבתת משתמש'
        }
        onClose={() => !saving && setConfirmDeactivate(null)}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setConfirmDeactivate(null)}>
              ביטול
            </Button>
            <Button variant="destructive" loading={saving} onClick={() => void confirmDeactivateUser()}>
              השבתה
            </Button>
          </>
        }
      >
        <p className="t-body">
          הוא לא יוכל להתחבר, והנתונים ההיסטוריים יישמרו.
        </p>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        title={
          confirmDelete ? `למחוק את המשתמש ${confirmDelete.full_name}?` : 'מחיקת משתמש'
        }
        onClose={() => !saving && setConfirmDelete(null)}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setConfirmDelete(null)}>
              ביטול
            </Button>
            <Button variant="destructive" loading={saving} onClick={() => void confirmDeleteUser()}>
              מחיקה
            </Button>
          </>
        }
      >
        <p className="t-body">
          המשתמש יימחק לצמיתות מאימות וממערכת המשתמשים. לא ניתן לשחזר — רק להזמין מחדש.
          אם הוא אחמ״ש על אירועים או משמרות, המחיקה תיחסם.
        </p>
      </Dialog>

      <Dialog
        open={vehicleConfirm !== null}
        title={vehicleConfirm?.mode === 'archive' ? 'העברה לארכיון' : 'מחיקת רכב'}
        onClose={() => !saving && setVehicleConfirm(null)}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setVehicleConfirm(null)}>
              ביטול
            </Button>
            <Button
              variant={vehicleConfirm?.mode === 'archive' ? 'primary' : 'destructive'}
              loading={saving}
              onClick={() => void confirmVehicleAction()}
            >
              {vehicleConfirm?.mode === 'archive' ? 'העברה לארכיון' : 'מחיקה'}
            </Button>
          </>
        }
      >
        <p className="t-body">
          {vehicleConfirm?.mode === 'archive'
            ? VEHICLE_ARCHIVE_CONFIRM
            : VEHICLE_DELETE_CONFIRM}
        </p>
      </Dialog>
    </div>
  )
}
