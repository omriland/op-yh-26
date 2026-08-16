/** Keep in sync with `src/lib/otpSmsProvider.ts`. */
export type OtpSmsPurpose = "login_device" | "users_page";
export type OtpSmsProvider = "twilio" | "soprano";

export const OTP_SMS_MESSAGE_PREFIX = "קוד האימות באבן דרך: ";

/** Login + users-page OTP use Twilio. Unit broadcasts stay on Soprano. */
export function otpSmsProvider(purpose: OtpSmsPurpose): OtpSmsProvider {
  switch (purpose) {
    case "login_device":
    case "users_page":
      return "twilio";
  }
}

export function buildOtpSmsMessage(code: string): string {
  return `${OTP_SMS_MESSAGE_PREFIX}${code}`;
}
