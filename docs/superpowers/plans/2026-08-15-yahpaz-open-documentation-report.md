# Open Documentation Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `open_documentation` report to דוחות וסטטיסטיקות: events a shift lead finished entering where a volunteer has not completed documentation.

**Architecture:** Pure lib (`openDocumentationReport.ts`) owns inclusion, grain, labels, viewer cut, and sort. Registry maps rows to the generic runner. Runner gains an opt-in PeriodPicker and optional fuzzy field search. No migrations.

**Tech Stack:** Vite + React + TypeScript, Supabase client, Vitest, existing PeriodPicker / reports registry.

## Global Constraints

- Hebrew-only UI, full RTL; EN identifiers in code/DB
- רשומה design system; no invented tokens
- Kilometers unused in this report
- Status labels `טרם הוזן` / `נשמרה טיוטה` are report-only — do not change `status.ts`
- No schema, RPC, or Netlify Functions
- Existing four reports keep from/to date fields and substring-on-all-cells search
- Do not commit unless the user asks

---

## File map

- Create: `src/lib/openDocumentationReport.ts`
- Create: `src/lib/openDocumentationReport.test.ts`
- Modify: `src/lib/reports/librarySearch.ts` — export `queryMatchesText`
- Modify: `src/lib/reports/search.ts` + `search.test.ts` — fuzzy-on-`searchText`
- Modify: `src/lib/reports/types.ts` — viewer, date input, search fields
- Modify: `src/lib/reports/registry.ts` + `registry.test.ts`
- Modify: `src/components/reports/ReportRunner.tsx`
- Modify: `src/pages/ReportsPage.tsx` — pass viewer
- Modify: `design-system-design-instructions/screens/admin.md` — list the new kind
- Modify: `.cursor/memory/MEMORY.md` — record the shipped report

---

### Task 1: Shared fuzzy matcher

**Files:**
- Modify: `src/lib/reports/librarySearch.ts`
- Modify: `src/lib/reports/search.ts`
- Modify: `src/lib/reports/search.test.ts`
- Modify: `src/lib/reports/types.ts`

**Interfaces:**
- Produces: `queryMatchesText(haystack: string, query: string): boolean`
- Produces: `filterReportRows(rows, query)` uses `row.searchText` with fuzzy when present; otherwise existing substring-on-`values`

- [ ] **Step 1: Write the failing search tests**

Add to `src/lib/reports/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filterReportRows } from './search'
import type { ReportTableRow } from './types'

const rows: ReportTableRow[] = [
  { id: 'a', values: ['עמרי לנדמן', '12', '3'] },
  { id: 'b', values: ['משה כהן', '60', '1'] },
]

const fieldRows: ReportTableRow[] = [
  {
    id: '1',
    values: ['P-1', '10.08.2026', 'דנה כהן · D1', 'ליאור · L1', 'כביש 1 · צומת', 'טרם הוזן'],
    searchText: 'דנה כהן D1 P-1 כביש 1 צומת',
  },
  {
    id: '2',
    values: ['P-2', '11.08.2026', 'יוסי לוי · Y2', 'ליאור · L1', 'כביש 2 · גשר', 'נשמרה טיוטה'],
    searchText: 'יוסי לוי Y2 P-2 כביש 2 גשר',
  },
]

describe('filterReportRows', () => {
  it('returns all rows when the query is blank', () => {
    expect(filterReportRows(rows, '  ')).toEqual(rows)
  })

  it('matches case-insensitively across cell text', () => {
    expect(filterReportRows(rows, 'משה').map((row) => row.id)).toEqual(['b'])
    expect(filterReportRows(rows, '12').map((row) => row.id)).toEqual(['a'])
  })

  it('fuzzy-matches searchText only when present', () => {
    expect(filterReportRows(fieldRows, 'דנה').map((row) => row.id)).toEqual(['1'])
    expect(filterReportRows(fieldRows, 'P-1').map((row) => row.id)).toEqual(['1'])
    expect(filterReportRows(fieldRows, 'גשר').map((row) => row.id)).toEqual(['2'])
  })

  it('does not match אחמ״ש or status when only searchText is queried', () => {
    expect(filterReportRows(fieldRows, 'ליאור')).toEqual([])
    expect(filterReportRows(fieldRows, 'טיוטה')).toEqual([])
  })

  it('allows a one-letter typo on words of three letters or more', () => {
    expect(filterReportRows(fieldRows, 'דנא').map((row) => row.id)).toEqual(['1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reports/search.test.ts`
