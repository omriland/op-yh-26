/** Extract Profile Service payload attributes from an iOS enroll PKCS#7 body. */

export type EnrollAttributes = {
  udid: string
  product: string | null
  version: string | null
  deviceName: string | null
}

/** Locate the enclosed XML plist inside a PKCS#7 / CMS envelope (span parse). */
export function extractPlistXmlFromPkcs7Body(body: string): string | null {
  const start = body.indexOf('<?xml')
  if (start < 0) return null
  const end = body.lastIndexOf('</plist>')
  if (end < 0 || end < start) return null
  return body.slice(start, end + '</plist>'.length)
}

function plistStringAfterKey(xml: string, key: string): string | null {
  const re = new RegExp(
    `<key>${key}</key>\\s*<string>([^<]*)</string>`,
    'i',
  )
  const match = xml.match(re)
  if (!match) return null
  const value = match[1]?.trim() ?? ''
  return value || null
}

export function parseEnrollAttributes(plistXml: string): EnrollAttributes | null {
  const udid = plistStringAfterKey(plistXml, 'UDID')
  if (!udid) return null
  return {
    udid,
    product: plistStringAfterKey(plistXml, 'PRODUCT'),
    version: plistStringAfterKey(plistXml, 'VERSION'),
    deviceName: plistStringAfterKey(plistXml, 'DEVICE_NAME'),
  }
}
