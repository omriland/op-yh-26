# Bulk invite from Excel

Invites the members listed in a spreadsheet. Each row becomes one call to the existing
`admin-users` `invite` action, which is exactly what the "משתמש חדש" dialog sends: the
same server checks, the same invite email (7-day link) and the same SMS. Before 1.11
00:01 the invitees will see the pre-launch gate after they set a password.

**`--send` emails and texts real people.** Dry run first, then send to yourself with
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

## Running

```bash
# 1. Dry run: no network, prints the plan or the problems.
node scripts/bulk-invite/bulk-invite.mjs ~/Downloads/members.csv

# 2. Send. The admin account is yours; nothing is printed.
BULK_INVITE_ALLOW=1 SUPABASE_ANON_KEY=… YAHPZ_ADMIN_EMAIL=… YAHPZ_ADMIN_PASSWORD=… \
  node scripts/bulk-invite/bulk-invite.mjs ~/Downloads/members.csv --send --confirm-production --limit 1
```

The script sends one invite every 1.5 s (`--delay-ms`), so 100 rows take about 2.5
minutes. It writes `<file>.results.csv` next to the input. That file holds emails, so
delete it when you are done.

| Outcome | Meaning |
|---|---|
| `invited` | Created, emailed, texted |
| `exists` | Already a user: skipped, so re-running the same file is safe |
| `failed` | This row only (callsign already taken, invalid email): fix it and re-run |
| `stopped` | Something that could hit every row: sign-in or permission, rate limit (429), email or SMS provider, server error, network. The run stops there. If it stopped on an email error, that user was created but not emailed, and a re-run will skip them, so use "שליחת הזמנה מחדש" for them in the users screen |

## Tests

`npm test` runs `lib.test.mjs` (parsing, validation, run order, stop rules) against a
fake `invoke`. The script itself has only been run as a dry run.
