// Run: OPENAI_API_KEY=... SMART_SEARCH_MODEL=... node scripts/smart-search/run-golden.ts
// Calls OpenAI directly with the production prompt and schema. Not part of `npm test`.
import { readFileSync } from 'node:fs'
import { validateSmartSearchFilter, smartSearchJsonSchema } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import type { SmartSearchFilter, SmartSearchVocab } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import { buildSmartSearchMessages } from '../../supabase/functions/_shared/smartSearchPrompt.ts'

const apiKey = process.env.OPENAI_API_KEY
const model = process.env.SMART_SEARCH_MODEL
if (!apiKey || !model) {
  console.error('Set OPENAI_API_KEY and SMART_SEARCH_MODEL in the environment.')
  process.exit(1)
}

type Golden = {
  vocab: SmartSearchVocab
  cases: { q: string; today: string; expect: Partial<SmartSearchFilter> }[]
}
const golden: Golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'))

let passed = 0
for (const c of golden.cases) {
  let got: SmartSearchFilter | undefined
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: buildSmartSearchMessages(c.q, c.today, golden.vocab),
        response_format: { type: 'json_schema', json_schema: smartSearchJsonSchema(golden.vocab) },
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`)
    const body = await res.json()
    got = validateSmartSearchFilter(JSON.parse(body.choices[0].message.content), golden.vocab)
  } catch (err) {
    console.log(`FAIL  ${c.q}  (${err instanceof Error ? err.message : err})`)
    continue
  }
  const wrong = Object.entries(c.expect).filter(
    ([k, v]) => got[k as keyof SmartSearchFilter] !== v,
  )
  if (wrong.length === 0) {
    passed++
    console.log(`PASS  ${c.q}`)
  } else {
    console.log(`FAIL  ${c.q}`)
    for (const [k, v] of wrong) console.log(`        ${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got[k as keyof SmartSearchFilter])}`)
  }
}
console.log(`\n${passed}/${golden.cases.length} (${Math.round((100 * passed) / golden.cases.length)}%)`)
