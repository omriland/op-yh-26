# KM Discrepancy Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-only `km_discrepancy` to דוחות וסטטיסטיקות: rows where lead `total_km` ≠ odometer delta, with confirm-to-adopt the volunteer number.

**Architecture:** Pure lib owns inclusion, delta, sort, and the replace helper. Registry maps rows and declares one optional column action. Generic runner renders hover/confirm/write and drops the row. No migrations.

**Tech Stack:** Vite + React + TypeScript, Supabase client, Vitest, existing ReportRunner / PeriodPicker / Dialog / HoverTip / Toast.

## Global Constraints

- Hebrew-only UI, full RTL; EN identifiers in code/DB
- רשומה; no invented tokens; CSS logical properties only
- Official km remains `event_responders.total_km`; odometers are read only to find the gap and to compute the replacement
- Write updates `total_km` only — never odometers, status, or event fields
- Audience `admin` only
- No schema, RPC, or Netlify Functions
- Do not commit unless the user asks

---

## File map

- Create: `src/lib/kmDiscrepancyReport.ts`
- Create: `src/lib/kmDiscrepancyReport.test.ts`
- Modify: `src/lib/reports/types.ts` — optional `action` on kind; `assignmentId` / `actionValue` on row
- Modify: `src/lib/reports/registry.ts` + `registry.test.ts`
- Modify: `src/components/reports/ReportRunner.tsx` — action cell, confirm, drop row
- Modify: `src/styles/components.css` — `.report-km-action` touch target
- Modify: `design-system-design-instructions/screens/admin.md`
- Modify: `.cursor/memory/MEMORY.md`

---

### Task 1: Inclusion, delta, labels, replace resolver

**Files:**
- Create: `src/lib/kmDiscrepancyReport.test.ts`
- Create: `src/lib/kmDiscrepancyReport.ts`

**Interfaces:**
- Produces: `responderKm(start: number | null, end: number | null): number | null`
- Produces: `policeEventLabel(policeEventId: string | null, isCancelled: boolean): string`
- Produces: `buildKmDiscrepancyRows(events, range: { from: string; to: string }): KmDiscrepancyRow[]`
- Produces: `resolveLeadKmReplacement(input): { status: 'replace'; totalKm: number } | { status: 'already_aligned' } | { status: 'invalid' }`
- Produces: `KmDiscrepancyRow` with `assignment_id`, `lead_km`, `responder_km`, `diff` (responder − lead)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kmDiscrepancyReport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildKmDiscrepancyRows,
  policeEventLabel,
  resolveLeadKmReplacement,
  responderKm,
  type KmDiscrepancyEventSource,
} from './kmDiscrepancyReport'

const range = { from: '2026-08-01', to: '2026-08-31' }

function event(
  partial: Partial<KmDiscrepancyEventSource> & Pick<KmDiscrepancyEventSource, 'id'>,
): KmDiscrepancyEventSource {
  return {
    id: partial.id,
    event_date: partial.event_date ?? '2026-08-10',
    is_cancelled: partial.is_cancelled ?? false,
    police_event_id: partial.police_event_id ?? 'P-1',
    location: partial.location ?? 'צומת',
    road: partial.road ?? { name: 'כביש 1' },
    shift_lead: partial.shift_lead ?? { full_name: 'ליאור', callsign: 'L1' },
    responders: partial.responders ?? [
      {
        id: 'a1',
        responder_id: 'r1',
        status: 'done',
        total_km: 10,
        odometer_start: 100,
        odometer_end: 118,
        profile: { full_name: 'דנה כהן', callsign: 'D1' },
      },
    ],
  }
}

describe('responderKm', () => {
  it('returns end minus start when both are set', () => {
    expect(responderKm(100, 118)).toBe(18)
  })

  it('returns null when either odometer is missing', () => {
    expect(responderKm(null, 118)).toBeNull()
    expect(responderKm(100, null)).toBeNull()
  })
})

