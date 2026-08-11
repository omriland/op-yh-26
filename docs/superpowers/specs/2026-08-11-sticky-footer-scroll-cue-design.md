# Sticky footer scroll cue — design

Date: 2026-08-11  
Status: approved for implementation

## Problem

On mobile, forms with a sticky action footer (סיום דיווח / שמירת טיוטה and siblings) make it unclear that the panel scrolls and that more fields sit above the buttons. Content ends flush against the footer with no affordance that overflow exists.

## Decision

Add a **soft upward shadow** on the sticky `.event-form__footer` whenever the form panel is taller than the scrollport. The cue makes content read as continuing underneath the action bar.

| Aspect | Rule |
|---|---|
| Scope | Every screen using sticky `.event-form__footer`: responder fill, event form, shift form |
| When visible | While the form panel overflows the scrollport — including after the user has scrolled to the bottom |
| When hidden | When content fits with no overflow |
| Visual | Soft upward shadow / fade from the top edge of the sticky footer |
| Token | New `--shadow-scroll-cue` (explicit exception to the flat elevation ladder for this affordance) |
| Toggle | Class on the footer, e.g. `event-form__footer--scroll-cue`, driven by a shared overflow measurement (ResizeObserver + scroll/viewport checks) |
| A11y | Decorative only; no new Hebrew copy; opacity transition respects `prefers-reduced-motion` |
| Desktop | Same behavior if that form panel overflows |

## Approaches considered

1. **Soft top shadow on sticky footer (chosen)** — clear, quiet, shared via existing footer chrome.
2. Fade mask strip above the buttons — stronger cue, more layout risk with tab bar / safe-area.
3. Shadow + “עוד פרטים” chevron — most explicit, adds temporary chrome/copy.

## Out of scope

- Chevron / “עוד פרטים” text hint
- Separate gradient mask layer above the footer
- Changing button order, labels, or sticky positioning
- Scroll cues on non-form surfaces (lists, dialogs, pickers)
