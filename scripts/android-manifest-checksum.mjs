#!/usr/bin/env node
/**
 * Refreshes apkSha256 / apkSizeBytes in public/android/version.json for the APK
 * that apkUrl points at. The Android app verifies both before installing an
 * in-app download, so a stale digest silently disables OTA updates.
 *
 * Usage: node scripts/android-manifest-checksum.mjs [--check]
 */
import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'public/android/version.json')
const checkOnly = process.argv.includes('--check')

function fail(message) {
  console.error(message)
  process.exit(1)
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

const apkName = String(manifest.apkUrl ?? '')
  .split('/')
  .pop()
if (!apkName || !apkName.endsWith('.apk')) {
  fail(`apkUrl in ${manifestPath} does not point at an .apk file`)
}

const apkPath = join(root, 'public/android', apkName)
const info = await stat(apkPath).catch(() => null)
if (!info) fail(`Missing APK: ${apkPath}`)

const bytes = await readFile(apkPath)
const sha256 = createHash('sha256').update(bytes).digest('hex')

if (checkOnly) {
  const stale = manifest.apkSha256 !== sha256 || manifest.apkSizeBytes !== info.size
  if (stale) {
    fail(
      `version.json is stale for ${apkName}.\n` +
        `  expected apkSha256 ${sha256}\n` +
        `  expected apkSizeBytes ${info.size}\n` +
        'Run: npm run android:checksum',
    )
  }
  console.log(`version.json matches ${apkName}`)
  process.exit(0)
}

const updated = {
  minVersionCode: manifest.minVersionCode,
  latestVersionCode: manifest.latestVersionCode,
  latestVersionName: manifest.latestVersionName,
  apkUrl: manifest.apkUrl,
  apkSha256: sha256,
  apkSizeBytes: info.size,
  messageHe: manifest.messageHe ?? '',
}
await writeFile(manifestPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
console.log(`${apkName}: sha256 ${sha256}, ${info.size} bytes`)
