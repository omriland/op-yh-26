/** Shared Resend transactional email helpers for Edge Functions. */

export type SendTransactionalInput = {
  to: string
  subject: string
  /** Inner HTML only (no full document). Placed inside the אבן דרך shell body. */
  htmlInner: string
  textInner?: string
  idempotencyKey?: string
}

export type SendTransactionalResult =
  | { ok: true; id: string }
  | { ok: false; error: string; detail?: string }

const DEFAULT_FROM = "אבן דרך - יחפ״צ <alerts@send.yahpz.com>";

export function emailFromAddress(): string {
  const raw = Deno.env.get("EMAIL_FROM")?.trim();
  if (!raw) return DEFAULT_FROM;
  if (raw.includes("<")) return raw;
  return `אבן דרך - יחפ״צ <${raw}>`;
}

/** Naive HTML → text for multipart fallback. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function wrapEmailShell(htmlInner: string): string {
  return `
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
                      ${htmlInner}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `;
}

export function ctaButtonHtml(href: string, label: string): string {
  return `<p style="margin:0 0 28px;text-align:center;">
                        <a href="${href}" style="display:inline-block;background:#1D4E89;color:#FFFFFF;text-decoration:none;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;border-radius:4px;">${label}</a>
                      </p>`;
}

/** Official Android sideload page — no Play Store listing. */
export const ANDROID_APP_DOWNLOAD_URL = "https://yahpz.com/android";
export const ANDROID_APP_DOWNLOAD_LABEL = "הורדת אפליקציית אנדרואיד";
export const ANDROID_APP_ICON_URL = "https://yahpz.com/email/android-icon.png";

/**
 * Email-safe outlined button with Android robot icon (hosted PNG).
 * Table + inline styles; no JS. Icon is decorative so the label still stands if images are blocked.
 */
export function androidDownloadButtonHtml(
  href = ANDROID_APP_DOWNLOAD_URL,
  label = ANDROID_APP_DOWNLOAD_LABEL,
  iconSrc = ANDROID_APP_ICON_URL,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 24px;">
                        <tr>
                          <td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;border:2px solid #1D4E89;border-radius:4px;">
                            <a href="${href}" target="_blank" style="display:inline-block;background:#FFFFFF;color:#1D4E89;text-decoration:none;padding:11px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:18px;border-radius:4px;">
                              <img src="${iconSrc}" width="18" height="18" alt="" style="display:inline-block;vertical-align:middle;border:0;margin:0 0 0 8px;" />
                              ${label}
                            </a>
                          </td>
                        </tr>
                      </table>`;
}

export async function sendTransactionalEmail(
  input: SendTransactionalInput,
): Promise<SendTransactionalResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "חסר מפתח Resend בשרת. פנו למנהל המערכת." };
  }

  const text =
    input.textInner?.trim() ||
    ["אבן דרך", "יחפ״צ · היחידה הארצית לפינוי צירים", "", htmlToText(input.htmlInner)].join(
      "\n",
    );

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey.slice(0, 256);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: emailFromAddress(),
      to: [input.to],
      subject: input.subject,
      text,
      html: wrapEmailShell(input.htmlInner),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return {
      ok: false,
      error: "שליחת הדוא״ל נכשלה. בדקו את החיבור ונסו שוב.",
      detail,
    };
  }

  let id = "";
  try {
    const body = (await response.json()) as { id?: string };
    id = body.id ?? "";
  } catch {
    id = "";
  }

  return { ok: true, id };
}
