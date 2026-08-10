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
import { passwordStrengthError } from './passwordRules'
import { supabase } from './supabase'

export type AppRole = 'admin' | 'shift_lead' | 'responder'

export type Profile = {
  id: string
  full_name: string
  email: string
  callsign: string
  phone: string | null
  active: boolean
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
      .select('id, full_name, email, callsign, phone, active')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ])

  return {
    profile: (profile as Profile | null) ?? null,
    roles: (roleRows ?? []).map((r) => r.role as AppRole),
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
      setPasswordSetupReason(getPasswordSetupReason())

      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session)
      setPasswordSetupReason(getPasswordSetupReason())
      if (data.session?.user) {
        const loaded = await loadProfileAndRoles(data.session.user.id)
        if (!mounted) return
        if (loaded.profile && loaded.profile.active === false) {
          clearPasswordSetupIntent()
          await supabase.auth.signOut()
          setSession(null)
          setProfile(null)
          setRoles([])
          setPasswordSetupReason(null)
        } else {
          setProfile(loaded.profile)
          setRoles(loaded.roles)
        }
      }
      setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordSetupRequired('recovery')
        setPasswordSetupReason('recovery')
      } else if (event === 'SIGNED_IN') {
        // Invite links fire SIGNED_IN (not PASSWORD_RECOVERY). Intent is
        // captured from the URL hash / set_password query before createClient.
        // Only adopt storage → reason; never clear an in-flight setup (e.g. after
        // updateUser) when storage was already cleared for the confirmation step.
        const fromStorage = getPasswordSetupReason()
        if (fromStorage) setPasswordSetupReason(fromStorage)
      }

      setSession(next)
      if (next?.user) {
        const loaded = await loadProfileAndRoles(next.user.id)
        if (loaded.profile && loaded.profile.active === false) {
          clearPasswordSetupIntent()
          await supabase.auth.signOut()
          setSession(null)
          setProfile(null)
          setRoles([])
          setPasswordSetupReason(null)
        } else {
          setProfile(loaded.profile)
          setRoles(loaded.roles)
        }
      } else {
        setProfile(null)
        setRoles([])
        // Do not clear password-setup intent on SIGNED_OUT. Invite verifyOtp
        // signs out any prior session first; clearing here dropped users on the
        // normal login screen (especially in a clean/incognito browser).
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return { error: null }
    const badCredentials = /invalid login credentials/i.test(error.message)
    return {
      error: badCredentials
        ? 'הדוא״ל או הסיסמה שגויים. נסו שוב.'
        : 'הכניסה נכשלה. בדקו את החיבור ונסו שוב.',
    }
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
      await supabase
        .from('profiles')
        .update({
          invite_pending: false,
          invite_token: null,
          invite_token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id)
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
    setSession(data.session)
    setPasswordSetupReason(getPasswordSetupReason())
    if (data.session?.user) {
      const loaded = await loadProfileAndRoles(data.session.user.id)
      setProfile(loaded.profile)
      setRoles(loaded.roles)
    }
    return { error: null }
  }, [])

  const acknowledgePasswordSetup = useCallback(() => {
    clearPasswordSetupIntent()
    stripPasswordSetupFromUrl()
    setPasswordSetupReason(null)
  }, [])

  const signOut = useCallback(async () => {
    clearPasswordSetupIntent()
    setPasswordSetupReason(null)
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
