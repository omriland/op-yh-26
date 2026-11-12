import { buildFeedbackTreatedSms } from "./feedbackTreatedSms.ts";

export type MarkTreatedRow = {
  status: string;
  /** Null on a task a super admin opened; set on feedback a member sent. */
  kind: string | null;
  title: string | null;
  body: string | null;
  audio_storage_path: string | null;
  author: { full_name: string | null; phone: string | null };
};

export type MarkTreatedSms =
  | "sent"
  | "already_sent"
  | "skipped"
  | "skipped_no_phone"
  | "failed";

/**
 * Result of claiming the one SMS a feedback item may send: `claimed` (this
 * request sends), `already_sent` (sent, or a send was claimed and never
 * released), or `error` (the record could not be read or written).
 */
export type SmsClaim = "claimed" | "already_sent" | "error";

/**
 * Sets the row to fixed and texts the submitter at most once, ever. A task
 * (kind null) was opened by a super admin, so it never texts anyone — a title
 * on submitted feedback is only a label and does not change that.
 *
 * The once-only rule is the claim: an atomic write that succeeds for one
 * request only. A failed send releases it so a later טופל can try again; a
 * successful send records sms_sent_at. If recording fails after Soprano
 * accepted the message, the claim stays, so nothing is sent again.
 */
export async function markFeedbackTreated(
  row: MarkTreatedRow,
  deps: {
    setFixed: () => Promise<boolean>;
    smsDestination: (phone: string | null) => string | null;
    claimSms: () => Promise<SmsClaim>;
    sendSms: (destination: string, message: string) => Promise<boolean>;
    markSmsSent: () => Promise<void>;
    releaseSms: () => Promise<void>;
  },
): Promise<{ ok: true; sms: MarkTreatedSms } | { ok: false }> {
  if (row.status !== "fixed" && !(await deps.setFixed())) return { ok: false };
  if (row.kind === null) return { ok: true, sms: "skipped" };

  const destination = deps.smsDestination(row.author.phone);
  if (!destination) return { ok: true, sms: "skipped_no_phone" };

  const claim = await deps.claimSms();
  if (claim === "already_sent") return { ok: true, sms: "already_sent" };
  // Fail closed: without a record of the claim, texting could repeat.
  if (claim !== "claimed") return { ok: true, sms: "failed" };

  const message = buildFeedbackTreatedSms({
    fullName: row.author.full_name,
    body: row.body,
    hasAudio: Boolean(row.audio_storage_path),
  });
  if (!(await deps.sendSms(destination, message))) {
    await deps.releaseSms();
    return { ok: true, sms: "failed" };
  }
  await deps.markSmsSent();
  return { ok: true, sms: "sent" };
}
