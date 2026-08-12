# 08 — Accessibility (non-negotiable minimums)

This platform is used at roadside, at night, in sunlight, under stress, sometimes with gloves. Accessibility here is operational fitness, not compliance theater.

## Contrast

- Text: **≥ 4.5:1** against its surface (WCAG AA). Large text (≥ 24 px or ≥ 18.5 px bold): ≥ 3:1.
- UI boundaries that carry meaning (input borders, focus rings, stamp borders, icons): ≥ 3:1.
- Every pairing declared in `02-color.md` is verified by `scripts/contrast-check.mjs` — run it after ANY color change (`node scripts/contrast-check.mjs`; all pairs must PASS). If you compose a pairing not listed there, add it to the script and verify before shipping.
- Known traps (already encoded in the tokens — do not "improve" them back into failure): amber `#B07C24` text is NOT allowed on white (use `--status-partial-on-tint` `#7A5410`); Command status tints above 8% opacity wash out their own ink text; `--stroke-strong` opacity below ~0.5 (Field) fails the 3:1 boundary minimum.

## Focus

- `:focus-visible` on every interactive element: `outline: 2px solid var(--accent); outline-offset: 2px;`. Never `outline: none` without this replacement.
- Focus order follows visual RTL reading order. Dialogs/sheets trap focus and return it on close.
- Skip link (`דילוג לתוכן`) as first focusable element on desktop layouts.

## Touch & pointer

- Minimum tap target **44×44 px** on mobile — including checkbox rows, stepper buttons, table-row equivalents, and stamp-adjacent actions.
- Interactive elements separated by ≥ 8 px so gloved fingers don't mis-tap.
- Hover is never the only way to reveal information or actions.

## Screen readers (Hebrew)

- `lang="he" dir="rtl"` at root; any LTR isolate spans keep `lang` appropriate (e.g., emails stay default).
- All `aria-label` / `aria-describedby` values in Hebrew: e.g., icon-only user menu = `aria-label="תפריט משתמש"`.
- Stamp chips carry the status as text (they already do — never replace the label with an icon or color alone).
- Form fields: real `<label for>` associations; errors linked via `aria-describedby` and announced with `role="alert"` / `aria-live="assertive"` on submit failure.
- Toasts: `role="status"` (`aria-live="polite"`); error toasts `role="alert"`.
- Ledger rows are marked up as `<dl>`/`<dt>`/`<dd>` — they are definition lists, semantically.

## Status is never color-only

Every status conveys through **text (the Hebrew label)** + color. The dashed border on `אירוע בהזנה` stamps adds a non-color channel. Do not add status indicators that are dots or bars without text.

## Forms

- `inputmode` and `autocomplete` set correctly (numeric fields, `tel`, `email`).
- Required fields marked in the label (`שדה חובה` via visually-hidden text or the dotted-line + helper convention) — not by color alone.
- Validation tightens on status transitions per the product spec: partial saves never block with errors on fields the user isn't required to fill yet.

## Zoom & text scaling

- Layout survives 200% browser zoom and iOS/Android font scaling without loss of function (test the bottom tab bar and table→card fallbacks).
- No `maximum-scale` or `user-scalable=no` in the viewport meta.