Expected: FAIL — `searchText` ignored / ליאור still matches via values

- [ ] **Step 3: Export matcher and implement filter**

In `librarySearch.ts`, export:

```ts
export function queryMatchesText(haystack: string, query: string): boolean {
  const tokens = normalizeReportQuery(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return true
  const normalized = normalizeReportQuery(haystack)
  return tokens.every((token) => tokenMatches(normalized, token))
}
```

Refactor `filterReportCatalog` to use `queryMatchesText` for the token loop (keep ranking as today).

In `types.ts` add optional `searchText?: string` on `ReportTableRow`.

In `search.ts`:

```ts
import { queryMatchesText } from './librarySearch'
import type { ReportTableRow } from './types'

export function filterReportRows(rows: ReportTableRow[], query: string): ReportTableRow[] {
  const needle = query.trim()
  if (!needle) return rows
  return rows.filter((row) => {
    if (row.searchText != null) return queryMatchesText(row.searchText, needle)
    const lower = needle.toLowerCase()
    return row.values.some((value) => value.toLowerCase().includes(lower))
  })
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/reports/search.test.ts src/lib/reports/librarySearch.test.ts`
Expected: PASS

---

### Task 2: Types for period + viewer

**Files:**
- Modify: `src/lib/reports/types.ts`
- Modify: `src/lib/reports/registry.ts` (add fields, no new kind yet)
- Modify: `src/lib/reports/registry.test.ts`

**Interfaces:**
- Produces:

```ts
export type ReportViewer = { userId: string; isAdmin: boolean }

export type ReportInputs = {
  from?: string
  to?: string
  viewer?: ReportViewer
}

export type ReportKind = {
  id: string
  title: string
  includes: string
  audience: ReportAudience
  hasDateRange: boolean
  hasPeriodPicker?: boolean
  searchPlaceholder?: string
  csvFilename: string
  columns: ReportColumn[]
  load: (inputs: ReportInputs) => Promise<ReportTableRow[]>
}
```

Existing four kinds: do not set `hasPeriodPicker` or `searchPlaceholder`.

- [ ] **Step 1: Extend types** as above. No behavior change yet.

- [ ] **Step 2: Run** `npx vitest run src/lib/reports/registry.test.ts`
Expected: PASS (still four kinds)

---

### Task 3: Inclusion / grain / labels / viewer (TDD)

**Files:**
- Create: `src/lib/openDocumentationReport.test.ts`
- Create: `src/lib/openDocumentationReport.ts`

**Interfaces:**
- Produces: `documentationFillLabel`, `buildOpenDocumentationRows`, types `OpenDocumentationEventSource`, `OpenDocumentationRow`

```ts
export type OpenDocumentationFillStatus = 'pending' | 'in_progress'

export type OpenDocumentationResponderSource = {
  responder_id: string
  status: ParticipationStatus
  profile: { full_name: string; callsign: string } | null
}

export type OpenDocumentationEventSource = {
  id: string
  event_date: string
  status: EventStatus
  is_cancelled: boolean
  police_event_id: string | null
  location: string | null
  shift_lead_id: string
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: OpenDocumentationResponderSource[]
}

export type OpenDocumentationRow = {
  id: string
  event_id: string
  event_date: string
  police_event_id: string | null
  responder_name: string | null
  responder_callsign: string | null
  shift_lead_name: string | null
  shift_lead_callsign: string | null
  road_name: string | null
  location: string | null
  fill_status: OpenDocumentationFillStatus
}

export function documentationFillLabel(status: OpenDocumentationFillStatus): string

export function buildOpenDocumentationRows(
  events: OpenDocumentationEventSource[],
  opts: { from: string; to: string; viewer: ReportViewer },
): OpenDocumentationRow[]
```

