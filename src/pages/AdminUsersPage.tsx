import { useEffect, useMemo, useRef, useState } from 'react'
import { ArchiveRestore, Plus, RefreshCw, Search, Trash2, UserRound } from 'lucide-react'
import {
  archiveAdminVehicle,
  deleteAdminUser,
  deleteAdminVehicle,
  fetchAdminUsers,
  copyAdminInviteLink,
  inviteAdminUser,
  resendAdminInvite,
  saveAdminUser,
  setAdminUserActive,
  setAdminUserEmail,
  setAdminUserPassword,
  syncUserAddresses,
  unarchiveAdminVehicle,
  type AdminUserRow,
} from '../lib/adminUsers'
import {
  applyStashedCreateUserDraft,
  canEditUserEmail,
  canSubmitCreateUser,
  clearCreateUserStash,
  createUserEmailError,
  emailsDiffer,
  isValidEmail,
  readCreateUserStash,
  stashCreateUserDraft,
  shouldStashCreateUserDraft,
  USER_CREATE_STASH_DEBOUNCE_MS,
  userEmailFieldHint,
} from '../lib/adminUserDraft'
import { SUPER_ADMIN_LOCK_ERROR, canMutateAdminUser, canToggleUsersPageOtp } from '../lib/adminUserMenu'
import {
  highestRoleLabel,
  isAssignableRoleLocked,
  toggleAssignableRole,
  withImpliedAssignableRoles,
  type AssignableRole,
} from '../lib/appRoles'
import { hasAvailability, isInvitePending } from '../lib/adminUserStatus'
import { AndroidInstallMark } from '../components/admin/AndroidInstallMark'
import { UserPresenceDot } from '../components/admin/UserPresenceDot'
import {
  androidInstallHoverTip,
  canShowAndroidInstallMark,
  fetchAndroidLatestVersionCode,
} from '../lib/androidInstall'
import { AvailabilityPopoverTrigger, AvailabilityTrigger } from '../components/availability/AvailabilityControl'
import { availabilitySearchLabel } from '../lib/availability'
import {
  PRESENCE_TOUCH_THROTTLE_MS,
  fetchAdminLastActive,
  mergeLastActive,
  presenceFromLastActive,
} from '../lib/userPresence'
import { fieldsMatchQuery } from '../lib/searchQuery'
import { useAuth, type AppRole } from '../lib/auth'
import { canImpersonateTarget } from '../lib/impersonationEligibility'
import { isImpersonating } from '../lib/impersonationStash'
import { isValidIlMobile } from '../lib/phoneE164'
import { fetchOtpStatus, setOtpFlags } from '../lib/phoneOtp'
import { otpUserLabel } from '../lib/otpUserTags'
import { passwordStrengthError } from '../lib/passwordRules'
import { ImpersonationPickerDialog } from '../components/shell/ImpersonationPickerDialog'
import { OtpGate } from '../components/otp/OtpGate'
import {
  findDuplicatePlate,
  formatLastLogin,
  formatPhone,
  formatPlate,
  isValidOptionalPhone,
  isValidPhone,
  monoClass,
  phoneDigits,
} from '../lib/format'
import {
  VEHICLE_ARCHIVE_CONFIRM,
  VEHICLE_DELETE_CONFIRM,
  isVehicleAttachedToEvents,
  vehicleRemoveMode,
} from '../lib/vehicles'
import { useIsDesktop } from '../lib/useMediaQuery'
import { Avatar } from '../components/ui/Avatar'
import { Button, IconButton } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { OverflowMenu, type OverflowMenuItem } from '../components/ui/OverflowMenu'
import { SelectField } from '../components/ui/SelectField'
import { PasswordField, TextField } from '../components/ui/TextField'
import { EventListSkeleton, EventRowsSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { useDesktopFormSubmit } from '../lib/useDesktopFormSubmit'
import { LocationPlacesField } from '../components/events/LocationPlacesField'
import {
  addressDraftError,
  addressKindLabel,
  draftsFromRows,
  emptyAddressDrafts,
  emptyExtraAddressDraft,
  persistableAddresses,
  type AddressDraft,
} from '../lib/userAddresses'
import {
  DEFAULT_VOLUNTEER_STATUS,
  VOLUNTEER_STATUS_OPTIONS,
  volunteerStatusLabel,
  type VolunteerStatus,
} from '../lib/volunteerStatus'

const ROLE_OPTIONS: { role: AssignableRole; label: string }[] = [
  { role: 'admin', label: 'מנהל' },
  { role: 'shift_lead', label: 'אחמ״ש' },
  { role: 'responder', label: 'כונן' },
]

function RoleTag({ roles }: { roles: AppRole[] }) {
  const label = highestRoleLabel(roles)
  if (!label) return null
  return <span className="tag">{label}</span>
}

type DraftVehicle = {
  key: string
  id?: string
  plate_number: string
  model: string
  archived: boolean
}

type Draft = {
  id?: string
  full_name: string
  email: string
  callsign: string
  phone: string
  volunteer_status: VolunteerStatus
  roles: AppRole[]
  vehicles: DraftVehicle[]
  addresses: AddressDraft[]
}

function emptyDraft(): Draft {
  return {
    full_name: '',
    email: '',
    callsign: '',
    phone: '',
    volunteer_status: DEFAULT_VOLUNTEER_STATUS,
    roles: ['responder'],
    vehicles: [],
    addresses: emptyAddressDrafts(),
  }
}

function draftFromUser(user: AdminUserRow): Draft {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    callsign: user.callsign,
    phone: user.phone ? formatPhone(user.phone) : '',
    volunteer_status: user.volunteer_status,
    roles: withImpliedAssignableRoles(user.roles),
    vehicles: user.vehicles.map((vehicle) => ({
      key: vehicle.id,
      id: vehicle.id,
      plate_number: formatPlate(vehicle.plate_number),
      model: vehicle.model,
      archived: vehicle.archived,
    })),
    addresses: draftsFromRows(user.addresses),
  }
}

