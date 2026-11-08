// Parser eval: the production prompt, schema and request against Claude, one call per query.
//   ANTHROPIC_API_KEY=... node scripts/smart-search/eval/run-eval.ts [--limit 10] [--filter סוזוקי]
// Not part of `npm test`; it spends real money (about $0.03 for the whole set at Haiku 5.5 prices).
// Checks per query: the raw reply matches the schema (every key, right types, closed lists),
// the expected keys came out right, and how long it took. Exits 1 on any schema failure.
import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { claudeRequestBody, parseClaudeFilter } from '../../../supabase/functions/_shared/smartSearchClaude.ts'
import {
  SMART_SEARCH_FILTER_KEYS,
  smartSearchJsonSchema,
  validateSmartSearchFilter,
} from '../../../supabase/functions/_shared/smartSearchFilter.ts'
import type { SmartSearchFilter, SmartSearchVocab } from '../../../supabase/functions/_shared/smartSearchFilter.ts'
import { buildSmartSearchPrompt } from '../../../supabase/functions/_shared/smartSearchPrompt.ts'

type EvalSet = {
  vocab: SmartSearchVocab
  cases: { q: string; today: string; expect: Partial<SmartSearchFilter> }[]
}

const args = process.argv.slice(2)
const arg = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY in the environment.')
  process.exit(1)
}

const set: EvalSet = JSON.parse(readFileSync(new URL('./queries.json', import.meta.url), 'utf8'))
const only = arg('--filter')
const limit = Number(arg('--limit') ?? Infinity)
const cases = set.cases.filter((c) => !only || c.q.includes(only)).slice(0, limit)
const schema = smartSearchJsonSchema(set.vocab)
const client = new Anthropic({ timeout: 5000, maxRetries: 0 })

/** The raw reply holds every key, with null or a value the validator keeps unchanged. */
function schemaProblems(raw: Record<string, unknown>): string[] {
  const problems: string[] = []
  for (const key of SMART_SEARCH_FILTER_KEYS) if (!(key in raw)) problems.push(`missing ${key}`)
  for (const key of Object.keys(raw))
    if (!(SMART_SEARCH_FILTER_KEYS as readonly string[]).includes(key)) problems.push(`extra ${key}`)
  const kept = validateSmartSearchFilter(raw, set.vocab) as Record<string, unknown>
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || key === 'plate') continue
    if (JSON.stringify(kept[key]) !== JSON.stringify(value)) problems.push(`${key}=${JSON.stringify(value)} rejected`)
  }
  return problems
}

const latencies: number[] = []
let correct = 0
let schemaFailures = 0
let refusals = 0
let inputTokens = 0
let outputTokens = 0

for (const c of cases) {
  const started = Date.now()
  let line: string
  try {
    const reply = await client.messages.create(
      claudeRequestBody(buildSmartSearchPrompt(c.q, c.today, set.vocab), schema),
    )
    latencies.push(Date.now() - started)
    inputTokens += reply.usage.input_tokens
    outputTokens += reply.usage.output_tokens
    const parsed = parseClaudeFilter(reply, set.vocab)
    if ('error' in parsed) {
      if (parsed.error === 'refusal') refusals++
      schemaFailures++
      console.log(`FAIL  ${c.q}  (${parsed.error})`)
      continue
    }
    const text = reply.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    const problems = schemaProblems(JSON.parse(text))
    if (problems.length > 0) schemaFailures++
    const wrong = Object.entries(c.expect).filter(
      ([k, v]) => JSON.stringify(parsed.filter[k as keyof SmartSearchFilter]) !== JSON.stringify(v),
    )
    if (wrong.length === 0 && problems.length === 0) correct++
    line = `${wrong.length === 0 && problems.length === 0 ? 'PASS' : 'FAIL'}  ${c.q}  ${Date.now() - started}ms`
    console.log(line)
    for (const p of problems) console.log(`        schema: ${p}`)
    for (const [k, v] of wrong)
      console.log(`        ${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(parsed.filter[k as keyof SmartSearchFilter])}`)
  } catch (err) {
    schemaFailures++
    const what =
      err instanceof Anthropic.APIConnectionTimeoutError
        ? 'timeout'
        : err instanceof Anthropic.APIError
          ? `HTTP ${err.status}`
          : err instanceof Error
            ? err.message
            : String(err)
    console.log(`FAIL  ${c.q}  (${what})`)
  }
}

const sorted = [...latencies].sort((a, b) => a - b)
const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0)
// Haiku 5.5 list price for prompts under 100K tokens: $0.10 / $0.50 per million.
const cost = (inputTokens * 0.1 + outputTokens * 0.5) / 1_000_000
console.log(`\nAccuracy ${correct}/${cases.length} (${Math.round((100 * correct) / Math.max(1, cases.length))}%)`)
console.log(`Schema or call failures ${schemaFailures} · refusals ${refusals}`)
console.log(`Latency p50 ${pct(0.5)} ms · p90 ${pct(0.9)} ms`)
console.log(`Tokens in ${inputTokens} · out ${outputTokens} · about $${cost.toFixed(4)}`)
process.exit(schemaFailures > 0 ? 1 : 0)