describe('policeEventLabel', () => {
  it('marks cancelled events like חריגי ק״מ', () => {
    expect(policeEventLabel('P-1', true)).toBe('בוטל · P-1')
    expect(policeEventLabel(null, true)).toBe('בוטל')
    expect(policeEventLabel('P-1', false)).toBe('P-1')
    expect(policeEventLabel(null, false)).toBe('—')
  })
})

describe('buildKmDiscrepancyRows', () => {
  it('includes done participations with a km gap, including cancelled', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({ id: 'gap' }),
        event({
          id: 'cancelled',
          is_cancelled: true,
          police_event_id: 'P-9',
          responders: [
            {
              id: 'a9',
              responder_id: 'r9',
              status: 'done',
              total_km: 5,
              odometer_start: 0,
              odometer_end: 9,
              profile: { full_name: 'משה', callsign: 'M1' },
            },
          ],
        }),
      ],
      range,
    )
    expect(rows.map((row) => [row.event_id, row.lead_km, row.responder_km, row.diff])).toEqual([
      ['gap', 10, 18, 8],
      ['cancelled', 5, 9, 4],
    ])
  })

  it('excludes open fills, missing lead km, missing odometers, equal numbers, and dates outside range', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({
          id: 'pending',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'pending',
              total_km: 10,
              odometer_start: 100,
              odometer_end: 120,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({
          id: 'draft-fill',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'in_progress',
              total_km: 10,
              odometer_start: 100,
              odometer_end: 120,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({
          id: 'no-lead',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'done',
              total_km: null,
              odometer_start: 100,
              odometer_end: 120,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({
          id: 'no-odo',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'done',
              total_km: 10,
              odometer_start: 100,
              odometer_end: null,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({
          id: 'equal',
          responders: [
            {
              id: 'a',
              responder_id: 'r',
              status: 'done',
              total_km: 20,
              odometer_start: 100,
              odometer_end: 120,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
        event({ id: 'old', event_date: '2026-07-31' }),
        event({ id: 'future', event_date: '2026-09-01' }),
      ],
      range,
    )
    expect(rows).toEqual([])
  })

  it('emits one row per gapped volunteer on the same event', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({
          id: 'multi',
          responders: [
            {
              id: 'a1',
              responder_id: 'r1',
              status: 'done',
              total_km: 10,
              odometer_start: 0,
              odometer_end: 12,
              profile: { full_name: 'דנה', callsign: 'D1' },
            },
            {
              id: 'a2',
              responder_id: 'r2',
              status: 'done',
              total_km: 10,
              odometer_start: 0,
              odometer_end: 10,
              profile: { full_name: 'יוסי', callsign: 'Y2' },
            },
            {
              id: 'a3',
              responder_id: 'r3',
              status: 'done',
              total_km: 8,
              odometer_start: 0,
              odometer_end: 20,
              profile: { full_name: 'משה', callsign: 'M1' },
            },
          ],
        }),
      ],
      range,
    )
    expect(rows.map((row) => [row.assignment_id, row.responder_callsign, row.diff])).toEqual([
      ['a3', 'M1', 12],
      ['a1', 'D1', 2],
    ])
  })

  it('sorts by event_date desc, then absolute diff desc, then responder name', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({
          id: 'old',
          event_date: '2026-08-01',
          responders: [
            {
              id: 'a-old',
              responder_id: 'r',
              status: 'done',
              total_km: 1,
              odometer_start: 0,
              odometer_end: 50,
              profile: { full_name: 'ישן', callsign: 'O' },
            },
          ],
        }),
        event({
          id: 'new',
          event_date: '2026-08-20',
          responders: [
            {
              id: 'a-low',
              responder_id: 'r1',
              status: 'done',
              total_km: 10,
              odometer_start: 0,
              odometer_end: 12,
              profile: { full_name: 'בני', callsign: 'B' },
            },
            {
              id: 'a-high',
              responder_id: 'r2',
              status: 'done',
              total_km: 10,
              odometer_start: 0,
              odometer_end: 40,
              profile: { full_name: 'אבי', callsign: 'A' },
            },
          ],
        }),
      ],
      range,
    )
    expect(rows.map((row) => row.assignment_id)).toEqual(['a-high', 'a-low', 'a-old'])
  })

  it('includes zero lead km when the odometer delta differs', () => {
    const rows = buildKmDiscrepancyRows(
      [
        event({
          id: 'zero',
          responders: [
            {
              id: 'a0',
              responder_id: 'r',
              status: 'done',
              total_km: 0,
              odometer_start: 10,
              odometer_end: 15,
              profile: { full_name: 'א', callsign: 'A' },
            },
          ],
        }),
      ],
      range,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.lead_km).toBe(0)
    expect(rows[0]?.responder_km).toBe(5)
    expect(rows[0]?.diff).toBe(5)
  })
})

describe('resolveLeadKmReplacement', () => {
  it('returns the odometer delta when a gap remains', () => {
    expect(
      resolveLeadKmReplacement({ total_km: 10, odometer_start: 100, odometer_end: 118 }),
    ).toEqual({ status: 'replace', totalKm: 18 })
  })

  it('treats an already-aligned row as success', () => {
    expect(
      resolveLeadKmReplacement({ total_km: 18, odometer_start: 100, odometer_end: 118 }),
    ).toEqual({ status: 'already_aligned' })
  })

  it('rejects missing numbers', () => {
    expect(
      resolveLeadKmReplacement({ total_km: null, odometer_start: 100, odometer_end: 118 }),
    ).toEqual({ status: 'invalid' })
    expect(
      resolveLeadKmReplacement({ total_km: 10, odometer_start: null, odometer_end: 118 }),
    ).toEqual({ status: 'invalid' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kmDiscrepancyReport.test.ts`

Expected: FAIL — cannot find module `./kmDiscrepancyReport`

- [ ] **Step 3: Write the lib**

Create `src/lib/kmDiscrepancyReport.ts`:

```ts
import type { ParticipationStatus } from './status'
import { supabase } from './supabase'

export type KmDiscrepancyResponderSource = {
  id: string
  responder_id: string
  status: ParticipationStatus
  total_km: number | null
  odometer_start: number | null
  odometer_end: number | null
  profile: { full_name: string; callsign: string } | null
}

export type KmDiscrepancyEventSource = {
  id: string
  event_date: string
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: KmDiscrepancyResponderSource[]
}

export type KmDiscrepancyRow = {
  id: string
  assignment_id: string
  event_id: string
  event_date: string
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  road_name: string | null
  responder_name: string | null
  responder_callsign: string | null
  shift_lead_name: string | null
  shift_lead_callsign: string | null
  lead_km: number
  responder_km: number
  diff: number
}

export type LeadKmReplacement =
  | { status: 'replace'; totalKm: number }
  | { status: 'already_aligned' }
  | { status: 'invalid' }

export function responderKm(start: number | null, end: number | null): number | null {
  if (start == null || end == null) return null
  return end - start
}

export function policeEventLabel(policeEventId: string | null, isCancelled: boolean): string {
  if (isCancelled) return policeEventId ? `בוטל · ${policeEventId}` : 'בוטל'
  return policeEventId || '—'
}

function responderSortKey(row: KmDiscrepancyRow): string {
  return [row.responder_name ?? '', row.responder_callsign ?? ''].join(' ')
}

export function resolveLeadKmReplacement(input: {
  total_km: number | null
  odometer_start: number | null
  odometer_end: number | null
}): LeadKmReplacement {
  const next = responderKm(input.odometer_start, input.odometer_end)
  if (input.total_km == null || next == null) return { status: 'invalid' }
  if (next === input.total_km) return { status: 'already_aligned' }
  return { status: 'replace', totalKm: next }
}

export function buildKmDiscrepancyRows(
  events: KmDiscrepancyEventSource[],
  range: { from: string; to: string },
): KmDiscrepancyRow[] {
  const rows: KmDiscrepancyRow[] = []

  for (const event of events) {
    if (event.event_date < range.from || event.event_date > range.to) continue
    for (const responder of event.responders) {
      if (responder.status !== 'done') continue
      if (responder.total_km == null) continue
      const volunteerKm = responderKm(responder.odometer_start, responder.odometer_end)
      if (volunteerKm == null || volunteerKm === responder.total_km) continue
      rows.push({
        id: `${event.id}:${responder.id}`,
        assignment_id: responder.id,
        event_id: event.id,
        event_date: event.event_date,
        is_cancelled: event.is_cancelled,
        police_event_id: event.police_event_id,
        location: event.location,
        road_name: event.road?.name ?? null,
        responder_name: responder.profile?.full_name ?? null,
        responder_callsign: responder.profile?.callsign ?? null,
        shift_lead_name: event.shift_lead?.full_name ?? null,
        shift_lead_callsign: event.shift_lead?.callsign ?? null,
        lead_km: responder.total_km,
        responder_km: volunteerKm,
        diff: volunteerKm - responder.total_km,
      })
    }
  }

  rows.sort((a, b) => {
    const byDate = b.event_date.localeCompare(a.event_date)
    if (byDate !== 0) return byDate
    const byAbs = Math.abs(b.diff) - Math.abs(a.diff)
    if (byAbs !== 0) return byAbs
    return responderSortKey(a).localeCompare(responderSortKey(b), 'he')
  })

  return rows
}

const KM_DISCREPANCY_SELECT = `
  id,
  event_date,
  is_cancelled,
  police_event_id,
  location,
  road:roads(name),
  shift_lead:profiles(full_name, callsign),
  responders:event_responders(
    id,
    responder_id,
    status,
    total_km,
    odometer_start,
    odometer_end,
    profile:profiles(full_name, callsign)
  )
`

export async function loadKmDiscrepancyReport(from: string, to: string): Promise<KmDiscrepancyRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select(KM_DISCREPANCY_SELECT)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: false })

  if (error) throw new Error(error.message)
  return buildKmDiscrepancyRows((data ?? []) as unknown as KmDiscrepancyEventSource[], { from, to })
}

export async function applyLeadKmFromOdometer(assignmentId: string): Promise<'replaced' | 'already_aligned'> {
  const { data, error } = await supabase
    .from('event_responders')
    .select('id, total_km, odometer_start, odometer_end')
    .eq('id', assignmentId)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'missing assignment')

  const resolved = resolveLeadKmReplacement({
    total_km: data.total_km,
    odometer_start: data.odometer_start,
    odometer_end: data.odometer_end,
  })
  if (resolved.status === 'invalid') throw new Error('invalid odometer replacement')
  if (resolved.status === 'already_aligned') return 'already_aligned'

  const { error: updateError } = await supabase
    .from('event_responders')
    .update({ total_km: resolved.totalKm, updated_at: new Date().toISOString() })
    .eq('id', assignmentId)

  if (updateError) throw new Error(updateError.message)
  return 'replaced'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/kmDiscrepancyReport.test.ts`

Expected: PASS (all tests)

---

### Task 2: Registry kind + action types

**Files:**
- Modify: `src/lib/reports/types.ts`
- Modify: `src/lib/reports/registry.test.ts`
- Modify: `src/lib/reports/registry.ts`

**Interfaces:**
- Consumes: `loadKmDiscrepancyReport`, `applyLeadKmFromOdometer`, `policeEventLabel` from Task 1
- Produces: `ReportTableRow.assignmentId?: string` and `actionValue?: number`
- Produces: `ReportKind.action?: { columnId, hoverText, confirmTitle, confirmBody, apply }`
- Produces: kind `km_discrepancy` with `audience: 'admin'`, PeriodPicker, action on `responder_km`

- [ ] **Step 1: Extend types**

In `src/lib/reports/types.ts`, add to `ReportTableRow`:

```ts
  assignmentId?: string
  actionValue?: number
```

Add after `ReportColumn`:

```ts
export type ReportRowAction = {
  columnId: string
  hoverText: string
  confirmTitle: string
  confirmBody: (row: ReportTableRow) => string
  apply: (row: ReportTableRow) => Promise<void>
}
```

Add to `ReportKind`:

```ts
  action?: ReportRowAction
```

- [ ] **Step 2: Update registry tests first**

Replace the kind list assertions in `src/lib/reports/registry.test.ts` with:

```ts
    expect(REPORT_KINDS.map((kind) => [kind.id, kind.audience])).toEqual([
      ['open_documentation', 'admin_and_shift_lead'],
      ['km_discrepancy', 'admin'],
      ['km_exceptions', 'admin_and_shift_lead'],
      ['duplicate_events', 'admin_and_shift_lead'],
    ])
```

```ts
    expect(visibleReportKinds(REPORT_KINDS, ['admin']).map((kind) => kind.id)).toEqual([
      'open_documentation',
      'km_discrepancy',
      'km_exceptions',
      'duplicate_events',
    ])
    expect(visibleReportKinds(REPORT_KINDS, ['shift_lead']).map((kind) => kind.id)).toEqual([
      'open_documentation',
      'km_exceptions',
      'duplicate_events',
    ])
```

Add:

```ts
  it('registers km discrepancy as admin-only with a responder-km action', () => {
    const kind = REPORT_KINDS.find((item) => item.id === 'km_discrepancy')
    expect(kind?.audience).toBe('admin')
    expect(kind?.hasPeriodPicker).toBe(true)
    expect(kind?.action?.columnId).toBe('responder_km')
    expect(kind?.action?.hoverText).toBe('החלפת הקילומטרים של האחמ״ש במספר זה')
    expect(kind?.columns.map((column) => column.header)).toEqual([
      'מספר אירוע',
      'תאריך',
      'כביש ומיקום',
      'מתנדב',
      'אחמ״ש',
      'ק״מ אחמ״ש',
      'ק״מ מתנדב',
      'הפרש',
    ])
  })
```

- [ ] **Step 3: Run registry tests — expect FAIL**

Run: `npx vitest run src/lib/reports/registry.test.ts`

Expected: FAIL — `km_discrepancy` missing from `REPORT_KINDS`

- [ ] **Step 4: Register the kind**

In `src/lib/reports/registry.ts`, add imports:

```ts
import {
  applyLeadKmFromOdometer,
  loadKmDiscrepancyReport,
  policeEventLabel,
} from '../kmDiscrepancyReport'
```

Add this kind after `openDocumentation` and before `kmExceptions`:

```ts
const kmDiscrepancy: ReportKind = {
  id: 'km_discrepancy',
  title: 'אירועים עם פערי דיווח ק״מ',
  includes: 'אירועים בהם יש פער בין דיווח האחמ״ש לבין הק״מ שהזין המתנדב',
  audience: 'admin',
  hasDateRange: true,
  hasPeriodPicker: true,
  searchPlaceholder: 'חיפוש לפי מתנדב, מספר אירוע או מיקום',
  csvFilename: 'פערי-דיווח-קמ.csv',
  columns: [
    { id: 'police', header: 'מספר אירוע', numeric: true },
    { id: 'date', header: 'תאריך', numeric: true },
    { id: 'place', header: 'כביש ומיקום' },
    { id: 'responder', header: 'מתנדב' },
    { id: 'lead', header: 'אחמ״ש' },
    { id: 'lead_km', header: 'ק״מ אחמ״ש', numeric: true },
    { id: 'responder_km', header: 'ק״מ מתנדב', numeric: true },
    { id: 'diff', header: 'הפרש', numeric: true },
  ],
  action: {
    columnId: 'responder_km',
    hoverText: 'החלפת הקילומטרים של האחמ״ש במספר זה',
    confirmTitle: 'החלפת קילומטרים?',
    confirmBody: (row) =>
      `הקילומטרים שהזין האחמ״ש יוחלפו ב־${formatNumber(row.actionValue ?? 0)} ק״מ לפי מד האוץ של המתנדב.`,
    async apply(row) {
      if (!row.assignmentId) throw new Error('missing assignment')
      await applyLeadKmFromOdometer(row.assignmentId)
    },
  },
  async load(inputs) {
    const range = requireRange(inputs)
    if (!range) return []
    const rows = await loadKmDiscrepancyReport(range.from, range.to)
    return rows.map((row): ReportTableRow => {
      const responder = person(row.responder_name, row.responder_callsign)
      const placeText = place(row.road_name, row.location)
      return {
        id: row.id,
        eventId: row.event_id,
        assignmentId: row.assignment_id,
        actionValue: row.responder_km,
        searchText: [responder, row.police_event_id ?? '', placeText].join(' '),
        values: [
          policeEventLabel(row.police_event_id, row.is_cancelled),
          formatDate(row.event_date),
          placeText,
          responder,
          person(row.shift_lead_name, row.shift_lead_callsign),
          formatNumber(row.lead_km),
          formatNumber(row.responder_km),
          formatNumber(row.diff),
        ],
      }
    })
  },
}
```

Insert into the export array:

```ts
export const REPORT_KINDS: ReportKind[] = [
  openDocumentation,
  kmDiscrepancy,
  kmExceptions,
  duplicateEvents,
]
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/reports/registry.test.ts src/lib/kmDiscrepancyReport.test.ts src/lib/reports/access.test.ts`

Expected: PASS

---

### Task 3: Runner action — hover, confirm, write, drop row

**Files:**
- Modify: `src/components/reports/ReportRunner.tsx`
- Modify: `src/styles/components.css` (append `.report-km-action` next to `.report-catalog`)

**Interfaces:**
- Consumes: `kind.action` from Task 2
- Produces: click on action column opens Dialog; confirm calls `kind.action.apply(row)` then removes that `row.id` from `rows`; other cells still call `onOpenEvent`

- [ ] **Step 1: Add action CSS**

Append to `src/styles/components.css` after `.report-catalog` rules:

```css
.report-km-action {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.report-km-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Wire action UI in ReportRunner**

Imports to add:

```ts
import { HoverTip } from '../ui/HoverTip'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toast'
```

Inside `ReportRunner`, after existing state:

```ts
  const { show } = useToast()
  const [pendingRow, setPendingRow] = useState<ReportTableRow | null>(null)
  const [applying, setApplying] = useState(false)
```

Add `confirmReplace`:

```ts
  async function confirmReplace() {
    if (!kind.action || !pendingRow) return
    setApplying(true)
    try {
      await kind.action.apply(pendingRow)
      setRows((current) => (current ?? []).filter((row) => row.id !== pendingRow.id))
      show('הקילומטרים עודכנו', 'done')
    } catch {
      show('עדכון הקילומטרים נכשל. בדקו את החיבור ונסו שוב.', 'alert')
    } finally {
      setApplying(false)
      setPendingRow(null)
    }
  }
```

Pass `onAction={kind.action ? setPendingRow : undefined}` into `ReportTable` and `ReportCard`.

Render the dialog as a sibling inside the page `stack-4` (always, so it can open over table or cards):

```tsx
      {kind.action ? (
        <Dialog
          open={pendingRow != null}
          title={kind.action.confirmTitle}
          onClose={() => {
            if (!applying) setPendingRow(null)
          }}
          footer={
            <>
              <Button variant="primary" loading={applying} loadingLabel="מחליף…" onClick={() => void confirmReplace()}>
                החלפה
              </Button>
              <Button variant="secondary" disabled={applying} onClick={() => setPendingRow(null)}>
                ביטול
              </Button>
            </>
          }
        >
          <p className="t-body">{pendingRow ? kind.action.confirmBody(pendingRow) : null}</p>
        </Dialog>
      ) : null}
```

`Button` variants are `primary` | `secondary` | `ghost` | `destructive`. Use `primary` for החלפה.

- [ ] **Step 3: Action cell in table and cards**

Add helper in the same file (below `groupRows`):

```tsx
function ReportActionValue({
  kind,
  row,
  value,
  onAction,
}: {
  kind: ReportKind
  row: ReportTableRow
  value: string
  onAction?: (row: ReportTableRow) => void
}) {
  if (!kind.action || !onAction) return <>{value}</>
  return (
    <HoverTip text={kind.action.hoverText} mode="always">
      <button
        type="button"
        className="report-km-action"
        onClick={(event) => {
          event.stopPropagation()
          onAction(row)
        }}
      >
        {value}
      </button>
    </HoverTip>
  )
}
```

Update `ReportTable` props to include `onAction?: (row: ReportTableRow) => void`.

In each `<td>`, if `kind.action && column.id === kind.action.columnId`, render `<ReportActionValue … />` instead of the raw string.

Update `ReportCard`:

- Add `onAction?: (row: ReportTableRow) => void`
- Do **not** wrap the whole card in one `<button className="event-card">` when `kind.action` is set
- Instead: `<li className="card stack-2">` with a button for title + non-action fields (`onOpenEvent`), and `ReportActionValue` for the action field
- When `kind.action` is absent, keep today’s single full-card button

Sketch for the action-kind card:

```tsx
  const actionId = kind.action?.columnId
  const title = row.values[0] ?? '—'
  const rest = kind.columns.slice(1).map((column, index) => ({
    id: column.id,
    header: column.header,
    value: row.values[index + 1] ?? '—',
    numeric: column.numeric,
    isAction: Boolean(actionId && column.id === actionId),
  }))

  if (kind.action && onAction) {
    return (
      <li className="card stack-2">
        <button
          type="button"
          className="event-card"
          onClick={row.eventId && onOpenEvent ? () => onOpenEvent(row.eventId!) : undefined}
        >
          <span className="t-body">{title}</span>
          {rest
            .filter((item) => !item.isAction)
            .map((item) => (
              <span key={item.header} className="t-caption text-muted">
                {item.header}: <span className={item.numeric ? 'mono' : undefined}>{item.value}</span>
              </span>
            ))}
        </button>
        {rest
          .filter((item) => item.isAction)
          .map((item) => (
            <span key={item.header} className="t-caption">
              {item.header}:{' '}
              <ReportActionValue kind={kind} row={row} value={item.value} onAction={onAction} />
            </span>
          ))}
      </li>
    )
  }
```

Keep the existing no-action card path unchanged.

- [ ] **Step 4: Typecheck + unit tests**

Run: `npx tsc -b --pretty false`

Expected: exit 0

Run: `npx vitest run src/lib/kmDiscrepancyReport.test.ts src/lib/reports`

Expected: PASS

Manual smoke (do not claim done without this): admin opens דוחות → האירועים עם פערי דיווח ק״מ → hover ק״מ מתנדב → confirm → row gone. אחמ״ש-only does not see the card. Other reports still have no hover action.

---

### Task 4: Docs + memory

**Files:**
- Modify: `design-system-design-instructions/screens/admin.md` — in the Kinds sentence under דוחות, add `אירועים עם פערי דיווח ק״מ` (admin only; PeriodPicker on `event_date`; hover/tap ק״מ מתנדב replaces lead `total_km`)
- Modify: `.cursor/memory/MEMORY.md` — Last updated 2026-08-16; one bullet: KM discrepancy report shipped, spec `2026-08-16-yahpaz-km-discrepancy-report-design.md`, admin-only, odometer delta vs `total_km`, confirm replace writes `total_km` only

- [ ] **Step 1: Update those two files. No product-surface English.**

---

## Spec coverage

| Spec item | Task |
|---|---|
| Inclusion: done + both odometers + `total_km` set + gap + period | 1 |
| Cancelled included, `בוטל ·` on מספר אירוע | 1 |
| Grain: one row per gapped volunteer | 1 |
| הפרש = responder − lead | 1 |
| Audience admin only | 2 |
| PeriodPicker on `event_date` | 2 (reuses runner) |
| Hover / confirm / write `total_km` / drop row | 1 (`resolve` + `apply`), 3 |
| Odometers unchanged | 1 (`applyLeadKmFromOdometer` updates `total_km` only) |
| Row click → event; action cell does not | 3 |
| Mobile card splits action vs drill-in | 3 |
| CSV eight columns, no action column | 2 (generic runner) |
| No migrations | all |
| Existing reports unchanged | 2–3 |

## Self-review

- No TBD / “handle edge cases”
- Names are consistent: `applyLeadKmFromOdometer`, `resolveLeadKmReplacement`, `assignmentId`, `actionValue`, `kind.action.columnId`
- `confirmBody` uses `row.actionValue` (the responder km), not a stale cell string parse
- Commit steps omitted on purpose (user rule)
