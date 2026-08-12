# 06 — Components

Every component below must render correctly in both theme contexts using semantic tokens only. All interactive states are mandatory. Measurements are exact.

---

## Buttons

Font: `--type-body-strong`. Radius: `--radius-sm`. Height: 44 px mobile, 40 px desktop. Padding-inline: `--space-5`. Icon (optional, 20 px) sits at inline-start with `--space-2` gap. Min-width 96 px except icon-only (44×44).

| Variant | Field theme | Command theme |
|---|---|---|
| **Primary** | fill `--accent`, text `--text-on-accent` | fill `--accent-fill`, text `#FFFFFF` |
| **Secondary** | transparent, `1px solid var(--stroke-strong)`, text `--text-primary` | same recipe with Command tokens |
| **Ghost** | transparent, text `--accent`, no border | same |
| **Destructive** | fill `--status-alert`, text white | outline `--status-alert`, text `--status-alert` (dark bg keeps red as ink, not fill) |

States (all variants):

- **Hover** (pointer devices only): primary → `--accent-hover` fill; secondary/ghost → background `--accent-subtle`.
- **Focus-visible**: 2px ring `--accent`, offset 2px (see `08-accessibility.md`).
- **Active**: translateY(1px), no color change.
- **Disabled**: 40% opacity, no pointer events. Never remove the label.
- **Loading**: label swaps to 16 px spinner + the in-progress verb (`שומר…`); width locked to pre-loading width.

One primary button per view section, maximum.

---

## Text input / Textarea

Structure: label above (`--type-label`, `--text-secondary`, margin-block-end `--space-1`) → field → helper/error line below (`--type-caption`).

Field: height 44 px (textarea min-height 96 px), radius `--radius-sm`, background `--surface-raised`, border `1px solid var(--stroke-strong)`, padding-inline `--space-3`, text `--type-body` / `--text-primary`. Placeholder: `--text-muted`, phrased as an example (`למשל: כביש 6 צפון`), never a duplicate of the label.

| State | Spec |
|---|---|
| **Empty + required** | border-block-end becomes `1.5px dotted var(--accent)` — the "blank on the form" signature. Disappears once filled. |
| **Focus** | border `1px solid var(--accent)` + 2px focus ring |
| **Error** | border `--status-alert`; error line in `--status-alert` text with the fix, e.g. `יש להזין מספר לוחית` |
| **Disabled / read-only** | background `--surface-sunken`, no border change, text `--text-primary` (read-only data is still primary data) |

Numeric fields (odometer, ק״מ, plate): value in `--type-numeric`; `inputmode="numeric"`; plate inputs are LTR isolates.

## Select / Combobox

Same field chrome as text input. Chevron (mirrored — points down always, but positioned at inline-end). Options menu: elevation-2 overlay, item height 44 px, selected item gets `--accent-subtle` bg + `--accent` text + check icon at inline-end. Closed lists (שלוחה, סוג אירוע, כביש, סוג רכב) are always selects fed by admin data — never free text.

## Date input

Field chrome + calendar icon at inline-end. Display format `DD.MM.YYYY`. Default value = today for new events.

## Counter stepper (רכבים שטופלו)

Row: vehicle-kind label at inline-start; stepper at inline-end: `[−] value [+]` — buttons 36×36, radius `--radius-sm`, secondary-button chrome; value in `--type-numeric-lg`, min-width 40 px, centered. Zero renders value in `--text-muted`. Long-press does not accelerate (counts are small).

## Checkbox / Toggle

