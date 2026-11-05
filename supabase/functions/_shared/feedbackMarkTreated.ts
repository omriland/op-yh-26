import { buildFeedbackTreatedSms } from "./feedbackTreatedSms.ts";

export type MarkTreatedRow = {
  status: string;
  title: string | null;
  body: string | null;
  audio_storage_path: string | null;
  author: { full_name: string | null; phone: string | null };
};

export type MarkTreatedSms = "sent" | "skipped" | "skipped_no_phone" | "failed";

/**
 * Sets the row to fixed and texts the submitter once. A task (title set) was
 * opened by a super admin, so it never texts anyone.
 */
export async function markFeedbackTreated(
  row: MarkTreatedRow,
  deps: {
    setFixed: () => Promise<boolean>;
    smsDestination: (phone: string | null) => string | null;
    sendSms: (destination: string, message: string) => Promise<boolean>;
  },
): Promise<{ ok: true; sms: MarkTreatedSms } | { ok: false }> {
  const alreadyFixed = row.status === "fixed";
  if (!alreadyFixed && !(await deps.setFixed())) return { ok: false };
  if (row.title !== null) return { ok: true, sms: "skipped" };
  if (alreadyFixed) return { ok: true, sms: "sent" };

  const destination = deps.smsDestination(row.author.phone);
  if (!destination) return { ok: true, sms: "skipped_no_phone" };

  const message = buildFeedbackTreatedSms({
    fullName: row.author.full_name,
    body: row.body,
    hasAudio: Boolean(row.audio_storage_path),
  });
  const sent = await deps.sendSms(destination, message);
  return { ok: true, sms: sent ? "sent" : "failed" };
}
