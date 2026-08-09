# Screen — Login (כניסה)

The one screen where both worlds meet: the Command-ink institution and the Field-paper form. This is the front door; it must feel like arriving at a well-run unit.

## Theme context

Split: hero region = **Command**, form region = **Field**.

## Layout

### Desktop (≥1025)

Two panels, full viewport height:

```
┌────────────────────────────┬───────────────────────┐
│  (inline-start ~55%)       │  (inline-end ~45%)    │
│  COMMAND HERO — ink        │  FIELD FORM — paper   │
│                            │                       │
│  יחפ״צ                     │   כניסה למערכת        │
│  (Frank Ruhl Libre,        │   [דוא״ל]             │
│   --type-display, paper)   │   [סיסמה]             │
│  היחידה הארצית לפינוי צירים│   (כניסה) primary     │
│  (--type-body, ink-200)    │   שכחתי סיסמה (ghost) │
└────────────────────────────┴───────────────────────┘
```

- Hero: Command navy `#182A47` (Command `--surface-page`) background, flat — NOT near-black. Wordmark `יחפ״צ` in Frank Ruhl Libre 700 at display size in `#F2F6FA`; beneath it the unit line `היחידה הארצית לפינוי צירים` in `--type-body`, `#C3CEDC`. Below, ONE hairline rule (`rgba(242,246,250,0.15)`, width 64 px) as the letterhead rule. Nothing else — no illustration, no photo, no gradient, no floating shapes.
- Form panel: `--paper-50` bg; form card max-width 360 px centered vertically, `--surface-raised`, hairline, radius `--radius-md`, padding `--space-8`.

### Mobile (≤640)

Single column: ink header band (~35vh) with the same wordmark composition, then the paper form area continuing to the bottom. Form fields full-width, padding-inline `--space-4`.

## Form composition

1. Title `כניסה למערכת` (`--type-section` — the screen title lives in the hero, so the form uses section level).
2. `דוא״ל` — text input, `type="email"`, `autocomplete="email"`, `dir` stays rtl with LTR-isolated value display.
3. `סיסמה` — password input, `autocomplete="current-password"`, show/hide toggle (icon button, `aria-label="הצגת סיסמה"`). Always LTR-isolated (Latin characters) — the only product field that forces LTR.
4. Primary button, full-width: `כניסה`.
5. Ghost link below, centered: `שכחתי סיסמה` → reset flow (email input + `שליחת קישור לאיפוס`).

## Invite / set-password (השלמת הרשמה)

Same split shell. Form card is slightly wider (max 400) and opens with a welcome block:

1. Eyebrow label (`השלמת הרשמה` / `איפוס גישה`)
2. Avatar + greeting `שלום, {full_name} - {callsign}` (callsign mono). Omit gracefully if profile still loading.
3. Hairline under the welcome block
4. Title row with key icon in accent-subtle chip + `בחירת סיסמה` / `איפוס סיסמה`
5. Short body, two password fields (LTR), primary `שמירת סיסמה`, ghost `יציאה`
6. Success: stamp `נשמר` + `הסיסמה נשמרה` + primary `המשך למערכת`

## States

- **Submitting:** button loading state `נכנס…`.
- **Bad credentials:** inline alert above the button — `--status-alert-tint` bg, `--status-alert-on-tint` text, radius `--radius-sm`, padding `--space-3`: `הדוא״ל או הסיסמה שגויים. נסו שוב.` `role="alert"`.
- **Reset sent:** replace form body with confirmation: `קישור לאיפוס סיסמה נשלח אל הכתובת שהזנתם.` + ghost `חזרה לכניסה`.
- No self-signup: no "הרשמה" link exists. Users are provisioned by the admin.

## Notes

- No top app bar and no tab bar on this screen.
- The hero is the only place `--type-display` appears in the entire app — guard it.
