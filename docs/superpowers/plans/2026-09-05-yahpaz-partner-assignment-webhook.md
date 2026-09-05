# Yahpaz Partner Assignment-Webhook Notifications Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Part B of `docs/superpowers/specs/2026-09-04-yahpaz-profile-telegram-link-design.md` — when a volunteer gets a new event assignment, Yahpaz signs and delivers an `assignment_created` webhook to the partner bot server's registered `webhook_url`, so the bot can message the volunteer and (per `docs/superpowers/specs/2026-09-04-yahpaz-telegram-live-trip-tracking-design.md`'s "Future integration" note) offer an "accept" action that calls `start_live_track { event_id }` directly, skipping `list_open_events`.

**Architecture:** An `after insert` trigger on `event_responders` enqueues one `partner_webhook_events` outbox row per partner client that (a) has an active, unrevoked grant for that volunteer and (b) has a `webhook_url` configured. A pg_cron job (every minute, mirroring the existing `notify-overdue-fills` pattern) invokes a new `deliver_webhooks` action on the `partner-auth` Edge Function, which polls undelivered rows (skipping any still in their backoff window), HMAC-SHA256-signs the JSON body with the client's `webhook_secret`, POSTs it to `webhook_url`, and marks delivery success/failure. Admins configure `webhook_url` (and receive a generated `webhook_secret` once) from the existing Partner Bot settings page, the same way `client_secret` is issued today.

**Tech Stack:** Postgres trigger + `pg_cron` + `pg_net` + Supabase Vault (existing patterns from `supabase/migrations/20260818090000_overdue_fill_reminder.sql`), Deno Edge Function (`supabase/functions/partner-auth/index.ts`), React/TypeScript admin UI (`src/pages/PartnerBotSettings.tsx`), Vitest.

---

## Global Constraints

- **No local Deno/Supabase CLI is available.** Edge Function and SQL migration changes cannot be run or tested locally. Verify them by careful code review against the exact patterns cited below (they are copied from working code in this repo), not by execution.
- **The frontend (`src/`) DOES have a working test runner** (`npm test` → `vitest run`). Any pure-function change there must follow real TDD: write the failing test, run it, watch it fail, implement, run again, watch it pass.
- Commit after each task.
- Do not touch `public/partner-api/openapi.yaml`'s `/partner-auth` `token` section — there is a known, pre-existing, out-of-scope 60-day-vs-7-day documentation inconsistency there (see `docs/superpowers/plans/2026-09-04-yahpaz-telegram-live-trip-tracking.md`'s Errors log for context). Do not fix it as a drive-by in this plan.
- This spec deliberately reuses the existing `yahpaz_service_role_key` Vault secret (already present, used by `invoke_notify_overdue_fills`) — do not create a new Vault secret.

---

## Task 1: Migration — webhook config columns, outbox table, enqueue trigger, delivery cron

**Files:**
- Create: `supabase/migrations/20260905120000_partner_webhook_events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Partner webhook (Telegram bot): assignment_created notifications. Outbox + delivery config.

alter table public.oauth_clients
  add column if not exists webhook_url text,
  add column if not exists webhook_secret text;

comment on column public.oauth_clients.webhook_url is
  'Where to POST assignment_created notifications. Null = not configured, no webhook delivery.';
comment on column public.oauth_clients.webhook_secret is
  'Plaintext HMAC-SHA256 signing key for outbound webhooks. Not hashed: the bot server needs the same plaintext to verify X-Yahpaz-Signature.';

create table public.partner_webhook_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  attempts int not null default 0,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index partner_webhook_events_undelivered_idx
  on public.partner_webhook_events (created_at)
  where delivered_at is null;

comment on table public.partner_webhook_events is
  'Outbox for signed webhook deliveries to partner bot servers (e.g. assignment_created). Service-role only.';

alter table public.partner_webhook_events enable row level security;
revoke all on public.partner_webhook_events from public, anon, authenticated;

-- Enqueue one outbox row per (client, volunteer) with an active grant + configured webhook_url,
-- whenever a volunteer gets a new event assignment.
create or replace function public.enqueue_partner_webhook_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_summary jsonb;
begin
  select jsonb_build_object(
    'event_type_name', et.name,
    'event_date', e.event_date,
    'police_event_id', e.police_event_id,
    'location', e.location
  )
  into event_summary
  from public.events e
  left join public.event_types et on et.id = e.event_type_id
  where e.id = new.event_id;

  if event_summary is null then
    return new;
  end if;

  insert into public.partner_webhook_events (client_id, user_id, event_type, payload)
  select
    oc.id,
    new.responder_id,
    'assignment_created',
    jsonb_build_object('event_id', new.event_id, 'event_summary', event_summary)
  from public.oauth_access_tokens oat
  join public.oauth_clients oc on oc.id = oat.client_id
  where oat.user_id = new.responder_id
    and oat.revoked_at is null
    and oc.is_active = true
    and oc.webhook_url is not null;

  return new;
end;
$$;

drop trigger if exists event_responders_enqueue_webhooks on public.event_responders;
create trigger event_responders_enqueue_webhooks
  after insert on public.event_responders
  for each row
  execute function public.enqueue_partner_webhook_events();

-- Scheduled delivery worker (mirrors invoke_notify_overdue_fills in 20260818090000_overdue_fill_reminder.sql).
create or replace function public.invoke_deliver_partner_webhooks()
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  secret text;
  request_id bigint;
begin
  select ds.decrypted_secret
    into secret
  from vault.decrypted_secrets as ds
  where ds.name = 'yahpaz_service_role_key'
  limit 1;

  if secret is null or btrim(secret) = '' then
    raise warning 'invoke_deliver_partner_webhooks: missing vault secret yahpaz_service_role_key';
    return null;
  end if;

  select net.http_post(
    url := 'https://rtvizpsfvtjowbimugns.supabase.co/functions/v1/partner-auth',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret,
      'apikey', secret
    ),
    body := '{"action":"deliver_webhooks"}'::jsonb,
    timeout_milliseconds := 50000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_deliver_partner_webhooks() from public, anon, authenticated;
grant execute on function public.invoke_deliver_partner_webhooks() to postgres;

do $$
begin
  perform cron.unschedule('deliver-partner-webhooks');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'deliver-partner-webhooks',
  '* * * * *',
  $cmd$select public.invoke_deliver_partner_webhooks()$cmd$
);
```

