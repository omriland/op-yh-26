---
target: the web "My events" page + the whole navbar and sidebar
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-20T15-37-49Z
slug: src-pages-eventspage-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + browser evidence, isolated). All eight load-bearing defect claims verified against source before publishing.

Targets: src/pages/EventsPage.tsx (mine scope) · src/components/shell/AppShell.tsx + src/components/shell/* · the events components they render.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Nav attention dot fails closed: any fetchNavAttention error clears both dots (App.tsx:295). |
| 2 | Match System / Real World | 3 | One state, three names: tab `ממתינים לתיעוד`, stamp `ממתין למילוי פרטים` (status.ts:95), spec `ממתין לתיעוד שלך` (06-components.md:78). |
| 3 | User Control and Freedom | 2 | Archive 30 days at a time; tab + window + search reset on reload (EventsPage.tsx:117). Future-dated done event unreachable. |
| 4 | Consistency and Standards | 2 | role="tab" with both aria-selected and aria-pressed, no tabpanel/aria-controls/arrow keys (MineInboxTabs.tsx:13). Card tap opens detail where 06-components.md:120 specifies fill. Physical `right`. |
| 5 | Error Prevention | 2 | Fuel-refund warning only at openCount >= 3; two undocumented events lose the same money silently. |
| 6 | Recognition Rather Than Recall | 2 | Cards carry no time, no lead, no vehicle. Date is smallest/faintest text. |
| 7 | Flexibility and Efficiency | 3 | Good: keyboard-resizable sidebar, nav-click section reset, search hydration. Against: <tr onClick> with no tabIndex (EventsTable.tsx:35). |
| 8 | Aesthetic and Minimalist Design | 3 | Card/stamp/table/letterhead disciplined; undercut by mine-insight and the radar sweep. |
| 9 | Error Recovery | 2 | Frozen-record explanation unreachable by touch or keyboard; no recovery path. |
| 10 | Help and Documentation | 2 | HoverTip is the whole explanation layer; bare span, no tabIndex (HoverTip.tsx:97). |
| **Total** | | **24/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

Specific in the record, generic in the chrome, drifting in the one screen the volunteer sees most.

Content layer is authored for this product: viewer-relative stamp, 2/3 completion fraction, origin rail that separates standalone from shift-born without touching status color, letterhead app bar.

Navigation is not. .nav-item (components.css:1828) is the shadcn/Linear default row; swap the Hebrew labels for English and it is a plausible SaaS admin panel. Trips the design system's own anti-reference #4 ("NOT a generic admin panel… structure comes from rules and typography, not boxes-in-boxes") because the active state IS a filled box. In a system whose vocabulary is hairlines, ledger rows and dotted leaders, the nav contains not one hairline, rule, or leader.

The one attempt at nav character uses forbidden vocabulary: .nav-item--cockpit::after paints a conic-gradient running `animation: spin 1.2s linear infinite` on hover (components.css:1903), against 00-how-to-use.md:25 and 07-motion.md. Desktop-only, so the field user never sees the app's one moment of authored personality.

Deterministic scan: detect.mjs exit 0, ZERO findings across all 25 target files (verified not a silent skip — control scan of src/ yields 4; --no-config rerun confirms nothing suppressed). Those 4 are rule `side-tab` on border-inline-start rails — false positives: logical (correct RTL) and carrying status semantics 02-color.md mandates. A live-scan dark-glow on login__card is also a false positive (--shadow-overlay, 8px offset, not a halo). The mechanical detector is clean; every real problem came from judgment or the project's own gates.

Visual overlays: NONE. Browser inspection blocked at the Supabase auth wall — .env.local has no credentials, no dev/seed login. Injection was proven working on the login page, so this is a credentials gap, not tooling. Nothing in this report is based on a rendered view of the events page or shell.

## Overall Impression

Well-built product with an unusually good design system and a real POV. The critique is hard BECAUSE the system is so specific — most findings are the implementation drifting from a contract it wrote itself.

Biggest opportunity: the phone does more work than the desk and gets less design. Mobile fetches unbounded while desktop caps at 200. mine-insight is desktop-only. Cockpit is desktop-only. The whole explanation layer is pointer-only. PRODUCT.md Principle 2 says the field wins conflicts; right now it consistently loses.

## What's Working

1. Viewer-relative stamp, honestly implemented (status.ts:90-120) — and the desktop table deliberately REFUSES the override to show the event-level pipeline (EventsTable.tsx:60). Not personalizing the manager's table shows real understanding of the two-sided model.
2. Origin and urgency encoded without stealing status color (components.css:621-629) — 3px --accent for standalone vs --status-alert + tint for 48h overdue, explicitly refusing green because it would read as הושלם. Two orthogonal dimensions on one edge, stamp left free.
3. Theme-aware chrome detail: attention-dot halo re-tints per surface; tab bar avoids position:fixed with a documented iOS reason.

## Priority Issues

### [P0] Mobile list fetches the entire events table, unbounded
EventsPage.tsx:103 passes undefined to fetchEvents on every non-table surface; events.ts:126 limits only when given one. VERIFIED. Desk gets 200 rows; phone gets every row with nested responders->profile joins on the worst connection, with no partial data and no timeout.
Fix: limit the card path (50 is plenty), add date-window pagination matching the sticky date groups already rendered, keep search as the escape hatch the desktop copy already promises.
Command: /impeccable optimize src/pages/EventsPage.tsx

### [P0] A completed event dated after today vanishes from both tabs
VERIFIED, mechanism sharper than the review stated: partitionMineList has a `future` bucket but the caller (EventsPage.tsx:234) only ever returns 'pending' or 'logged', so `future` is unreachable dead code. A done event with event_date > today satisfies neither date<=today nor date<start — dropped AND hasMoreLogged stays false. No trace, no load-more hint. Night shift crossing midnight is routine.
Fix: render the future bucket as a `בהמשך` group above pending, or classify future-dated done events as logged and set hasMoreLogged for exclusions in EITHER direction.
Command: /impeccable harden src/lib/mineListSections.ts

### [P1] The record's stakes are hover-only, therefore invisible in the field
HoverTip trigger is a bare <span> with onFocus but NO tabIndex (HoverTip.tsx:97) — VERIFIED, unreachable by touch and keyboard. Carries freeze reasons, overdue reason, chip meanings, per-responder breakdown. Freeze is worst: it decides reimbursement, and on the phone the information is simply absent.
Fix: tabIndex={0} + role="button", open on click/Enter as well as hover. For freeze, promote out of tooltip-land: a hairline notice line in the card, `מוקפא · ממתין לאישור מנהל` in --status-pending ink.
Command: /impeccable harden src/components/ui/HoverTip.tsx

### [P1] The inbox spends its loudest element on a constant and omits the differentiator
Every pending card shows the same stamp and CTA; time of day, אחמ״ש, and treated plate are absent (EventCard.tsx:69-85). The stamp — "the one expressive flourish of the entire system" — carries zero information because it never varies. Card tap opens detail (EventCard.tsx:52), contradicting 06-components.md:120 ("Mine inbox open card -> fill"), so the largest one-handed target does the less useful thing.
Fix: drop the stamp in the pending tab and give the row back to identity (time + lead in the meta line, marks as the only chrome); whole card opens fill with a ghost `לאירוע` for detail; reconcile the label to `ממתין לתיעוד שלך`.
Command: /impeccable distill src/components/events/EventCard.tsx

### [P1] Navigation has no product character and mis-ranks the field user's obligations
Twelve sidebar items under two muted labels, no hairline or ledger device in the chrome; the one bespoke treatment is a forbidden infinite conic-gradient spin; .nav-attention-dot positions with physical `right: -2px` (components.css:1861) — VERIFIED, and the class is shared by sidebar AND mobile tab bar, so the badge sits on the wrong side in both. MOBILE_TAB_PRIMARY = ['mine','events','users','my_shifts'] (mobileNav.ts:2) — VERIFIED — ranks users above my_shifts, exiling `המשמרות שלי` (which carries the missing-odometer dot) into `עוד` for dual-role users. PRODUCT.md says dual roles are routine.
Fix: delete the radar sweep; inset-inline-end: -2px; section labels as headings sitting ON a hairline rule (04-layout.md:34) so twelve items read as three drawers; active state via ink weight + the existing 2px indicator, lighten the --accent-subtle box; rank my_shifts above users for responders.
Command: /impeccable layout src/components/shell/AppShell.tsx

### [P2] mine-insight is a dashboard hero with three typographic violations
VERIFIED at components.css:2331-2334: font-size 40px (off-scale; 03-typography.md reserves it for the login wordmark), font-weight 700 on --font-mono (fake-bold; only 400/500 loaded; 03-typography.md:72 forbids by name), letter-spacing -0.02em (forbidden), plus a 4px inline-start border absent from the stroke vocabulary. It is the greeting-hero-plus-KPI-tile pattern on the screen whose identity doc says "not a dashboard" — and it is desktop-only, so the invented treatment landed on the easier scene.
Fix: a document header instead — `האירועים שלי` in --type-title, a --type-label ledger line beneath (`ממתינים לתיעוד ······ 3`, value in --type-numeric-lg), fuel consequence as a plain caption with no exclamation mark and no >=3 threshold. Same on both widths.
Command: /impeccable typeset src/pages/EventsPage.tsx

## Cognitive Load

Nav breadth: an admin who also leads and responds gets 12 sidebar items under 2 section labels, with מפה and אנשי קשר (unit-wide) inside what reads as the personal block. Mobile: 3 real destinations + a dialog of 4.
Redundancy: the same fact stated up to four times on the responder's home (nav dot, summary sentence, tab label count, 40px counter), then every card repeats the same stamp and CTA.
Working memory: "why is this red?" requires recalling that an hourglass means 48h since km entry; "why won't I be paid?" requires recalling what a snowflake means. Neither has a visible label on the page.

## Emotional Journey

Opening: mobile gets a title and one honest sentence — correct. Desktop gets `שלום, {firstName}` plus a large counter, making the first impression "you owe three" rather than "here is your record." The register should be a docket, not a scoreboard.
Valley: the fuel notice is the most emotionally loaded string on the page (it is about money) and the one string that breaks the voice contract — PRODUCT.md and 01-identity.md:59 forbid exclamation marks. It shouts, appears only at >=3, offers no action.
Peak-end failure: finishing your last documentation is the summit — "the ceremony of completion" is in the identity doc. The responder gets a clipboard outline and `אין אירועים שממתינים לתיעוד.`, a negation phrased as absence. There is NO stamp, though the system owns a rubber-stamp device and a stamp-press animation reserved for exactly this moment.

## Persona Red Flags

Casey (distracted mobile) = the 03:00 roadside responder: taps the mode-switch tab at 36px (components.css:1267 — VERIFIED; the 44px opt-in .chips--field-height exists but is not applied), gloved, in the dark. Taps a card centre expecting the form, gets read-only detail. Taps the snowflake — nothing. Taps the hourglass — nothing. Cannot tell tonight's two חילוץ events on כביש 6 apart because no card shows a time. Connection drops, the nav dot reminding them of the debt quietly clears.

Sam (accessibility-dependent): role="tab" with aria-pressed, no tabpanel/aria-controls/arrow keys — invalid widget on the page's primary control. Every HoverTip keyboard-unreachable, so ALL explanatory content is off-limits. EventFrozenMark puts aria-label on a non-interactive span (commonly dropped by AT) while the overdue mark ships a proper visually-hidden string — so freeze, the one with financial consequence, is the silent one. Desktop table is <tr onClick> with no keyboard path: a keyboard user cannot open any event from the manager view at all.

Shift-lead running a live shift: on a phone הקוקפיט is not in the nav at all — the live-shift tool is desktop-only while the shift is by definition in the field. המשמרות שלי, carrying the odometer dot, is pushed into עוד. "Who still owes me documentation" — the lead's one question — exists only in a mouse-hover tooltip, never as a column or filter.

## Minor Observations

- THE BRANCH DOES NOT BUILD. tsc -b fails with 8 TS2322 errors from the in-progress EventFreezeFlags work, three in target files (EventCard.tsx:68, EventsTable.tsx:46, MineLoggedEventRow.tsx:29). Fix: make frozen_over_60km optional in src/lib/eventFreeze.ts or default it at call sites. npm run build runs tsc -b first.
- npm run contrast PASSES — all 68 declared pairings, 4 known traps correctly still failing.
- .toast hardcodes five raw hex values (components.css:3427-3446), freezing it to Command values so it cannot follow a theme switch. Rendered by UpdateAvailableNotice.tsx:12.
- prefers-reduced-motion coverage is complete (base.css:225 blanket reset + six targeted blocks). This neutralizes the radar spin for reduced-motion users but not for anyone else.
- .event-group--logged .card { opacity: 0.7 } fades archive records; 06-components.md:125 explicitly says no opacity fade.
- Dead CSS: .sidebar__section-label has no consumers. .nav-attention-dot uses border-radius: 999px instead of --radius-full.
- StampChip's doc comment says -1.5deg where 01-identity.md:29 and 06-components.md:71 specify -8deg.
- Keep: the דילוג לתוכן skip link and the aria-valuenow sidebar splitter.

## Questions to Consider

1. If the stamp is the signature, why is it constant on the screen the volunteer opens most? What if a stamp only ever appeared on תועדו — so seeing one MEANS something is finished, everywhere, without exception?
2. What would this navigation look like as a file drawer instead of a nav rail? You already own section rules with the heading on the rule, hairlines, and dotted leaders.
3. Where is the ceremony? What if the empty inbox were a closed record — a הושלם stamp pressed once, with a ledger line counting what you documented this quarter?
4. What if the tooltip layer simply did not exist? Every fact hidden in a HoverTip is a fact the field user needs and can never see. If tooltips were banned tomorrow, where would each fact have to live? That list is probably the real design brief.
