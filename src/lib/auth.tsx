import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { redeemStashedAuthToken, stashAuthTokenFromUrl } from './consumeAuthToken'
import {
  clearPasswordSetupIntent,
  getPasswordSetupReason,
  markPasswordSetupRequired,
  stripPasswordSetupFromUrl,
  type PasswordSetupReason,
} from './passwordSetup'
import { IMPERSONATION_CHANGE_EVENT, clearImpersonationStash } from './impersonationStash'
import { identifyPosthogUser, resetPosthogUser } from './posthog'
import { passwordStrengthError } from './passwordRules'
import { supabase } from './supabase'

export type AppRole = 'admin' | 'shift_lead' | 'responder' | 'super_admin'

export type Profile = {
  id: string
  full_name: string
  email: string
  callsign: string
  phone: string | null
  active: boolean
  must_change_password: boolean
  otp_login_enabled: boolean
  otp_users_page_enabled: boolean
  lifetime_event_count: number
  lifetime_km: number
  lifetime_stats_updated_at: string | null
}

type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  roles: AppRole[]
  loading: boolean
  /** Session exists from invite/recovery link — must choose a password first. */
  passwordSetupReason: PasswordSetupReason | null
  /** Failed branded invite/recovery token exchange (shown on login). */
  authBootstrapError: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
  /** User-initiated invite/recovery OTP redeem (anti-prefetch). */
  redeemInviteToken: () => Promise<{ error: string | null }>
  /** Leave the set-password gate after the success confirmation. */
  acknowledgePasswordSetup: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function loadProfileAndRoles(userId: string) {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, full_name, email, callsign, phone, active, must_change_password, otp_login_enabled, otp_users_page_enabled, lifetime_event_count, lifetime_km, lifetime_stats_updated_at',
      )
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ])

  const row = profile as (Profile & Record<string, unknown>) | null
  return {
    profile: row
      ? {
          ...row,
          otp_login_enabled: Boolean(row.otp_login_enabled),
          otp_users_page_enabled: Boolean(row.otp_users_page_enabled),
          lifetime_event_count: Number(row.lifetime_event_count ?? 0),
          lifetime_km: Number(row.lifetime_km ?? 0),
          lifetime_stats_updated_at:
            typeof row.lifetime_stats_updated_at === 'string'
              ? row.lifetime_stats_updated_at
              : null,
        }
      : null,
    roles: (roleRows ?? []).map((r) => r.role as AppRole),
  }
}

/** Prefer invite/recovery URL intent; otherwise arm from profile flag. */
function resolvePasswordSetupReason(
  profile: Profile | null,
): PasswordSetupReason | null {
  const fromStorage = getPasswordSetupReason()
  if (fromStorage === 'invite' || fromStorage === 'recovery') return fromStorage
  if (profile?.must_change_password) {
    markPasswordSetupRequired('admin_reset')
    return 'admin_reset'
  }
  return fromStorage
}

type ApplySessionResult =
  | { kind: 'signed_out' }
  | {
      kind: 'ready'
      session: Session
      profile: Profile | null
      roles: AppRole[]
      passwordSetupReason: PasswordSetupReason | null
    }

/**
 * Load profile/roles and resolve the password gate BEFORE exposing the session
 * to the app — otherwise SIGNED_IN briefly unlocks the shell without the gate.
 */
