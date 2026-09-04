# אבן דרך — Partner API

**Share this:** [https://yahpz.com/partner-api/](https://yahpz.com/partner-api/)

**Volunteers do not use this page.** They open a **connect link from your Telegram bot**, approve once on [yahpz.com](https://yahpz.com), then you call the HTTP actions below (MCP-style: connect once, then use tools). To revoke later they use **פרופיל → חיבורים**.

**Product:** אבן דרך (Yahpaz)  
**Audience:** The trusted server that runs the Telegram bot  
**Version:** 1.1  
**Date:** 2026-08-30

---

## What you can do

On behalf of a volunteer who has **linked their אבן דרך account** to your app:

- See who they are
- List **open standalone events** assigned to them
- Load one event (context + current draft + their vehicles + treated plates + photos)
- Save a draft or **complete** the report (same rules as השלמת הפרטים שלי)
- Add / remove / look up treated civilian plates
- Upload / list / update / delete **their** event photos

User-facing `error` strings are **Hebrew**. Show them in the chat. Machine `code` values (when present) are English.

## What you cannot do

- Create or edit unit events, shift-lead fields, or `total_km`
- Access **shift / shift-born** events (`origin = shift`)
- See other volunteers’ private drafts (you only get this user’s assignment)
- Call Supabase PostgREST, Auth, or Storage directly
- Use a volunteer password or a long-lived refresh token

Scope name: `responder:fill` (only scope in v1).

---

## Credentials you receive

Yahpaz registers your app once. You get:

| Secret | Use |
|---|---|
| `client_id` | Public id in the authorize URL and on `token` / `revoke` |
| `client_secret` | **Server only.** Redeem codes and revoke tokens. Never put this in Telegram, a webpage, or a mobile app |
| Publishable `apikey` | The same anon key the website uses. Required on every Edge request. Not authorization |

Base URL:

```
https://rtvizpsfvtjowbimugns.supabase.co/functions/v1
```

All calls are `POST` with `Content-Type: application/json`.

---

## 1. Link a volunteer (MCP-style connection)

You never collect אבן דרך passwords. The volunteer logs in on yahpz.com and taps **אשר גישה**. The volunteer's profile page also has its own "link with Telegram" entry point that starts the same flow — either path lands them on the same consent screen described below.

### 1.1 Open the consent page

Bind a random `state` to **this Telegram user (or session)** in your database *before* you send the link. We do not echo `state` back through Telegram (the start payload is too small). When `/start yp_…` arrives on **that** chat, you know who it is.

```
https://yahpz.com/oauth/authorize
  ?client_id={client_id}
  &state={your_csrf_state}
```

Rules:

- `client_id` and `state` are required.
- `redirect_uri` and `scope` are **optional**. If omitted, we use `https://t.me/{your_bot_username}` and `responder:fill`. If you send them, they must still be valid (same bot URI; scope must be `responder:fill`).
- Do not put a query string on `redirect_uri` when you do send it.

After login (and SMS OTP if that account uses it), they see Hebrew consent: 60-day access to complete their event reports (kilometers, treatment, plates, media).

**אשר גישה** redirects the browser to:

```
https://t.me/{bot_username}?start=yp_{code}
```

The start parameter is a **one-time authorization code** (about 5 minutes, single use), not the access token.

**לא עכשיו** issues nothing.

Re-linking the same volunteer to your app replaces the previous grant.

### 1.2 Exchange the code — `partner-auth` `token`

Call this from **your server** when the bot receives `/start yp_…`.

```http
POST /functions/v1/partner-auth
apikey: {publishable_anon_key}
Authorization: Bearer {publishable_anon_key}
Content-Type: application/json
```

```json
{
  "action": "token",
  "client_id": "ypb_…",
  "client_secret": "…",
  "code": "yp_…"
}
```

**200**

```json
{
  "access_token": "ypat_…",
  "token_type": "Bearer",
  "expires_in": 5184000,
  "scope": "responder:fill"
}
```

`expires_in` is **60 days** (5184000 seconds). There is **no refresh token**. After expiry, revoke, or unlink on yahpz.com (**פרופיל → חיבורים**), send them through authorize again.

Store `access_token` keyed by your Telegram user id. Treat it like a password.

| HTTP | `error` | Notes |
|---|---|---|
| 401 | יישום או טוקן אינם תקינים. | Wrong `client_id` / `client_secret` |
| 400 | קוד האישור אינו תקין או שפג תוקפו. | Used, unknown, or malformed (`code` may be `"expired"`) |
| 403 | החשבון אינו פעיל. | Volunteer deactivated |

### 1.3 Unlink — `partner-auth` `revoke`

Call when the user sends `/unlink` (or equivalent).

```json
{
  "action": "revoke",
  "client_id": "ypb_…",
  "client_secret": "…",
  "token": "ypat_…"
}
```

**200** `{ "ok": true }` even if the token was already gone (idempotent).

Same 401 as `token` if `client_secret` is wrong.

---

## 2. Responder API (uses the access token)

```http
POST /functions/v1/responder-api
apikey: {publishable_anon_key}
Authorization: Bearer ypat_…
Content-Type: application/json
```

You may send the access token as `X-Yahpaz-Partner-Token: ypat_…` instead of `Authorization` if a gateway insists on a JWT in `Authorization`. Prefer `Authorization: Bearer ypat_…`.

Every JSON body includes `"action": "…"`.

**401** (any action)

```json
{
  "error": "החיבור פג או בוטל. יש לקשר מחדש.",
  "code": "invalid_token"
}
```

Ask the volunteer to link again.

**405** `שיטת הבקשה אינה נתמכת.` — not POST.  
**400** `גוף הבקשה אינו תקין.` — body is not JSON.  
**400** `פעולה לא מוכרת.` — unknown `action`.

---

### `whoami`

Confirm which volunteer this token is.

**Request**

```json
{ "action": "whoami" }
```

**200**

```json
{
  "user_id": "uuid",
  "full_name": "…",
  "callsign": "…"
}
```

---

### `list_open_events`

Inbox: assigned to this volunteer, participation `pending` or `in_progress`, event not cancelled, **standalone only** (`origin = manual`). Newest `event_date` first.

**Request**

```json
{ "action": "list_open_events" }
```

**200**

```json
{
  "events": [
    {
      "event_id": "uuid",
      "assignment_id": "uuid",
      "participation_status": "pending",
      "event_date": "2026-08-24",
      "police_event_id": "12-34-567",
      "event_type_name": "תאונה",
      "road_name": "כביש 6",
      "location": "…",
      "shift_lead_name": "שם מלא · או״ק"
    }
  ]
}
```

`events` may be `[]`. Shift-born cards never appear here.

`participation_status`: `pending` | `in_progress`  
(`done` is not listed.)

---

### `get_event`

Full fill context for one assignment.

**Request**

```json
{ "action": "get_event", "event_id": "uuid" }
```

**200** (shape)

```json
{
  "event_id": "uuid",
  "assignment_id": "uuid",
  "event_status": "in_progress",
  "participation_status": "pending",
  "event_date": "2026-08-24",
  "police_event_id": "…",
  "event_type_name": "…",
  "is_cancelled": false,
  "road_name": "…",
  "location": "…",
  "shift_lead_name": "…",
  "vehicles": [{ "plate": "1234567", "model": "…" }],
  "allowed_plates": ["1234567"],
  "draft": {
    "vehicle_plate": "1234567",
    "odometer_start": "",
    "odometer_end": "",
    "route": "",
    "treatment_detail": "",
    "treatment_notes": ""
  },
  "treated_plates": [
    {
      "id": "uuid",
      "plate_number": "12-345-67",
      "model": "…",
      "color": "…",
      "left_where": null,
      "manufacturer": "…",
      "logo_slug": null,
      "sort_order": 0
    }
  ],
  "media": [
    {
      "id": "uuid",
      "uploaded_by": "uuid",
      "caption": null,
      "taken_when": "before_treatment",
      "byte_size": 120000,
      "width": null,
      "height": null,
      "created_at": "2026-08-24T08:00:00.000Z",
      "treated_plate_ids": [],
      "signed_url": "https://… (valid ~1 hour)"
    }
  ]
}
```

`draft.vehicle_plate` and `vehicles[].plate` / `allowed_plates` are **digits only** (no hyphens).

`event_status`: `draft` | `in_progress` | `partial` | `done`

| HTTP | `error` | `code` |
|---|---|---|
| 400 | חסר מזהה אירוע. | |
| 404 | אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים. | |
| 400 | אירוע זה אינו זמין דרך ה-API. | `shift_born` |

Cancelled standalone events can still be **read** (`is_cancelled: true`). Writes are blocked.

---

### `save_draft`

Partial save. Participation becomes `in_progress`. Does not require every field. Invalid numbers are still rejected.

**Request**

```json
{
  "action": "save_draft",
  "event_id": "uuid",
  "draft": {
    "vehicle_plate": "1234567",
    "odometer_start": "45210",
    "odometer_end": "45240",
    "route": "דרך צומת …",
    "treatment_detail": "…",
    "treatment_notes": ""
  }
}
```

Omitted `draft` keys keep the **stored** values. All draft values are **strings**.

**200**

```json
{
  "ok": true,
  "eventStatus": "in_progress",
  "participationStatus": "in_progress"
}
```

**400** validation:

```json
{
  "error": "בדקו את השדות המסומנים.",
  "fieldErrors": {
    "odometer_end": "מד אוץ סיום חייב להיות גדול ממד אוץ התחלה"
  }
}
```

`fieldErrors` keys: `vehicle_plate` | `odometer_start` | `odometer_end` | `route` | `treatment_detail` | `treated_plates` | `event_media`

Write locks (same for `complete` on the report fields):

| HTTP | `error` | `code` |
|---|---|---|
| 400 | לא ניתן לערוך דיווח שהושלם. רק אחמ״ש יכול לערוך. | `locked` |
| 400 | האירוע בוטל. | `cancelled` |
| 400 | אירוע זה אינו זמין דרך ה-API. | `shift_born` |
| 404 | אין לך הרשאה… | |

---

### `complete`

Same body as `save_draft` (`draft` optional; stored values are used). Required fields must pass. Participation becomes `done`. Photos are **not** required.

**200**

```json
{
  "ok": true,
  "eventStatus": "partial",
  "participationStatus": "done"
}
```

`eventStatus` is `done` only when **every** assigned responder on that event is `done`; otherwise `partial` (or `in_progress` if nobody has completed yet).

**400**

```json
{
  "error": "יש למלא את כל שדות החובה לפני סיום הדיווח.",
  "fieldErrors": {
    "route": "יש למלא נתיב נסיעה."
  }
}
```

#### Complete / draft validation (same as the website)

| Field | Draft | Complete |
|---|---|---|
| `vehicle_plate` | optional | Required. Must be in `allowed_plates`. If the user has no linked vehicle: `לא מקושר רכב למשתמש. פנו למנהל המערכת.` |
| `odometer_start` / `odometer_end` | empty OK; if present must be a number | Both required numbers. **End must be strictly greater than start:** `מד אוץ סיום חייב להיות גדול ממד אוץ התחלה` |
| `route` | optional | Required: `יש למלא נתיב נסיעה.` |
| `treatment_detail` | optional | Required: `יש למלא פירוט הטיפול.` |
| `treatment_notes` | always optional | always optional |

Non-numeric odometer (draft or complete): `מד אוץ התחלה חייב להיות מספר.` / `מד אוץ סיום חייב להיות מספר.`

---

### `lookup_treated_plate`

Israeli registry (data.gov.il). A miss is not an error — you may still add the plate.

**Request** — `plate` or `plate_number`

```json
{ "action": "lookup_treated_plate", "plate_number": "1234567" }
```

**200** `{ "hit": { "model", "color", "manufacturer" } }` or `{ "hit": null }`

---

### `add_treated_plate`

7 or 8 digits. We format hyphens, look up model/color, and store the plate. Optional `left_where`.

**Request**

```json
{
  "action": "add_treated_plate",
  "event_id": "uuid",
  "plate_number": "1234567",
  "left_where": "צד ימין של הכביש"
}
```

**200** `{ "ok": true, "plate": { "id", "plate_number", "model", "color", "left_where", "manufacturer", "logo_slug", "sort_order" } }`

| `error` | `fieldErrors.treated_plates` |
|---|---|
| יש להזין 7 או 8 ספרות. | same |
| מספר זה כבר נוסף. | same |

Same write locks as `save_draft` (including after the report is `done`).

---

### `remove_treated_plate`

**Request**

```json
{
  "action": "remove_treated_plate",
  "event_id": "uuid",
  "plate_number": "1234567"
}
```

**200** `{ "ok": true }`  
**400** `הלוחית לא נמצאה.`

---

### `list_media`

All photos on the event (crew can see them). `signed_url` lasts about **one hour** — do not persist it as a permanent URL.

**Request**

```json
{ "action": "list_media", "event_id": "uuid" }
```

**200** `{ "media": [ /* same objects as get_event.media */ ] }`

Allowed on cancelled events (read). Shift-born: `shift_born`.

---

### `upload_media`

JPEG only, **already compressed**, max **1 572 864 bytes** (~1.5 MB). PNG/HEIC are rejected. Magic bytes must be JPEG (`FF D8 FF`). `data:image/jpeg;base64,` prefix is allowed.

`taken_when` is required:

| Value | Meaning (show this Hebrew) |
|---|---|
| `before_treatment` | לפני הטיפול |
| `during_after_treatment` | במהלך/לאחר הטיפול |

Optional: `caption` (max 200 characters), `treated_plate_ids` (UUIDs from `treated_plates` on **this** event).

Max **20** photos per event.

You may upload **after** the volunteer has completed the report, while they are still assigned and the event is not cancelled.

**Request**

```json
{
  "action": "upload_media",
  "event_id": "uuid",
  "taken_when": "before_treatment",
  "caption": "גלגל קדמי",
  "treated_plate_ids": [],
  "image_base64": "/9j/4AAQ…"
}
```

**200** `{ "ok": true, "media": { /* one media object */ } }`

| `error` |
|---|
| יש לבחור מתי צולמה התמונה. (`fieldErrors.event_media`) |
| התיאור קצר עד 200 תווים. |
| ניתן לצרף עד 20 תמונות לאירוע. |
| לא ניתן להעלות קובץ זה. בחרו תמונה. |
| הקובץ גדול מדי. בחרו תמונה אחרת. |
| ההעלאה נכשלה. נסו שוב. |
| האירוע בוטל. (`code`: `cancelled`) |

---

### `update_media`

Only photos **this volunteer uploaded**. `taken_when` required. If `treated_plate_ids` is sent (array), it **replaces** the plate links.

**Request**

```json
{
  "action": "update_media",
  "media_id": "uuid",
  "taken_when": "during_after_treatment",
  "caption": "",
  "treated_plate_ids": ["uuid"]
}
```

**200** `{ "ok": true }`  
**404** `התמונה לא נמצאה.`

---

### `delete_media`

Only own photos.

**Request**

```json
{ "action": "delete_media", "media_id": "uuid" }
```

**200** `{ "ok": true }`  
**404** `התמונה לא נמצאה.`

---

## Suggested bot flow

1. `/start` without a `yp_` code → send the short authorize URL (`client_id` + fresh `state`).
2. `/start yp_…` → `token` → save bearer → `whoami` → greet by `full_name`.
3. “האירועים שלי” → `list_open_events` → user picks one → `get_event`.
4. Collect fields (volunteer plate from `vehicles`, both odometers, route, treatment, notes).
5. Optional: plates (`add_treated_plate`) and photos (`upload_media`).
6. `save_draft` while they pause; `complete` when they finish.
7. On `fieldErrors`, ask only for those keys again, then `complete` (or `save_draft`) with an updated `draft`.
8. `/unlink` → `revoke` → delete the stored bearer.

---

## Security requirements (your side)

- Server-to-server only. Do not call these URLs from a browser or from the Telegram client.
- Never log `client_secret`, authorization codes, or `access_token`.
- One volunteer ↔ one Telegram account in **your** mapping. We do not store Telegram ids.
- After `invalid_token`, delete the bearer and start linking again.
- The publishable `apikey` is public (it is in the website). It does not grant fill access by itself.

---

## Action index

### `POST …/partner-auth` (app credentials)

| `action` | Auth | Purpose |
|---|---|---|
| `token` | `client_id` + `client_secret` | Code → 60-day access token |
| `revoke` | `client_id` + `client_secret` + `token` | Kill that access token |

### `POST …/responder-api` (volunteer access token)

| `action` | Purpose |
|---|---|
| `whoami` | Volunteer name and או״ק |
| `list_open_events` | Open standalone assignments |
| `get_event` | One event: draft, vehicles, plates, media |
| `save_draft` | Partial save |
| `complete` | Validate and lock the report |
| `lookup_treated_plate` | Registry model / color |
| `add_treated_plate` | Add a treated plate |
| `remove_treated_plate` | Remove a treated plate |
| `list_media` | List photos |
| `upload_media` | Add a JPEG |
| `update_media` | Edit own photo metadata |
| `delete_media` | Delete own photo |

---

## Support

Questions about credentials or a new bot username: Yahpaz admin (הגדרות → רישום בוט).  
Contract changes will bump the version at the top of this file.
