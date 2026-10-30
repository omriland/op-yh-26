// Legacy (old-site) event-report data layer.
//
// Reconstructs the old members.yachpatz.org.il ShowEventReport.aspx document
// from the archived YP data. Shape mirrors the offline exporter (yp_report.py).
//
// DATA SOURCE: the admin-gated Supabase RPC `legacy_report_search` (reads the
// unexposed `legacy.*` schema; see the migration). The component layer never sees
// the source. A dev harness may inject a local dataset via __setLegacyFixtureProvider
// to run the UI without the backend; production never injects, so the fixture JSON is
// referenced only by the (non-shipped) dev files and never enters the prod bundle.

import { supabase } from '../supabase'

/** 17 damage locations, in display order (fld_AutoID 1..17 = row order). */
export const HIT_TYPES: ReadonlyArray<{ order: number; label: string }> = [
  { order: 1, label: 'פגוש קדמי' },
  { order: 2, label: 'כנף ימין קדמית' },
  { order: 3, label: 'כנף שמאל קדמית' },
  { order: 4, label: 'דלת נהג' },
  { order: 5, label: 'דלת נוסע' },
  { order: 6, label: 'דלת אחורית שמאלית' },
  { order: 7, label: 'דלת אחורית ימנית' },
  { order: 8, label: 'כנף אחורית ימנית' },
  { order: 9, label: 'כנף אחורית שמאלית' },
  { order: 10, label: 'תא מטען' },
  { order: 11, label: 'פגוש אחורי' },
  { order: 12, label: 'גג' },
  { order: 13, label: 'שמשה קדמית' },
  { order: 14, label: 'שמשה אחורית' },
  { order: 15, label: 'מרכב תחתון' },
  { order: 16, label: 'גלגלים' },
  { order: 17, label: 'מכסה מנוע' },
]

/** Equipment flags, in display order. Keys match the fixture's `equipment` map. */
export const EQUIPMENT: ReadonlyArray<{ key: LegacyEquipmentKey; label: string }> = [
  { key: 'fld_2Meter', label: 'רצועה 2 מטר' },
  { key: 'fld_3Meter', label: 'רצועה 3 מטר' },
  { key: 'fld_9Meter', label: 'רצועה 9 מטר' },
  { key: 'fld_AgasChain', label: 'שרשרת אגסים' },
  { key: 'fld_ChainFlipLarge', label: 'שרשרת הפיכה' },
  { key: 'fld_ChainFlipSmall', label: 'שרשרת הפיכה קצרה' },
  { key: 'fld_AirTube', label: 'צינור אויר' },
]

export type LegacyEquipmentKey =
  | 'fld_2Meter'
  | 'fld_3Meter'
  | 'fld_9Meter'
  | 'fld_AgasChain'
  | 'fld_ChainFlipLarge'
  | 'fld_ChainFlipSmall'
  | 'fld_AirTube'

export type LegacyCar = { index: number; plate: string }

export type LegacyReportHeader = {
  volName: string
  /** ת.ז., masked by the server to its last 3 digits (`******123`); null when missing. */
  pid: string | null
  carNumber: string
  branch: string
  approvingOfficer: string
  policeCallSign: string
  roadNumber: string
  location: string
  coordinator: string
  eventType: string
  inShift: boolean
  startHour: string
  endHour: string
  shool: boolean
  siren: boolean
  specialApprovingOfficer: string
  officerName: string
  startKM: string
  endKM: string
  totalKM: string
  route: string
  actionsTaken: string
  problems: string
  problemsReportedTo: string
  otherEquipment: string
}

export type LegacyReport = {
  /** fld_EventFK — the stable report key (old URL ?id=). */
  fk: string
  /** fld_EventNumber — NOT unique across years. */
  eventNumber: string
  callSign: string
  /** ISO yyyy-mm-dd. */
  eventDate: string
  header: LegacyReportHeader
  equipment: Record<LegacyEquipmentKey, boolean>
  /** Up to 4 car slots (fld_CarIndex 1..4); plate = free-text type/color. */
  cars: LegacyCar[]
  /** Checked damage cells as [carIndex, hitOrder] pairs. */
  hits: Array<[number, number]>
}

export type LegacyLookup =
  | { kind: 'id'; id: string }
  | { kind: 'report'; eventNumber: string }
  | { kind: 'callsign'; callSign: string; date: string } // date dd/mm/yyyy

// DEV ONLY. The dev harnesses inject a local dataset here so the UI can run without
// the backend; production never sets this, so the fixture JSON is referenced only by
// the (non-shipped) dev harness files and never enters the production bundle.
let fixtureProvider: (() => Promise<LegacyReport[]>) | null = null

export function __setLegacyFixtureProvider(fn: (() => Promise<LegacyReport[]>) | null): void {
  fixtureProvider = fn
}

async function rpcSearch(kind: string, value: string, date?: string): Promise<LegacyReport[]> {
  const { data, error } = await supabase.rpc('legacy_report_search', {
    p_kind: kind,
    p_value: value,
    p_date: date ?? null,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as LegacyReport[]
}

/** dd/mm/yyyy -> yyyy-mm-dd; returns '' if unparseable. */
export function toIsoDate(ddmmyyyy: string): string {
  const m = ddmmyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ''
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** yyyy-mm-dd -> dd/mm/yyyy for display. */
export function toDisplayDate(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const [, y, mo, d] = m
  return `${d}/${mo}/${y}`
}

/**
 * ת.ז. for display: only the last 3 digits. The RPC already masks it; masking
 * again keeps any other source (the dev fixture) from showing a full number.
 */
export function maskPid(pid: string | null | undefined): string {
  const value = (pid ?? '').trim()
  if (!value) return ''
  return value.length <= 3 ? '******' : `******${value.slice(-3)}`
}

const byDate = (a: LegacyReport, b: LegacyReport) => a.eventDate.localeCompare(b.eventDate)

/** A report number or a call-sign+date can match several events — all are returned. */
export async function searchLegacyReports(lookup: LegacyLookup): Promise<LegacyReport[]> {
  if (fixtureProvider) {
    const all = await fixtureProvider()
    if (lookup.kind === 'id') return all.filter((r) => r.fk === lookup.id.trim())
    if (lookup.kind === 'report') {
      return all.filter((r) => r.eventNumber === lookup.eventNumber.trim()).sort(byDate)
    }
    const iso = toIsoDate(lookup.date)
    return all.filter((r) => r.callSign === lookup.callSign.trim() && r.eventDate === iso).sort(byDate)
  }
  if (lookup.kind === 'id') return rpcSearch('id', lookup.id)
  if (lookup.kind === 'report') return rpcSearch('report', lookup.eventNumber)
  return rpcSearch('callsign_date', lookup.callSign, toIsoDate(lookup.date))
}

export async function loadLegacyReport(fk: string): Promise<LegacyReport | undefined> {
  if (fixtureProvider) return (await fixtureProvider()).find((r) => r.fk === fk.trim())
  return (await rpcSearch('id', fk))[0]
}

/** All events for a call sign, sorted by date (oldest first). */
export async function searchByCallSign(callSign: string): Promise<LegacyReport[]> {
  const cs = callSign.trim()
  if (fixtureProvider) return (await fixtureProvider()).filter((r) => r.callSign === cs).sort(byDate)
  return rpcSearch('callsign_list', cs)
}

/** Whole injected dataset, for the dev harness index (dev only). */
export async function allLegacyReports(): Promise<LegacyReport[]> {
  return fixtureProvider ? fixtureProvider() : []
}