Notes for the implementer (do not skip reading these):
- This refines two details the design spec left as a sketch, deliberately: (1) added `last_attempt_at` (not in the spec's column list) because a backoff schedule is impossible to implement without it — Task 3 relies on it. (2) The design's payload sketch was `{ id, user_id, event_id, event_type, ...minimal event summary }`; `event_type` there collides with the outbox row's own `event_type` column (which holds the notification kind, `"assignment_created"`, not the incident category). This migration's trigger stores the incident category under `payload.event_summary.event_type_name` instead, to avoid that collision. `id` and `user_id` are added to the final delivered body at send time in Task 3 (not stored redundantly in `payload`).
- Cadence is every minute (`* * * * *`), unlike the existing hourly crons (`notify-overdue-fills`, `refresh-profile-lifetime-stats`) — deliberate, since this is a near-real-time assignment notification, not a batch reminder.
- Trigger is `security definer` because it must read `oauth_access_tokens`/`oauth_clients` (locked to service-role only) and insert into `partner_webhook_events` (same) regardless of which role's session performed the `event_responders` insert.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260905120000_partner_webhook_events.sql
git commit -m "$(cat <<'EOF'
Add partner webhook outbox: schema, enqueue trigger, delivery cron

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U8Xj2LudEaYN86Nw3RbhTC
EOF
)"
```

---

## Task 2: Shared crypto helpers — webhook secret + HMAC signing

**Files:**
- Modify: `supabase/functions/_shared/partnerCrypto.ts`

- [ ] **Step 1: Add `randomWebhookSecret` and `hmacSha256Hex`**

Find (end of file):

```ts
export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const len = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}
```

Replace with:

```ts
export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const len = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

/** Plaintext HMAC-signing secret for a partner's webhook_url. Same shape as randomClientSecret; kept separate for call-site clarity. */
export function randomWebhookSecret(): string {
  return bytesToBase64Url(randomBytes(32));
}

