#!/usr/bin/env node
/**
 * Contrast verification for the "רשומה" design system.
 *
 * Every pairing declared in design-system-design-instructions/02-color.md is
 * checked here. Run after ANY color change:  node scripts/contrast-check.mjs
 * If you compose a pairing that is not listed, add it before shipping.
 *
 * Thresholds (08-accessibility.md): text 4.5:1, large text 3:1,
 * meaning-bearing UI boundaries 3:1.
 */

// ---------- palette (must mirror src/styles/tokens.css) ----------

const P = {
  ink900: '#0F1B2D',
  ink500: '#445A73',
  ink400: '#5B6F86',
  paper0: '#FFFFFF',
  paper50: '#F6F8FA',
  paper100: '#EDF1F5',
  navySunken: '#122036',
  navyPage: '#182A47',
  navyRaised: '#213656',
  navyOverlay: '#2A4168',
  blue800: '#17416E',
  blue700: '#1D4E89',
  blue600: '#2E6CB4',
  blue300: '#8FBCEB',
  blue200: '#A9CDF2',
  blue50: '#EDF4FB',
  greenField: '#2E7D5B',
  greenFieldTint: '#E3F1EA',
  greenFieldOnTint: '#215C43',
  greenCommand: '#66C79B',
  redField: '#B3382F',
  redFieldTint: '#F9E9E7',
  redFieldOnTint: '#93291F',
  redCommand: '#EF8177',
  redCommandOnTint: '#F6A29A',
  amberField: '#B07C24',
  amberFieldTint: '#F7EEDC',
  amberFieldOnTint: '#7A5410',
  amberCommand: '#E0B05C',
  commandText: '#F2F6FA',
  commandTextSecondary: '#C3CEDC',
  commandTextMuted: '#9FB0C4',
  plateField: '#F5C400',
}

const STROKE_STRONG_FIELD = rgba(15, 27, 45, 0.55)
const STROKE_STRONG_COMMAND = rgba(242, 246, 250, 0.45)
const ACCENT_SUBTLE_COMMAND = rgba(143, 188, 235, 0.14)

/** Command status tints are exactly 8% of the ink over the local surface. */
const tint8 = (ink, surface) => over(withAlpha(ink, 0.08), surface)

// ---------- color math ----------

function hexToRgb(hex) {
  const v = hex.replace('#', '')
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ]
}

function rgba(r, g, b, a) {
  return { rgb: [r, g, b], a }
}

/** Accepts '#RRGGBB', an [r,g,b] triple, or an {rgb, a} record. */
function toRgb(color) {
  if (typeof color === 'string') return hexToRgb(color)
  return Array.isArray(color) ? color : color.rgb
}

function withAlpha(color, a) {
  return { rgb: toRgb(color), a }
}

