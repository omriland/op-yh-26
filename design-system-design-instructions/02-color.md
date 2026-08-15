# 02 — Color

Every pairing declared in this file is machine-verified: run `node scripts/contrast-check.mjs` from the repo root (all pairs must PASS). If you change any value here, update that script in the same change.

## Theme contexts

The system ships **one token vocabulary with two value sets** ("theme contexts"):

- **שטח / Field** (`data-theme="field"`) — paper surfaces, ink text. Default for: all mobile widths, all responder-facing flows, login form panel.
- **מפקדה / Command** (`data-theme="command"`) — deep navy surfaces, paper text. Default for: shift-lead and admin views on desktop (≥1025 px), login hero panel, the top app bar in all contexts. The Command world is a **rich archival navy, not near-black** — it must feel like a records room with the lights on.

Components consume **semantic tokens only**. Theme switching = swapping the semantic layer; component code never branches on theme.

## Raw palette (never referenced directly in components)

### Ink ramp (blue-slate — the ink of the record; used as TEXT on Field)

| Token | Hex |
|---|---|
| `--ink-900` | `#0F1B2D` |
| `--ink-700` | `#22354E` |
| `--ink-500` | `#445A73` |
| `--ink-400` | `#5B6F86` |
| `--ink-300` | `#8B9CAF` |
| `--ink-100` | `#DDE4EB` |
| `--ink-50`  | `#EEF2F6` |

### Navy ramp (Command SURFACES — deliberately lighter than the ink ramp)

| Token | Hex | Role |
|---|---|---|
| `--navy-sunken` | `#122036` | Wells, table headers on Command |
| `--navy-page` | `#182A47` | Command page background, top app bar, login hero |
| `--navy-raised` | `#213656` | Command cards/panels |
| `--navy-overlay` | `#2A4168` | Command dialogs, menus, popovers |

### Paper

| Token | Hex |
|---|---|
| `--paper-0`   | `#FFFFFF` |
| `--paper-50`  | `#F6F8FA` |
| `--paper-100` | `#EDF1F5` |

Paper is always **cool** (blue-tinted). Never introduce warm/cream whites.

### Record blue (the single brand accent)

| Token | Hex |
|---|---|
| `--blue-800` | `#17416E` |
| `--blue-700` | `#1D4E89` ← anchor |
| `--blue-600` | `#2E6CB4` |
| `--blue-300` | `#8FBCEB` |
| `--blue-200` | `#A9CDF2` |
| `--blue-100` | `#DCE8F5` |
| `--blue-50`  | `#EDF4FB` |

### Status inks

| Meaning | Field ink | Field tint / text-on-tint | Command ink | Command tint / text-on-tint |
|---|---|---|---|---|
| Done / seal | `#2E7D5B` | `#E3F1EA` / `#215C43` | `#66C79B` | ink @ 8% on surface / `#66C79B` |
| Alert / archive red | `#B3382F` | `#F9E9E7` / `#93291F` | `#EF8177` | ink @ 8% on surface / `#F6A29A` |
| Partial / stamp amber | `#B07C24` | `#F7EEDC` / `#7A5410` | `#E0B05C` | ink @ 8% on surface / `#E0B05C` |

**Command tints are exactly 8% opacity of the status ink over the local surface — never more.** Higher opacities wash out the ink text (verified failure at 14–16%). Alert text on its own Command tint uses the dedicated lighter value `#F6A29A`.

## Semantic tokens

### שטח / Field theme