- [ ] **Step 1: Write failing tests** covering:
  - include `in_progress` + `partial` with pending / in_progress participation
  - exclude `draft`, `done`, cancelled, participation `done`, `event_date` outside `[from, to]`
  - two open volunteers → two rows; one done + one open on `partial` → one row
  - labels `טרם הוזן` / `נשמרה טיוטה`
  - אחמ״ש-only (`isAdmin: false`) keeps only `shift_lead_id === userId`
  - admin and the same user with `isAdmin: true` see all
  - sort `event_date` desc, then responder display name (`full_name` then `callsign`) asc he

Helper `event()` like `kmExceptionsReport.test.ts`, plus `shift_lead_id` and `status`.

- [ ] **Step 2: Run** `npx vitest run src/lib/openDocumentationReport.test.ts`
Expected: FAIL — module missing

- [ ] **Step 3: Implement** `buildOpenDocumentationRows`:
  - Event must be `in_progress` | `partial`, not cancelled, `event_date` in inclusive range
  - If `!viewer.isAdmin`, skip events where `shift_lead_id !== viewer.userId`
  - Emit one row per responder with status `pending` | `in_progress`
  - `id` = `${event.id}:${responder_id}`
  - Sort as specified

```ts
export function documentationFillLabel(status: OpenDocumentationFillStatus): string {
  return status === 'in_progress' ? 'נשמרה טיוטה' : 'טרם הוזן'
}
```

- [ ] **Step 4: Run tests**
Expected: PASS

---

### Task 4: Fetch + register the kind

**Files:**
- Modify: `src/lib/openDocumentationReport.ts` — `fetchOpenDocumentationRows` / `loadOpenDocumentationReport`
- Modify: `src/lib/reports/registry.ts`
- Modify: `src/lib/reports/registry.test.ts`

**Interfaces:**
- Consumes: `buildOpenDocumentationRows`, `ReportInputs.viewer`
- Produces: kind `open_documentation` in `REPORT_KINDS`

Query (no RPC):

```ts
const SELECT = `
  id,
  event_date,
  status,
  is_cancelled,
  police_event_id,
  location,
  shift_lead_id,
  road:roads(name),
  shift_lead:profiles(full_name, callsign),
  responders:event_responders(
    responder_id,
    status,
    profile:profiles(full_name, callsign)
  )
`

.from('events')
.select(SELECT)
.in('status', ['in_progress', 'partial'])
.eq('is_cancelled', false)
.gte('event_date', from)
.lte('event_date', to)
.order('event_date', { ascending: false })
```

If `!viewer.isAdmin`, add `.eq('shift_lead_id', viewer.userId)`.

`load` returns `[]` when range invalid or `viewer` missing.

Registry mapping (same `person` / `place` helpers as existing kinds):

```ts
const openDocumentation: ReportKind = {
  id: 'open_documentation',
  title: 'אירועים שהוזנו ע״י אחמ״ש ולא נסגרו ע״י מתנדב',
  includes: 'אירועים שהוזנו על ידי אחמ״ש ומתנדב טרם השלים את התיעוד שלהם',
  audience: 'admin_and_shift_lead',
  hasDateRange: true,
  hasPeriodPicker: true,
  searchPlaceholder: 'חיפוש לפי מתנדב, מספר אירוע או מיקום',
  csvFilename: 'אירועים-פתוחים-לתיעוד.csv',
  columns: [
    { id: 'police', header: 'מס אירוע', numeric: true },
    { id: 'date', header: 'תאריך', numeric: true },
    { id: 'responder', header: 'מתנדב' },
    { id: 'lead', header: 'אחמ״ש' },
    { id: 'place', header: 'כביש ומיקום' },
    { id: 'fill', header: 'סטטוס תיעוד' },
  ],
  async load(inputs) {
    const range = requireRange(inputs)
    if (!range || !inputs.viewer) return []
    const rows = await loadOpenDocumentationReport(range.from, range.to, inputs.viewer)
    return rows.map((row) => {
      const responder = person(row.responder_name, row.responder_callsign)
      const placeText = place(row.road_name, row.location)
      return {
        id: row.id,
        eventId: row.event_id,
        searchText: [responder, row.police_event_id ?? '', placeText].join(' '),
        values: [
          row.police_event_id ?? '—',
          formatDate(row.event_date),
          responder,
          person(row.shift_lead_name, row.shift_lead_callsign),
          placeText,
          documentationFillLabel(row.fill_status),
        ],
      }
    })
  },
}
```