function buildUserMenuItems(
  user: AdminUserRow,
  actions: {
    onEdit: () => void
    onSetPassword?: () => void
    onImpersonate?: () => void
    onToggleOtpLogin: () => void
    onToggleOtpUsersPage: () => void
    onResendInvite: () => void
    onCopyInviteLink: () => void
    onDeactivate: () => void
    onReactivate: () => void
    onDelete: () => void
  },
  canMutate: boolean,
): OverflowMenuItem[] {
  const phoneOk = isValidIlMobile(user.phone)
  const privileged: OverflowMenuItem[] = [
    ...(actions.onSetPassword
      ? [{ label: 'הגדרת סיסמה', onSelect: actions.onSetPassword }]
      : []),
    ...(actions.onImpersonate
      ? [{ label: 'צפייה כמשתמש זה', onSelect: actions.onImpersonate }]
      : []),
  ]
  if (!canMutate) return privileged
  return [
    { label: 'עריכה', onSelect: actions.onEdit },
    ...privileged,
    {
      label: user.otp_login_enabled ? 'כבה OTP בכניסה' : 'הפעל OTP בכניסה',
      onSelect: actions.onToggleOtpLogin,
      disabled: !user.otp_login_enabled && !phoneOk,
    },
    ...(canToggleUsersPageOtp(user.roles)
      ? [
          {
            label: user.otp_users_page_enabled
              ? 'כבה OTP לניהול משתמשים'
              : 'הפעל OTP לניהול משתמשים',
            onSelect: actions.onToggleOtpUsersPage,
            disabled: !user.otp_users_page_enabled && !phoneOk,
          },
        ]
      : []),
    ...(isInvitePending(user)
      ? [
          { label: 'שליחת הזמנה מחדש', onSelect: actions.onResendInvite },
          { label: 'העתקת קישור הזמנה', onSelect: actions.onCopyInviteLink },
        ]
      : []),
    user.active
      ? {
          label: 'השבתת משתמש',
          danger: true,
          onSelect: actions.onDeactivate,
        }
      : {
          label: 'הפעלה מחדש',
          onSelect: actions.onReactivate,
        },
    {
      label: 'מחיקת משתמש',
      danger: true,
      onSelect: actions.onDelete,
    },
  ]
}

function UserAndroidInstallMark({
  user,
  roles,
  impersonating,
  latestVersionCode,
}: {
  user: AdminUserRow
  roles: readonly AppRole[]
  impersonating: boolean
  latestVersionCode: number | null
}) {
  if (
    !canShowAndroidInstallMark({
      roles,
      impersonating,
      lastAndroidSeenAt: user.last_android_seen_at,
    })
  ) {
    return null
  }
  return (
    <AndroidInstallMark
      tip={androidInstallHoverTip({
        versionName: user.last_android_version_name,
        versionCode: user.last_android_version_code,
        latestVersionCode,
      })}
    />
  )
}

