export type PasswordRule = 'minLength' | 'uppercase' | 'symbol'

export type PasswordStrengthResult =
  | { ok: true }
  | { ok: false; missing: PasswordRule[] }

const MIN_LENGTH = 8
const UPPERCASE = /[A-Z]/
/** Punctuation / special only — digits do not count. */
const SYMBOL = /[^A-Za-z0-9]/

const RULE_LABELS: Record<PasswordRule, string> = {
  minLength: '8 תווים לפחות',
  uppercase: 'אות גדולה',
  symbol: 'תו מיוחד (למשל !)',
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const missing: PasswordRule[] = []
  if (password.length < MIN_LENGTH) missing.push('minLength')
  if (!UPPERCASE.test(password)) missing.push('uppercase')
  if (!SYMBOL.test(password)) missing.push('symbol')
  if (missing.length === 0) return { ok: true }
  return { ok: false, missing }
}

/** Hebrew error listing only failed rules, or null when valid. */
export function passwordStrengthError(password: string): string | null {
  const result = validatePasswordStrength(password)
  if (result.ok) return null

  const labels = result.missing.map((rule) => RULE_LABELS[rule])
  return `הסיסמה אינה עומדת בדרישות. יש לכלול: ${formatHebrewList(labels)}.`
}

function formatHebrewList(items: string[]): string {
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} ו${items[1]}`
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`
}