async function prepareSession(
  session: Session,
  event?: string,
): Promise<ApplySessionResult> {
  const loaded = await loadProfileAndRoles(session.user.id)
  if (loaded.profile && loaded.profile.active === false) {
    clearPasswordSetupIntent()
    await supabase.auth.signOut()
    return { kind: 'signed_out' }
  }

  let reason: PasswordSetupReason | null
  if (event === 'PASSWORD_RECOVERY') {
    markPasswordSetupRequired('recovery')
    reason = 'recovery'
  } else {
    reason = resolvePasswordSetupReason(loaded.profile)
  }

  return {
    kind: 'ready',
    session,
    profile: loaded.profile,
    roles: loaded.roles,
    passwordSetupReason: reason,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)
  const [passwordSetupReason, setPasswordSetupReason] = useState<PasswordSetupReason | null>(
    () => getPasswordSetupReason(),
  )
  const [authBootstrapError, setAuthBootstrapError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    void (async () => {
      // Stash token only — never verifyOtp on load (email scanners burn OTPs).
      stashAuthTokenFromUrl()
      if (!mounted) return

      const { data } = await supabase.auth.getSession()
      if (!mounted) return

      if (data.session?.user) {
        const prepared = await prepareSession(data.session)
        if (!mounted) return
        if (prepared.kind === 'signed_out') {
          setSession(null)
          setProfile(null)
          setRoles([])
          setPasswordSetupReason(null)
        } else {
          setProfile(prepared.profile)
          setRoles(prepared.roles)
          setPasswordSetupReason(prepared.passwordSetupReason)
          setSession(prepared.session)
        }
      } else {
        setPasswordSetupReason(getPasswordSetupReason())
      }
      setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordSetupRequired('recovery')
      }

      if (!next?.user) {
        setSession(null)
        setProfile(null)
        setRoles([])
        // Do not clear password-setup intent on SIGNED_OUT. Invite verifyOtp
        // signs out any prior session first; clearing here dropped users on the
        // normal login screen (especially in a clean/incognito browser).
        setLoading(false)
        return
      }

      const prepared = await prepareSession(next, event)
      if (prepared.kind === 'signed_out') {
        setSession(null)
        setProfile(null)
        setRoles([])
        setPasswordSetupReason(null)
        setLoading(false)
        return
      }

      setProfile(prepared.profile)
      setRoles(prepared.roles)

      // SIGNED_IN / INITIAL_SESSION / PASSWORD_RECOVERY: adopt gate.
      // USER_UPDATED after updatePassword may arm admin_reset but must not
      // clear an in-flight confirmation when storage was already cleared.
      if (
        event === 'PASSWORD_RECOVERY' ||
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION'
      ) {
        setPasswordSetupReason(prepared.passwordSetupReason)
      } else if (prepared.passwordSetupReason) {
        setPasswordSetupReason(prepared.passwordSetupReason)
      }

      // Expose session only after gate reason is decided.
      setSession(prepared.session)
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const [impersonationTick, setImpersonationTick] = useState(0)
  useEffect(() => {
    const onChange = () => setImpersonationTick((n) => n + 1)
    window.addEventListener(IMPERSONATION_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(IMPERSONATION_CHANGE_EVENT, onChange)
  }, [])

  useEffect(() => {
    if (loading) return
    if (!session?.user) return
    identifyPosthogUser({
      userId: session.user.id,
      email: profile?.email,
      name: profile?.full_name,
      callsign: profile?.callsign,
      roles,
    })
  }, [loading, session, profile, roles, impersonationTick])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const badCredentials = /invalid login credentials/i.test(error.message)
      return {
        error: badCredentials
          ? 'הדוא״ל או הסיסמה שגויים. נסו שוב.'
          : 'הכניסה נכשלה. בדקו את החיבור ונסו שוב.',
      }
    }

    // Arm the gate immediately (do not wait for onAuthStateChange ordering).
    if (data.session) {
      const prepared = await prepareSession(data.session, 'SIGNED_IN')
      if (prepared.kind === 'signed_out') {
        return { error: 'החשבון אינו פעיל. פנו למנהל המערכת.' }
      }
      setProfile(prepared.profile)
      setRoles(prepared.roles)
      setPasswordSetupReason(prepared.passwordSetupReason)
      setSession(prepared.session)
    }

    return { error: null }
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?set_password=1`,
    })
    return { error: error ? 'שליחת הקישור נכשלה. בדקו את החיבור ונסו שוב.' : null }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const strengthError = passwordStrengthError(password)
    if (strengthError) return { error: strengthError }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      if (/weak|least|characters|short/i.test(error.message)) {
        return {
          error:
            'הסיסמה אינה עומדת בדרישות. יש לכלול: 8 תווים לפחות, אות גדולה ותו מיוחד (למשל !).',
        }
      }
      return { error: 'שמירת הסיסמה נכשלה. נסו שוב.' }
    }

    const {
      data: { user: current },
    } = await supabase.auth.getUser()
    if (current?.id) {
      await supabase.rpc('clear_must_change_password')
      await supabase
        .from('profiles')
        .update({
          invite_pending: false,
          invite_token: null,
          invite_token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id)
      setProfile((prev) => (prev ? { ...prev, must_change_password: false } : prev))
    }

    // Clear durable intent + URL so refresh cannot reopen the gate; keep React
    // reason until acknowledgePasswordSetup so the confirmation screen can show.
    clearPasswordSetupIntent()
    stripPasswordSetupFromUrl()
    return { error: null }
  }, [])

  const redeemInviteToken = useCallback(async () => {
    setAuthBootstrapError(null)
    const result = await redeemStashedAuthToken()
    if (result.error) {
      setAuthBootstrapError(result.error)
      setPasswordSetupReason(getPasswordSetupReason())
      return result
    }
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) {
      const prepared = await prepareSession(data.session)
      if (prepared.kind === 'signed_out') {
        setSession(null)
        setProfile(null)
        setRoles([])
        setPasswordSetupReason(null)
        return { error: 'החשבון אינו פעיל. פנו למנהל המערכת.' }
      }
      setProfile(prepared.profile)
      setRoles(prepared.roles)
      setPasswordSetupReason(prepared.passwordSetupReason)
      setSession(prepared.session)
    } else {
      setPasswordSetupReason(getPasswordSetupReason())
    }
    return { error: null }
  }, [])

  const acknowledgePasswordSetup = useCallback(() => {
    clearPasswordSetupIntent()
    stripPasswordSetupFromUrl()
    setPasswordSetupReason(null)
  }, [])

  const signOut = useCallback(async () => {
    clearImpersonationStash()
    clearPasswordSetupIntent()
    setPasswordSetupReason(null)
    resetPosthogUser()
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      roles,
      loading,
      passwordSetupReason,
      authBootstrapError,
      signIn,
      requestPasswordReset,
      updatePassword,
      redeemInviteToken,
      acknowledgePasswordSetup,
      signOut,
    }),
    [
      session,
      profile,
      roles,
      loading,
      passwordSetupReason,
      authBootstrapError,
      signIn,
      requestPasswordReset,
      updatePassword,
      redeemInviteToken,
      acknowledgePasswordSetup,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
