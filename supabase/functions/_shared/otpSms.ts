/** Keep in sync with `src/lib/otpSmsProvider.ts`. */
export type OtpSmsPurpose = "login_device" | "users_page";
export type OtpSmsProvider = "twilio" | "soprano";

export const OTP_SMS_MESSAGE_PREFIX = "קוד האימות באבן דרך: ";

export function otpSmsProvider(purpose: OtpSmsPurpose): OtpSmsProvider {
  return purpose === "login_device" ? "twilio" : "soprano";
}

export function buildOtpSmsMessage(code: string): string {
  return `${OTP_SMS_MESSAGE_PREFIX}${code}`;
}
