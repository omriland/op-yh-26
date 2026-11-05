export type LoginOtpCheck = 'idle' | 'ok' | 'check' | 'keep'

/**
 * Whether the login OTP gate should run again.
 *
 * A tab returning to the foreground makes Supabase emit SIGNED_IN for the
 * same user. Treating that as a new login sets the gate to "checking" and
 * unmounts the app, which closes whatever form was open.
 */
export function loginOtpCheck(input: {
  signedIn: boolean
  passwordSetup: boolean
  impersonating: boolean
  otpLoginEnabled: boolean
  userId: string | null
  clearedUserId: string | null
}): LoginOtpCheck {
  if (!input.signedIn || input.passwordSetup) return 'idle'
  if (input.impersonating || !input.otpLoginEnabled) return 'ok'
  if (input.userId && input.userId === input.clearedUserId) return 'keep'
  return 'check'
}
