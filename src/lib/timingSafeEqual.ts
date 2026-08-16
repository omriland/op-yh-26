const encoder = new TextEncoder()

/** Constant-time string compare (CWE-208). Works in the browser — no Node crypto. */
export function timingSafeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const len = Math.max(a.length, b.length)
  let mismatch = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return mismatch === 0
}