/** Hex HMAC-SHA256 of `body` using `secret` as the key — signs outbound partner webhook deliveries. */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/partnerCrypto.ts
git commit -m "$(cat <<'EOF'
Add randomWebhookSecret + hmacSha256Hex partner crypto helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U8Xj2LudEaYN86Nw3RbhTC
EOF
)"
```

---

## Task 3: `partner-auth` — `admin_set_webhook` + `deliver_webhooks` actions

**Files:**
- Modify: `supabase/functions/partner-auth/index.ts`

- [ ] **Step 1: Import the new crypto helpers**

Find:

```ts
import {
  constantTimeEqual,
  randomAccessToken,
  randomClientId,
  randomClientSecret,
  randomStartParam,
  sha256Hex,
} from "../_shared/partnerCrypto.ts";
```

Replace with:

```ts
import {
  constantTimeEqual,
  hmacSha256Hex,
  randomAccessToken,
  randomClientId,
  randomClientSecret,
  randomStartParam,
  randomWebhookSecret,
  sha256Hex,
} from "../_shared/partnerCrypto.ts";
```

- [ ] **Step 2: Dispatch the two new actions**

Find:

```ts
    if (action === "admin_delete_client") {
      return handleAdminDelete(admin, cfg, req, body);
    }

    return json(400, { error: "פעולה לא מוכרת." });
  });
});
```

Replace with:

```ts
    if (action === "admin_delete_client") {
      return handleAdminDelete(admin, cfg, req, body);
    }
    if (action === "admin_set_webhook") {
      return handleAdminSetWebhook(admin, cfg, req, body);
    }
    if (action === "deliver_webhooks") {
      return handleDeliverWebhooks(admin, cfg.service, req);
    }

    return json(400, { error: "פעולה לא מוכרת." });
  });
});
```

- [ ] **Step 3: Expose `webhook_url` in `admin_list_clients`**

Find:

```ts
  const { data, error } = await admin
    .from("oauth_clients")
    .select("id, name, client_id, telegram_bot_username, is_active, created_at")
    .order("created_at", { ascending: false });
  if (error) return json(400, { error: "לא ניתן לטעון יישומים." });
  return json(200, { clients: data ?? [] });
}
```

Replace with:

```ts
  const { data, error } = await admin
    .from("oauth_clients")
    .select("id, name, client_id, telegram_bot_username, is_active, webhook_url, created_at")
    .order("created_at", { ascending: false });
  if (error) return json(400, { error: "לא ניתן לטעון יישומים." });
  return json(200, { clients: data ?? [] });
}
```

- [ ] **Step 4: Add `handleAdminSetWebhook` and `handleDeliverWebhooks`**

Find (end of file):

```ts
async function handleAdminDelete(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  if (!(await requireAdmin(admin, user.id))) {
    return json(403, { error: "אין הרשאה." });
  }

  const clientId = trim(body.client_id);
  const client = await findClientByPublicId(admin, clientId);
  if (!client) return json(400, { error: "היישום אינו מוכר." });

  const { error } = await admin.from("oauth_clients").delete().eq("id", client.id);
  if (error) return json(400, { error: "לא ניתן להסיר את הבוט." });
  return json(200, { ok: true });
}
```

Replace with:

```ts
async function handleAdminDelete(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  if (!(await requireAdmin(admin, user.id))) {
    return json(403, { error: "אין הרשאה." });
  }

  const clientId = trim(body.client_id);
  const client = await findClientByPublicId(admin, clientId);
  if (!client) return json(400, { error: "היישום אינו מוכר." });

  const { error } = await admin.from("oauth_clients").delete().eq("id", client.id);
  if (error) return json(400, { error: "לא ניתן להסיר את הבוט." });
  return json(200, { ok: true });
}

function isHttpsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function handleAdminSetWebhook(
  admin: SupabaseClient,
  cfg: { url: string; anon: string },
  req: Request,
  body: JsonBody,
): Promise<Response> {
  const user = await userFromRequest(req, cfg.url, cfg.anon);
  if (!user) return json(401, { error: "יש להתחבר מחדש." });
  if (!(await requireAdmin(admin, user.id))) {
    return json(403, { error: "אין הרשאה." });
  }

  const clientId = trim(body.client_id);
  const client = await findClientByPublicId(admin, clientId);
  if (!client) return json(400, { error: "היישום אינו מוכר." });

  const webhookUrl = trim(body.webhook_url);

  if (!webhookUrl) {
    const { error } = await admin
      .from("oauth_clients")
      .update({ webhook_url: null, webhook_secret: null })
      .eq("id", client.id);
    if (error) return json(400, { error: "לא ניתן לעדכן webhook." });
    return json(200, { ok: true, webhook_url: null });
  }

  if (!isHttpsUrl(webhookUrl)) {
    return json(400, { error: "כתובת ה-webhook חייבת להתחיל ב-https://." });
  }

  const secret = randomWebhookSecret();
  const { error } = await admin
    .from("oauth_clients")
    .update({ webhook_url: webhookUrl, webhook_secret: secret })
    .eq("id", client.id);
  if (error) return json(400, { error: "לא ניתן לעדכן webhook." });

  return json(200, { ok: true, webhook_url: webhookUrl, webhook_secret: secret });
}

const WEBHOOK_DELIVERY_BATCH_LIMIT = 50;

function webhookBackoffMs(attempts: number): number {
  const minutes = attempts <= 1 ? 1 : attempts === 2 ? 5 : attempts === 3 ? 15 : 60;
  return minutes * 60 * 1000;
}

type WebhookOutboxRow = {
  id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  last_attempt_at: string | null;
  client:
    | { webhook_url: string | null; webhook_secret: string | null; is_active: boolean }
    | { webhook_url: string | null; webhook_secret: string | null; is_active: boolean }[]
    | null;
};

