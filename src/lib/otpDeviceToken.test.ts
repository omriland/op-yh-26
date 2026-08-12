import { describe, expect, it } from 'vitest'
import {
  OTP_DEVICE_STORAGE_KEY,
  clearOtpDeviceToken,
  readOtpDeviceToken,
  writeOtpDeviceToken,
} from './otpDeviceToken'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}

describe('otpDeviceToken', () => {
  it('reads null when missing', () => {
    const storage = memoryStorage()
    expect(readOtpDeviceToken(storage)).toBeNull()
  })

  it('writes and reads a token', () => {
    const storage = memoryStorage()
    writeOtpDeviceToken('abc123', storage)
    expect(readOtpDeviceToken(storage)).toBe('abc123')
    expect(storage.getItem(OTP_DEVICE_STORAGE_KEY)).toBe('abc123')
  })

  it('clears the token', () => {
    const storage = memoryStorage()
    writeOtpDeviceToken('abc123', storage)
    clearOtpDeviceToken(storage)
    expect(readOtpDeviceToken(storage)).toBeNull()
  })

  it('ignores empty writes', () => {
    const storage = memoryStorage()
    writeOtpDeviceToken('   ', storage)
    expect(readOtpDeviceToken(storage)).toBeNull()
  })
})
