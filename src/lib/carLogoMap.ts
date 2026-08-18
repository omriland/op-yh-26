/** Hebrew (and Latin) manufacturer → car-logos-dataset slug. Longest keys first. */

const COUNTRY_SUFFIXES = [
  'גרמניה',
  'גרמנ',
  'ד.קור',
  'דקור',
  'קוריאה',
  'יפן',
  'סין',
  'צרפת',
  'איטליה',
  'אנגליה',
  'בריטניה',
  'ארהב',
  'ארה"ב',
  'ארצות הברית',
  'צכיה',
  'צ׳כיה',
  'ספרד',
  'שבדיה',
  'שוודיה',
  'הודו',
  'תאילנד',
  'מקסיקו',
  'טורקיה',
  'רומניה',
  'סלובקיה',
]

/** Longest-first Hebrew / mixed keys. */
const HEBREW_BRANDS: ReadonlyArray<readonly [string, string]> = [
  ['אלפא רומיאו', 'alfa-romeo'],
  ['לנד רובר', 'land-rover'],
  ['מרצדס בנץ', 'mercedes-benz'],
  ['מרצדס', 'mercedes-benz'],
  ['פולקסווגן', 'volkswagen'],
  ['סאנגיונג', 'ssangyong'],
  ['מיצובישי', 'mitsubishi'],
  ['שברולט', 'chevrolet'],
  ['סיטרואן', 'citroen'],
  ['פיג׳ו', 'peugeot'],
  ["פיג'ו", 'peugeot'],
  ['רנו', 'renault'],
  ['טויוטה', 'toyota'],
  ['יונדאי', 'hyundai'],
  ['ג׳נסיס', 'genesis'],
  ["ג'נסיס", 'genesis'],
  ['לקסוס', 'lexus'],
  ['אינפיניטי', 'infiniti'],
  ['סובארו', 'subaru'],
  ['הונדה', 'honda'],
  ['ניסאן', 'nissan'],
  ['מאזדה', 'mazda'],
  ['סוזוקי', 'suzuki'],
  ['איסוזו', 'isuzu'],
  ['סקודה', 'skoda'],
  ['סיאט', 'seat'],
  ['קופרה', 'cupra'],
  ['אאודי', 'audi'],
  ['פורשה', 'porsche'],
  ['וולוו', 'volvo'],
  ['יגואר', 'jaguar'],
  ['פיאט', 'fiat'],
  ['אופל', 'opel'],
  ['פורד', 'ford'],
  ['דאצ׳יה', 'dacia'],
  ["דאצ'יה", 'dacia'],
  ['טסלה', 'tesla'],
  ['קרייזלר', 'chrysler'],
  ['דודג׳', 'dodge'],
  ["דודג'", 'dodge'],
  ['ג׳יפ', 'jeep'],
  ["ג'יפ", 'jeep'],
  ['ג׳ילי', 'geely'],
  ["ג'ילי", 'geely'],
  ['צ׳רי', 'chery'],
  ["צ'רי", 'chery'],
  ['צרי', 'chery'],
  ['בי.ווי.די', 'byd'],
  ['ביווידי', 'byd'],
  ['סמארט', 'smart'],
  ['מיני', 'mini'],
  ['אקורה', 'acura'],
  ['לינקולן', 'lincoln'],
  ['קדילאק', 'cadillac'],
  ['קיה', 'kia'],
  ['ב מ וו', 'bmw'],
  ['ב.מ.וו', 'bmw'],
  ['במוו', 'bmw'],
]

const LATIN_BRANDS: ReadonlyArray<readonly [string, string]> = [
  ['mercedes-benz', 'mercedes-benz'],
  ['mercedes', 'mercedes-benz'],
  ['volkswagen', 'volkswagen'],
  ['ssangyong', 'ssangyong'],
  ['mitsubishi', 'mitsubishi'],
  ['chevrolet', 'chevrolet'],
  ['land rover', 'land-rover'],
  ['land-rover', 'land-rover'],
  ['alfa romeo', 'alfa-romeo'],
  ['alfa-romeo', 'alfa-romeo'],
  ['citroen', 'citroen'],
  ['citroën', 'citroen'],
  ['peugeot', 'peugeot'],
  ['renault', 'renault'],
  ['toyota', 'toyota'],
  ['hyundai', 'hyundai'],
  ['genesis', 'genesis'],
  ['lexus', 'lexus'],
  ['infiniti', 'infiniti'],
  ['subaru', 'subaru'],
  ['honda', 'honda'],
  ['nissan', 'nissan'],
  ['mazda', 'mazda'],
  ['suzuki', 'suzuki'],
  ['isuzu', 'isuzu'],
  ['skoda', 'skoda'],
  ['škoda', 'skoda'],
  ['seat', 'seat'],
  ['cupra', 'cupra'],
  ['audi', 'audi'],
  ['porsche', 'porsche'],
  ['volvo', 'volvo'],
  ['jaguar', 'jaguar'],
  ['fiat', 'fiat'],
  ['opel', 'opel'],
  ['ford', 'ford'],
  ['dacia', 'dacia'],
  ['tesla', 'tesla'],
  ['chrysler', 'chrysler'],
  ['dodge', 'dodge'],
  ['jeep', 'jeep'],
  ['geely', 'geely'],
  ['chery', 'chery'],
  ['byd', 'byd'],
  ['smart', 'smart'],
  ['mini', 'mini'],
  ['acura', 'acura'],
  ['lincoln', 'lincoln'],
  ['cadillac', 'cadillac'],
  ['kia', 'kia'],
  ['bmw', 'bmw'],
  ['mg', 'mg'],
]

export function normalizeManufacturer(raw: string): string {
  let value = raw.trim().replace(/\s+/g, ' ')
  if (!value) return ''
  // Strip trailing country-ish tokens repeatedly.
  let changed = true
  while (changed) {
    changed = false
    for (const suffix of COUNTRY_SUFFIXES) {
      const re = new RegExp(`(?:\\s+|^)${escapeRegExp(suffix)}\\.?$`, 'u')
      if (re.test(value)) {
        value = value.replace(re, '').trim()
        changed = true
      }
    }
  }
  return value.replace(/[.,]+$/g, '').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function resolveCarLogoSlug(manufacturer: string | null | undefined): string | null {
  const normalized = normalizeManufacturer(manufacturer ?? '')
  if (!normalized) return null

  for (const [key, slug] of HEBREW_BRANDS) {
    if (normalized.includes(key)) return slug
  }

  const lower = normalized.toLowerCase()
  for (const [key, slug] of LATIN_BRANDS) {
    if (lower.includes(key)) return slug
  }

  return null
}

/** Slugs we vendor under public/car-logos/{slug}.png */
export const CURATED_CAR_LOGO_SLUGS: readonly string[] = [
  ...new Set([...HEBREW_BRANDS.map(([, s]) => s), ...LATIN_BRANDS.map(([, s]) => s)]),
].sort()
