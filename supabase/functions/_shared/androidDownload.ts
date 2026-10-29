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