async function handleDeliverWebhooks(
  admin: SupabaseClient,
  serviceKey: string,
  req: Request,
): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "יש להתחבר מחדש." });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (token !== serviceKey) {
    return json(403, { error: "אין לך הרשאה לפעולה זו." });
  }

  const { data: rows, error } = await admin
    .from("partner_webhook_events")
    .select(
      `id, user_id, event_type, payload, attempts, last_attempt_at,
       client:oauth_clients!inner(webhook_url, webhook_secret, is_active)`,
    )
    .is("delivered_at", null)
    .eq("client.is_active", true)
    .not("client.webhook_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(WEBHOOK_DELIVERY_BATCH_LIMIT);

  if (error) {
    return json(500, { error: "טעינת אירועי webhook נכשלה.", detail: error.message });
  }

  const delivered: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const raw of (rows ?? []) as WebhookOutboxRow[]) {
    const due =
      !raw.last_attempt_at ||
      Date.now() - new Date(raw.last_attempt_at).getTime() >= webhookBackoffMs(raw.attempts);
    if (!due) {
      skipped.push({ id: raw.id, reason: "backoff" });
      continue;
    }

    const client = Array.isArray(raw.client) ? raw.client[0] : raw.client;
    if (!client?.webhook_url || !client.webhook_secret) {
      skipped.push({ id: raw.id, reason: "unconfigured" });
      continue;
    }

    const bodyText = JSON.stringify({
      id: raw.id,
      user_id: raw.user_id,
      event_type: raw.event_type,
      ...raw.payload,
    });
    const signature = await hmacSha256Hex(client.webhook_secret, bodyText);

    let ok = false;
    try {
      const response = await fetch(client.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Yahpaz-Signature": signature,
        },
        body: bodyText,
      });
      ok = response.ok;
    } catch {
      ok = false;
    }

    const nowIso = new Date().toISOString();
    if (ok) {
      await admin
        .from("partner_webhook_events")
        .update({ delivered_at: nowIso, last_attempt_at: nowIso })
        .eq("id", raw.id);
      delivered.push(raw.id);
    } else {
      await admin
        .from("partner_webhook_events")
        .update({ attempts: raw.attempts + 1, last_attempt_at: nowIso })
        .eq("id", raw.id);
      skipped.push({ id: raw.id, reason: "delivery_failed" });
    }
  }

  return json(200, { delivered, skipped });
}
```

Notes for the implementer (do not skip reading these):
- `handleDeliverWebhooks` takes `cfg.service` (the raw service-role key string), not the `cfg` object — check the call site in Step 2 passes `cfg.service`, matching how `responder-fill`'s `handleNotifyOverdueFills(adminClient, serviceKey, req)` takes the key directly.
- The query uses `client:oauth_clients!inner(...)` (an *inner* join, not the default left join) plus `.eq("client.is_active", true)` and `.not("client.webhook_url", "is", null)` **deliberately** — this filters out rows whose client is inactive or unconfigured *at the database level*, before they're ever fetched. Do not simplify this back to a plain left join with client-side filtering: without the DB-level filter, a row whose client had its `webhook_url` cleared (via `admin_set_webhook` with an empty URL, Task 4) would have `last_attempt_at` stay `null` forever, be re-selected on every single one-minute cron tick indefinitely, and — because rows are ordered oldest-first with a hard `LIMIT 50` — could eventually fill the entire batch and permanently starve delivery of newer, legitimately-deliverable webhooks behind it. The `client?.webhook_url || !client.webhook_secret` check inside the loop is now purely defensive (webhook_secret is always set together with webhook_url by `admin_set_webhook`, so it should be unreachable) — it is not the real fix, the `!inner` query filter is.
- Known limitation, accepted as-is: rows still inside their backoff window are fetched into the batch (the query can't express "not due yet" — that depends on `attempts`, which varies per row) and skipped client-side, so a large backlog of backing-off rows could still delay newer due rows behind them in the same `LIMIT 50` window. This is lower-severity than the unconfigured case because backoff-skipped rows are self-resolving (their `attempts`/`last_attempt_at` keep advancing, and the cron runs every minute), not stuck forever. Not worth the complexity of a real claim/lease query for v1.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/partner-auth/index.ts
git commit -m "$(cat <<'EOF'
Add partner-auth admin_set_webhook + deliver_webhooks actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U8Xj2LudEaYN86Nw3RbhTC
EOF
)"
```

---

## Task 4: Admin UI — configure webhook URL on the Partner Bot settings page

**Files:**
- Modify: `src/lib/partnerOAuth.ts`
- Modify: `src/lib/partnerOAuth.test.ts`
- Modify: `src/lib/partnerApi.ts`
- Modify: `src/pages/PartnerBotSettings.tsx`

- [ ] **Step 1: Write the failing test for `isHttpsWebhookUrl`**

Find in `src/lib/partnerOAuth.test.ts`:

```ts
  isTelegramBotUsername,
```

Replace with:

```ts
  isHttpsWebhookUrl,
  isTelegramBotUsername,
```

Then find:

```ts
describe('Telegram bot username and redirect', () => {
  it('accepts Telegram usernames without @', () => {
    expect(isTelegramBotUsername('YahpazFillBot')).toBe(true)
    expect(isTelegramBotUsername('ab')).toBe(false)
    expect(isTelegramBotUsername('@YahpazFillBot')).toBe(false)
    expect(normalizeTelegramBotUsername('@YahpazFillBot')).toBe('YahpazFillBot')
  })
```

