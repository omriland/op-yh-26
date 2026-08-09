# 07 — Motion

Motion in an official record is the motion of paperwork: quick, decisive, done. Nothing floats, bounces, or lingers.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 120 ms | Hover/active feedback, toggles, checkboxes |
| `--duration-base` | 180 ms | Menus, popovers, tab switches, stamp press |
| `--duration-slow` | 240 ms | Dialogs, bottom sheets, page-level panels |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Everything entering/changing |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Everything leaving |

No other durations or easings exist. No springs. No bounce.

## What animates

| Element | Animation |
|---|---|
| Buttons/interactive hover | background-color, `--duration-fast` |
| Menus/popovers | opacity + translateY(4px)→0, `--duration-base` |
| Dialog | opacity + scale 0.98→1, `--duration-slow`; backdrop opacity only |
| Bottom sheet | translateY 100%→0, `--duration-slow` |
| Toast | translateY(−8px)→0 + opacity in; opacity out |
| Tab/nav indicator | inline-position slide, `--duration-base` |
| Skeleton | opacity pulse 0.6↔1, 1.2 s loop |

## The stamp press (the one choreographed moment)

When a status **changes to a completed state in front of the user** (responder finishes their section; event flips to `הושלם`), the new stamp chip enters with a press: `scale(1.12) → scale(1)` + opacity 0→1, `--duration-base`, `--ease-standard`. It reads as a stamp hitting paper. This animation runs ONLY on live status transitions — never on page load, never in lists.

## Never

- No animated gradients, parallax, floating/idle loops, confetti.
- No layout-shifting entrance animations on page load — content appears immediately (skeletons cover loading).
- No transition on `dir`-sensitive properties that could glitch RTL (animate transforms/opacity, not `inset-inline`, where possible).

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  /* All transitions/animations → duration 0.01ms; skeleton pulse becomes static --surface-sunken */
}
```

The stamp press is replaced by an instant swap. Functionality never depends on motion.
