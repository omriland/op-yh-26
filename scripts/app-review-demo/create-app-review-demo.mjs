#!/usr/bin/env node
/**
 * Creates or refreshes the App Review demo account and its demo data.
 * Idempotent. Read README.md in this folder first; production needs Omri's OK.
 *
 *   node scripts/app-review-demo/create-app-review-demo.mjs --target local --dry-run
 *   APP_REVIEW_DEMO_ALLOW=1 node scripts/app-review-demo/create-app-review-demo.mjs \
 *     --target production --confirm-production
 */

import { createClient } from '@supabase/supabase-js'
import { parseCli, provision, resolveTarget } from './lib.mjs'

try {
  const cli = parseCli(process.argv.slice(2))
  const target = resolveTarget(cli, process.env)
  const admin = createClient(target.url, target.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await provision({ admin, cli, target, log: console.log })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
