import { describe, expect, it } from 'vitest'
import { FEEDBACK_RECORD_UNSUPPORTED } from './userFeedback'
import {
  pickRecorderMime,
  recorderCapabilityError,
  shouldAutoStopRecording,
} from './feedbackRecorder'

describe('pickRecorderMime', () => {
  it('returns the first supported candidate', () => {
    expect(pickRecorderMime((mime) => mime === 'audio/mp4')).toBe('audio/mp4')
  })

  it('returns empty when nothing is supported', () => {
    expect(pickRecorderMime(() => false)).toBe('')
  })
})

describe('recorderCapabilityError', () => {
  it('blocks when MediaRecorder or getUserMedia is missing', () => {
    expect(recorderCapabilityError(false, true)).toBe(FEEDBACK_RECORD_UNSUPPORTED)
    expect(recorderCapabilityError(true, false)).toBe(FEEDBACK_RECORD_UNSUPPORTED)
    expect(recorderCapabilityError(true, true)).toBeUndefined()
  })
})

describe('shouldAutoStopRecording', () => {
  it('stops at 90 seconds', () => {
    expect(shouldAutoStopRecording(89)).toBe(false)
    expect(shouldAutoStopRecording(90)).toBe(true)
  })
})
