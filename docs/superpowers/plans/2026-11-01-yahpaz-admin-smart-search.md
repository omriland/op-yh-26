# Admin Smart Search (חיפוש) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins one Hebrew-first search box that finds new events, old-site archive events and people from fuzzy clues, shows what it understood as removable chips, and exports matches to CSV.

**Architecture:** A Supabase Edge Function (`smart-search`) turns the admin's sentence into a validated JSON filter using OpenAI. It never reads unit data. The browser then runs two database functions with the admin's own session: `admin_search` (new events plus people, security invoker) and `admin_search_archive` (`legacy.*`, security definer, audited). Digits-only queries skip the AI entirely.

**Tech Stack:** Vite + React 19 + TS, Supabase Postgres (plpgsql), Supabase Edge Functions (Deno), OpenAI Chat Completions with `response_format: json_schema` (strict), vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-yahpaz-admin-smart-search-design.md`

## Global Constraints

- Admin only: `admin` or `super_admin`, enforced in the Edge Function (403) and in both SQL functions.
- The OpenAI key is the Supabase function secret `OPENAI_API_KEY`, and the model name is the secret `SMART_SEARCH_MODEL`. Neither is ever a `VITE_` or Netlify variable. If either is missing, the function returns 503 and the client falls back to the direct lane.
- The model receives only: the admin's sentence, today's date (Asia/Jerusalem), the filter schema, and the event-type, district and 17 `HIT_TYPES` name lists. It receives no rows, roads, names or plates from the DB.
- Hebrew-only UI, RTL, logical CSS properties, semantic tokens only, both theme contexts, tap targets of 44 px or more, mono numerals for plates, IDs and dates. Read `design-system-design-instructions/00-how-to-use.md` before any UI task.
- Caps: 200 events, 200 archive rows and 50 people on screen. CSV export uses 5,000.
- AI timeout is 5 s. Queries longer than 300 characters are rejected with 400 before any AI call.
- The archive never returns an ID number. Every `admin_search_archive` call writes one `legacy.report_lookup_audit` row with `search_kind = 'smart'`.
- `is_demo` events are excluded everywhere.
- Migrations must be re-runnable (`create or replace`, `if not exists`), because the deploy workflow applies listed files on every run.
- Shared Edge-Function logic lives in `supabase/functions/_shared/*.ts` with relative `.ts` imports and no `jsr:` or `npm:` imports, so vitest and Node can import it (existing pattern: `inviteTtl.ts` ↔ `src/lib/inviteTtl.test.ts`).
- Applying migrations to the production project and deploying the function are outward-facing. Stop and get Omri's go-ahead before running either.

## Review Focus

1. **Hebrew prefixes on the direct lane**, e.g. `בסוזוקי` or `לדני`. A person expects the same hits as `סוזוקי` or `דני`. Pinned in Task 4 (`smart_search_word_variants`) and its verify script.
2. **The model returns `date_to` before `date_from`, or an impossible date** (`2026-02-30`). Expected: the range is swapped, an invalid date is dropped, and the rest of the filter still runs. Pinned in Task 1.
3. **An empty or whitespace-only query, or punctuation only** (`״׳.`). Expected: no AI call, no RPC call, and the "before first search" state. Pinned in Task 6 (`isBlankQuery`).
4. **A query over 300 characters.** Expected: 400 `query_too_long`, no OpenAI call, and the inline Hebrew error `החיפוש ארוך מדי. נסו לקצר.` Pinned in Task 3 and Task 9.
5. **A non-admin opens `/search` directly or calls the RPCs.** Expected: the route falls back to their home view, `admin_search` returns empty, and `admin_search_archive` raises `42501`. Pinned in Task 8 (`isAllowedAppView`) and in the Task 4 and 5 verify scripts.

---

### Task 1: Filter contract and validator

**Files:**
- Create: `supabase/functions/_shared/smartSearchFilter.ts`
- Test: `src/lib/smartSearchFilter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SmartSearchIntent = 'find' | 'export' | 'unsupported_question'
  export type SmartSearchEntity = 'events' | 'people' | 'both'
  export type SmartSearchSource = 'new' | 'archive' | 'both'
  export type SmartSearchFilter = {
    intent: SmartSearchIntent          // default 'find'
    entity: SmartSearchEntity          // default 'both'
    source: SmartSearchSource          // default 'both'
    date_from?: string                 // YYYY-MM-DD
    date_to?: string
    police_event_id?: string
    road?: string
    location_text?: string
    event_type?: string
    district?: string
    plate?: string                     // digits only
    vehicle_text?: string
    person?: string
    person_role?: 'responder' | 'lead' | 'any'
    text?: string
    status?: 'draft' | 'in_progress' | 'partial' | 'done'
    include_cancelled?: boolean
    damaged?: boolean
    damage_location?: string
  }
  export type SmartSearchVocab = { eventTypes: string[]; districts: string[]; hitTypes: string[] }
  export const SMART_SEARCH_FILTER_KEYS: readonly (keyof SmartSearchFilter)[]
  export const SMART_SEARCH_MAX_QUERY_CHARS = 300
  export function validateSmartSearchFilter(raw: unknown, vocab: SmartSearchVocab): SmartSearchFilter
  export function smartSearchJsonSchema(vocab: SmartSearchVocab): Record<string, unknown> // OpenAI strict json_schema
  ```

- [ ] **Step 1: Write the failing tests** in `src/lib/smartSearchFilter.test.ts`:

```ts
const vocab = { eventTypes: ['חילוץ', 'גרירה'], districts: ['מרכז'], hitTypes: ['פגוש קדמי', 'דלת נהג'] }

it('fills defaults for an empty object', () => {
  expect(validateSmartSearchFilter({}, vocab)).toEqual({ intent: 'find', entity: 'both', source: 'both' })
})
it('drops unknown keys', () => {
  expect(validateSmartSearchFilter({ road: '531', sql: 'drop' }, vocab)).toEqual({ intent: 'find', entity: 'both', source: 'both', road: '531' })
})
it('swaps a reversed date range', () => {
  const f = validateSmartSearchFilter({ date_from: '2026-10-31', date_to: '2026-10-25' }, vocab)
  expect([f.date_from, f.date_to]).toEqual(['2026-10-25', '2026-10-31'])
})
it('drops an impossible date and keeps the rest', () => {
  const f = validateSmartSearchFilter({ date_from: '2026-02-30', road: '6' }, vocab)
  expect(f.date_from).toBeUndefined(); expect(f.road).toBe('6')
})
it('drops event_type, district and damage_location outside the vocab', () => {
  const f = validateSmartSearchFilter({ event_type: 'שריפה', district: 'צפון', damage_location: 'גג' }, vocab)
  expect(f).toEqual({ intent: 'find', entity: 'both', source: 'both' })
})
it('keeps only digits in plate and drops it when fewer than 3 remain', () => {
  expect(validateSmartSearchFilter({ plate: '12-345-67' }, vocab).plate).toBe('1234567')
  expect(validateSmartSearchFilter({ plate: 'א1' }, vocab).plate).toBeUndefined()
})
it('trims strings, drops empty strings and caps each at 100 chars', () => {
  const f = validateSmartSearchFilter({ person: '  דני ', text: '   ', location_text: 'א'.repeat(150) }, vocab)
  expect(f.person).toBe('דני'); expect(f.text).toBeUndefined(); expect(f.location_text).toHaveLength(100)
})
it('drops enum values outside their set', () => {
  expect(validateSmartSearchFilter({ intent: 'delete', status: 'closed' }, vocab)).toEqual({ intent: 'find', entity: 'both', source: 'both' })
})
it('builds a strict json schema listing every key and the vocab enums', () => {
  const s = smartSearchJsonSchema(vocab) as any
  expect(s.strict).toBe(true)
  expect(Object.keys(s.schema.properties).sort()).toEqual([...SMART_SEARCH_FILTER_KEYS].sort())
  expect(JSON.stringify(s)).toContain('פגוש קדמי')
})
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lib/smartSearchFilter.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement both functions in `supabase/functions/_shared/smartSearchFilter.ts`.** Strict mode in OpenAI requires every property in `required`, so optional keys are typed `["string","null"]` and the validator treats `null` as absent. Validate dates with a round-trip through `Date.UTC`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run src/lib/smartSearchFilter.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git add supabase/functions/_shared/smartSearchFilter.ts src/lib/smartSearchFilter.test.ts && git commit -m "Validate the smart-search filter the model returns."`

### Task 2: Hebrew-first prompt builder and golden set

**Files:**
- Create: `supabase/functions/_shared/smartSearchPrompt.ts`
- Create: `scripts/smart-search/golden.json`, `scripts/smart-search/run-golden.ts`
- Test: `src/lib/smartSearchPrompt.test.ts`

**Interfaces:**
- Consumes: `SmartSearchVocab`, `smartSearchJsonSchema`, `validateSmartSearchFilter` (Task 1).
- Produces:
  ```ts
  export function jerusalemToday(now: Date): string // YYYY-MM-DD in Asia/Jerusalem
  export function buildSmartSearchMessages(query: string, today: string, vocab: SmartSearchVocab):
    { role: 'system' | 'user'; content: string }[]
  export const SMART_SEARCH_EXAMPLES: { q: string; filter: Partial<SmartSearchFilter> }[] // today pinned to 2026-11-01
  ```

- [ ] **Step 1: Write the failing tests.**

```ts
it('puts the stable instructions first and the query last, so the prefix caches', () => {
  const m = buildSmartSearchMessages('אירוע בכביש 531 בשבוע שעבר', '2026-11-01', vocab)
  expect(m[0].role).toBe('system'); expect(m.at(-1)).toEqual({ role: 'user', content: 'אירוע בכביש 531 בשבוע שעבר' })
  expect(m[0].content).toContain('2026-11-01')
})
it('lists the vocab and says Sunday–Saturday weeks, day-first dates, most recent past month', () => {
  const s = buildSmartSearchMessages('x', '2026-11-01', vocab)[0].content
  for (const w of ['חילוץ', 'מרכז', 'פגוש קדמי', 'ראשון', 'DD.MM']) expect(s).toContain(w)
})
it('has at least 12 Hebrew examples and at most 3 non-Hebrew ones', () => {
  const he = SMART_SEARCH_EXAMPLES.filter((e) => /[֐-׿]/.test(e.q))
  expect(he.length).toBeGreaterThanOrEqual(12)
  expect(SMART_SEARCH_EXAMPLES.length - he.length).toBeLessThanOrEqual(3)
})
it('every example filter survives validation unchanged', () => {
  for (const e of SMART_SEARCH_EXAMPLES)
    expect(validateSmartSearchFilter(e.filter, fullVocab)).toMatchObject(e.filter)
})
it('jerusalemToday rolls over at Jerusalem midnight, not UTC', () => {
  expect(jerusalemToday(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11-01')
})
```

The examples must cover, with `today = 2026-11-01`: `בשבוע שעבר` → 2026-10-25..2026-10-31, `אתמול`, `בינואר` → 2026-01-01..2026-01-31, `רבעון 3 2025` + `ייצוא` → intent `export` with 2025-07-01..2025-09-30, `סוזוקי שנפגעה` → `vehicle_text: 'סוזוקי suzuki'` + `damaged: true`, `פגוש קדמי`, a prefixed name `לדני כהן` → `person: 'דני כהן'`, `כמה כרטיסי דלק…` → `unsupported_question`, `מתי משה התחבר לאחרונה` → `entity: 'people'`, `person: 'משה'`, `14.1` → 2026-01-14, and one English-layout gibberish example, e.g. ` xuzuei` → `vehicle_text: 'סוזוקי'`. (The layout mapping is word-level, so check `mapEnKeysToHe` to pick a real example.)

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lib/smartSearchPrompt.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it in `supabase/functions/_shared/smartSearchPrompt.ts`.** The system message must be byte-identical across calls on the same day, so the provider's prompt cache hits. Render examples as `שאלה: …` / `JSON: …` lines.
- [ ] **Step 4: Write the golden set.** Add about 40 entries to `scripts/smart-search/golden.json`, shaped `{ "q": string, "today": "YYYY-MM-DD", "expect": Partial<SmartSearchFilter> }`, with at least 32 in Hebrew. Write `run-golden.ts`, which calls OpenAI directly with `OPENAI_API_KEY` and `SMART_SEARCH_MODEL` from env, validates the result, compares only the keys present in `expect`, and prints pass/fail per row plus the overall percentage. Run it with `node scripts/smart-search/run-golden.ts` (Node 23.6+ strips types). It is not part of `npm test`.
- [ ] **Step 5: Run the tests and confirm they pass.** Run `npx vitest run src/lib/smartSearchPrompt.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit.**

### Task 3: `smart-search` Edge Function

**Files:**
- Create: `supabase/functions/smart-search/index.ts`
- Create: `supabase/functions/_shared/smartSearchOpenAi.ts`
- Modify: `.github/workflows/deploy-edge-functions.yml` (add `smart-search` to the deployed functions, the same way as `plate-lookup`)
- Test: `src/lib/smartSearchOpenAi.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2. `smart_search_log` and `log_smart_search(...)` come from Task 4, so deploy after Task 4's migration.
- Produces the HTTP contract `POST /functions/v1/smart-search`, body `{ q: string }`:
  - `200 { filter: SmartSearchFilter, logId: string }`
  - `400 { error: 'invalid_body' | 'query_too_long' }`, `401`, `403 { error: 'forbidden' }`, `503 { error: 'not_configured' }`, `504 { error: 'timeout' }`, `502 { error: 'model_error' }`
- Produces in `_shared/smartSearchOpenAi.ts`:
  ```ts
  export function openAiRequestBody(model: string, messages: {role:string;content:string}[], schema: Record<string, unknown>): Record<string, unknown>
  export function parseOpenAiFilter(responseJson: unknown, vocab: SmartSearchVocab): SmartSearchFilter | null
  ```

- [ ] **Step 1: Write the failing tests.**
  - `openAiRequestBody` sets `response_format: { type: 'json_schema', json_schema: schema }`, `temperature: 0`, and `max_completion_tokens: 300`.
  - `parseOpenAiFilter` reads `choices[0].message.content`. It returns `null` on a refusal, missing content or invalid JSON, and returns a validated filter otherwise.
- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lib/smartSearchOpenAi.test.ts`.
- [ ] **Step 3: Implement the shared helpers and pass the tests.**
- [ ] **Step 4: Implement `index.ts`, following the `admin-users` pattern** (CORS via `_shared/cors.ts`; `getUser` with the caller's `Authorization`; `has_role` via the service client for `admin` then `super_admin`). Then:
  1. Reject an empty `q` (400) or one over `SMART_SEARCH_MAX_QUERY_CHARS` (400 `query_too_long`) before any other work.
  2. Load the vocab with the service client: active `event_types.name`, `districts.name`, and `HIT_TYPES` labels copied as a constant from `src/lib/reports/legacyReport.ts`. Cache it in module scope for 10 minutes.
  3. Call `https://api.openai.com/v1/chat/completions` with an `AbortController` set to 5,000 ms.
  4. Call `log_smart_search` (Task 4) as the caller and return `{ filter, logId }`.
  5. Never log or echo the key.
- [ ] **Step 5: Verify locally by type-checking.** Run `deno check supabase/functions/smart-search/index.ts`. Expected: no errors. If `deno` isn't installed, say so and rely on `npx tsc --noEmit -p tsconfig.app.json` for the shared files.
- [ ] **Step 6: Commit.** Deploying waits for Task 10.

### Task 4: Migration: `admin_search`, word variants, search log

**Files:**
- Create: `supabase/migrations/20261101120000_admin_smart_search.sql`
- Create: `scripts/smart-search/verify-admin-search.sql`
- Test: `src/lib/adminSmartSearchSql.test.ts`

**Interfaces:**
- Produces (SQL):
  - `public.smart_search_word_variants(p_word text) returns text[]`, immutable. It lowercases and strips `״ " ׳ '`, then returns `[w]`, plus `substr(w, 2)` when `w` starts with one of `בהוכלמש` and has 4 or more characters.
  - `public.admin_search(p_filter jsonb, p_limit int default 200) returns jsonb`, security invoker. It returns `{ "events": [{ "id": uuid, "found_by": text }], "people": [{ "id", "full_name", "callsign", "highest_role", "volunteer_status", "last_active_at" }] }`, and returns `{"events":[],"people":[]}` for non-admins. `p_limit` is clamped to 1..5000. People are capped at 50.
  - `public.smart_search_log(id uuid pk, actor_id uuid, query text, filter jsonb, lane text check (lane in ('ai','direct','fallback')), event_count int, archive_count int, people_count int, latency_ms int, chip_removed boolean default false, created_at timestamptz default now())`. RLS is on, with an admin-only `select` policy and no client insert or update policies.
  - `public.log_smart_search(p_query text, p_filter jsonb, p_lane text, p_latency_ms int) returns uuid`, security definer, admin-gated, with `actor_id = auth.uid()`.
  - `public.set_smart_search_log_counts(p_id uuid, p_events int, p_archive int, p_people int)` and `public.mark_smart_search_chip_removed(p_id uuid)`, both security definer and limited to the caller's own rows.
- Semantics, from the spec's "admin_search" section and filter table:
  - Keys are ANDed. Within `text`, `vehicle_text`, `person` and `location_text`, every whitespace word must match some column (via `smart_search_word_variants`, `ilike` with escaping as in `search_unit_event_ids`).
  - `person` matches the main lead, `event_secondary_leads` and responders, narrowed by `person_role`.
  - `plate` is a substring of `plate_digits` on both responder-owned and event-owned plates.
  - `damaged` on new events adds `נזק|פגיע|נפגע|פגוע` to the text match.
  - `include_cancelled` defaults to false, and `is_demo` is always excluded.
  - The direct lane sends `{ text: q }` and matches across police id, plate digits and number, manufacturer, model, color, location, road, lead, secondary-lead and responder names and callsigns, and all treatment and notes columns.
  - `found_by` is the first matched field, rendered like `לוחית 12-345-67 · סוזוקי סוויפט` or `כונן: דני כהן`.
  - `last_active_at` comes via `admin_list_last_active()`.
  - `source = 'archive'` or `entity = 'people'` skips the event query, and `entity = 'events'` skips people.

- [ ] **Step 1: Write the failing migration-text test** (pattern: `src/lib/eventEditLockRls.test.ts`). Assert that the file contains:
  - `create or replace function public.admin_search(p_filter jsonb, p_limit int default 200)` and `security invoker`
  - `has_role(auth.uid(), 'admin')` and `'super_admin'`
  - `is_demo`, `event_secondary_leads`, `plate_digits`, `admin_list_last_active()`
  - `create table if not exists public.smart_search_log`
  - `revoke all on function public.admin_search(jsonb, int) from public, anon`
  - `grant execute on function public.admin_search(jsonb, int) to authenticated`

  It must not contain `drop table`.
- [ ] **Step 2: Run the test and confirm it fails.**
- [ ] **Step 3: Write the migration** so the test passes. Add a `pg_trgm` index only if Step 5 shows a sequential scan over 50 ms.
- [ ] **Step 4: Write `verify-admin-search.sql`.** Run it inside `begin; … rollback;`, setting `request.jwt.claims` to an admin's and then a responder's uid. It covers:
  - `smart_search_word_variants('בסוזוקי')` contains `סוזוקי`, and `smart_search_word_variants('בית')` is `{בית}`.
  - The responder gets empty arrays.
  - `{ "text": "<a real plate's last 4 digits>" }` finds that event.
  - `{ "road": "531", "date_from": …, "date_to": … }` matches a hand count.
  - `{ "entity": "people", "person": "<prefixed real name>" }` finds the person.
- [ ] **Step 5: STOP. Ask Omri before applying anything to production.** Once he approves, apply the migration with `supabase db query --linked --project-ref rtvizpsfvtjowbimugns -f supabase/migrations/20261101120000_admin_smart_search.sql`, then run the verify script with `-f` the same way. Expected: every check returns `t`, and `explain analyze` of a direct-lane call is under 300 ms.
- [ ] **Step 6: Add the migration to the workflow's "Apply idempotent migrations" list and commit.**

### Task 5: Migration: `admin_search_archive`

**Files:**
- Create: `supabase/migrations/20261101121000_admin_search_archive.sql`
- Create: `scripts/smart-search/verify-admin-search-archive.sql`
- Test: `src/lib/adminSearchArchiveSql.test.ts`

**Interfaces:**
- Produces `public.admin_search_archive(p_filter jsonb, p_limit int default 200) returns jsonb`, security definer, `set search_path = public, legacy`. It returns `{ "rows": [{ "event_fk", "event_date", "event_number", "road", "location", "people": text, "cars": text, "damage": text, "found_by": text }] }`. `people` is `callsign name` pairs joined with `, `, using `legacy.users`. `damage` is the `HIT_TYPES` labels joined with `, `. Non-admins get `raise exception … using errcode = '42501'`, the same wording style as `legacy_report_search`.
- Mapping, from the spec:
  - `date_from` and `date_to` match `event_date::date`.
  - `police_event_id` matches `btrim(event_number)`.
  - `road` matches `road_number`, and `location_text` matches `location`.
  - `person` matches `call_sign`, `coordinator` and `legacy.users` first and last names.
  - `event_type` matches `legacy.event_types.event_description` with `ilike`.
  - `district` matches `legacy.branches.branch_name` with `ilike`. If nothing matches, the key is ignored.
  - `text` matches `actions_taken`, `problems` and `location`.
  - `plate` matches `regexp_replace(license_plate, '\D', '', 'g')`, and `vehicle_text` matches `license_plate`.
  - `damaged` means there is a hit with `value = true`.
  - `damage_location` matches `hit_id` = the 1-based index of the label in the `HIT_TYPES` order, hard-coded in a `values` list.
  - `status` and `include_cancelled` are ignored.
  - `source = 'new'` or `entity = 'people'` returns `{"rows":[]}` without an audit row.
  - The function groups by `event_fk`, because `vol_events` has one row per volunteer.
- Audit: one `insert into legacy.report_lookup_audit` per call with `search_kind = 'smart'`, `search_value = legacy.mask_id_like(p_filter::text)`, the result count and the fks.

- [ ] **Step 1: Write the failing migration-text test.** Assert the file contains:
  - `security definer`, `set search_path = public, legacy`, `errcode = '42501'`
  - `legacy.report_lookup_audit`, `'smart'`, `legacy.mask_id_like`
  - `revoke all on function public.admin_search_archive(jsonb, int) from public, anon`

  It must not contain `pid` or `mask_pid`, because no ID column is selected.
- [ ] **Step 2: Run the test and confirm it fails.**
- [ ] **Step 3: Write the migration** so the test passes.
- [ ] **Step 4: Write `verify-admin-search-archive.sql`.** It covers:
  - A responder call raises `42501`.
  - An admin call `{ "vehicle_text": "סוזוקי", "damaged": true, "date_from": "2026-01-01", "date_to": "2026-01-31" }` returns rows whose `damage` is non-empty.
  - Exactly one new audit row with `search_kind = 'smart'`.
  - No value in the result matches `\d{9}`.
- [ ] **Step 5: STOP. Ask Omri before applying, the same as Task 4.** Then apply and verify. Expected: all checks `t`, p95 under 1 s on a dated query.
- [ ] **Step 6: Add the migration to the workflow list and commit.**

### Task 6: Client search logic (direct lane, chips, ordering)

**Files:**
- Create: `src/lib/smartSearch.ts`
- Test: `src/lib/smartSearch.test.ts`

**Interfaces:**
- Consumes: `SmartSearchFilter` (Task 1, imported from `../../supabase/functions/_shared/smartSearchFilter.ts`).
- Produces:
  ```ts
  export function isBlankQuery(q: string): boolean
  export function isDirectQuery(q: string): boolean          // only digits, spaces, - / .
  export function directFilter(q: string): SmartSearchFilter // { intent:'find', entity:'both', source:'both', text: q.trim() }
  export type SearchChip = { key: keyof SmartSearchFilter | 'dates'; label: string; numeric: boolean }
  export function chipsForFilter(f: SmartSearchFilter): SearchChip[]
  export function removeChip(f: SmartSearchFilter, key: SearchChip['key']): SmartSearchFilter
  export type SearchSection = 'events' | 'archive' | 'people'
  export function sectionOrder(f: SmartSearchFilter, firstNewEventDate: string | null): SearchSection[]
  ```

- [ ] **Step 1: Write the failing tests.**

```ts
expect(isBlankQuery('  ״׳. ')).toBe(true)
expect(isDirectQuery('12-345-67')).toBe(true); expect(isDirectQuery('4471')).toBe(true)
expect(isDirectQuery('כביש 531')).toBe(false)
expect(chipsForFilter({ intent:'find', entity:'both', source:'both', road:'531', date_from:'2026-10-25', date_to:'2026-10-31' }))
  .toEqual([{ key:'road', label:'כביש 531', numeric:false }, { key:'dates', label:'25.10.2026–31.10.2026', numeric:true }])
expect(chipsForFilter({ intent:'find', entity:'both', source:'both', damaged:true }).map(c=>c.label)).toEqual(['עם נזק'])
expect(chipsForFilter({ intent:'find', entity:'both', source:'archive' }).map(c=>c.label)).toEqual(['ארכיון בלבד'])
expect(removeChip({ intent:'find', entity:'both', source:'both', date_from:'a', date_to:'b', road:'6' }, 'dates'))
  .toEqual({ intent:'find', entity:'both', source:'both', road:'6' })
expect(sectionOrder({ intent:'find', entity:'both', source:'both' }, '2026-08-09')).toEqual(['events','archive','people'])
expect(sectionOrder({ intent:'find', entity:'both', source:'both', date_to:'2026-01-31' }, '2026-08-09')).toEqual(['archive','events','people'])
expect(sectionOrder({ intent:'find', entity:'people', source:'both' }, null)).toEqual(['people'])
```

  Chip labels:
  - `road` → `כביש {v}`
  - `police_event_id` → `אירוע {v}`
  - `plate` → `לוחית {formatPlate(v)}`
  - `vehicle_text` → the value as-is
  - `person` → `{v}`, prefixed `כונן: ` or `אחמ״ש: ` by `person_role`
  - `event_type` and `district` → the value
  - `text` → `״{v}״`
  - `damage_location` → `נזק: {v}`
  - `status` → the existing stamp label text
  - `include_cancelled` → `כולל מבוטלים`
  - `source` `new` → `אירועים חדשים בלבד`, `archive` → `ארכיון בלבד`

  No chips for `intent`, `entity` or `source: 'both'`.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement** using `formatDate` and `formatPlate` from the existing `format.ts` (check the exact names there).
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.**

### Task 7: API wrapper and CSV mapping

**Files:**
- Create: `src/lib/smartSearchApi.ts`, `src/lib/smartSearchCsv.ts`
- Test: `src/lib/smartSearchCsv.test.ts`, `src/lib/smartSearchApi.test.ts`

**Interfaces:**
- Consumes: Tasks 3–6, `EVENT_LIST_SELECT` and `EventListItem` from `src/lib/events.ts`, and `toCsv`/`downloadCsv` from `src/lib/reports/csv.ts`.
- Produces:
  ```ts
  export type ArchiveRow = { event_fk: string; event_date: string; event_number: string | null; road: string | null; location: string | null; people: string; cars: string; damage: string; found_by: string }
  export type PersonHit = { id: string; full_name: string; callsign: string; highest_role: string; volunteer_status: string | null; last_active_at: string | null }
  export type Interpretation = { filter: SmartSearchFilter; lane: 'ai' | 'direct' | 'fallback'; logId: string | null; error?: 'query_too_long' }
  export async function interpretQuery(q: string): Promise<Interpretation> // direct lane locally; else invoke 'smart-search'; on 503/504/502/network → fallback with directFilter
  export async function runSearch(f: SmartSearchFilter, limit: number): Promise<{ events: (EventListItem & { found_by: string })[]; archive: ArchiveRow[]; people: PersonHit[] }>
  export async function reportCounts(logId: string, counts: { events: number; archive: number; people: number }): Promise<void>
  export async function reportChipRemoved(logId: string): Promise<void>
  export function eventsCsv(rows: (EventListItem & { found_by: string })[]): string
  export function archiveCsv(rows: ArchiveRow[]): string
  export function searchCsvFilename(kind: 'events' | 'archive', today: string): string // 'חיפוש-אירועים-2026-11-01.csv' | 'חיפוש-ארכיון-2026-11-01.csv'
  ```
  `runSearch` calls both RPCs in parallel. It hydrates event ids with one `.in('id', ids)` query using `EVENT_LIST_SELECT`, keeps the RPC order, and attaches `found_by`.
  On the `fallback` lane, when `searchQueryVariants(q)` returns two variants (Hebrew typed on an English layout), `runSearch` runs once per variant and merges the results by id, keeping the first occurrence.

- [ ] **Step 1: Write the failing tests.**
  - The `eventsCsv` header equals the events-table headers plus `נמצא לפי`, `לוחיות`, `יצרן ודגם`, `כוננים`, `ק״מ`, `פירוט הטיפול`.
  - The `archiveCsv` header is `תאריך, מספר אירוע, כביש / מיקום, כוננים, רכבים, נזק, נמצא לפי, פעולות שבוצעו`, and the fixture row has no 9-digit run.
  - The filenames match the spec.
  - `interpretQuery`, with the supabase client mocked: `'12-345-67'` never invokes the function; a `503` yields `lane: 'fallback'`; a `400 query_too_long` yields `error: 'query_too_long'`.
  - On the fallback lane, a Latin-layout query (`'xuzuei'`-style) calls `admin_search` twice, once per variant, and the merged events contain no duplicate ids.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement both files.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.**

### Task 8: Route, nav entry, mobile overflow, ⌘K

**Files:**
- Modify: `src/lib/appRoute.ts` (add `'search'` to `AppRouteView`, `VIEW_TO_SLUG.search = 'search'`, `isAllowedAppView` → `access.isAdmin`)
- Modify: `src/lib/mobileNav.ts` (`MOBILE_TAB_SECONDARY` becomes `['search', 'shifts', 'contacts', 'map', 'reports']`)
- Modify: `src/components/shell/AppShell.tsx` (`NAV_ICONS.search` = Lucide `Search` at the same size and stroke as its siblings)
- Modify: `src/App.tsx`, in the `isAdmin` block. On desktop, push `{ view: 'search', label: 'חיפוש', icon: NAV_ICONS.search, section: 'ניהול' }` before the `ADMIN_SEGMENTS` loop. On mobile, push the same entry without `section`, so `splitMobileNav` sends it to `עוד`.
- Create: `src/lib/searchShortcut.ts`, exporting `isSearchShortcut(e: Pick<KeyboardEvent,'key'|'metaKey'|'ctrlKey'|'altKey'|'shiftKey'|'isComposing'>): boolean` (true for ⌘K / Ctrl+K only, no Alt or Shift, not while composing) and `useSearchShortcut(enabled: boolean, open: () => void): void`. The hook listens on `document` in the bubble phase, so open Dialog handlers using the capture phase still win.
- Modify: `design-system-design-instructions/screens/admin.md` (add `חיפוש` to the desktop `ניהול` items and as the first `עוד` item for מנהל)
- Test: `src/lib/appRoute.test.ts`, `src/lib/mobileNav.test.ts`, `src/lib/searchShortcut.test.ts`

The query lives in the URL as `/search?q=…`. Add `searchQuery?: string` to `AppRouteState`, and parse and serialize it in `appPath` and the parser. Pushing a new query uses `pushState`, so back returns to the previous query.

- [ ] **Step 1: Write the failing tests.**
  - `isAllowedAppView('search', admin)` is true; for a shift lead and a responder it is false.
  - Parsing `/search?q=%D7%9B%D7%91%D7%99%D7%A9` yields `view: 'search'` and `searchQuery: 'כביש'`, and `appPath` round-trips it.
  - `splitMobileNav` puts `search` first in the overflow for an admin entry list.
  - `isSearchShortcut` is true for `{key:'k', metaKey:true}` and `{key:'k', ctrlKey:true}`, false with `altKey`, and false with `isComposing`. It also accepts `key:'ל'` (the Hebrew layout's K key).
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement the changes.** Render a placeholder `SearchPage` stub so the route compiles.
- [ ] **Step 4: Run `npx vitest run` and `npx tsc -b`.** Expected: all pass, exit 0.
- [ ] **Step 5: Commit.**

### Task 9: Search page UI

**Files:**
- Create: `src/pages/SearchPage.tsx`
- Create: `src/components/search/SearchChips.tsx`, `src/components/search/ArchiveResultsTable.tsx`, `src/components/search/PeopleResults.tsx`
- Modify: `src/components/events/EventsTable.tsx`. Add an optional prop `foundBy?: (event: EventListItem) => string`. When it's present, render a last column `נמצא לפי`, truncated to one line, with the full text in a `HoverTip`. With no prop, the table is unchanged.
- Modify: `src/components/events/EventCard.tsx`. Add an optional `foundBy?: string`, rendered as a `--type-caption` line `נמצא לפי: …` under row 3.
- Modify: `src/index.css` (or the styles file the events page uses). Add `search-*` classes, tokens only, logical properties only.
- Create: `design-system-design-instructions/screens/search.md`, written from the spec's UI section (anatomy, mobile, states table, copy).
- Create: `src/lib/searchPageState.ts` + `src/lib/searchPageState.test.ts`, exporting `searchViewState(input: { query: string; loading: boolean; error: boolean; interpretation: Interpretation | null; counts: { events: number; archive: number; people: number } | null }): 'idle' | 'loading' | 'error' | 'too_long' | 'unsupported' | 'empty' | 'results'`

**Behavior (copy verbatim from the spec's States table):**
- The input's placeholder rotates once per visit among three examples:
  - `למשל: אירוע בכביש 531 בשבוע שעבר`
  - `למשל: סוזוקי שנפגעה בינואר`
  - `למשל: 12-345-67`
- Enter or `חיפוש` runs `interpretQuery`, then `runSearch(filter, 200)`, then `reportCounts`.
- Chip removal runs `removeChip`, then `runSearch`, then `reportChipRemoved`. There is no new AI call.
- The direct lane shows the caption `חיפוש ישיר לפי מספר` instead of chips. The fallback lane shows results plus the caption `החיפוש החכם אינו זמין כרגע. מוצגות תוצאות חיפוש טקסט.`
- When `intent = 'export'`, the events `ייצוא ל־CSV` button is the page's single primary and `חיפוש` becomes secondary.
- Export runs `runSearch(filter, 5000)` and then `downloadCsv`, followed by the toast `הקובץ יוצא`. Nothing downloads without a click.
- Clicking an event row opens event detail. An archive row opens the legacy report through the existing `LegacyEventReport` flow for that `event_fk`. A person row opens that user's edit dialog on `/users`.
- Section order comes from `sectionOrder`. The first new-event date is the min `event_date`, fetched once and cached.
- `too_long` shows the inline field error `החיפוש ארוך מדי. נסו לקצר.`
- `unsupported` shows the info line from the spec, any chips that were extracted, and a ghost `הצגת האירועים המתאימים`. That button runs `runSearch` with `intent: 'find'`.
- When a section returns exactly its cap (200), a caption above that table reads `מוצגות 200 התוצאות הראשונות. צמצמו את החיפוש או ייצאו ל־CSV.`

- [ ] **Step 1: Write the failing `searchPageState` tests.** Cover one case per state, including that a blank query gives `idle`, `unsupported_question` with zero counts gives `unsupported`, and all-zero counts give `empty`.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement `searchPageState.ts`** so the tests pass.
- [ ] **Step 4: Build the page and components** against `06-components.md`: section rules, table recipe, neutral chips (not stamps), skeletons (6 rows on desktop, 5 cards on mobile), and the empty-state pattern.
- [ ] **Step 5: Verify in the browser** with the `run` skill, as an admin, at 1280 px and 390 px. Check:
  - `/search` renders all states. For the AI states, use the fallback by leaving the secret unset.
  - Tab order and focus rings work, and every tap target is 44 px or more.
  - No physical `left`/`right` appears in the new CSS: `grep -nE "(margin|padding|border)-(left|right)|\b(left|right):" src/index.css` shows no new lines.
  - `npm run contrast` passes.
  - Run the `00-how-to-use.md` pre-delivery checklist.
- [ ] **Step 6: Run `npx vitest run`, `npx tsc -b` and `npm run lint`.** Expected: exit 0 for each.
- [ ] **Step 7: Commit.**

### Task 10: Deploy and acceptance (with Omri)

**Files:**
- Modify: `.github/workflows/deploy-edge-functions.yml` (already edited in Tasks 3–5; confirm the entries)

- [ ] **Step 1: STOP. Get from Omri** the OpenAI key and his go-ahead to set secrets and deploy. He sets the secrets himself, or approves the commands: `supabase secrets set OPENAI_API_KEY=… SMART_SEARCH_MODEL=… --project-ref rtvizpsfvtjowbimugns`.
- [ ] **Step 2: Run the golden set.** Run `node scripts/smart-search/run-golden.ts`. Expected: 90% or more exact match on the date, road, plate, person, vehicle_text and damage keys. Below that, add or adjust examples in `SMART_SEARCH_EXAMPLES` (Task 2) and re-run. Report the final percentage and any failures to Omri.
- [ ] **Step 3: Deploy** the function and migrations through the workflow, with Omri's approval.
- [ ] **Step 4: Run the acceptance checks in production as an admin:**
  - `12-345-67`-style plate search: the results show and no AI call is logged (`lane = 'direct'` in `smart_search_log`).
  - `אירוע בכביש 531 בשבוע שעבר` shows chips and results in 3 s or less.
  - `סוזוקי שנפגעה בינואר` returns archive rows with damage.
  - `ייצוא כל האירועים מרבעון 3 2025` makes export the primary button, and the CSV opens correctly in Excel (Hebrew intact).
  - As a shift-lead account, `/search` is unreachable and the RPC returns empty.
- [ ] **Step 5: Use superpowers:verification-before-completion,** then superpowers:finishing-a-development-branch.