Replace with:

```ts
describe('Telegram bot username and redirect', () => {
  it('accepts Telegram usernames without @', () => {
    expect(isTelegramBotUsername('YahpazFillBot')).toBe(true)
    expect(isTelegramBotUsername('ab')).toBe(false)
    expect(isTelegramBotUsername('@YahpazFillBot')).toBe(false)
    expect(normalizeTelegramBotUsername('@YahpazFillBot')).toBe('YahpazFillBot')
  })

  it('only accepts https:// webhook URLs', () => {
    expect(isHttpsWebhookUrl('https://bot.example.com/webhooks/yahpaz')).toBe(true)
    expect(isHttpsWebhookUrl('http://bot.example.com/webhooks/yahpaz')).toBe(false)
    expect(isHttpsWebhookUrl('not a url')).toBe(false)
    expect(isHttpsWebhookUrl('')).toBe(false)
  })
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npm test -- partnerOAuth`
Expected: FAIL — `isHttpsWebhookUrl` is not exported from `./partnerOAuth`

- [ ] **Step 3: Implement `isHttpsWebhookUrl`**

Find in `src/lib/partnerOAuth.ts`:

```ts
export function isTelegramBotUsername(raw: string): boolean {
  return TELEGRAM_USERNAME.test(raw.trim())
}
```

Replace with:

```ts
export function isTelegramBotUsername(raw: string): boolean {
  return TELEGRAM_USERNAME.test(raw.trim())
}

export function isHttpsWebhookUrl(raw: string): boolean {
  try {
    return new URL(raw.trim()).protocol === 'https:'
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `npm test -- partnerOAuth`
Expected: PASS

- [ ] **Step 5: Add the client API call**

Find in `src/lib/partnerApi.ts`:

```ts
export type PartnerClient = {
  id: string
  name: string
  client_id: string
  telegram_bot_username: string
  is_active: boolean
  created_at: string
}
```

Replace with:

```ts
export type PartnerClient = {
  id: string
  name: string
  client_id: string
  telegram_bot_username: string
  is_active: boolean
  webhook_url: string | null
  created_at: string
}
```

Then find (end of file):

```ts
export async function deletePartnerClient(
  clientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await invokePartnerAuth<{ ok?: boolean }>({
    action: 'admin_delete_client',
    client_id: clientId,
  })
  if (!result.ok) return result
  return { ok: true }
}
```

Replace with:

```ts
export async function deletePartnerClient(
  clientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await invokePartnerAuth<{ ok?: boolean }>({
    action: 'admin_delete_client',
    client_id: clientId,
  })
  if (!result.ok) return result
  return { ok: true }
}

export async function setPartnerClientWebhook(input: {
  clientId: string
  webhookUrl: string
}): Promise<
  | { ok: true; webhookUrl: string | null; webhookSecret: string | null }
  | { ok: false; error: string }
> {
  const result = await invokePartnerAuth<{ webhook_url?: string | null; webhook_secret?: string }>(
    {
      action: 'admin_set_webhook',
      client_id: input.clientId,
      webhook_url: input.webhookUrl,
    },
  )
  if (!result.ok) return result
  return {
    ok: true,
    webhookUrl: result.data.webhook_url ?? null,
    webhookSecret: result.data.webhook_secret?.trim() || null,
  }
}
```

- [ ] **Step 6: Wire the UI**

Find in `src/pages/PartnerBotSettings.tsx`:

```ts
import {
  createPartnerClient,
  deletePartnerClient,
  fetchPartnerClients,
  rotatePartnerClientSecret,
  type PartnerClient,
} from '../lib/partnerApi'
import { isTelegramBotUsername, normalizeTelegramBotUsername } from '../lib/partnerOAuth'
```

Replace with:

```ts
import {
  createPartnerClient,
  deletePartnerClient,
  fetchPartnerClients,
  rotatePartnerClientSecret,
  setPartnerClientWebhook,
  type PartnerClient,
} from '../lib/partnerApi'
import {
  isHttpsWebhookUrl,
  isTelegramBotUsername,
  normalizeTelegramBotUsername,
} from '../lib/partnerOAuth'
```

Find:

```ts
  const [deleteClient, setDeleteClient] = useState<PartnerClient | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [secretOnce, setSecretOnce] = useState<{
    title: string
    clientId: string
    secret: string
    authorizeUrl?: string
  } | null>(null)

  useEffect(() => {
    let active = true
    fetchPartnerClients().then((result) => {
      if (!active) return
      if (result.ok) {
        setClients(result.clients)
        setListError(null)
      } else {
        setClients([])
        setListError(result.error)
      }
    })
    return () => {
      active = false
    }
  }, [])
