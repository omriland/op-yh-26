# Screen — Login (כניסה)

Front door for **אבן דרך**. Not a split shell — a Command portal with one Field document card.

## Theme context

- Page stage = **Command** (`data-theme="command"` on `.login`)
- Form card = **Field** (`data-theme="field"` on `.login__card`)

## Brand

- Platform: **אבן דרך** (oversized login wordmark)
- Beside it (RTL lockup): two stacked lines — **היחידה הארצית** / **לפינוי צירים**, separated by a vertical hairline. Do not wrap to three lines.

## Layout (all breakpoints)

```
┌─────────────────────────────────────────┐
│         COMMAND STAGE (full viewport)   │
│                                         │
│      אבן דרך │ היחידה הארצית           │
│              │ לפינוי צירים            │
│                                         │
│      ┌───────────────────────────┐      │
│      │  FIELD CARD               │      │
│      │  כניסה למערכת             │      │
│      │  [דוא״ל] [סיסמה]          │      │
│      │  [ ] זכור אותי… ל־30 יום  │      │
│      │  (כניסה) · שכחתי סיסמה    │      │
│      └───────────────────────────┘      │
│                                         │
└─────────────────────────────────────────┘
```

- Stage centered vertically and horizontally; padding respects safe-area.
- Masthead above the card: horizontal lockup, centered.
- Wordmark sizes (this screen only): 44/48 mobile → 56/60 tablet → 72/76 desktop.
- Card: `--surface-raised`, hairline, `--radius-md`, elevation-2 shadow (login portal exception — the card must read as a document on the navy stage).
- Card width ~400–460 px; setup modes slightly wider.

## Form composition

Unchanged behavior: sign-in, reset, reset-sent, set-password, password-set. Form-section title, LTR email/password, primary + centered ghost links, alerts, invite welcome + stamp success.

Sign-in includes checkbox **זכור אותי במכשיר זה ל־30 יום** (default on). Checked: keep the Auth session in `localStorage` for 30 days from that login and prefill email next time. Unchecked: `sessionStorage` only (browser close signs out) and forget the email. Never store the password in app storage — the browser password manager may save it via `autocomplete`.

## Notes

- No app bar / tab bar.
- Do not reuse the old two-panel split on this screen.
- Auth logic stays client-side Supabase as before.
