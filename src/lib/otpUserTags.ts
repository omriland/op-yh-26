/** Compact OTP status for admin users table/cards. Column header already says OTP. */
export function otpUserLabel(flags: {
  otp_login_enabled: boolean
  otp_users_page_enabled: boolean
}): string | null {
  // "שניהם" keeps the OTP column width stable vs "כניסה · משתמשים".
  if (flags.otp_login_enabled && flags.otp_users_page_enabled) return 'שניהם'
  if (flags.otp_login_enabled) return 'כניסה'
  if (flags.otp_users_page_enabled) return 'משתמשים'
  return null
}