```

Replace with:

```ts
  const [deleteClient, setDeleteClient] = useState<PartnerClient | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [secretOnce, setSecretOnce] = useState<{
    title: string
    clientId: string
    secret: string
    authorizeUrl?: string
  } | null>(null)
  const [webhookDrafts, setWebhookDrafts] = useState<Record<string, string>>({})
  const [webhookErrors, setWebhookErrors] = useState<Record<string, string>>({})
  const [webhookSaving, setWebhookSaving] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchPartnerClients().then((result) => {
      if (!active) return
      if (result.ok) {
        setClients(result.clients)
        setWebhookDrafts(
          Object.fromEntries(result.clients.map((c) => [c.client_id, c.webhook_url ?? ''])),
        )
        setListError(null)
      } else {
        setClients([])
        setListError(result.error)
      }
    })
    return () => {
      active = false
    }
  }, [])
```

Find:

```ts
  async function onDeleteClient() {
    if (!deleteClient) return
    if (viewingAsOther) {
      show('לא ניתן לרשום בוט בזמן התחזות.')
      return
    }
    setDeleting(true)
    const result = await deletePartnerClient(deleteClient.client_id)
    setDeleting(false)
    if (!result.ok) {
      show(result.error)
      return
    }
    setClients((current) => (current ?? []).filter((row) => row.id !== deleteClient.id))
    setDeleteClient(null)
    show('הבוט הוסר')
  }
```

Replace with:

```ts
  async function onDeleteClient() {
    if (!deleteClient) return
    if (viewingAsOther) {
      show('לא ניתן לרשום בוט בזמן התחזות.')
      return
    }
    setDeleting(true)
    const result = await deletePartnerClient(deleteClient.client_id)
    setDeleting(false)
    if (!result.ok) {
      show(result.error)
      return
    }
    setClients((current) => (current ?? []).filter((row) => row.id !== deleteClient.id))
    setDeleteClient(null)
    show('הבוט הוסר')
  }

  async function onSaveWebhook(clientId: string) {
    if (viewingAsOther) {
      show('לא ניתן לרשום בוט בזמן התחזות.')
      return
    }
    const url = (webhookDrafts[clientId] ?? '').trim()
    if (url && !isHttpsWebhookUrl(url)) {
      setWebhookErrors((current) => ({
        ...current,
        [clientId]: 'כתובת ה-webhook חייבת להתחיל ב-https://.',
      }))
      return
    }
    setWebhookErrors((current) => {
      const next = { ...current }
      delete next[clientId]
      return next
    })
    setWebhookSaving(clientId)
    const result = await setPartnerClientWebhook({ clientId, webhookUrl: url })
    setWebhookSaving(null)
    if (!result.ok) {
      setWebhookErrors((current) => ({ ...current, [clientId]: result.error }))
      return
    }
    setClients((current) =>
      (current ?? []).map((client) =>
        client.client_id === clientId ? { ...client, webhook_url: result.webhookUrl } : client,
      ),
    )
    if (result.webhookSecret) {
      setSecretOnce({
        title: 'The new webhook secret is shown only once',
        clientId,
        secret: result.webhookSecret,
      })
    } else {
      show('ה-webhook הוסר')
    }
  }
```

Find:

```ts
                <Button
                  variant="secondary"
                  disabled={viewingAsOther}
                  onClick={() => void onRotateSecret(client.client_id)}
                >
                  חידוש טוקן
                </Button>
                <Button
                  variant="destructive"
                  disabled={viewingAsOther}
                  onClick={() => setDeleteClient(client)}
                >
                  הסרה
                </Button>
              </div>
            ))}
```

Replace with:

```ts
                <Button
                  variant="secondary"
                  disabled={viewingAsOther}
                  onClick={() => void onRotateSecret(client.client_id)}
                >
                  חידוש טוקן
                </Button>
                <Button
                  variant="destructive"
                  disabled={viewingAsOther}
                  onClick={() => setDeleteClient(client)}
                >
                  הסרה
                </Button>
                <TextField
                  label="Webhook URL"
                  hint="https://... — ריק כדי לבטל"
                  isolate
                  value={webhookDrafts[client.client_id] ?? ''}
                  onChange={(event) =>
                    setWebhookDrafts((current) => ({
                      ...current,
                      [client.client_id]: event.target.value,
                    }))
                  }
                />
                {webhookErrors[client.client_id] ? (
                  <p className="alert alert--error" role="alert">
                    {webhookErrors[client.client_id]}
                  </p>
                ) : null}
                <Button
                  variant="secondary"
                  disabled={viewingAsOther}
                  loading={webhookSaving === client.client_id}
                  loadingLabel="שומר…"
                  onClick={() => void onSaveWebhook(client.client_id)}
                >
                  שמירת Webhook
                </Button>
              </div>
            ))}
