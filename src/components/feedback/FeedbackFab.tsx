import { useEffect, useRef, useState } from 'react'
import { ImagePlus, MessageSquarePlus, Mic, Square, Trash2 } from 'lucide-react'
import { Button, IconButton } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { TextAreaField } from '../ui/TextAreaField'
import { useToast } from '../ui/Toast'
import {
  startFeedbackRecording,
  stopMediaStream,
  shouldAutoStopRecording,
} from '../../lib/feedbackRecorder'
import {
  FEEDBACK_ATTACH_HINT,
  FEEDBACK_ATTACH_MAX,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_RECORD_MAX_SECONDS,
  addFeedbackAttachments,
  feedbackSubmitError,
  formatRecordSeconds,
  submitUserFeedback,
  type FeedbackKind,
} from '../../lib/userFeedback'

type FeedbackFabProps = {
  pagePath: string | null
}

export function FeedbackFab({ pagePath }: FeedbackFabProps) {
  const { show } = useToast()
  const [open, setOpen] = useState(false)
  const [hiddenUntilRefresh, setHiddenUntilRefresh] = useState(false)
  const [kind, setKind] = useState<FeedbackKind | null>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string>()
  const [attachError, setAttachError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      stopMediaStream(streamRef.current)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    const tick = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000)
      setElapsed(seconds)
      if (shouldAutoStopRecording(seconds)) stopRecording()
    }, 250)
    return () => window.clearInterval(tick)
  }, [recording])

  function resetForm() {
    setKind(null)
    setBody('')
    setError(undefined)
    setAttachError(undefined)
    setBusy(false)
    setRecording(false)
    setElapsed(0)
    setAudio(null)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    chunksRef.current = []
    stopMediaStream(streamRef.current)
    streamRef.current = null
    recorderRef.current = null
  }

  function close() {
    if (busy) return
    if (recording) stopRecording()
    setOpen(false)
    resetForm()
  }

  function hideUntilRefresh() {
    if (busy) return
    if (recording) stopRecording()
    setHiddenUntilRefresh(true)
    setOpen(false)
    resetForm()
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }

  async function startRecording() {
    setError(undefined)
    const result = await startFeedbackRecording()
    if (!result.ok) {
      setError(result.error)
      return
    }
    chunksRef.current = []
    streamRef.current = result.stream
    recorderRef.current = result.recorder
    result.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    result.recorder.onstop = () => {
      stopMediaStream(streamRef.current)
      streamRef.current = null
      recorderRef.current = null
      setRecording(false)
      const blob = new Blob(chunksRef.current, { type: result.mime })
      chunksRef.current = []
      if (blob.size === 0) return
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      setAudio(blob)
      setAudioUrl(URL.createObjectURL(blob))
    }
    result.recorder.start()
    setElapsed(0)
    setRecording(true)
  }

  function clearAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudio(null)
    setAudioUrl(null)
    setElapsed(0)
  }

  async function submit() {
    const nextError = feedbackSubmitError({
      kind,
      body,
      hasAudio: Boolean(audio),
    })
    if (nextError || !kind) {
      setError(nextError)
      return
    }
    setBusy(true)
    const result = await submitUserFeedback({
      kind,
      body,
      pagePath,
      audio,
      files,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    show('המשוב נשלח. תודה.', 'done')
    setOpen(false)
    resetForm()
  }

  return (
    <>
      {open || hiddenUntilRefresh ? null : (
        <div className="feedback-fab">
          <IconButton
            className="feedback-fab__btn"
            variant="primary"
            label="משוב"
            onClick={() => setOpen(true)}
          >
            <MessageSquarePlus size={20} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>
      )}
      <Dialog
        open={open}
        title="משוב"
        form
        onClose={close}
        footer={
          <>
            <Button
              type="button"
              variant="primary"
              loading={busy}
              loadingLabel="שולח…"
              disabled={recording}
              onClick={() => void submit()}
            >
              שליחה
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || recording}
              onClick={hideUntilRefresh}
            >
              הסתרה עד הרענון הבא
            </Button>
          </>
        }
      >
        <div className="stack-4">
          <fieldset className="field">
            <legend className="field__label">סוג</legend>
            <div className="chips" role="group" aria-label="סוג משוב">
              {(['bug', 'suggestion'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                >
                  {FEEDBACK_KIND_LABEL[value]}
                </button>
              ))}
            </div>
          </fieldset>
          <TextAreaField
            label="הערה"
            hint="אפשר לכתוב, להקליט, לצרף קבצים, או לשלב."
            placeholder="למשל: אחרי שמירה המסך נשאר ריק"
            rows={4}
            maxLength={2000}
            value={body}
            error={error}
            onChange={(event) => {
              setBody(event.target.value)
              setError(undefined)
            }}
          />
          <div className="feedback-record">
            {recording ? (
              <div className="feedback-record__live">
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Square size={20} strokeWidth={1.75} aria-hidden="true" />}
                  onClick={stopRecording}
                >
                  עצירת הקלטה
                </Button>
                <p className="t-num feedback-record__time" aria-live="polite">
                  {formatRecordSeconds(elapsed)} / {formatRecordSeconds(FEEDBACK_RECORD_MAX_SECONDS)}
                </p>
              </div>
            ) : audioUrl ? (
              <div className="feedback-record__preview">
                <audio className="feedback-record__audio" controls src={audioUrl} />
                <IconButton label="מחיקת הקלטה" variant="ghost" onClick={clearAudio}>
                  <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                icon={<Mic size={20} strokeWidth={1.75} aria-hidden="true" />}
                onClick={() => void startRecording()}
              >
                הקלטה
              </Button>
            )}
          </div>
          <fieldset className="field">
            <legend className="field__label">קבצים</legend>
            {attachError ? (
              <p className="field__hint field__hint--error" role="alert">
                {attachError}
              </p>
            ) : (
              <p className="field__hint">{FEEDBACK_ATTACH_HINT}</p>
            )}
            {files.length > 0 ? (
              <ul className="feedback-attach__list">
                {files.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`} className="feedback-attach__row">
                    <span className="t-body feedback-attach__name" dir="ltr">
                      {file.name}
                    </span>
                    <IconButton
                      label="הסרת קובץ"
                      variant="ghost"
                      disabled={busy || recording}
                      onClick={() => {
                        setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
                        setAttachError(undefined)
                      }}
                    >
                      <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            ) : null}
            {files.length < FEEDBACK_ATTACH_MAX ? (
              <div className="feedback-attach">
                <input
                  ref={fileInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={busy || recording}
                  onChange={(event) => {
                    const picked = Array.from(event.target.files ?? [])
                    event.target.value = ''
                    if (picked.length === 0) return
                    const result = addFeedbackAttachments(files, picked)
                    setFiles(result.files)
                    setAttachError(result.error)
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || recording}
                  icon={<ImagePlus size={20} strokeWidth={1.75} aria-hidden="true" />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  צירוף קובץ
                </Button>
              </div>
            ) : null}
          </fieldset>
        </div>
      </Dialog>
    </>
  )
}
