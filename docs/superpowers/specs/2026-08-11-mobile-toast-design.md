# Mobile toast — design

Date: 2026-08-11  
Status: approved for implementation (aligns with `design-system-design-instructions/06-components.md` → Toast)

## Problem

Confirmation and error toasts mis-rendered on mobile RTL. The stack used `inset-inline-start: 50%` + `transform: translateX(-50%)`, which does not center in RTL and can push the toast partially off-screen. Enter/exit motion from the motion spec was also missing, and the alert dismiss control was below the 44×44 mobile touch minimum.

## Decision

Keep the existing product API (`useToast().show(message, tone)`) and desktop placement (bottom-inline-start). Redesign **mobile placement/layout only**:

| Aspect | Mobile | Desktop |
|---|---|---|
| Anchor | Top, under app bar (`--appbar-height` + `--space-3`) | Bottom-inline-start (`--space-6`) |
| Centering | Flex `align-items: center` on full-bleed stack with `--space-4` gutters (RTL-safe) | Stretch, fixed width |
| Width | `100%` of gutters, `max-width: 360px` (near full-bleed banner on phones) | `min(360px, 100% − --space-12)` |
| Motion | `toast-in` / `toast-out` per `07-motion.md` | Same |
| Dismiss (alert) | 44×44 hit target | 32×32 |

Chrome, tones, copy rules, and auto-dismiss timings stay as specified in the design system (Command navy overlay, status inline-start bar, 4s / 6s).

## Out of scope

- Bottom snackbar above the tab bar (Material-style) — rejected; design system requires top-center on mobile so toasts stay clear of the tab bar and thumb zone for primary nav.
- Queue / max-visible limits beyond current append-all stack.
- Changing toast call sites or Hebrew copy.
