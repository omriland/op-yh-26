# Platform parity: web, Android, iPhone

One page that shows which Yahpaz features each app has, and what is missing where.

## Last checked

Date: 2026-11-25

| App | Commit checked | Released version |
|---|---|---|
| Web | `4ffb14c` (origin/infra/bootstrap) | live at yahpz.com |
| Android | `34f5d56` (main) | 0.3.64 (78), 2026-11-16 |
| iPhone | `dece879` (release/build19-icon, local branch) | none public yet; build 1.0.2 (19) sent to App Review 2026-11-19 |

For iPhone, "has it" means "in build 19". origin/main of the iPhone repo is stale.

## Legend

✅ has it · ❌ missing · 🔶 in progress (on a branch, not released) · — not needed on this platform · ? unsure

## Biggest gaps

1. Phones have no event filters or saved views (lead, vehicle type, plate, dates). Web has them since 2026-11-05.
2. Shift hours and the live shift screen (web 2026-11-22) are on neither phone.
3. iPhone cannot fill the shared crew report of a shift-born event. Android can.
4. Android has no push notifications (no device registration). iPhone registers for push.
5. Android has no "delete my account". iPhone and web have it.
6. The trip distance next to the end odometer (web 2026-11-24) is on neither phone.
7. iPhone has no broadcast (תפוצה), fuel quarter tool, closed-lists settings or lead cockpit list. Android has them.
8. Live location sharing is off in the iPhone build (compiled out). Android has it.
9. Phones have no Telegram bot link, phone-code (OTP) sign-in, or reports "activity summary" and "inactive volunteers".
10. Android 0.3.65 (calmer leaders' events tab) is not released yet (branch only).

## Sign-in and account

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Email and password sign-in | all | ✅ | ✅ | ✅ | |
| Forgot password (reset link) | all | ✅ | ✅ | ✅ | |
| First password from invite link / forced password change | new members | ✅ | — | ✅ | Android: opens the web set-password page |
| Phone one-time code sign-in (SMS) | all | ✅ | ❌ | ❌ | Android only lets admin switch users to it |
| Remember me, 30 days | all | ✅ | — | — | Apps stay signed in |
| Delete my account | all | ✅ | ❌ | ✅ | iPhone since build 18; web since 2026-11-03 |
| Sign out | all | ✅ | ✅ | ✅ | |
| Change password | all | ✅ | ✅ | ✅ | |
| Forced update screen | all | — | ✅ | ✅ | |
| Optional update prompt | all | — | ✅ | ✅ | Android 0.3.59; iPhone build 19 |
| Prompt to refresh after new deploy | all | ✅ | — | — | |
| Privacy policy page | all | ✅ | ✅ | ✅ | |
| Support page, data-deletion page, store-review demo account, pre-launch gate | public/store | ✅ | — | — | Web-only by nature |

## Navigation and general

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Role-based tabs (sidebar on web, bottom bar on phones) | all | ✅ | ✅ | ✅ | |
| Admin "view as" a user / a role | admin | ✅ | ✅ | ✅ | Web: super admin |
| Feedback form (text, voice, files) | all | ✅ | ✅ | ✅ | |
| Feedback inbox and task board | super admin | ✅ | — | — | Web-only |
| Form drafts kept on device | all | ✅ | ✅ | ✅ | |
| Ctrl/Cmd+K search shortcut, sidebar resize, footer | all | ✅ | — | — | Desktop only |
| Session heartbeat (last seen) | all | — | ✅ | ✅ | |
| Remote texts, colours, flags | all | — | ❌ | ✅ | iPhone reads app_config; Android has no such code |

## Events list (אירועים)

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Unit events list with search | lead, admin | ✅ | ✅ | ✅ | |
| Filters: lead, on-duty, event number, dates, plate, vehicle type | lead, admin | ✅ | ❌ | ❌ | Web since 2026-11-05; Android has filter chips only |
| Saved named filter views | lead, admin | ✅ | ❌ | ❌ | Web since 2026-11-05 |
| Default to my own events, toggle for others | lead | ✅ | ✅ | ✅ | iPhone: showOthersCreatedEvents toggle in UnitEventsView |
| Show or hide shift-born events | lead | ✅ | ✅ | ❌ | |
| Calmer leaders' events tab | lead | — | 🔶 | — | 0.3.65 branch |
| My events (האירועים שלי) | responder | ✅ | ✅ | ✅ | |
| Search my events | responder | ✅ | ✅ | ✅ | |
| Cancelled events marked | all | ✅ | ✅ | ✅ | |
| Delete an event (owner or admin) | lead, admin | ✅ | ✅ | ✅ | |

## Event create and edit

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Create and edit an event | lead | ✅ | ✅ | ✅ | |
| Assign responders (מתנדבים), named confirm to remove | lead | ✅ | ✅ | ✅ | |
| Secondary lead (אחמ״ש משני) | lead | ✅ | ✅ | ✅ | |
| Place search with highway junctions | lead | ✅ | ✅ | ✅ | |
| Optional station (תחנה) | lead | ✅ | ✅ | ✅ | |
| Event notes | lead | ✅ | ✅ | ✅ | |
| Manual event held until number, road and or-ak filled | lead | ✅ | ✅ | ✅ | |
| Same-day event number refused | lead | ✅ | ✅ | ✅ | |
| Cancel / uncancel flag | lead | ✅ | ✅ | ✅ | |
| Lead KM before marking done | lead | ✅ | ✅ | ✅ | |
| KM freeze at 80 | lead, admin | ✅ | ✅ | ✅ | Android: KM_EXCEPTION_THRESHOLD = 80, frozen mark |
| Event form autosave on device | lead | ✅ | ✅ | ✅ | |
| 7-day edit lock for non-admins | lead | ✅ | ✅ | ✅ | |

## Event page and photos

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Event detail with responders and status | all | ✅ | ✅ | ✅ | |
| Photo and video gallery | all | ✅ | ✅ | ✅ | Phones: inside fill and event view |
| Link a photo to a treated vehicle | responder | ✅ | ✅ | ✅ | Web 2026-11-03 |
| Personal-vehicle prompt for photo with no vehicle | responder | ✅ | ✅ | ❌ | Android 0.3.62; no prompt code in build 19 |
| Map pin on highway events | all | ✅ | ✅ | ✅ | |
| העשרות (comments) with gold mark | all | ✅ | ❌ | ❌ | Web 2026-11-27 |

## Responder fill (filling in the event report)

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Fill in the app | responder | ✅ | ✅ | ✅ | |
| Fill by emailed link | responder | ✅ | — | — | Web-only by nature |
| Treated plates, several vehicles | responder | ✅ | ✅ | ✅ | |
| Plate read from photo or camera | responder | ✅ | ✅ | ✅ | Experimental on phones |
| Odometer start and end | responder | ✅ | ✅ | ✅ | |
| Trip distance next to end odometer | responder | ✅ | ❌ | ❌ | Web 2026-11-24 |
| Autosave draft | responder | ✅ | ✅ | ✅ | |
| Responder can log a cancelled event | responder | ✅ | ✅ | ✅ | Android 0.3.55; iPhone FillView handles cancelled fills |
| Finish note minimum 25 characters | responder | ✅ | ✅ | ❌ | Android: TREATMENT_DETAIL_MIN_ERROR; no 25-char check in iPhone |
| "סיימת לתעד" when lead KM missing | responder, lead | ✅ | ✅ | ✅ | |
| Document before lead enters KM | responder | ✅ | ✅ | ✅ | |
| Missing-KM alerts and reminders for lead | lead | ✅ | ✅ | ✅ | |

## Shifts (משמרות)

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Unit shifts list | shift lead | ✅ | ✅ | ✅ | |
| Create and edit a shift | shift lead | ✅ | ✅ | ✅ | |
| My shifts (המשמרות שלי) | responder | ✅ | ✅ | ✅ | |
| Shift hours with overlap checks | shift lead | ✅ | ❌ | ❌ | Web 2026-11-22 |
| Live shift screen, crew completes events | crew | ✅ | ❌ | ❌ | Web 2026-11-22 |
| Shift-born events: shared crew report | crew | ✅ | ✅ | ❌ | Android 0.3.51; iPhone only lists them |
| Crew enters shift odometer | crew | ✅ | ✅ | ❌ | |
| Super admin reopens a responder log | super admin | ✅ | — | — | Web-only |

## Volunteer profile and availability

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Profile with activity summary | volunteer | ✅ | ✅ | ✅ | |
| Lifetime KM hidden for responder-only | responder | ❌ | ✅ | ✅ | Web shows every user their own KM since 2026-11-27 |
| My KM by month and quarter, frozen events counted | all | ✅ | ❌ | ❌ | Web since 2026-11-27; lifetime KM and the handled-events count now include frozen events in all apps |
| My vehicles: add, edit, star default | responder | ✅ | ✅ | ✅ | |
| Availability with return date | responder | ✅ | ✅ | ✅ | Web: not checked in detail |
| Telegram bot link | volunteer | ✅ | ❌ | ❌ | Web since 2026-09-04 |
| Contacts list with search | all | ✅ | ✅ | ✅ | |
| Call a contact | all | ✅ | ✅ | ✅ | |
| WhatsApp a contact | all | ✅ | ✅ | ✅ | |
| Save a contact to the phone (vCard) | all | ✅ | ❌ | ❌ | Web since 2026-11-25 |

## Leaders and live operations

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Cockpit (live board of events) | shift lead | ✅ | ✅ | ❌ | Android: list with map links, hidden from tab bar |
| Cockpit contacts panel and intro | shift lead | ✅ | ❌ | ❌ | Android CockpitScreen has no contacts panel or intro |
| Live location sharing (SMS or app link) | responder | ✅ | ✅ | ❌ | iPhone compiled out since build 17 |
| Live en-route pins for leads | lead | ✅ | ✅ | ✅ | |
| Telegram live trip tracking | responder | ✅ | — | — | Web-only by nature |

## Maps and location

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Map of events and units with clusters | all | ✅ | ✅ | ✅ | |
| Police station layer | all | ✅ | ✅ | ✅ | |
| Kilometre posts layer | all | ✅ | ✅ | ✅ | Android: milePosts layer in MapScreen.kt |
| Address search with nearby responders | all | ✅ | ✅ | ✅ | Android: NearbySheet in MapScreen.kt |

## Reports and fuel

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Reports catalogue | lead, admin | ✅ | ✅ | ✅ | |
| Open documentation | lead, admin | ✅ | ✅ | ✅ | |
| Events by responder | lead, admin | ✅ | ✅ | ✅ | |
| KM exceptions | lead, admin | ✅ | ✅ | ✅ | |
| KM discrepancy | lead, admin | ✅ | ✅ | ✅ | |
| Duplicate events | lead, admin | ✅ | ✅ | ✅ | |
| Event preview on hover in KM exceptions and duplicates | admin | ✅ | — | — | Desktop only, web since 2026-11-27 |
| Fuel summary table | lead, admin | ✅ | ✅ | ✅ | |
| Fuel quarter and allocation | admin | ✅ | ✅ | ❌ | iPhone has data code, no screen |
| Activity summary report | admin | ✅ | ❌ | ❌ | Web 2026-11-24 |
| Inactive volunteers report | admin | ✅ | ❌ | ❌ | Web 2026-11-24 |
| Admin search (events, archive, people), CSV | admin | ✅ | — | — | Web-only |
| Legacy archive, partner API, Telegram partner bot, iOS device approval | admin | ✅ | — | — | Web-only by nature |

## Admin

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Users list, roles, archive | admin | ✅ | ✅ | ✅ | |
| Invite a user | admin | ✅ | ✅ | ✅ | |
| Resend invite | admin | ✅ | ✅ | ✅ | |
| Create user, hard delete, change login email, reset password | super admin | ✅ | — | — | Web-only |
| Closed lists settings (הגדרות) | admin | ✅ | ✅ | ❌ | |
| Broadcast (תפוצה) to volunteers | admin | ✅ | ✅ | ❌ | |
| Remove a volunteer's vehicle | admin | ✅ | ✅ | ✅ | Android: "הסרת רכב" button in AdminUsersScreen.kt |
| Bulk invite script, SMS provider, locations queue, junction aliases | admin | ✅ | — | — | Web-only |

## Notifications

| Feature | Who | Web | Android | iPhone | Notes |
|---|---|---|---|---|---|
| Push permission and device registration | all | — | ❌ | ✅ | Android has no push code |
| Receive broadcast push | all | — | ❌ | ✅ | Web sends it |

## Change log

- 2026-11-27: web: העשרות (comments) on the event page, with a gold mark anyone who sees the event can set.
- 2026-11-27: web: my KM by month and quarter on the profile, shown to every user; lifetime KM and the handled-events count include frozen events.
- 2026-11-27: web: event preview on hover in the KM exceptions and duplicate events reports.
- 2026-11-25: web: save a contact to the phone from the contacts page.
- 2026-11-25: first full sweep of all three apps.
- 2026-11-24: web: trip next to end odometer, activity summary and inactive volunteers reports.
- 2026-11-22: web: shift hours and live shift screen.
- 2026-11-19: iPhone: build 19 to App Review (optional update prompt, remote config, new icon).
- 2026-11-16: Android 0.3.64 released; 0.3.65 (calmer leaders' tab) on a branch.
- 2026-11-14: web and Android 0.3.63: single save and delete buttons on event form.
- 2026-11-05: web: event filters and saved views.
- 2026-11-03: web, Android 0.3.50 to 0.3.53, iPhone build 18: photo linked to vehicle, hide lifetime KM from responders; iPhone and web: delete my account.
- 2026-11-03: web and Android: shift-born events with a shared crew report.
- 2026-10-29: iPhone build 17 to App Store: map, autosave, edit lock, held manual events.
- 2026-09-10: web and iPhone: KM freeze at 80.
- 2026-09-05: iPhone: Android parity build (shifts, reports, admin, contacts, feedback).
- 2026-09-04: web: Telegram bot link in profile; Android 0.3.25 in-app install.
- 2026-08-18: Android: first full app (events, reports, admin).
- 2026-08-17: iPhone: first native app. Web: live location tracking.
- 2026-08-09: web: first release.

## How to keep it current

- When a web change people can see is shipped, add or update its row (web ✅ once merged; phones ❌ unless they already have it) and add a change-log line.
- When a phone release goes out, or someone asks what is missing where, read that repo's history since the "Last checked" commit, update the rows and the change log, and move "Last checked" (commits and released versions).
- Features that only make sense on web (admin tools, partner API, emailed links, store-review items) get — on the phones.
- Something on a branch but not released is 🔶. For iPhone, "has it" means in the latest build sent to review.
- If you cannot confirm a row by searching that app's code, mark it ? with a short note.
- Keep this file in one place: the web repo (`docs/platform-parity.md`).