export function AdminUsersPage() {
  const isDesktop = useIsDesktop()
  const { user: authUser, roles, profile: authProfile } = useAuth()
  const isSuperAdmin = roles.includes('super_admin')
  const viewingAsOther = isImpersonating()
  const { show } = useToast()
  const [impersonateTargetId, setImpersonateTargetId] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  function patchUserAvailability(next: {
    id: string
    availability: AdminUserRow['availability']
    available_from: string | null
  }) {
    setUsers((current) =>
      current
        ? current.map((row) =>
            row.id === next.id
              ? {
                  ...row,
                  availability: next.availability,
                  available_from: next.available_from,
                }
              : row,
          )
        : current,
    )
  }
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminUserRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminUserRow | null>(null)
  const [confirmOtpEnable, setConfirmOtpEnable] = useState<
    null | { user: AdminUserRow; kind: 'login' | 'users_page' }
  >(null)
  const [usersPageOtp, setUsersPageOtp] = useState<
    | { state: 'checking' }
    | { state: 'required'; maskedPhone: string | null }
    | { state: 'ok' }
  >({ state: 'checking' })
  const [passwordTarget, setPasswordTarget] = useState<AdminUserRow | null>(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordForceChange, setPasswordForceChange] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [latestAndroidVersionCode, setLatestAndroidVersionCode] = useState<number | null>(null)
  const [menuUserId, setMenuUserId] = useState<string | null>(null)
  const [vehicleBusyKey, setVehicleBusyKey] = useState<string | null>(null)
  const [vehicleConfirm, setVehicleConfirm] = useState<
    null | { mode: 'delete' | 'archive'; vehicle: DraftVehicle }
  >(null)
  const draftRootRef = useRef<HTMLDivElement>(null)
  const passwordRootRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<Draft | null>(null)
  const stashLatest = useRef<(() => void) | null>(null)
  const stashTimer = useRef<number | null>(null)

  draftRef.current = draft

  const emailEditable = Boolean(draft && canEditUserEmail(!draft.id, isSuperAdmin))
  const canSaveDraft =
    draft !== null &&
    (draft.id
      ? !isSuperAdmin || isValidEmail(draft.email)
      : canSubmitCreateUser(draft))
  const createEmailError =
    draft && emailEditable ? createUserEmailError(draft.email) : null

  useDesktopFormSubmit(() => void submitDraft(), {
    enabled:
      canSaveDraft &&
      !saving &&
      confirmDeactivate === null &&
      confirmDelete === null &&
      vehicleConfirm === null &&
      passwordTarget === null,
    rootRef: draftRootRef,
  })

  useDesktopFormSubmit(() => void submitSetPassword(), {
    enabled: passwordTarget !== null && !passwordSaving,
    rootRef: passwordRootRef,
  })

  function stashCreateDraftNow() {
    if (!authUser) return
    const current = draftRef.current
    if (!current || current.id) return
    stashCreateUserDraft(authUser.id, current, Date.now())
  }

  function openCreateForm() {
    setFormError(null)
    const fresh = emptyDraft()
    if (!authUser) {
      setDraft(fresh)
      return
    }
    const restored = applyStashedCreateUserDraft(
      fresh,
      readCreateUserStash<Draft>(authUser.id, Date.now()),
    )
    setDraft(restored && shouldStashCreateUserDraft(restored) ? restored : fresh)
  }

  function closeCreateForm() {
    if (saving) return
    stashCreateDraftNow()
    setDraft(null)
  }

  useEffect(() => {
    if (!authUser || !draft || draft.id) return

    stashLatest.current = stashCreateDraftNow
    if (stashTimer.current) window.clearTimeout(stashTimer.current)
    stashTimer.current = window.setTimeout(stashCreateDraftNow, USER_CREATE_STASH_DEBOUNCE_MS)
    return () => {
      if (stashTimer.current) window.clearTimeout(stashTimer.current)
    }
  }, [authUser, draft])

  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === 'hidden') stashLatest.current?.()
    }
    function onPageHide() {
      stashLatest.current?.()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  useEffect(() => {
    if (viewingAsOther || !authProfile?.otp_users_page_enabled) {
      setUsersPageOtp({ state: 'ok' })
      return
    }
    let active = true
    setUsersPageOtp({ state: 'checking' })
    fetchOtpStatus()
      .then((status) => {
        if (!active) return
        if ('error' in status) {
          setUsersPageOtp({ state: 'required', maskedPhone: null })
          return
        }
        if (status.usersPageRequired) {
          setUsersPageOtp({ state: 'required', maskedPhone: status.maskedPhone })
        } else {
          setUsersPageOtp({ state: 'ok' })
        }
      })
      .catch(() => {
        if (active) setUsersPageOtp({ state: 'required', maskedPhone: null })
      })
    return () => {
      active = false
    }
  }, [viewingAsOther, reloadKey, authProfile?.otp_users_page_enabled])

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

  useEffect(() => {
    if (!isSuperAdmin || viewingAsOther) {
      setLatestAndroidVersionCode(null)
      return
    }
    let active = true
    fetchAndroidLatestVersionCode().then((code) => {
      if (active) setLatestAndroidVersionCode(code)
    })
    return () => {
      active = false
    }
  }, [isSuperAdmin, viewingAsOther, reloadKey])

  async function refreshUsers() {
    if (refreshing) return
    const keepRows = users !== null
    setRefreshing(true)
    setFailed(false)
    try {
      const rows = await fetchAdminUsers()
      setUsers(rows)
    } catch {
      if (keepRows) {
        show('טעינת המשתמשים נכשלה. בדקו את החיבור ונסו שוב.', 'alert')
      } else {
        setFailed(true)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const usersLoaded = users !== null
  useEffect(() => {
    if (!usersLoaded) return
    let active = true
    async function refreshPresence() {
      if (document.hidden) return
      try {
        const rows = await fetchAdminLastActive()
        if (!active) return
        setUsers((current) => (current ? mergeLastActive(current, rows) : current))
      } catch {
        /* keep last discs */
      }
    }
    const id = window.setInterval(() => {
      void refreshPresence()
    }, PRESENCE_TOUCH_THROTTLE_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshPresence()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [usersLoaded, reloadKey])

  const filtered = useMemo(() => {
    if (!users) return []
    const q = query.trim()
    if (!q) return users
    return users.filter((user) =>
      fieldsMatchQuery(
        [
          user.full_name,
          user.callsign,
          user.email,
          volunteerStatusLabel(user.volunteer_status),
          hasAvailability(user)
            ? availabilitySearchLabel(user.availability, user.available_from)
            : '',
        ],
        q,
      ),
    )
  }, [users, query])

  async function submitDraft() {
    if (!draft) return
    setFormError(null)

    if (!draft.full_name.trim() || !draft.callsign.trim()) {
      setFormError('יש למלא שם מלא ואו״ק.')
      return
    }
    if ((!draft.id || isSuperAdmin) && !isValidEmail(draft.email)) {
      setFormError(draft.email.trim() ? 'יש להזין כתובת דוא״ל תקינה.' : 'יש למלא דוא״ל.')
      return
    }
    if (draft.roles.length === 0) {
      setFormError('יש לבחור לפחות תפקיד אחד.')
      return
    }
    const phoneOk = draft.id ? isValidOptionalPhone(draft.phone) : isValidPhone(draft.phone)
    if (!phoneOk) {
      setFormError('יש להזין מספר טלפון בן 10 ספרות.')
      return
    }
    if (findDuplicatePlate(draft.vehicles)) {
      setFormError('לא ניתן לשייך את אותה לוחית רישוי יותר מפעם אחת לאותו משתמש.')
      return
    }
    const addressesError = addressDraftError(draft.addresses)
    if (addressesError) {
      setFormError(addressesError)
      return
    }
    if (draft.id && draft.id === authUser?.id && !draft.roles.includes('admin')) {
      setFormError('לא ניתן להסיר מעצמך את תפקיד המנהל.')
      return
    }

    if (draft.id) {
      const row = users?.find((entry) => entry.id === draft.id)
      if (row && !canMutateAdminUser(isSuperAdmin, row.roles)) {
        setFormError(SUPER_ADMIN_LOCK_ERROR)
        return
      }
    }

    const phone = phoneDigits(draft.phone) || null
    const addresses = persistableAddresses(draft.addresses)

    setSaving(true)
    try {
      if (!draft.id) {
        const result = await inviteAdminUser({
          full_name: draft.full_name,
          email: draft.email,
          callsign: draft.callsign,
          phone,
          volunteer_status: draft.volunteer_status,
          roles: draft.roles,
          vehicles: draft.vehicles
            .filter((vehicle) => !vehicle.archived)
            .map((v) => ({
              plate_number: v.plate_number,
              model: v.model,
            })),
          addresses,
        })
        if (!result.ok) {
          setFormError(result.error)
          return
        }
        if (result.user_id && addresses.length > 0) {
          const addressResult = await syncUserAddresses(result.user_id, addresses)
          if (addressResult.error) {
            const copied = await copyInviteLinkToClipboard(result.action_link)
            show(
              copied
                ? 'המשתמש נוצר וקישור ההזמנה הועתק, אך שמירת הכתובות נכשלה. ערכו את המשתמש כדי לנסות שוב.'
                : 'המשתמש נוצר, אך שמירת הכתובות נכשלה. ערכו את המשתמש כדי לנסות שוב.',
              'alert',
            )
            if (authUser) clearCreateUserStash(authUser.id)
            setDraft(null)
            setReloadKey((value) => value + 1)
            return
          }
        }
        const copied = await copyInviteLinkToClipboard(result.action_link)
        show(
          copied
            ? 'משתמש נוצר בהצלחה וקישור ההזמנה הועתק.'
            : (result.message ?? 'משתמש נוצר בהצלחה'),
          'done',
        )
        if (authUser) clearCreateUserStash(authUser.id)
      } else {
        const original = users?.find((entry) => entry.id === draft.id)
        if (
          isSuperAdmin &&
          original &&
          emailsDiffer(original.email, draft.email)
        ) {
          const emailResult = await setAdminUserEmail({
            userId: draft.id,
            email: draft.email,
          })
          if (emailResult.error) {
            setFormError(emailResult.error)
            return
          }
        }
        const result = await saveAdminUser({
          id: draft.id,
          full_name: draft.full_name,
          callsign: draft.callsign,
          phone,
          volunteer_status: draft.volunteer_status,
          roles: draft.roles,
          vehicles: draft.vehicles.map((vehicle) => ({
            id: vehicle.id,
            plate_number: vehicle.plate_number,
            model: vehicle.model,
            archived: vehicle.archived,
          })),
          addresses,
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

  function requestToggleOtpLogin(user: AdminUserRow) {
    setMenuUserId(null)
    if (user.otp_login_enabled) {
      void applyOtpFlag(user, 'login', false)
      return
    }
    if (!isValidIlMobile(user.phone)) {
      show('יש להזין מספר נייד ישראלי תקין לפני הפעלת OTP.', 'alert')
      return
    }
    setConfirmOtpEnable({ user, kind: 'login' })
  }

  function requestToggleOtpUsersPage(user: AdminUserRow) {
    setMenuUserId(null)
    if (user.otp_users_page_enabled) {
      void applyOtpFlag(user, 'users_page', false)
      return
    }
    if (!isValidIlMobile(user.phone)) {
      show('יש להזין מספר נייד ישראלי תקין לפני הפעלת OTP.', 'alert')
      return
    }
    setConfirmOtpEnable({ user, kind: 'users_page' })
  }

  async function applyOtpFlag(
    user: AdminUserRow,
    kind: 'login' | 'users_page',
    enabled: boolean,
  ) {
    setSaving(true)
    const result = await setOtpFlags(
      kind === 'login'
        ? { userId: user.id, otpLoginEnabled: enabled }
        : { userId: user.id, otpUsersPageEnabled: enabled },
    )
    setSaving(false)
    setConfirmOtpEnable(null)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show(
      enabled
        ? kind === 'login'
          ? 'OTP בכניסה הופעל'
          : 'OTP לניהול משתמשים הופעל'
        : kind === 'login'
          ? 'OTP בכניסה כובה'
          : 'OTP לניהול משתמשים כובה',
      'done',
    )
    if (user.id === authUser?.id && kind === 'users_page') {
      if (enabled) {
        setUsersPageOtp({ state: 'required', maskedPhone: null })
      } else {
        setUsersPageOtp({ state: 'ok' })
      }
    }
    setReloadKey((value) => value + 1)
  }

  function menuActionsFor(user: AdminUserRow) {
    return {
      onEdit: () => {
        setFormError(null)
        setDraft(draftFromUser(user))
      },
      onSetPassword: isSuperAdmin ? () => openSetPassword(user) : undefined,
      onImpersonate:
        isSuperAdmin && !viewingAsOther && canImpersonateTarget(authUser?.id, user)
          ? () => {
              setMenuUserId(null)
              setImpersonateTargetId(user.id)
            }
          : undefined,
      onToggleOtpLogin: () => requestToggleOtpLogin(user),
      onToggleOtpUsersPage: () => requestToggleOtpUsersPage(user),
      onResendInvite: () => void resendInvite(user),
      onCopyInviteLink: () => void copyInviteLink(user),
      onDeactivate: () => setConfirmDeactivate(user),
      onReactivate: () => void reactivateUser(user),
      onDelete: () => setConfirmDelete(user),
    }
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

  async function copyInviteLinkToClipboard(actionLink: string | undefined) {
    if (!actionLink) return false
    try {
      await navigator.clipboard.writeText(actionLink)
      return true
    } catch {
      return false
    }
  }

  async function resendInvite(target: AdminUserRow) {
    setMenuUserId(null)
    const result = await resendAdminInvite(target.id)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    const copied = await copyInviteLinkToClipboard(result.action_link)
    show(
      copied
        ? 'ההזמנה נשלחה מחדש וקישור ההזמנה הועתק.'
        : (result.message ?? 'ההזמנה נשלחה מחדש.'),
      'done',
    )
  }

  async function copyInviteLink(target: AdminUserRow) {
    setMenuUserId(null)
    const result = await copyAdminInviteLink(target.id)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    const copied = await copyInviteLinkToClipboard(result.action_link)
    show(
      copied ? 'קישור ההזמנה הועתק.' : 'נוצר קישור הזמנה, אך ההעתקה נכשלה. נסו שוב.',
      copied ? 'done' : 'alert',
    )
  }

  function openSetPassword(target: AdminUserRow) {
    setMenuUserId(null)
    setPasswordTarget(target)
    setPasswordValue('')
    setPasswordConfirm('')
    setPasswordForceChange(false)
    setPasswordError(null)
  }

  function closeSetPassword() {
    if (passwordSaving) return
    setPasswordTarget(null)
    setPasswordError(null)
  }

  async function submitSetPassword() {
    if (!passwordTarget) return
    setPasswordError(null)
    if (passwordValue !== passwordConfirm) {
      setPasswordError('הסיסמאות אינן תואמות.')
      return
    }
    const strengthError = passwordStrengthError(passwordValue)
    if (strengthError) {
      setPasswordError(strengthError)
      return
    }
    setPasswordSaving(true)
    try {
      const result = await setAdminUserPassword({
        userId: passwordTarget.id,
        password: passwordValue,
        forceChange: passwordForceChange,
      })
      if (result.error) {
        setPasswordError(result.error)
        return
      }
      show('הסיסמה עודכנה', 'done')
      setPasswordTarget(null)
    } finally {
      setPasswordSaving(false)
    }
  }

  async function confirmDeleteUser() {
    if (!confirmDelete) return
    const target = confirmDelete
    if (target.id === authUser?.id) {
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
      setVehicleConfirm({ mode: vehicleRemoveMode(attached), vehicle })
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

  if (usersPageOtp.state === 'checking') {
    return (
      <div>
        <h1 className="t-title" style={{ marginBlockEnd: 'var(--space-6)' }}>
          משתמשים
        </h1>
        <EventListSkeleton count={3} />
      </div>
    )
  }

  if (usersPageOtp.state === 'required') {
    return (
      <OtpGate
        purpose="users_page"
        maskedPhone={usersPageOtp.maskedPhone}
        onVerified={() => setUsersPageOtp({ state: 'ok' })}
      />
    )
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="t-title">משתמשים</h1>
        <div className="page-head__actions">
          {isDesktop ? (
            <>
              <Button
                variant="secondary"
                onClick={() => void refreshUsers()}
                loading={refreshing}
                loadingLabel="מרענן…"
                disabled={users === null && !failed}
                icon={<RefreshCw size={20} strokeWidth={1.75} />}
              >
                רענון
              </Button>
              <Button
                onClick={openCreateForm}
                icon={<Plus size={20} strokeWidth={1.75} />}
              >
                משתמש חדש
              </Button>
            </>
          ) : (
            <>
              <IconButton
                label="רענון"
                onClick={() => void refreshUsers()}
                disabled={refreshing || (users === null && !failed)}
              >
                <RefreshCw size={20} strokeWidth={1.75} />
              </IconButton>
              <IconButton
                label="משתמש חדש"
                onClick={openCreateForm}
              >
                <Plus size={20} strokeWidth={1.75} />
              </IconButton>
            </>
          )}
        </div>
      </div>

      <div className="admin-toolbar">
        <label className="search-field">
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">חיפוש משתמשים</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש לפי שם, או״ק, דוא״ל, סטטוס או זמינות"
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
            <Button
              variant="secondary"
              onClick={() => void refreshUsers()}
              loading={refreshing}
              loadingLabel="מרענן…"
            >
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
            <Button onClick={openCreateForm}>משתמש חדש</Button>
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
                <th>תפקיד</th>
                <th>סטטוס</th>
                <th>זמינות</th>
                <th className="table-col--otp">OTP</th>
                <th>רכבים</th>
                <th>כניסה אחרונה</th>
                <th>
                  <span className="visually-hidden">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const otpLabel = otpUserLabel(user)
                const canMutate = canMutateAdminUser(isSuperAdmin, user.roles)
                const presence = presenceFromLastActive(user.last_active_at, Date.now(), user)
                const menuItems = buildUserMenuItems(user, menuActionsFor(user), canMutate)
                const showMenu = menuItems.length > 0
                return (
                <tr
                  key={user.id}
                  className={[!user.active ? 'is-muted' : '', !canMutate ? 'is-static' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    if (!canMutate) return
                    setFormError(null)
                    setDraft(draftFromUser(user))
                  }}
                >
                  <td>
                    <span className="user-name-with-presence">
                      {presence ? <UserPresenceDot status={presence} /> : null}
                      <UserAndroidInstallMark
                        user={user}
                        roles={roles}
                        impersonating={viewingAsOther}
                        latestVersionCode={latestAndroidVersionCode}
                      />
                      {user.full_name}
                    </span>
                  </td>
                  <td className={monoClass(user.callsign)}>{user.callsign}</td>
                  <td>
                    <span className="ltr">{user.email}</span>
                  </td>
                  <td className="num table-cell--nowrap">
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
                      <RoleTag roles={user.roles} />
                      {!user.active ? <span className="tag tag--alert">מושבת</span> : null}
                    </div>
                  </td>
                  <td>{volunteerStatusLabel(user.volunteer_status)}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    {hasAvailability(user) ? (
                      <AvailabilityPopoverTrigger
                        target={{
                          id: user.id,
                          availability: user.availability,
                          available_from: user.available_from,
                        }}
                        disabled={!canMutate}
                        onSaved={patchUserAvailability}
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="table-col--otp table-cell--nowrap">
                    {otpLabel ? (
                      <span className="t-caption text-secondary" title={otpLabel === 'שניהם' ? 'OTP כניסה ו-OTP משתמשים' : undefined}>
                        {otpLabel}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="num mono">
                    {user.vehicles.filter((vehicle) => !vehicle.archived).length}
                  </td>
                  <td>
                    {isInvitePending(user) ? (
                      <span className="text-muted">ממתין להרשמה</span>
                    ) : user.last_sign_in_at ? (
                      formatLastLogin(user.last_sign_in_at)
                    ) : (
                      <span className="text-muted">טרם התחבר</span>
                    )}
                  </td>
                  <td onClick={(event) => event.stopPropagation()}>
                    {showMenu ? (
                      <OverflowMenu
                        open={menuUserId === user.id}
                        onOpenChange={(next) => setMenuUserId(next ? user.id : null)}
                        items={menuItems}
                      />
                    ) : null}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {users && filtered.length > 0 && !isDesktop ? (
        <div className="stack-3">
          {filtered.map((user) => {
            const canMutate = canMutateAdminUser(isSuperAdmin, user.roles)
            const openEdit = () => {
              if (!canMutate) return
              setFormError(null)
              setDraft(draftFromUser(user))
            }
            const otpLabel = otpUserLabel(user)
            const menuItems = buildUserMenuItems(
              user,
              { ...menuActionsFor(user), onEdit: openEdit },
              canMutate,
            )
            const showMenu = menuItems.length > 0
            const presence = presenceFromLastActive(user.last_active_at, Date.now(), user)
            const androidMark = (
              <UserAndroidInstallMark
                user={user}
                roles={roles}
                impersonating={viewingAsOther}
                latestVersionCode={latestAndroidVersionCode}
              />
            )
            const identity = (
              <>
                <Avatar name={user.full_name} size="lg" />
                    <span className="user-card__identity">
                      <span className="t-section">{user.full_name}</span>
                      <span className="t-caption text-muted">
                        או״ק <span className={monoClass(user.callsign)}>{user.callsign}</span>
                      </span>
                    </span>
              </>
            )
            return (
              <div
                key={user.id}
                className={['card', 'user-card', !user.active ? 'is-muted' : ''].join(' ')}
              >
                <div className="user-card__head">
                  <div className="user-card__identity-btn">
                    {presence ? <UserPresenceDot status={presence} /> : null}
                    {androidMark}
                    {canMutate ? (
                      <button type="button" className="user-card__identity-btn" onClick={openEdit}>
                        {identity}
                      </button>
                    ) : (
                      <div className="user-card__identity-btn user-card__identity-btn--static">
                        {identity}
                      </div>
                    )}
                  </div>
                  {showMenu ? (
                    <OverflowMenu
                      open={menuUserId === user.id}
                      onOpenChange={(next) => setMenuUserId(next ? user.id : null)}
                      items={menuItems}
                    />
                  ) : null}
                </div>
                {canMutate ? (
                  <div className="user-card__details">
                    <div className="tags">
                      <RoleTag roles={user.roles} />
                      <span className="tag">{volunteerStatusLabel(user.volunteer_status)}</span>
                      {hasAvailability(user) ? (
                        <AvailabilityTrigger
                          compact
                          target={{
                            id: user.id,
                            availability: user.availability,
                            available_from: user.available_from,
                          }}
                          disabled={!canMutate}
                          onSaved={patchUserAvailability}
                        />
                      ) : null}
                      {otpLabel ? <span className="tag">OTP · {otpLabel}</span> : null}
                      {isInvitePending(user) ? (
                        <span className="tag tag--pending">ממתין להרשמה</span>
                      ) : null}
                      {!user.active ? <span className="tag tag--alert">מושבת</span> : null}
                    </div>
                    <button type="button" className="user-card__email-btn" onClick={openEdit}>
                      <span className="t-caption text-muted">
                        <span className="ltr">{user.email}</span>
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="user-card__details user-card__details--static">
                    <div className="tags">
                      <RoleTag roles={user.roles} />
                      <span className="tag">{volunteerStatusLabel(user.volunteer_status)}</span>
                      {hasAvailability(user) ? (
                        <AvailabilityTrigger
                          compact
                          target={{
                            id: user.id,
                            availability: user.availability,
                            available_from: user.available_from,
                          }}
                          disabled
                          onSaved={patchUserAvailability}
                        />
                      ) : null}
                      {otpLabel ? <span className="tag">OTP · {otpLabel}</span> : null}
                      {isInvitePending(user) ? (
                        <span className="tag tag--pending">ממתין להרשמה</span>
                      ) : null}
                      {!user.active ? <span className="tag tag--alert">מושבת</span> : null}
                    </div>
                    <p className="t-caption text-muted">
                      <span className="ltr">{user.email}</span>
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      <Dialog
        open={draft !== null}
        title={draft?.id ? 'עריכת משתמש' : 'משתמש חדש'}
        form
        onClose={closeCreateForm}
        footer={
          <>
            {draft?.id && draft.id !== authUser?.id ? (
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
            <Button variant="secondary" disabled={saving} onClick={closeCreateForm}>
              ביטול
            </Button>
            <Button
              loading={saving}
              disabled={saving || !canSaveDraft}
              onClick={() => void submitDraft()}
            >
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
                required={emailEditable}
                type="email"
                autoComplete="email"
                isolate
                disabled={!emailEditable}
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                error={createEmailError ?? undefined}
                hint={
                  createEmailError
                    ? undefined
                    : userEmailFieldHint(!draft.id, isSuperAdmin)
                }
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
                required={!draft.id}
                numeric
                value={draft.phone}
                onChange={(event) =>
                  setDraft({ ...draft, phone: formatPhone(event.target.value) })
                }
                hint={
                  draft.id
                    ? 'אופציונלי. אם ממלאים — 10 ספרות, למשל: 050-1234567'
                    : '10 ספרות, למשל: 050-1234567'
                }
              />
              <SelectField
                label="סטטוס"
                required
                value={draft.volunteer_status}
                options={VOLUNTEER_STATUS_OPTIONS}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    volunteer_status: event.target.value as VolunteerStatus,
                  })
                }
              />
            </section>

            <section className="stack-4">
              <div className="form-section">
                <h3 className="form-section__heading">תפקידים</h3>
              </div>
              <p className="t-caption text-muted">בחירת תפקיד כוללת את התפקידים שמתחתיו.</p>
              {ROLE_OPTIONS.map((option) => {
                const lockOwnAdmin =
                  Boolean(draft.id) &&
                  draft.id === authUser?.id &&
                  option.role === 'admin' &&
                  draft.roles.includes('admin')
                const implied = isAssignableRoleLocked(draft.roles, option.role)
                return (
                  <Checkbox
                    key={option.role}
                    id={`role-${option.role}`}
                    label={option.label}
                    checked={draft.roles.includes(option.role)}
                    disabled={lockOwnAdmin || implied}
                    onChange={(checked) => {
                      setDraft({
                        ...draft,
                        roles: toggleAssignableRole(draft.roles, option.role, checked),
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

            <section className="stack-4">
              <div className="form-section">
                <h3 className="form-section__heading">כתובות</h3>
              </div>
              <p className="t-caption text-muted">
                בית ועבודה הם ברירת מחדל. אפשר להשאיר ריק או לבחור כתובת מגוגל בלבד.
              </p>
              {draft.addresses.map((address, index) => (
                <div key={address.key} className="address-row">
                  <div
                    className={[
                      'address-row__fields',
                      address.kind === 'other' ? 'address-row__fields--extra' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {address.kind === 'other' ? (
                      <TextField
                        label="שם הכתובת"
                        value={address.label}
                        onChange={(event) => {
                          const addresses = [...draft.addresses]
                          addresses[index] = { ...address, label: event.target.value }
                          setDraft({ ...draft, addresses })
                        }}
                      />
                    ) : null}
                    <LocationPlacesField
                      label={
                        address.kind === 'other' ? 'כתובת' : addressKindLabel(address.kind)
                      }
                      allowFreeText={false}
                      placeholder="הקלידו כתובת ובחרו מהרשימה"
                      value={{
                        location: address.location,
                        location_place_id: address.location_place_id,
                        location_lat: address.location_lat,
                        location_lng: address.location_lng,
                      }}
                      onChange={(next) => {
                        const addresses = [...draft.addresses]
                        addresses[index] = {
                          ...address,
                          location: next.location,
                          location_place_id: next.location_place_id,
                          location_lat: next.location_lat,
                          location_lng: next.location_lng,
                        }
                        setDraft({ ...draft, addresses })
                      }}
                      onAutocompleteUnavailable={() =>
                        show('השלמת כתובת מגוגל אינה זמינה כרגע.', 'alert')
                      }
                    />
                    {address.kind === 'other' ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="הסרת כתובת"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            addresses: draft.addresses.filter((row) => row.key !== address.key),
                          })
                        }
                      >
                        <Trash2 size={20} strokeWidth={1.75} />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <Button
                variant="ghost"
                onClick={() =>
                  setDraft({
                    ...draft,
                    addresses: [...draft.addresses, emptyExtraAddressDraft()],
                  })
                }
              >
                הוספת כתובת
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

      {authUser?.id ? (
        <ImpersonationPickerDialog
          open={impersonateTargetId !== null}
          actorUserId={authUser.id}
          presetTargetId={impersonateTargetId}
          onClose={() => setImpersonateTargetId(null)}
          onStarted={() => {
            setImpersonateTargetId(null)
            show('נכנסתם למצב צפייה כמשתמש.', 'done')
          }}
        />
      ) : null}

      <Dialog
        open={passwordTarget !== null}
        title={
          passwordTarget
            ? `הגדרת סיסמה — ${passwordTarget.full_name}`
            : 'הגדרת סיסמה'
        }
        form
        onClose={closeSetPassword}
        footer={
          <>
            <Button variant="secondary" disabled={passwordSaving} onClick={closeSetPassword}>
              ביטול
            </Button>
            <Button loading={passwordSaving} onClick={() => void submitSetPassword()}>
              שמירת סיסמה
            </Button>
          </>
        }
      >
        {passwordTarget ? (
          <div ref={passwordRootRef} className="stack-6">
            <PasswordField
              label="סיסמה חדשה"
              autoComplete="new-password"
              required
              value={passwordValue}
              onChange={(event) => setPasswordValue(event.target.value)}
            />
            <PasswordField
              label="אימות סיסמה"
              autoComplete="new-password"
              required
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />

            <Checkbox
              id="force-password-change"
              label="חייב להחליף סיסמה בכניסה הבאה"
              checked={passwordForceChange}
              onChange={setPasswordForceChange}
            />
            {passwordForceChange ? (
              <p className="t-caption text-muted">
                אחרי התחברות עם הסיסמה הזו, המשתמש יידרש לבחור סיסמה חדשה.
              </p>
            ) : null}

            {passwordError ? (
              <p className="t-body text-alert" role="alert">
                {passwordError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmOtpEnable !== null}
        title={
          confirmOtpEnable?.kind === 'login'
            ? 'להפעיל אימות SMS בכניסה למשתמש זה?'
            : confirmOtpEnable?.kind === 'users_page'
              ? 'להפעיל אימות SMS לניהול משתמשים למשתמש זה?'
              : 'הפעלת OTP'
        }
        onClose={() => !saving && setConfirmOtpEnable(null)}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setConfirmOtpEnable(null)}>
              ביטול
            </Button>
            <Button
              loading={saving}
              onClick={() => {
                if (!confirmOtpEnable) return
                void applyOtpFlag(confirmOtpEnable.user, confirmOtpEnable.kind, true)
              }}
            >
              הפעלה
            </Button>
          </>
        }
      >
        {confirmOtpEnable ? (
          <p className="t-body">
            יישלח קוד SMS ל־
            <span className="ltr">
              {formatPhone(confirmOtpEnable.user.phone ?? '')}
            </span>{' '}
            כאשר יידרש אימות.
          </p>
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
