# Yahpaz Infra Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a working HE/RTL Vite+React+Supabase+Netlify app shell in `yhpz-2026` with Auth login and empty home — ready for feature slices.

**Architecture:** Static SPA on Netlify; Supabase Auth + Postgres + RLS; client uses `@supabase/supabase-js`. Resend SMTP deferred until a custom domain exists (documented, not blocked).

**Tech Stack:** Vite, React 18, TypeScript, `@supabase/supabase-js`, Netlify, Supabase, Resend (later)

## Global Constraints

- UI language: Hebrew only; `lang="he"` and `dir="rtl"` on `<html>`
- Stack locked: React + Supabase + Netlify (no Next.js, no Netlify Functions in v1)
- Secrets never committed; use `.env.local` (gitignored) and Netlify env
- Account: `omriland@gmail.com` for Supabase / Netlify / Resend
- Spec: `docs/superpowers/specs/2026-08-09-yahpaz-volunteers-events-design.md`
- Do not implement full event UI in this plan — shell + schema stubs only

## File map

| Path | Responsibility |
|---|---|
| `package.json` | Scripts and deps |
| `vite.config.ts` | Vite config |
| `index.html` | HE/RTL document shell |
| `src/main.tsx` | React entry |
| `src/App.tsx` | Auth gate + routes shell |
| `src/lib/supabase.ts` | Browser Supabase client |
| `src/lib/auth.tsx` | Auth session provider |
| `src/pages/LoginPage.tsx` | Email/password login (HE) |
| `src/pages/HomePage.tsx` | Empty authenticated home (HE) |
| `src/styles.css` | Minimal mobile-first RTL styles |
| `.env.example` | Public env var names |
| `.gitignore` | Ignore `.env.local`, `dist`, `node_modules` |
| `netlify.toml` | Build + SPA redirect |
| `.nvmrc` | Node 22 |
| `supabase/migrations/20260809120000_init.sql` | Core schema + RLS stubs |
| `README.md` | How to run / env / deploy |

---

### Task 1: Scaffold Vite React TS app (HE/RTL)

**Files:**
- Create: entire Vite app as listed above (minus Supabase migration / Netlify until later tasks)
- Create: `.gitignore`, `.nvmrc`, `.env.example`, `README.md`

**Interfaces:**
- Produces: `npm run build` exits 0; `npm run dev` serves HE/RTL shell

- [ ] **Step 1: Create branch `infra/bootstrap`**

```bash
cd /Users/omrilandman/CursorProjects/today-i/yhpz-2026
git checkout -b infra/bootstrap
```

- [ ] **Step 2: Scaffold with Vite**

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install @supabase/supabase-js
```

If the directory is non-empty (docs/), create in a temp dir and move files, or use `npm create vite@latest . -- --template react-ts` and confirm overwrite of non-conflicting paths. Keep `docs/` intact.

- [ ] **Step 3: Set Node and ignore rules**

`.nvmrc`:
```
22
```

`.gitignore` must include:
```
node_modules
dist
.env
.env.local
.netlify
.DS_Store
```

`.env.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 4: Make document HE/RTL**

`index.html` — set:
```html
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>יחפ״צ</title>
</head>
```

- [ ] **Step 5: Replace default App with HE smoke shell (no Auth yet)**

`src/App.tsx` shows a simple Hebrew heading `יחפ״צ` and subtitle `מערכת מתנדבים ואירועים` so build works before Supabase keys exist.

- [ ] **Step 6: Verify build**

Run: `npm run build`  
Expected: exit 0, `dist/` created

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: scaffold Vite React HE/RTL app shell

EOF
)"
```

---

### Task 2: Create Supabase project + init migration

**Files:**
- Create: `supabase/migrations/20260809120000_init.sql`
- Modify: `.env.local` (local only, not committed)

**Interfaces:**
- Produces: remote Supabase project with tables from the design; `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` for the SPA

- [ ] **Step 1: Resolve org and create project via Supabase MCP**

1. `list_organizations`
2. `get_cost` (type=project)
3. `confirm_cost` with returned amount
4. `create_project` name `yahpaz-2026`, region prefer `eu-central-1` (or closest EU), confirm_cost_id from step 3
5. Wait until project is active (`get_project`)

- [ ] **Step 2: Apply init migration via `apply_migration`**

Migration name: `init_yahpaz_schema`

SQL (apply exactly; adjust only if Postgres rejects):

```sql
-- roles enum
create type public.app_role as enum ('admin', 'shift_lead', 'responder');

