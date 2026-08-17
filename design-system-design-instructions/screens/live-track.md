# Screen — שיתוף מיקום (live track)

Unauthenticated beacon. The volunteer opens an SMS link and **leaves this page in the foreground**. No map, no login, no app bar, no tab bar. Always **Field** theme.

## Theme context

- Page + card = **Field** (`data-theme="field"` on `.live-track` and `.live-track__card`)
- Boots from `?track_token=` **before** the login gate (same idea as fill-token)

## Layout

Centered Field card in the shell main (`max-width: var(--form-max)`). Card: `--surface-raised`, hairline, `--radius-md`, padding `--space-6`, gap `--space-4`. No overlay shadow (elevation 1). Safe-area padding on the page.

```
┌─────────────────────────────────────────┐
│         FIELD STAGE                     │
│      ┌───────────────────────────┐      │
│      │  שיתוף מיקום              │      │
│      │  השאירו דף זה פתוח…       │      │
│      │  [התחלת שיתוף מיקום]      │      │
│      └───────────────────────────┘      │
└─────────────────────────────────────────┘
```

While sharing, the lead copy stays; the primary is replaced by stamp `משתף מיקום` (`tone="pending"`). No spinner-only state.

## Copy (locked)

- Title: `שיתוף מיקום`
- Lead: `השאירו דף זה פתוח. נעילת המסך או מעבר לאפליקציה אחרת יפסיקו את השיתוף.`
- Primary (needs a gesture): `התחלת שיתוף מיקום`
- While live: `משתף מיקום`
- Permission denied: title `שיתוף מיקום` / caption `יש לאשר מיקום בדפדפן כדי לשתף.`
- Invalid / expired token: title `קישור המעקב` / caption `קישור המעקב אינו תקין או שפג תוקפו.`
- Ended / assignment gone: title `המעקב הסתיים` / caption `אין צורך להשאיר דף זה פתוח`

Empty states use the standard EmptyState (icon 40, stroke 1.75). Loading: muted `טוען…`.

## Behavior notes (not visual)

Request GPS from the tap: `getCurrentPosition` first (no `timeout`), then `watchPosition`. Do not call Screen Wake Lock before GPS — on iOS it can consume the user gesture so Safari never shows Allow. Wake Lock is best-effort after the first fix. No map on this page — leads see pins on **מפה** and the cockpit map.
