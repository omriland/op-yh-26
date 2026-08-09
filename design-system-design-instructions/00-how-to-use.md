# 00 — How to Use These Instructions (Binding Contract)

You are an AI agent building UI for **Yahpaz (יחפ״צ)** — the on-duty management platform of a police road-recovery volunteer unit. These documents are the **single source of truth** for everything visual. They are not suggestions.

## Reading order

Read **all** of these before writing any UI code, in this order:

1. `01-identity.md` — what this design is and is not
2. `02-color.md` — the two theme contexts and every color token
3. `03-typography.md` — fonts, scale, numeric styles
4. `04-layout.md` — spacing, grid, radii, hairlines, breakpoints, elevation
5. `05-rtl-language.md` — RTL implementation and Hebrew copy rules
6. `06-components.md` — component anatomy, states, exact measurements
7. `07-motion.md` — what animates, how, and what never does
8. `08-accessibility.md` — non-negotiable minimums
9. The relevant file in `screens/` for the screen you are building

## Hard rules (MUST / NEVER)

- **NEVER invent a color, font, size, radius, shadow, or duration.** If the token you need does not exist in these docs, STOP and ask the human. Do not approximate.
- **MUST consume semantic tokens only** (`--surface-page`, `--text-primary`, …). Raw palette values (`--blue-700`) never appear in component code.
- **MUST use CSS logical properties everywhere**: `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-start-start-radius`, `text-align: start`. The words `left` and `right` are forbidden in layout CSS (exceptions: `direction`-agnostic media like maps/images).
- **MUST render every component correctly in both theme contexts** (שטח Field / מפקדה Command — see `02-color.md`). A component that only works on one background is incomplete.
- **NEVER use** decorative gradients, glassmorphism, neumorphism, blurry colored glows, emoji in UI, or animated background effects. This platform records official duty events; it is calm, precise, and matte.
- **All UI strings are Hebrew.** English never appears in the product surface (code identifiers and DB columns are English — that is fine).
- **Every interactive element** has all states specified in `06-components.md` implemented: default, hover, focus-visible, active, disabled, and where relevant error/loading/empty.

## Pre-delivery checklist

Before declaring any screen done, verify:

- [ ] **Token audit** — no hardcoded hex/px values that bypass tokens
- [ ] **RTL audit** — rendered with `dir="rtl"`; no physical left/right properties; directional icons mirrored per `05-rtl-language.md`
- [ ] **Both-themes audit** — components used render correctly in the theme context this screen declares (see its `screens/*.md` file)
- [ ] **Contrast audit** — all text/UI meets the minimums in `08-accessibility.md`; `node scripts/contrast-check.mjs` passes if any color was touched
- [ ] **Font audit** — all three families verified loaded via `document.fonts.check(...)` per `03-typography.md`; full fallback stacks used, never bare family names
- [ ] **States audit** — loading, empty, and error states implemented with the exact Hebrew copy pattern from the screen blueprint
- [ ] **Touch audit** — every tap target ≥ 44×44 px on mobile
- [ ] **Numeric audit** — plates, odometers, kilometers, IDs use the mono numeric style from `03-typography.md`
- [ ] **Reduced motion** — `prefers-reduced-motion` respected per `07-motion.md`

## Scope

Responsive web only (mobile-first, breakpoints in `04-layout.md`). No native app targets. One codebase, one token set, two theme contexts.