Insert this kind first in `REPORT_KINDS` (chase-down before km summaries) **or** after duplicates — put it **first** so leads see it immediately.

Update `registry.test.ts`:

- five kinds; `open_documentation` is `admin_and_shift_lead`
- admin sees 5; shift_lead sees `open_documentation`, `km_exceptions`, `duplicate_events`
- `hasDateRange` true + `hasPeriodPicker` true only on this kind

- [ ] **Step 1: Update registry tests first** (they fail: length 4)
- [ ] **Step 2: Run** `npx vitest run src/lib/reports/registry.test.ts` — FAIL
- [ ] **Step 3: Implement fetch + registry entry**
- [ ] **Step 4: Run** `npx vitest run src/lib/reports/registry.test.ts src/lib/openDocumentationReport.test.ts` — PASS

---

### Task 5: Runner — PeriodPicker, viewer, placeholder

**Files:**
- Modify: `src/pages/ReportsPage.tsx`
- Modify: `src/components/reports/ReportRunner.tsx`

**Interfaces:**
- Consumes: `kind.hasPeriodPicker`, `kind.searchPlaceholder`, `inputs.viewer`
- ReportsPage passes `viewer` from `useAuth()`: `{ userId: profile?.id ?? user?.id ?? '', isAdmin: roles.includes('admin') }`

- [ ] **Step 1: ReportsPage** pass `viewer` into `ReportRunner`.

- [ ] **Step 2: ReportRunner**
  - New prop `viewer: ReportViewer`
  - If `kind.hasPeriodPicker`: state `period` via `defaultPeriod()` / `PeriodPicker`; resolve `{ from, to }` with `periodToRange`; still validate with `isValidFuelRefundRange`
  - Else if `kind.hasDateRange`: existing two date fields
  - `load({ from, to, viewer })` whenever the kind has a date range **or** always pass `viewer` (existing loads ignore it)
  - Search input `placeholder={kind.searchPlaceholder ?? 'חיפוש בדוח'}`
  - `useEffect` deps include `period` range + `viewer.userId` + `viewer.isAdmin`

Existing km reports: unchanged UI (two date fields).

- [ ] **Step 3: Run** `npx vitest run src/lib/reports src/lib/openDocumentationReport.test.ts`
Expected: PASS

- [ ] **Step 4: Typecheck** `npx tsc -b --pretty false`
Expected: exit 0

---

### Task 6: Docs + memory

**Files:**
- Modify: `design-system-design-instructions/screens/admin.md` — add the fifth kind under דוחות (admin + אחמ״ש, PeriodPicker on `event_date`)
- Modify: `.cursor/memory/MEMORY.md` — one bullet: open documentation report shipped 2026-08-15, spec path, row grain, viewer cut

- [ ] **Step 1: Update those two files. No product-surface English.**

---

## Spec coverage

| Spec item | Task |
|---|---|
| Inclusion in_progress/partial, not cancelled/draft/done | 3 |
| One row per open volunteer | 3 |
| Labels טרם הוזן / נשמרה טיוטה | 3 |
| PeriodPicker on event_date | 4–5 |
| Fuzzy search three fields | 1, 4 |
| אחמ״ש-only vs admin | 3–5 |
| Drill-in eventId | 4 |
| CSV six columns | 4 (generic runner) |
| No migrations | 4 |
| Existing reports unchanged | 2, 5 |

## Self-review

- No TBD / “handle edge cases”
- `ReportViewer` / `searchText` / `hasPeriodPicker` names are consistent across tasks
- `requireRange` already exists in `registry.ts`
