import { describe, expect, it } from 'vitest'
import {
  feedbackIdsNeedingTranscript,
  needsFeedbackTranscript,
  transcriptFromScribeResponse,
  transcriptRequestDecision,
  transcriptionFailureMessage,
} from '../../supabase/functions/_shared/feedbackTranscript'

const audio = {
  id: 'a',
  audioStoragePath: 'user/note.m4a',
  transcript: null,
}

describe('feedbackIdsNeedingTranscript', () => {
  it('calls only when there is audio and no transcript', () => {
    expect(needsFeedbackTranscript(audio)).toBe(true)
    expect(needsFeedbackTranscript({ ...audio, audioStoragePath: null })).toBe(false)
    expect(needsFeedbackTranscript({ ...audio, transcript: 'שלום' })).toBe(false)
    expect(needsFeedbackTranscript({ ...audio, transcript: '   ' })).toBe(true)
    expect(feedbackIdsNeedingTranscript([audio, { ...audio, id: 'b', audioStoragePath: null }])).toEqual([
      'a',
    ])
  })

  it('does not list an id twice, and drops it once a transcript exists', () => {
    expect(feedbackIdsNeedingTranscript([audio, { ...audio }])).toEqual(['a'])
    expect(feedbackIdsNeedingTranscript([{ ...audio, transcript: 'כבר תומלל' }])).toEqual([])
  })
})

describe('transcriptRequestDecision', () => {
  it('rejects a missing session and a signed-in user who is not super_admin', () => {
    expect(transcriptRequestDecision({ hasUser: false, isSuperAdmin: false })).toEqual({ status: 401 })
    expect(transcriptRequestDecision({ hasUser: true, isSuperAdmin: false })).toEqual({ status: 403 })
    expect(transcriptRequestDecision({ hasUser: true, isSuperAdmin: true })).toEqual({ status: 200 })
  })
})

describe('transcriptionFailureMessage', () => {
  it('maps rate limit separately and keeps other failures short', () => {
    expect(transcriptionFailureMessage(429)).toBe('התמלול נכשל. נסו שוב בעוד רגע.')
    expect(transcriptionFailureMessage(401)).toBe('התמלול נכשל.')
    expect(transcriptionFailureMessage(500)).toBe('התמלול נכשל.')
    expect(transcriptionFailureMessage(null)).toBe('התמלול נכשל.')
  })
})

describe('transcriptFromScribeResponse', () => {
  it('keeps spoken text and rejects an empty body', () => {
    expect(transcriptFromScribeResponse({ text: '  שלום ' })).toBe('שלום')
    expect(transcriptFromScribeResponse({ text: '   ' })).toBeNull()
    expect(transcriptFromScribeResponse({})).toBeNull()
    expect(transcriptFromScribeResponse(null)).toBeNull()
  })
})
