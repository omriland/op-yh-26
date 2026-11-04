/** Pure rules for משוב voice-note transcription. No network, no secrets. */

export const SCRIBE_MODEL_ID = "scribe_v2";
export const SCRIBE_LANGUAGE_CODE = "he";

export const TRANSCRIPT_FAILED = "התמלול נכשל.";
export const TRANSCRIPT_RETRY = "התמלול נכשל. נסו שוב בעוד רגע.";

export type TranscriptCandidate = {
  id: string;
  audioStoragePath: string | null;
  transcript: string | null;
};

export function hasFeedbackTranscript(transcript: string | null | undefined): boolean {
  return Boolean(transcript && transcript.trim());
}

export function needsFeedbackTranscript(row: TranscriptCandidate): boolean {
  return Boolean(row.audioStoragePath) && !hasFeedbackTranscript(row.transcript);
}

/** Ids to send once. Skips rows that already have a transcript, and repeats. */
export function feedbackIdsNeedingTranscript(rows: readonly TranscriptCandidate[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of rows) {
    if (!needsFeedbackTranscript(row) || seen.has(row.id)) continue;
    seen.add(row.id);
    ids.push(row.id);
  }
  return ids;
}

/**
 * Inbox access is super_admin (same as user_feedback select for someone else's row).
 * Missing session is 401. A signed-in user who is not super_admin is 403.
 */
export function transcriptRequestDecision(input: {
  hasUser: boolean;
  isSuperAdmin: boolean;
}): { status: 401 | 403 | 200 } {
  if (!input.hasUser) return { status: 401 };
  if (!input.isSuperAdmin) return { status: 403 };
  return { status: 200 };
}

export function transcriptionFailureMessage(status: number | null): string {
  if (status === 429) return TRANSCRIPT_RETRY;
  return TRANSCRIPT_FAILED;
}

export function transcriptFromScribeResponse(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const text = (body as { text?: unknown }).text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}
