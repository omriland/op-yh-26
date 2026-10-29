/**
 * The initial-login invite: the email (Resend), then the SMS unless the caller
 * turns it off. Moved out of admin-users so tests can see every request;
 * `fetchImpl` is injectable for that.
 */
import {
  ANDROID_APP_DOWNLOAD_LABEL,
  ANDROID_APP_DOWNLOAD_URL,
  androidDownloadButtonHtml,
} from "./androidDownload.ts";
import { type InviteSmsResult, sendInviteSms, type SopranoCredentials } from "./inviteSms.ts";

export type InviteDeliveryResult =
  | { error: string; detail?: string }
  | { error: null; sms: InviteSmsResult | "off" };

/**
 * A failed email stops here, with no SMS. A failed SMS does not fail the
 * invite. `sendSms: false` sends the email only and reports sms "off".
 */
export async function deliverInvite(
  invite: {
    to: string;
    fullName: string;
    actionLink: string;
    phone: string | null;
    sendSms: boolean;
  },
  env: { resendApiKey: string | undefined; soprano: SopranoCredentials },
  fetchImpl: typeof fetch = fetch,
): Promise<InviteDeliveryResult> {
  const mail = await sendInviteEmail(
    invite.to,
    invite.fullName,
    invite.actionLink,
    env.resendApiKey,
    fetchImpl,
  );
  if (mail.error !== null) return { error: mail.error, detail: mail.detail };
  if (!invite.sendSms) return { error: null, sms: "off" };
  const sms = await sendInviteSms(invite.phone, env.soprano, fetchImpl);
  if (sms === "failed") console.error("admin-users: invite SMS was not sent");
  return { error: null, sms };
}

export async function sendInviteEmail(
  to: string,
  fullName: string,
  actionLink: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<{ error: string | null; detail?: string }> {
  if (!apiKey) {
    return { error: "חסר מפתח Resend בשרת. פנו למנהל המערכת." };
  }

  const text = [
    "אבן דרך",
    "יחפ״צ · היחידה הארצית לפינוי צירים",
    "",
    `שלום ${fullName},`,
    "",
    "הוזמנת למערכת 'אבן דרך' - מערכת הניהול של היחידה הארצית לפינוי צירים.",
    "לכניסה ראשונית למערכת והגדרת סיסמה, יש ללחוץ על הקישור:",
    actionLink,
    "",
    `או להעתיק את הכתובת: ${actionLink}`,
    "",
    "הקישור בתוקף ל־7 ימים.",
    "",
    "אחרי השלמת הרישום אפשר להוריד את האפליקציה לטלפון:",
    `${ANDROID_APP_DOWNLOAD_LABEL}: ${ANDROID_APP_DOWNLOAD_URL}`,
    "",
    "אם לא ציפית להזמנה זו, ניתן להתעלם מההודעה",
  ].join("\n");

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "אבן דרך - יחפ״צ <invites@send.yahpz.com>",
      to: [to],
      subject: 'הוזמנת למערכת אבן דרך - יחפ״צ',
      text,
      html: `
        <div dir="rtl" lang="he" style="margin:0;padding:0;background:#F6F8FA;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FA;padding:24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #DDE4EB;">
                  <tr>
                    <td style="background:#182A47;padding:20px 24px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#F2F6FA;letter-spacing:0.02em;">אבן דרך</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#DDE4EB;margin-top:4px;">יחפ״צ · היחידה הארצית לפינוי צירים</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#0F1B2D;text-align:right;">
                      <p style="margin:0 0 16px;">שלום ${fullName},</p>
                      <p style="margin:0 0 16px;">הוזמנת למערכת 'אבן דרך' - מערכת הניהול של היחידה הארצית לפינוי צירים.</p>
                      <p style="margin:0 0 24px;">לכניסה ראשונית למערכת והגדרת סיסמה, יש ללחוץ על הקישור.</p>
                      <p style="margin:0 0 28px;text-align:center;">
                        <a href="${actionLink}" style="display:inline-block;background:#1D4E89;color:#FFFFFF;text-decoration:none;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;border-radius:4px;">להשלמת הרישום</a>
                      </p>
                      <p style="margin:0 0 16px;font-size:13px;color:#5B6F86;word-break:break-all;">
                        או להעתיק את הכתובת: ${actionLink}
                      </p>
                      <p style="margin:0 0 20px;font-size:14px;color:#5B6F86;">הקישור בתוקף ל־7 ימים.</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                        <tr>
                          <td style="border-top:1px solid #DDE4EB;font-size:0;line-height:0;height:1px;">&nbsp;</td>
                        </tr>
                      </table>
                      <p style="margin:0 0 16px;">אחרי השלמת הרישום אפשר להוריד את האפליקציה לטלפון:</p>
                      ${androidDownloadButtonHtml()}
                      <p style="margin:0;font-size:14px;color:#5B6F86;">אם לא ציפית להזמנה זו, ניתן להתעלם מההודעה</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { error: "שליחת ההזמנה בדוא״ל נכשלה. בדקו את החיבור ונסו שוב.", detail };
  }

  return { error: null };
}