```

- [ ] **Step 7: Run the full test suite and the type check**

Run: `npm test`
Expected: all existing tests still pass, plus the new `isHttpsWebhookUrl` test.

Run: `npm run build`
Expected: `tsc -b` reports no type errors (this catches any `PartnerClient.webhook_url` shape mismatch across the codebase).

- [ ] **Step 8: Commit**

```bash
git add src/lib/partnerOAuth.ts src/lib/partnerOAuth.test.ts src/lib/partnerApi.ts src/pages/PartnerBotSettings.tsx
git commit -m "$(cat <<'EOF'
Add webhook URL configuration to Partner Bot settings page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U8Xj2LudEaYN86Nw3RbhTC
EOF
)"
```

---

## Task 5: Docs — `docs/partner-api.md` + `openapi.yaml`

**Files:**
- Modify: `docs/partner-api.md`
- Modify: `public/partner-api/openapi.yaml`

- [ ] **Step 1: Add a new `## 4. Assignment webhook` section to `docs/partner-api.md`**

Find:

```md
## Suggested bot flow
```

Replace with:

```md
## 4. Assignment webhook (we call you)

If you configure a `webhook_url` (Yahpaz admin → הגדרות → רישום בוט, same place `client_secret` is issued), Yahpaz POSTs here whenever a volunteer with an active grant to your app gets a new event assignment. This is the only notification type in v1.

```http
POST {your webhook_url}
Content-Type: application/json
X-Yahpaz-Signature: {hex HMAC-SHA256 of the raw body, using your webhook_secret}
```

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "event_type": "assignment_created",
  "event_id": "uuid",
  "event_summary": {
    "event_type_name": "תאונה",
    "event_date": "2026-09-05",
    "police_event_id": "12-34-567",
    "location": "…"
  }
}
```

`webhook_url` must be `https://` — non-HTTPS URLs are rejected when you configure it in the admin UI.

Your side:

1. **Verify the signature**: compute HMAC-SHA256 over the raw request body using your `webhook_secret`, compare against `X-Yahpaz-Signature` (constant-time compare). Reject anything that doesn't match.
2. **Dedupe on `id`**: we may retry a delivery that timed out but actually succeeded on your end. Skip work if you've already processed this `id`.
3. **Look up the chat** using your own `user_id → chat_id` mapping (the same one you already maintain for `token` and `/unlink`). If unmapped, just return 2xx and drop it.
4. **Send the Telegram message** yourself, with whatever inline keyboard you want (e.g. an "accept" button).
5. **Respond 2xx quickly** once sent or reliably queued. Anything else (non-2xx, timeout) is retried with backoff — there is no dead-letter queue or UI in v1, so a permanently broken `webhook_url` retries forever with increasing backoff; fix it or clear it (empty URL in the admin UI) to stop.

