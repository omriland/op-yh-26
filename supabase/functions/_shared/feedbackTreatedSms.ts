/** Keep in sync with `src/lib/userFeedback.ts`. */

export const FEEDBACK_SMS_EXCERPT_MAX = 80;
export const FEEDBACK_SMS_AUDIO_EXCERPT = "ההקלטה";
export const FEEDBACK_SMS_FALLBACK_EXCERPT = "המשוב";

export function firstNameFromFullName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

export function feedbackSmsExcerpt(
  body: string | null | undefined,
  hasAudio: boolean,
): string {
  const compact = (body ?? "").replace(/\s+/g, " ").trim();
  if (!compact) {
    return hasAudio ? FEEDBACK_SMS_AUDIO_EXCERPT : FEEDBACK_SMS_FALLBACK_EXCERPT;
  }
  if (compact.length <= FEEDBACK_SMS_EXCERPT_MAX) return compact;
  return `${compact.slice(0, FEEDBACK_SMS_EXCERPT_MAX - 1)}…`;
}

export function buildFeedbackTreatedSms(input: {
  fullName: string | null | undefined;
  body: string | null | undefined;
  hasAudio: boolean;
}): string {
  const first = firstNameFromFullName(input.fullName);
  const greeting = first ? `היי, ${first},` : "היי,";
  const excerpt = feedbackSmsExcerpt(input.body, input.hasAudio);
  return `${greeting}\nרק רצינו לעדכן שהפידבק שנתת על ${excerpt} טופל\n"אבן דרך"`;
}
