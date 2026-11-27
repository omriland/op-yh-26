import { isEventFrozen, type EventFreezeFlags } from './eventFreeze'
import type { EventDetail, EventResponderDetail } from './events'
import { formatDate, formatEndTime, formatNumber, formatTime } from './format'

export type EventPreviewResponderSource = Pick<
  EventResponderDetail,
  'id' | 'responder_id' | 'total_km' | 'frozen_over_60km' | 'frozen_suspicious_duplicate'
> & {
  profile: { full_name: string; callsign: string } | null
}

export type EventPreviewSource = Pick<
  EventDetail,
  | 'id'
  | 'event_date'
  | 'started_at'
  | 'ended_at'
  | 'police_event_id'
  | 'location'
  | 'status'
  | 'is_cancelled'
  | 'frozen_over_60km'
  | 'frozen_suspicious_duplicate'
  | 'district'
  | 'event_type'
  | 'road'
  | 'shift_lead'
> & {
  responders: EventPreviewResponderSource[]
}

export type EventPreviewRow = { label: string; value: string }

export type EventPreviewResponder = {
  id: string
  name: string
  callsign: string
  kmLabel: string
  frozen: boolean
}

export type EventPreview = {
  title: string
  rows: EventPreviewRow[]
  frozen: boolean
  freezeFlags: Required<EventFreezeFlags>
  responders: EventPreviewResponder[]
  responderCount: number
  totalKmLabel: string | null
}

const EMPTY_VALUE = '—'
const DEFAULT_TITLE = 'אירוע'
const LABEL_PREFIX = 'תצוגה מקדימה של אירוע'

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function timeRange(source: EventPreviewSource): string | null {
  const start = formatTime(source.started_at)
  const end = formatEndTime(source.ended_at, source.event_date)
  if (start && end) return `${start} - ${end}`
  return start ?? end ?? null
}

function shiftLeadText(source: EventPreviewSource): string | null {
  const lead = source.shift_lead
  if (!lead) return null
  return [textOrNull(lead.callsign), textOrNull(lead.full_name)].filter(Boolean).join(' · ') || null
}

function kmLabel(km: number): string {
  return `${formatNumber(km)} ק״מ`
}

function previewRows(source: EventPreviewSource): EventPreviewRow[] {
  const candidates: Array<[string, string | null]> = [
    ['סוג אירוע', textOrNull(source.event_type?.name)],
    ['בוטל', source.is_cancelled ? 'כן' : null],
    ['תאריך', formatDate(source.event_date)],
    ['שעות', timeRange(source)],
    ['כביש', textOrNull(source.road?.name)],
    ['מיקום', textOrNull(source.location)],
    ['שלוחה', textOrNull(source.district?.name)],
    ['מספר אירוע', textOrNull(source.police_event_id)],
    ['אחמ״ש', shiftLeadText(source)],
  ]
  return candidates.flatMap(([label, value]) => (value ? [{ label, value }] : []))
}

function responderSummary(responder: EventPreviewResponderSource): EventPreviewResponder {
  return {
    id: responder.id,
    name: responder.profile?.full_name ?? EMPTY_VALUE,
    callsign: responder.profile?.callsign ?? '',
    kmLabel: responder.total_km == null ? EMPTY_VALUE : kmLabel(responder.total_km),
    frozen: Boolean(responder.frozen_over_60km || responder.frozen_suspicious_duplicate),
  }
}

/** Sums the reported km; null when nobody reported any. Rounded so 0.1 + 0.2 reads 0.3. */
function totalKmText(responders: EventPreviewResponderSource[]): string | null {
  const reported = responders.flatMap((responder) =>
    responder.total_km == null ? [] : [responder.total_km],
  )
  if (reported.length === 0) return null
  const sum = reported.reduce((total, km) => total + km, 0)
  return kmLabel(Math.round(sum * 1000) / 1000)
}

export function buildEventPreview(source: EventPreviewSource): EventPreview {
  return {
    title: textOrNull(source.event_type?.name) ?? DEFAULT_TITLE,
    rows: previewRows(source),
    frozen: isEventFrozen(source),
    freezeFlags: {
      frozen_over_60km: Boolean(source.frozen_over_60km),
      frozen_suspicious_duplicate: Boolean(source.frozen_suspicious_duplicate),
    },
    responders: source.responders.map(responderSummary),
    responderCount: source.responders.length,
    totalKmLabel: totalKmText(source.responders),
  }
}

export function eventPreviewLabel(source: EventPreviewSource): string {
  const subject = textOrNull(source.police_event_id) ?? textOrNull(source.event_type?.name)
  return subject ? `${LABEL_PREFIX} ${subject}` : LABEL_PREFIX
}