| Semantic token | Value | Use |
|---|---|---|
| `--surface-page` | `#F6F8FA` | Page background |
| `--surface-raised` | `#FFFFFF` | Cards, form panels, sheets |
| `--surface-sunken` | `#EDF1F5` | Wells, read-only field bg, table headers |
| `--text-primary` | `#0F1B2D` | Headings, values, body |
| `--text-secondary` | `#445A73` | Labels, supporting text |
| `--text-muted` | `#5B6F86` | Captions, placeholders, timestamps |
| `--text-on-accent` | `#FFFFFF` | Text on record-blue fills |
| `--accent` | `#1D4E89` | Primary buttons, links, active nav, focus |
| `--accent-hover` | `#17416E` | Hover on accent fills/links |
| `--accent-subtle` | `#EDF4FB` | Selected row bg, active nav bg |
| `--stroke-hairline` | `rgba(15, 27, 45, 0.12)` | Decorative rules, dividers, card outlines |
| `--stroke-strong` | `rgba(15, 27, 45, 0.55)` | Input borders, meaning-bearing boundaries (must hit 3:1 — verified at 0.55, FAILS below ~0.5) |
| `--status-done` / `-tint` / `-on-tint` | `#2E7D5B` / `#E3F1EA` / `#215C43` | |
| `--status-alert` / `-tint` / `-on-tint` | `#B3382F` / `#F9E9E7` / `#93291F` | |
| `--status-partial` / `-tint` / `-on-tint` | `#B07C24` / `#F7EEDC` / `#7A5410` | |
| `--status-pending` | `#1D4E89` | Pending/awaiting-me stamp ink |
| `--status-draft` | `#5B6F86` | Draft stamp ink |

### מפקדה / Command theme

| Semantic token | Value | Use |
|---|---|---|
| `--surface-page` | `#182A47` | Page background, top app bar, login hero |
| `--surface-raised` | `#213656` | Cards, panels |
| `--surface-sunken` | `#122036` | Wells, table headers |
| `--surface-overlay` | `#2A4168` | Dialogs, menus, popovers, toasts |
| `--text-primary` | `#F2F6FA` | |
| `--text-secondary` | `#C3CEDC` | |
| `--text-muted` | `#9FB0C4` | |
| `--text-on-accent` | `#FFFFFF` | Text on `--accent-fill` |
| `--accent` | `#8FBCEB` | Links, active nav, focus ring, ghost buttons |
| `--accent-fill` | `#2E6CB4` | Primary button fill (text: white) |
| `--accent-hover` | `#A9CDF2` | Hover on links/ghost |
| `--accent-subtle` | `rgba(143, 188, 235, 0.14)` | Selected row bg, active nav bg |
| `--stroke-hairline` | `rgba(242, 246, 250, 0.15)` | Decorative rules, dividers |
| `--stroke-strong` | `rgba(242, 246, 250, 0.45)` | Input borders, meaning-bearing boundaries |
| `--status-done` | `#66C79B` | Stamp ink |
| `--status-alert` | `#EF8177` | Stamp/error ink |
| `--status-alert-on-tint` | `#F6A29A` | Alert TEXT on alert tint |
| `--status-partial` | `#E0B05C` | |
| `--status-pending` | `#8FBCEB` | |
| `--status-draft` | `#9FB0C4` | |

Status tints on Command = `color-mix(in srgb, <status ink> 8%, var(--surface-raised))` (or rgba at 0.08 over the surface).

### Real-world artifact — Israeli civil plate (theme-invariant)

Used only for the profile vehicles plate mark. A physical plate does not invert with Field/Command.

| Semantic token | Value | Use |
|---|---|---|
| `--plate-field` | `#F5C400` | Plate yellow |
| `--plate-ink` | `#0F1B2D` | Serial (ink-900) |
| `--plate-band` | `#17416E` | IL euroband (blue-800) |
| `--plate-band-text` | `#FFFFFF` | `IL` letters + flag field |
| `--plate-flag` | `#17416E` | Flag stripes and star |

## Usage rules

- **One accent.** Record blue is the only interactive color. Green/red/amber appear exclusively in status semantics (stamps, validation, toasts) — never as decoration.
- **Status color mapping is fixed:** `done` → seal green · `partial` → stamp amber · `pending`/`in_progress` (awaiting input) → record blue · `draft` → muted ink · destructive/errors → archive red.
- **Hairline vs strong is a semantic split:** hairline (12–15%) is decoration and may be subtle; `--stroke-strong` marks interactive/meaning-bearing boundaries and MUST keep ≥3:1 — never reduce its opacity for aesthetics.
- **No gradients** anywhere. Flat, matte fills only.
- **Never place saturated color on saturated color.** Status inks sit on their theme's surfaces or their own tint, nothing else.
- Charts/data-viz (future): build from the ink/navy ramps + record blue first; introduce nothing new without updating this file AND the contrast script.
