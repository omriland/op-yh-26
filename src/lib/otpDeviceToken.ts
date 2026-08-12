export const OTP_DEVICE_STORAGE_KEY = 'yahpaz:otp_device'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  if (typeof globalThis.localStorage === 'undefined') return null
  return globalThis.localStorage
}

export function readOtpDeviceToken(storage: StorageLike | null = defaultStorage()): string | null {
  if (!storage) return null
  const raw = storage.getItem(OTP_DEVICE_STORAGE_KEY)
  if (raw == null || raw.trim() === '') return null
  return raw
}

export function writeOtpDeviceToken(
  token: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return
  const trimmed = token.trim()
  if (!trimmed) return
  storage.setItem(OTP_DEVICE_STORAGE_KEY, trimmed)
}

export function clearOtpDeviceToken(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  storage.removeItem(OTP_DEVICE_STORAGE_KEY)
}
