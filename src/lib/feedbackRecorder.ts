import {
  FEEDBACK_MIC_ERROR,
  FEEDBACK_RECORD_MAX_SECONDS,
  FEEDBACK_RECORD_UNSUPPORTED,
} from './userFeedback'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

export function pickRecorderMime(
  isTypeSupported: (mime: string) => boolean = (mime) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime),
): string {
  return MIME_CANDIDATES.find((mime) => isTypeSupported(mime)) ?? ''
}

export function recorderCapabilityError(
  hasMediaRecorder: boolean = typeof MediaRecorder !== 'undefined',
  hasGetUserMedia: boolean = Boolean(navigator.mediaDevices?.getUserMedia),
): string | undefined {
  if (!hasMediaRecorder || !hasGetUserMedia) return FEEDBACK_RECORD_UNSUPPORTED
  return undefined
}

export async function startFeedbackRecording(): Promise<
  | {
      ok: true
      recorder: MediaRecorder
      stream: MediaStream
      mime: string
    }
  | { ok: false; error: string }
> {
  const capability = recorderCapabilityError()
  if (capability) return { ok: false, error: capability }

  const mime = pickRecorderMime()
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream)
    return { ok: true, recorder, stream, mime: recorder.mimeType || mime || 'audio/webm' }
  } catch {
    return { ok: false, error: FEEDBACK_MIC_ERROR }
  }
}

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function shouldAutoStopRecording(elapsedSeconds: number): boolean {
  return elapsedSeconds >= FEEDBACK_RECORD_MAX_SECONDS
}
