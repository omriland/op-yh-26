#!/usr/bin/env node
/**
 * Removes the App Review demo account, its demo events/shift, the reviewer's
 * feedback and uploaded files, and the local password file. Prints the
 * reviewer's feedback first. Same safety gates as create-app-review-demo.mjs.
 *
 *   node scripts/app-review-demo/remove-app-review-demo.mjs --target local --dry-run
 *   APP_REVIEW_DEMO_ALLOW=1 node scripts/app-review-demo/remove-app-review-demo.mjs \
 *     --target production --confirm-production
 */

import { createClient } from '@supabase/supabase-js'
import { parseCli, resolveTarget, teardown } from './lib.mjs'

try {
  const cli = parseCli(process.argv.slice(2))
  const target = resolveTarget(cli, process.env)
  const admin = createClient(target.url, target.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await teardown({ admin, cli, target, log: console.log })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