/** Composite a possibly-translucent color over an opaque surface. */
function over(color, surface) {
  const base = toRgb(surface)
  if (typeof color === 'string' || Array.isArray(color)) return toRgb(color)
  const { rgb, a } = color
  return rgb.map((c, i) => c * a + base[i] * (1 - a))
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg, bg) {
  const bgRgb = toRgb(bg)
  const fgRgb = over(fg, bgRgb)
  const [hi, lo] = [luminance(fgRgb), luminance(bgRgb)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

// ---------- declared pairings ----------

const TEXT = 4.5
const UI = 3

const pairs = []
const pair = (theme, name, fg, bg, min) => pairs.push({ theme, name, fg, bg, min })

// ===== שטח / Field =====
const F = { page: P.paper50, raised: P.paper0, sunken: P.paper100 }

for (const [surface, bg] of Object.entries(F)) {
  pair('field', `text-primary on ${surface}`, P.ink900, bg, TEXT)
  pair('field', `text-secondary on ${surface}`, P.ink500, bg, TEXT)
}
// text-muted is captions/placeholders/timestamps — it never sits on --surface-sunken
// (wells hold read-only values in --text-primary; table headers use --text-secondary).
pair('field', 'text-muted on page', P.ink400, F.page, TEXT)
pair('field', 'text-muted on raised', P.ink400, F.raised, TEXT)

pair('field', 'text-on-accent on accent', P.paper0, P.blue700, TEXT)
pair('field', 'text-on-accent on accent-hover', P.paper0, P.blue800, TEXT)
pair('field', 'accent on page', P.blue700, F.page, TEXT)
pair('field', 'accent on raised', P.blue700, F.raised, TEXT)
pair('field', 'accent on accent-subtle', P.blue700, P.blue50, TEXT)
pair('field', 'stroke-strong over page', STROKE_STRONG_FIELD, F.page, UI)
pair('field', 'stroke-strong over raised', STROKE_STRONG_FIELD, F.raised, UI)

pair('field', 'status-done ink on raised', P.greenField, F.raised, TEXT)
pair('field', 'status-alert ink on raised', P.redField, F.raised, TEXT)
pair('field', 'stamp done: on-tint text', P.greenFieldOnTint, P.greenFieldTint, TEXT)
pair('field', 'stamp done: ink border', P.greenField, P.greenFieldTint, UI)
pair('field', 'stamp alert: on-tint text', P.redFieldOnTint, P.redFieldTint, TEXT)
pair('field', 'stamp alert: ink border', P.redField, P.redFieldTint, UI)
pair('field', 'stamp partial: on-tint text', P.amberFieldOnTint, P.amberFieldTint, TEXT)
pair('field', 'stamp partial: ink border', P.amberField, P.amberFieldTint, UI)
pair('field', 'stamp pending: text', P.blue700, P.blue50, TEXT)
pair('field', 'stamp pending: ink border', P.blue700, P.blue50, UI)
pair('field', 'stamp draft: text on raised', P.ink400, F.raised, TEXT)
pair('field', 'stamp draft: dashed border', P.ink400, F.raised, UI)

// ===== מפקדה / Command =====
const C = {
  page: P.navyPage,
  raised: P.navyRaised,
  sunken: P.navySunken,
  overlay: P.navyOverlay,
}

for (const [surface, bg] of Object.entries(C)) {
  pair('command', `text-primary on ${surface}`, P.commandText, bg, TEXT)
  pair('command', `text-secondary on ${surface}`, P.commandTextSecondary, bg, TEXT)
  pair('command', `text-muted on ${surface}`, P.commandTextMuted, bg, TEXT)
}

pair('command', 'accent on page', P.blue300, C.page, TEXT)
pair('command', 'accent on raised', P.blue300, C.raised, TEXT)
pair('command', 'accent on accent-subtle', P.blue300, over(ACCENT_SUBTLE_COMMAND, C.raised), TEXT)
pair('command', 'accent-hover on raised', P.blue200, C.raised, TEXT)
pair('command', 'text-on-accent on accent-fill', P.paper0, P.blue600, TEXT)
pair('command', 'stroke-strong over page', STROKE_STRONG_COMMAND, C.page, UI)
pair('command', 'stroke-strong over raised', STROKE_STRONG_COMMAND, C.raised, UI)

for (const [surface, bg] of [
  ['raised', C.raised],
  ['page', C.page],
]) {
  pair('command', `status-done ink on ${surface}`, P.greenCommand, bg, TEXT)
  pair('command', `status-partial ink on ${surface}`, P.amberCommand, bg, TEXT)
  pair('command', `status-alert ink on ${surface}`, P.redCommand, bg, TEXT)
  // Stamps: ink text on its own 8% tint (alert swaps to the dedicated lighter value).
  pair('command', `stamp done on ${surface}`, P.greenCommand, tint8(P.greenCommand, bg), TEXT)
  pair('command', `stamp partial on ${surface}`, P.amberCommand, tint8(P.amberCommand, bg), TEXT)
  pair('command', `stamp alert on ${surface}`, P.redCommandOnTint, tint8(P.redCommand, bg), TEXT)
  pair('command', `stamp alert border on ${surface}`, P.redCommand, tint8(P.redCommand, bg), UI)
  pair('command', `stamp pending on ${surface}`, P.blue300, tint8(P.blue300, bg), TEXT)
  pair('command', `stamp draft on ${surface}`, P.commandTextMuted, tint8(P.commandTextMuted, bg), TEXT)
}

// Chrome that is Command navy in BOTH themes (06-components.md).
pair('command', 'top app bar text', P.commandText, P.navyPage, TEXT)
pair('command', 'toast text', P.commandText, P.navyOverlay, TEXT)

// Israeli civil plate mark — theme-invariant (02-color.md).
pair('artifact', 'plate serial on yellow', P.ink900, P.plateField, TEXT)
pair('artifact', 'IL letters on euroband', P.paper0, P.blue800, TEXT)

// ---------- known traps: these MUST fail (08-accessibility.md) ----------

const traps = [
  {
    name: 'amber ink as text on white (use --status-partial-on-tint)',
    ratio: contrast(P.amberField, P.paper0),
    min: TEXT,
  },
  {
    name: 'Command alert ink on its own tint (use --status-alert-on-tint)',
    ratio: contrast(P.redCommand, tint8(P.redCommand, C.raised)),
    min: TEXT,
  },
  {
    name: 'Command tint at 16% washes out its ink',
    ratio: contrast(P.greenCommand, over(withAlpha(P.greenCommand, 0.16), C.raised)),
    min: TEXT,
  },
  {
    name: 'Field stroke-strong at 0.30 opacity',
    ratio: contrast(rgba(15, 27, 45, 0.3), P.paper0),
    min: UI,
  },
]

// ---------- report ----------

let failed = 0
let currentTheme = ''

for (const { theme, name, fg, bg, min } of pairs) {
  if (theme !== currentTheme) {
    currentTheme = theme
    const heading =
      theme === 'field' ? 'שטח / Field' : theme === 'command' ? 'מפקדה / Command' : 'Artifact'
    console.log(`\n${heading}`)
  }
  const ratio = contrast(fg, bg)
  const ok = ratio >= min
  if (!ok) failed++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)}:1  (min ${min})  ${name}`,
  )
}

console.log('\nKnown traps (must NOT pass)')
for (const { name, ratio, min } of traps) {
  const stillFails = ratio < min
  if (!stillFails) failed++
  console.log(
    `  ${stillFails ? 'OK  ' : 'LEAK'}  ${ratio.toFixed(2).padStart(5)}:1  (min ${min})  ${name}`,
  )
}

console.log(
  failed === 0
    ? `\nAll ${pairs.length} declared pairings pass.\n`
    : `\n${failed} problem(s) found.\n`,
)
process.exit(failed === 0 ? 0 : 1)