create type public.event_status as enum ('draft', 'in_progress', 'partial', 'done');

create type public.participation_status as enum ('pending', 'in_progress', 'done');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  callsign text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plate_number text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.roads (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.vehicle_kinds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  shift_lead_id uuid not null references public.profiles (id),
  event_date date not null default (timezone('Asia/Jerusalem', now()))::date,
  police_event_id text,
  district_id uuid references public.districts (id),
  patrol_callsign text,
  event_type_id uuid references public.event_types (id),
  notes text,
  road_id uuid references public.roads (id),
  location text,
  status public.event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_responders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  responder_id uuid not null references public.profiles (id),
  vehicle_plate text,
  total_km numeric,
  odometer_start numeric,
  odometer_end numeric,
  route text,
  treatment_detail text,
  emergency_means boolean not null default false,
  treatment_notes text,
  status public.participation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, responder_id)
);

create table public.event_treated_vehicles (
  id uuid primary key default gen_random_uuid(),
  event_responder_id uuid not null references public.event_responders (id) on delete cascade,
  vehicle_kind_id uuid not null references public.vehicle_kinds (id),
  quantity int not null check (quantity > 0),
  unique (event_responder_id, vehicle_kind_id)
);

-- helper: has_role
create or replace function public.has_role(uid uuid, r public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = uid and ur.role = r
  );
$$;

-- auto profile stub on signup (name/callsign filled later by admin)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, callsign)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce(new.raw_user_meta_data->>'callsign', 'TBD')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.user_roles enable row level security;
alter table public.districts enable row level security;
alter table public.event_types enable row level security;
alter table public.roads enable row level security;
alter table public.vehicle_kinds enable row level security;
alter table public.events enable row level security;
alter table public.event_responders enable row level security;
alter table public.event_treated_vehicles enable row level security;

-- v1 stubs: authenticated users can read lookups; admins manage all; users read own profile
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy profiles_update_own_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy user_roles_select_own_or_admin on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy user_roles_admin_all on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy lookups_read_authenticated on public.districts
  for select to authenticated using (true);
create policy event_types_read_authenticated on public.event_types
  for select to authenticated using (true);
create policy roads_read_authenticated on public.roads
  for select to authenticated using (true);
create policy vehicle_kinds_read_authenticated on public.vehicle_kinds
  for select to authenticated using (true);

create policy districts_admin_write on public.districts
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy event_types_admin_write on public.event_types
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy roads_admin_write on public.roads
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy vehicle_kinds_admin_write on public.vehicle_kinds
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- events: shift_lead/admin full; responders read if assigned
create policy events_select on public.events
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or exists (
      select 1 from public.event_responders er
      where er.event_id = events.id and er.responder_id = auth.uid()
    )
  );

create policy events_write_lead_admin on public.events
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy event_responders_select on public.event_responders
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or responder_id = auth.uid()
  );

create policy event_responders_lead_admin_write on public.event_responders
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy event_responders_self_update on public.event_responders
  for update to authenticated
  using (responder_id = auth.uid())
  with check (responder_id = auth.uid());

create policy treated_vehicles_select on public.event_treated_vehicles
  for select to authenticated
  using (
    exists (
      select 1 from public.event_responders er
      where er.id = event_responder_id
        and (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'shift_lead')
          or er.responder_id = auth.uid()
        )
    )
  );

create policy treated_vehicles_lead_admin_write on public.event_treated_vehicles
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy vehicles_select_own_or_admin on public.vehicles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'shift_lead'));

create policy vehicles_write_own_or_admin on public.vehicles
  for all to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
