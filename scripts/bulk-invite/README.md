# Bulk invite from Excel

Invites the members listed in a spreadsheet. Each row becomes one call to the existing
`admin-users` `invite` action, which is what the "משתמש חדש" dialog sends: the same
server checks and the same invite email (7-day link). Before 1.11 00:01 the invitees
will see the pre-launch gate after they set a password.

**No SMS unless `--sms`.** Each request carries `send_sms: false`, so admin-users sends
the email only and answers `sms: "off"` (the phone is still saved). If an invite comes
back without `sms: "off"`, that admin-users predates the flag and may have texted: the
run stops at that row. `--sms` asks for the invite SMS as the dialog does; with it, the
first SMS failure stops the run (`--allow-sms-failure` to go on).

**`--send` emails real people.** Dry run first, then send to yourself with
`--limit 1`, and only then send the full list.

## File

Excel: File → Save As → **CSV UTF-8 (Comma delimited)**. The first row is headers, in
Hebrew or English, in any order:

| Column | Headers accepted | Required |
|---|---|---|
| Full name | `שם מלא`, `שם`, `full_name`, `name`, or `שם פרטי` / `שם` plus `שם משפחה` (joined) | yes |
| Email | `דוא"ל`, `אימייל`, `מייל`, `email` | yes |
| Callsign | `או"ק`, `אות קריאה`, `callsign` | yes |
| Phone | `טלפון`, `נייד`, `phone`, `mobile` (10 digits; `+972` and Excel's dropped leading 0 are fixed) | yes |
| Role | `תפקיד`, `role`: מתנדב / אחמ"ש / מנהל (empty = מתנדב). אחמ"ש includes מתנדב, and מנהל includes both, as in the dialog | no |
| Status | `סטטוס`, `status`: the dialog's labels, for example `מתנדב פעיל` (empty = מתנדב פעיל) | no |

The script checks every row first: required fields, email format, phone length, known
role and status, and duplicate emails or callsigns inside the file. If any row has a
problem it sends nothing and lists every problem.

## Vehicles (optional)

`--vehicles cars.csv` adds each member's cars right after their invite. One car per
row, keyed by email; the first car of a person becomes רכב ראשי.

| Column | Headers accepted |
|---|---|
| Email | same as above; must be an email in the members file |
| Plate | `מספר רכב`, `plate`, `plate_number` (7 or 8 digits; spaces, dashes and dots are ignored) |
| Model | `דגם`, `יצרן ודגם`, `model` (required) |
| Shared | `משותף`, `shared`: `כן` on every row of a plate that two members really share (optional) |

A plate repeated for one person is an error. A plate under two people is an error unless
every row of it is marked `משותף` = `כן` (approved shared cars; the DB allows one plate
for several users). The cars
are plain inserts over the REST API as the signed-in admin (same RLS as the users
screen): no edge function, no email, SMS or push. Before inserting, the script reads the
member's cars and skips a plate they already have, so a re-run never duplicates. It also
runs for `exists`, so a re-run fills in cars a stopped run missed. A failed car insert
stops the run (`stopped`, message starting `רכבים:`); fix and re-run.

## Running

```bash
# 1. Dry run: no network, prints the plan or the problems.
node scripts/bulk-invite/bulk-invite.mjs ~/Downloads/members.csv [--vehicles ~/Downloads/cars.csv]

# 2. Send. The admin account is yours; nothing is printed.
BULK_INVITE_ALLOW=1 SUPABASE_ANON_KEY=… YAHPZ_ADMIN_EMAIL=… YAHPZ_ADMIN_PASSWORD=… \
  node scripts/bulk-invite/bulk-invite.mjs ~/Downloads/members.csv --send --confirm-production --limit 1
```

The script sends one invite every 1.5 s (`--delay-ms`), so 100 rows take about 2.5
minutes. It writes `<file>.results.csv` next to the input, with an `sms` column (`off`,
or with `--sms`: `sent` / `skipped` / `failed`). That file holds emails, so delete it
when you are done.

| Outcome | Meaning |
|---|---|
| `invited` | Created and emailed (texted only with `--sms`), and cars added, see `vehicles_added` |
| `exists` | Already a user: skipped, so re-running the same file is safe |
| `failed` | This row only (callsign already taken, invalid email): fix it and re-run |
| `stopped` | Something that could hit every row: sign-in or permission, rate limit (429), email or SMS provider, server error, network, or admin-users ignoring `send_sms`. The run stops there. If it stopped on an email error, that user was created but not emailed, and a re-run will skip them, so use "שליחת הזמנה מחדש" for them in the users screen (that resend also sends the invite SMS) |

## Tests

`npm test` runs `lib.test.mjs` (parsing, validation, run order, stop rules, vehicles, SMS
off by default, the dry-run CLI) against a fake `invoke`. `scripts/vehicles-lock/test/local-check.sh` runs the vehicles step with real
JWTs against a local `supabase start` stack. The script itself has only been run as a dry run.