An "accept" action on this message can call `start_live_track { event_id }` directly (see "3. Live location ping" above and `responder-api`'s `start_live_track`) — you already have the `event_id`, no need for `list_open_events` on this path.

`webhook_url` / `webhook_secret` are issued and rotated the same way `client_secret` is today, via Yahpaz admin.

## Suggested bot flow
```

- [ ] **Step 2: Add step 10 to "Suggested bot flow" and bump the version**

Find:

```md
9. For live tracking during a trip: `start_live_track` → forward each Telegram live-location update to `responder-track` `ping` → `stop_live_track` when the trip ends (or let `complete` do it for you).
```

Replace with:

```md
9. For live tracking during a trip: `start_live_track` → forward each Telegram live-location update to `responder-track` `ping` → `stop_live_track` when the trip ends (or let `complete` do it for you).
10. If you configure a `webhook_url`: on an `assignment_created` webhook, message the volunteer with an "accept" option that calls `start_live_track { event_id }` directly (see "4. Assignment webhook" above).
```

Find:

```md
**Version:** 1.2  
**Date:** 2026-09-05
```

Replace with:

```md
**Version:** 1.3  
**Date:** 2026-09-05
```

- [ ] **Step 3: Note the webhook capability in "What you can do" and update the Action Index**

Find:

```md
- Start / stop live GPS location sharing for one of their own trips, and send location pings while it's active
```

Replace with:

```md
- Start / stop live GPS location sharing for one of their own trips, and send location pings while it's active
- Receive a signed webhook when a volunteer is newly assigned to an event (optional, if you configure `webhook_url`)
```

Find:

```md
Contract changes will bump the version at the top of this file.
```

Replace with:

```md
Contract changes will bump the version at the top of this file.

See "4. Assignment webhook" above for the `webhook_url` / `webhook_secret` notification contract (Yahpaz calls you; there is no `action` for it since it's not a request to `/responder-api`).
```

- [ ] **Step 4: Bump `openapi.yaml`'s version and mention the webhook in its top-level description**

Find:

```yaml
openapi: 3.0.3
info:
  title: Yahpaz Partner API
  version: "1.2.0"
```

Replace with:

```yaml
openapi: 3.0.3
info:
  title: Yahpaz Partner API
  version: "1.3.0"
```

Find:

```yaml
    After `/start yp_…`, exchange the code (`partner-auth` `token`) and call
    `responder-api` with the `ypat_` bearer. Pick an **Example** on each operation
    for the JSON `action`. User-facing `error` strings are Hebrew; show them in chat.
```

Replace with:

```yaml
    After `/start yp_…`, exchange the code (`partner-auth` `token`) and call
    `responder-api` with the `ypat_` bearer. Pick an **Example** on each operation
    for the JSON `action`. User-facing `error` strings are Hebrew; show them in chat.

    If you configure a `webhook_url` (admin-issued, same as `client_secret`), Yahpaz
    POSTs a signed `assignment_created` notification to it whenever a volunteer with
    an active grant gets a new assignment — see `docs/partner-api.md` §4 for the
    payload shape and signature verification. This is not a callable operation on
    this server, so it has no path below; see the `AssignmentWebhookPayload` schema
    for the JSON shape.
```

- [ ] **Step 5: Add the `AssignmentWebhookPayload` schema for reference**

Find:

```yaml
    ErrorWithCode:
```

Replace with:

```yaml
    AssignmentWebhookPayload:
      type: object
      description: >-
        Body Yahpaz POSTs to your webhook_url, signed with X-Yahpaz-Signature
        (hex HMAC-SHA256 using your webhook_secret). Not a request/response of
        this API — documented here for reference only.
      properties:
        id:
          type: string
          description: Dedupe key. Retries reuse the same id.
        user_id:
          type: string
        event_type:
          type: string
          enum: [assignment_created]
        event_id:
          type: string
        event_summary:
          type: object
          properties:
            event_type_name:
              type: string
              nullable: true
            event_date:
              type: string
              format: date
            police_event_id:
              type: string
              nullable: true
            location:
              type: string
              nullable: true
      required: [id, user_id, event_type, event_id, event_summary]
      example:
        id: "b1e2c3d4-0000-4000-8000-000000000000"
        user_id: "a1b2c3d4-0000-4000-8000-000000000000"
        event_type: "assignment_created"
        event_id: "c1d2e3f4-0000-4000-8000-000000000000"
        event_summary:
          event_type_name: "תאונה"
          event_date: "2026-09-05"
          police_event_id: "12-34-567"
          location: "כביש 6, צומת רעננה מזרח"
    ErrorWithCode:
```

Note for the implementer: find the exact indentation of `ErrorWithCode:` in the live file before replacing — schemas are indented under `components: schemas:`, matching the existing entries (`StartLiveTrackRequest`, `PingRequest`, etc. added in the live-tracking plan). Match that indentation exactly, don't guess.

- [ ] **Step 6: Commit**

```bash
git add docs/partner-api.md public/partner-api/openapi.yaml
git commit -m "$(cat <<'EOF'
Document partner assignment_created webhook contract (v1.3)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U8Xj2LudEaYN86Nw3RbhTC
EOF
)"
```

---

## Task 6: Final review + finish the branch

- [ ] Dispatch a final code-reviewer subagent over the entire diff (all 5 prior tasks) against this plan and against `docs/superpowers/specs/2026-09-04-yahpaz-profile-telegram-link-design.md`'s Part B section. Check specifically:
  - The trigger only enqueues for clients with `is_active = true` and `webhook_url is not null`, and only for active (`revoked_at is null`) grants — a revoked or inactive client/grant must never get an outbox row.
  - `handleDeliverWebhooks` never leaks `webhook_secret` in any response body (it's read from `oauth_clients` server-side only, used to sign, never echoed back — except the one-time mint in `handleAdminSetWebhook`, which is correct and intentional).
  - `handleAdminSetWebhook` requires `requireAdmin`, matching every other `admin_*` action in this file.
  - No stray `console.log` of secrets, tokens, or full request bodies.
- [ ] Fix anything the reviewer flags, re-review until clean.
- [ ] Use **superpowers:finishing-a-development-branch** to merge/PR.

---

## Testing

No local Deno/Supabase CLI or Postgres instance is available in this environment. Verification is by:
- Code review against the exact working patterns cited in each task (the `overdue_fill_reminder` migration, `responder-fill`'s `notify_overdue_fills` handler, `partner-auth`'s existing `admin_*` handlers).
- `npm test` and `npm run build` for the Task 4 frontend changes (these DO run locally).
- Manual review of the final diff by a reviewer subagent (Task 6) before merge.

## Docs to update

- `docs/partner-api.md` (Task 5)
- `public/partner-api/openapi.yaml` (Task 5)

## Complexity

**Medium.** One new table + one new trigger + one new cron job (Task 1, DB-only, unverifiable locally — the highest-risk task, review carefully), two new Edge Function actions (Task 3), a small but real UI addition (Task 4, has a real test), and a documentation section (Task 5).