```

Also save the same SQL to `supabase/migrations/20260809120000_init.sql` in the repo.

- [ ] **Step 3: Fetch URL + anon key**

Use MCP `get_project_url` and `get_publishable_keys`. Write `.env.local` (do not commit):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

- [ ] **Step 4: Commit migration file only**

```bash
git add supabase/migrations/20260809120000_init.sql
git commit -m "$(cat <<'EOF'
feat: add initial Yahpaz Supabase schema migration

EOF
)"
```

---

### Task 3: Wire Auth UI (login + home)

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/auth.tsx`, `src/pages/LoginPage.tsx`, `src/pages/HomePage.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Produces: `useAuth()` → `{ session, user, profile, roles, signIn, signOut, loading }`

- [ ] **Step 1: Supabase client**

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url ?? '', anon ?? '')
```

- [ ] **Step 2: Auth provider with session + roles load**

Implement `AuthProvider` / `useAuth` that:
- Subscribes to `supabase.auth.onAuthStateChange`
- Loads `profiles` row and `user_roles` for `user.id`
- Exposes `signIn(email, password)` and `signOut()`

- [ ] **Step 3: Login page (HE)**

Fields: אימייל, סיסמה, button התחברות. On error show `שגיאה בהתחברות`. On success navigate to home.

- [ ] **Step 4: Home page (HE)**

Show: `שלום, {full_name}` / callsign, list of roles in Hebrew (`מנהל`, `אחמ״ש`, `כונן`), logout button `התנתקות`. Empty state text: `אין אירועים עדיין` (placeholder for later).

- [ ] **Step 5: Gate in App**

If loading → `טוען…`; if no session → LoginPage; else HomePage.

- [ ] **Step 6: Verify build**

Run: `npm run build`  
Expected: exit 0

- [ ] **Step 7: Manual smoke**

Create one user in Supabase Auth dashboard (or MCP), assign `admin` in `user_roles`, log in locally via `npm run dev`.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "$(cat <<'EOF'
feat: wire Supabase auth login and HE home shell

EOF
)"
```

---

### Task 4: Netlify config + link/deploy

**Files:**
- Create: `netlify.toml`

- [ ] **Step 1: Add netlify.toml**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Auth check**

```bash
npx netlify status
```

If not logged in as `omriland@gmail.com`, run `npx netlify login` and wait for user.

- [ ] **Step 3: Create/link site**

```bash
npx netlify sites:create --name yahpaz-2026
npx netlify link
```

(Use unique name if taken.)

- [ ] **Step 4: Set env on Netlify**

```bash
npx netlify env:set VITE_SUPABASE_URL "..."
npx netlify env:set VITE_SUPABASE_ANON_KEY "..."
```

- [ ] **Step 5: Deploy**

```bash
npx netlify deploy --prod --build
```

Expected: production URL returned.

- [ ] **Step 6: Commit**

```bash
git add netlify.toml README.md
git commit -m "$(cat <<'EOF'
chore: add Netlify SPA config for Yahpaz

EOF
)"
```

---

### Task 5: Resend placeholder (blocked on domain)

**Files:**
- Modify: `README.md` — section “Email (Resend)”

- [ ] **Step 1: Document required steps (do not execute until domain purchased)**

1. Buy domain (Cloudflare Registrar or preferred)
2. Resend MCP: `create-domain` → display DNS records → user adds DNS → `verify-domain`
3. Configure Supabase Auth SMTP to Resend (host `smtp.resend.com`, user `resend`, password = API key)
4. Store `RESEND_API_KEY` in Netlify env when app sends mail

- [ ] **Step 2: Commit README update**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: note Resend + custom domain setup steps

EOF
)"
```

---

## Spec coverage check

| Spec item | Task |
|---|---|
| Vite/React HE RTL shell | 1 |
| Supabase schema + RLS stubs | 2 |
| Auth email/password | 3 |
| Netlify host | 4 |
| Resend | 5 (docs; blocked on domain) |
| Full event UI / admin lists UI | Out of scope (later plan) |

## Execution

After plan save: prefer **inline execution** for this bootstrap (interactive Auth/Netlify/Supabase). Subagent-driven also fine if preferred.