Checkbox: 20×20, radius 3, `--stroke-strong` border; checked = `--accent` fill + white check. Toggle (boolean fields like אמצעים): track 40×24 radius-full exception (it's a control, not a container), thumb 20 px; on = `--accent` track. Label at inline-start of the control, gap `--space-2`, entire row tappable (min 44 px).

---

## Stamp chip (THE signature — get this exact)

Statuses only. Never for categories, roles, or counts.

- `--type-stamp` (12/16, 700, letter-spacing 0.06em)
- Padding: 4px 10px. Radius: `--radius-stamp` (3px).
- Border: `1.5px solid` status ink. Text: status ink. Background: status tint (Field) / status ink at exactly 8% opacity over the local surface (Command — higher opacities wash out the text; alert text on its Command tint uses `--status-alert-on-tint`).
- Corners: `border-start-end-radius: 1px` — one slightly crushed corner, the imperfection of a real stamp. Subtle; if it's noticeable at a glance it's too much.
- **Header stamp** (event-detail title area only): scale up to `--type-label` sizing, padding 6px 14px, `transform: rotate(-8deg)`. The tilt must read as an intentional rubber stamp — not a slight skew that looks like a layout bug. This is the ONLY rotated element in the system.

| Status label | Ink |
|---|---|
| `הושלם` | `--status-done` |
| `תועד חלקית` | `--status-partial` |
| `הוזן - ממתין לתיעוד` | `--status-pending` |
| `ממתין לתיעוד שלך` / `ממתין לכונן` | `--status-pending` |
| `אירוע בהזנה` | `--status-draft` + `border-style: dashed` |

## Ledger row (read-only data display)

The default way to show any label/value pair on detail screens.

```
שם השדה ······················· הערך
```

- Row: `display: flex; justify-content: space-between; align-items: baseline;` min-height 32 px.
- Label: `--type-label`, `--text-secondary`, at inline-start.
- Leader: flexible middle element, `border-block-end: 1px dotted var(--stroke-hairline)`, margin-inline `--space-2`, aligned to text baseline.
- Value: `--type-body` `--text-primary` at inline-end; numeric values use `--type-numeric`.
- Missing value: `—` in `--text-muted` (never blank).

## Form section

Groups fields under a rule: hairline spanning full width; heading (`--type-section`) sits ON the rule at inline-start (background = the panel behind it — `--surface-raised` on cards/forms, `--surface-overlay` inside dialogs — never a mismatched page tint, padding-inline-end `--space-3`). Fields stack below with `--space-4` gaps; sections separated by `--space-8`. Optional section counter (`חלק ב׳`, `--font-display` / Plex Sans Hebrew 700) only on the event form where the paper-form metaphor is explicit.

---

## Cards

Base: `--surface-raised`, hairline outline, radius `--radius-md`, padding `--space-4` (mobile) / `--space-5` (desktop). No shadow (elevation 1).

**Event card** (list item): 
- Row 1: event type (`--type-section`) at inline-start + stamp chip at inline-end.
- Row 2: road + location, `--type-body`, `--text-secondary`.
- Row 3 (`--type-caption`, `--text-muted`): date · שלוחה · מספר אירוע (mono).
- Entire card is one tap target; pressed state = `--surface-sunken` flash. Chevron NOT needed (the card is obviously tappable; keep it clean).

**Responder card** (inside event detail): header row = avatar (28 px) + name + callsign (mono, caption) + stamp at inline-end; body = ledger rows of that responder's fields. When it's the viewer's own open card, a primary button `השלמת הפרטים שלי` sits at the card footer, full-width on mobile.

## Table (Command desktop only)

Header row: `--surface-sunken`, `--type-label` `--text-secondary`, height 40 px. Body rows: height 48 px, hairline separators, `--type-body`. Numeric columns `--type-numeric` aligned inline-end. Row hover: `--accent-subtle`. Row click opens detail. Mobile NEVER gets tables — same data renders as cards.

---

## Navigation

**Top app bar** (all contexts): height 48 px, ALWAYS Command navy (`#182A47` = Command `--surface-page`, text `#F2F6FA`) even in Field theme — the constant institutional band. Contains: wordmark at inline-start — desktop `היחידה הארצית לפינוי צירים` (IBM Plex Sans Hebrew 700, 15 px, ellipsis if needed); mobile `יחפ״צ` (18 px) — user menu at inline-end. Hairline bottom rule `rgba(242,246,250,0.15)`.

**Bottom tab bar** (mobile): height 56 px + `env(safe-area-inset-bottom)`, `--surface-raised`, top hairline. 3–4 tabs by role (see screen blueprints). Tab: icon 24 px + `--type-caption` label; active = `--accent` icon+label + 2px top indicator bar; inactive = `--text-muted`. No badges with counts unless a blueprint says so.

**Sidebar** (desktop Command): 240 px at inline-start. Nav item: height 40 px, radius `--radius-sm`, icon 20 + label `--type-body`, gap `--space-3`, padding-inline `--space-3`. Active: `--accent-subtle` bg + `--accent` text + 2px inline-start indicator. Section labels (`--type-label`, `--text-muted`) between groups.

---

## Dialog / Bottom sheet

Desktop: dialog, max-width 480 px (forms 640 px), radius `--radius-md`, elevation 2, backdrop `rgba(10, 18, 30, 0.55)`. Mobile: bottom sheet, full-width, top radius `--radius-md`, drag handle (32×4, `--stroke-strong`, radius-full) centered at top. Title `--type-section`. Footer: actions at inline-end (desktop) / stacked full-width primary-on-top (mobile). Destructive confirmations state the object: `למחוק את האירוע 12345?` with `מחיקה` (destructive) / `ביטול` (secondary).

## Toast

Position: **top-center mobile** (under the app bar, page gutters `--space-4`, stack centered with flex — never `translateX` centering, which breaks RTL), **bottom-inline-start desktop**. Elevation 2, radius `--radius-md`, padding `--space-3` `--space-4`, max-width 360 px (on phones this reads as a near-full-width banner). Always Command navy chrome (`#2A4168` = Command `--surface-overlay`, text `#F2F6FA`) in both themes + 3px inline-start bar in the Command-theme status color + icon. Motion: enter `translateY(−8px)→0` + opacity (`--duration-base`); exit opacity only. Auto-dismiss 4s (errors 6s, with close button — mobile hit target 44×44). Copy: past-tense confirmation (`האירוע נשמר`).

## Empty state

Centered in content area: icon 40 px `--text-muted` (outline, from the icon set — no illustrations), heading `--type-section`, one caption line, optional primary action. Max-width 320 px. Copy per screen blueprint.

## Skeleton / Loading

Skeleton blocks: `--surface-sunken`, radius `--radius-sm`, shimmer via opacity pulse 0.6→1 (no gradient sweep). Shape mirrors the real component (card skeletons for lists, ledger-row skeletons for details). Full-screen spinners are forbidden; skeletons only. Button-level loading per button spec.

## Avatar

Initials on `--accent-subtle` bg, `--accent` text, `--type-label`. Sizes: 28 (cards), 32 (bars), 40 (admin lists). Radius-full. No photos in v1.
