# Sticky Footer Scroll Cue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a soft upward shadow on sticky form footers whenever the page overflows, so mobile users see that more fields exist under the action bar.

**Architecture:** Pure overflow helper + hook that observes the form panel; shared `FormStickyFooter` wrapper applies `event-form__footer--scroll-cue`. CSS token `--shadow-scroll-cue` for the upward shadow. Wire into responder fill, event form, and shift form.

**Tech Stack:** Vite + React + TS, Vitest, existing `.event-form__footer` sticky chrome.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-sticky-footer-scroll-cue-design.md`
- Cue visible while document overflows (including scrolled to bottom); hidden when content fits
- Decorative only — no new Hebrew copy
- Hebrew-only UI strings elsewhere unchanged
- Opacity/shadow transition respects existing `prefers-reduced-motion` base rules

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/stickyFooterScrollCue.ts` | `contentOverflowsScrollport`, `useStickyFooterScrollCue` |
| `src/lib/stickyFooterScrollCue.test.ts` | Unit tests for overflow helper |
| `src/components/ui/FormStickyFooter.tsx` | Shared footer that toggles scroll-cue class |
| `src/styles/tokens.css` | `--shadow-scroll-cue` |
| `src/styles/components.css` | `.event-form__footer--scroll-cue` styles |
| `src/pages/ResponderFillPage.tsx` | Use `FormStickyFooter` |
| `src/pages/EventFormPage.tsx` | Use `FormStickyFooter` |
| `src/pages/ShiftFormPage.tsx` | Use `FormStickyFooter` |
| `.cursor/memory/MEMORY.md` | Record shipped cue |

---

### Task 1: Overflow helper (TDD)

**Files:**
- Create: `src/lib/stickyFooterScrollCue.test.ts`
- Create: `src/lib/stickyFooterScrollCue.ts`

**Interfaces:**
- Produces: `contentOverflowsScrollport(scrollHeight: number, clientHeight: number): boolean`
- Produces: `useStickyFooterScrollCue(footerRef: RefObject<HTMLElement | null>): boolean`

- [x] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { contentOverflowsScrollport } from './stickyFooterScrollCue'

describe('contentOverflowsScrollport', () => {
  it('is false when content fits exactly', () => {
    expect(contentOverflowsScrollport(800, 800)).toBe(false)
  })
  it('is false when content is shorter than the scrollport', () => {
    expect(contentOverflowsScrollport(600, 800)).toBe(false)
  })
  it('is true when content is taller than the scrollport', () => {
    expect(contentOverflowsScrollport(1200, 800)).toBe(true)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/stickyFooterScrollCue.test.ts`  
Expected: FAIL (module / export missing)

- [x] **Step 3: Implement helper + hook**

```ts
export function contentOverflowsScrollport(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight > clientHeight
}

export function useStickyFooterScrollCue(footerRef: RefObject<HTMLElement | null>): boolean {
  // ResizeObserver on closest .event-form__panel (fallback: footer)
  // + window resize → measure documentElement scrollHeight vs clientHeight
  // return boolean; cue stays true while overflowing (including at bottom)
}
```

- [x] **Step 4: Run tests — pass**

Run: `npm test -- src/lib/stickyFooterScrollCue.test.ts`  
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/stickyFooterScrollCue.ts src/lib/stickyFooterScrollCue.test.ts
git commit -m "feat: measure form page overflow for sticky footer cue"
```

---

### Task 2: Token, CSS, FormStickyFooter, wire pages

**Files:**
- Create: `src/components/ui/FormStickyFooter.tsx`
- Modify: `src/styles/tokens.css`, `src/styles/components.css`
- Modify: `src/pages/ResponderFillPage.tsx`, `EventFormPage.tsx`, `ShiftFormPage.tsx`

**Interfaces:**
- Consumes: `useStickyFooterScrollCue`
- Produces: `<FormStickyFooter>{actions}</FormStickyFooter>` → `<footer class="event-form__footer[ event-form__footer--scroll-cue]">`

- [x] **Step 1: Add token + CSS**

```css
--shadow-scroll-cue: 0 -10px 20px rgba(15, 27, 45, 0.14);
```

```css
.event-form__footer {
  /* existing + */
  transition: box-shadow var(--duration-base) var(--ease-standard);
}
.event-form__footer--scroll-cue {
  box-shadow: var(--shadow-scroll-cue);
}
```

- [x] **Step 2: Add FormStickyFooter and replace three footers**

```tsx
export function FormStickyFooter({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const showCue = useStickyFooterScrollCue(ref)
  return (
    <footer
      ref={ref}
      className={['event-form__footer', showCue ? 'event-form__footer--scroll-cue' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </footer>
  )
}
```

Replace `<footer className="event-form__footer">` in the three form pages with `<FormStickyFooter>`.

- [x] **Step 3: Verify**

Run: `npm test && npm run build`  
Expected: PASS (scroll-cue unit tests + production build; unrelated suites may fail without Supabase env)

- [x] **Step 4: Commit**

```bash
git add src/components/ui/FormStickyFooter.tsx src/styles/tokens.css src/styles/components.css \
  src/pages/ResponderFillPage.tsx src/pages/EventFormPage.tsx src/pages/ShiftFormPage.tsx
git commit -m "feat: sticky footer scroll shadow on overflowing forms"
```

---

### Task 3: Memory + PR

- [x] Update `.cursor/memory/MEMORY.md` with scroll-cue decision
- [x] Commit, push, update PR body
