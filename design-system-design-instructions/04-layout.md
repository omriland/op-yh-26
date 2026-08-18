# 04 — Layout, Spacing, Geometry

## Spacing scale (4 px base — no values outside this list)

| Token | px | Typical use |
|---|---|---|
| `--space-1` | 4 | Icon-to-label gaps, stamp padding-block |
| `--space-2` | 8 | Chip padding-inline, tight in-row gaps |
| `--space-3` | 12 | Gap between ledger rows, input padding-inline |
| `--space-4` | 16 | Card padding (mobile), gap between form fields |
| `--space-5` | 20 | Card padding (desktop), button padding-inline |
| `--space-6` | 24 | Gap between cards, section padding (mobile) |
| `--space-8` | 32 | Section padding (desktop), gap between form sections |
| `--space-10` | 40 | Screen-title to content gap |
| `--space-12` | 48 | Page padding-block (desktop) |
| `--space-16` | 64 | Hero/login spacing only |

## Radii

| Token | px | Use |
|---|---|---|
| `--radius-sm` | 4 | Inputs, buttons, selects, table cells' selection |
| `--radius-md` | 8 | Cards, dialogs, sheets, toasts |
| `--radius-stamp` | 3 | Stamp chips only |
| `--radius-full` | 9999 | Avatars, and the 8px user-presence disc on משתמשים |

Documents are not bubbly. Nothing else is rounded except avatars and the user-presence disc. No pill buttons.

## Hairlines & borders

- **Hairline** (`1px solid var(--stroke-hairline)`) is the primary separation device: card outlines, list dividers, section rules, table row separators.
- **Strong stroke** (`1px solid var(--stroke-strong)`) only on interactive boundaries: inputs, neutral chips.
- **Dotted fill-in line** (`border-block-end: 1.5px dotted var(--stroke-strong)`) marks empty required fields and ledger leaders (see `06-components.md`).
- A section rule above form sections: hairline with the section heading sitting on it (heading has `--surface` background and `padding-inline-end: var(--space-3)`), like a ruled form.

## Elevation

Print is flat; elevation is rare and quiet.

| Level | Recipe | Use |
|---|---|---|
| 0 — flat | surface + hairline | Everything by default: cards, lists, panels |
| 1 — raised | `--surface-raised` + hairline (no shadow) | Cards on the page surface |
| 2 — overlay | surface-overlay/raised + hairline + `box-shadow: 0 8px 24px rgba(15, 27, 45, 0.16)` | Dialogs, menus, bottom sheets, toasts ONLY |

No other shadows exist. No colored shadows ever.

## Breakpoints

| Name | Range | Notes |
|---|---|---|
| Mobile | ≤ 640 px | Design here FIRST. Single column. |
| Tablet | 641–1024 px | Mobile layout with wider gutters unless a screen blueprint says otherwise |
| Desktop | ≥ 1025 px | Manager shell layouts activate (sidebar, tables). Chrome is Command; content is Field. |

## Page structure

- **Content max-width:** 1120 px, centered.
- **Form max-width:** 720 px (forms are documents; they don't stretch full-bleed).
- **Page padding-inline:** 16 px mobile, 24 px tablet, 32 px desktop.
- **Mobile shell:** top app bar (48 px, Command-ink in both themes) + content + bottom tab bar (56 px + safe-area) for primary navigation.
- **Nav item click:** always returns that section's root (list / library / hub), even if that item is already current — e.g. a report runner → דוחות library; fuel usage → ניהול דלק chooser. Back-from-detail inside a section is unchanged until the nav item is clicked.
- **Desktop Command chrome:** sidebar at the **inline-start** (right side in RTL), default 240 px wide (user-resizable 190–265 px via invisible edge handle; preference in `localStorage`), Command `--surface-page` with hairline at its inline-end; **content area beside it is Field** (`data-theme="field"` on `.shell__main`).
- **Grid:** single column mobile. Desktop uses CSS grid with `gap: var(--space-6)`; event detail uses the split defined in `screens/event-detail.md`.

## Density

One density. Do not add "compact mode". Tables on desktop use row height 48 px; mobile lists use card rows with `--space-4` padding.
