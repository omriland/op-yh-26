import { describe, expect, it } from 'vitest'
import {
  extractPlistXmlFromPkcs7Body,
  parseEnrollAttributes,
} from '../../supabase/functions/_shared/iosEnrollPlist'

const SAMPLE_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>UDID</key>
	<string>00008140-000210E00CBB801C</string>
	<key>PRODUCT</key>
	<string>iPhone17,1</string>
	<key>VERSION</key>
	<string>22A3354</string>
	<key>DEVICE_NAME</key>
	<string>iPhone של עמרי</string>
</dict>
</plist>`

describe('extractPlistXmlFromPkcs7Body', () => {
  it('extracts an embedded plist span', () => {
    const wrapped = `garbage-prefix${SAMPLE_PLIST}trailing`
    const xml = extractPlistXmlFromPkcs7Body(wrapped)
    expect(xml).toContain('<key>UDID</key>')
    expect(xml).toContain('</plist>')
  })

  it('returns null when no plist is present', () => {
    expect(extractPlistXmlFromPkcs7Body('no plist here')).toBeNull()
  })
})

describe('parseEnrollAttributes', () => {
  it('reads UDID and device fields', () => {
    expect(parseEnrollAttributes(SAMPLE_PLIST)).toEqual({
      udid: '00008140-000210E00CBB801C',
      product: 'iPhone17,1',
      version: '22A3354',
      deviceName: 'iPhone של עמרי',
    })
  })

  it('returns null without UDID', () => {
    expect(parseEnrollAttributes('<plist><dict></dict></plist>')).toBeNull()
  })
})
