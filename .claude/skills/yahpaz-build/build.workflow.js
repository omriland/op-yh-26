export const meta = {
  name: 'yahpaz-build',
  description:
    'Build an approved Yahpaz plan, one pull request at a time: tests first, approval, build, verify and fix, review',
  whenToUse: 'After the person approved a yahpaz-plan plan',
  phases: [
    {
      title: 'Tests first',
      detail: 'one agent writes the unit tests, which must fail for the right reason',
    },
    { title: 'Test approval', detail: 'a different agent approves the tests, or sends them back' },
    { title: 'Build', detail: 'one agent per task, in waves by dependency' },
    { title: 'Verify', detail: 'run every check, fix, run again' },
    { title: 'Review', detail: 'code review, Codex when approved, Fable when the risk is high' },
    { title: 'Commit', detail: 'commit the files of the pull request' },
  ],
}

const MAX_TEST_ROUNDS = 3
const MAX_VERIFY_ROUNDS = 3
const MODEL = {
  plan: 'opus',
  approve: 'opus',
  review: 'opus',
  build: 'sonnet',
  lookup: 'haiku',
  finalReview: 'fable',
}
const CODEX_MODEL = 'gpt-6-sol'
const MAIN_BASE = 'origin/infra/bootstrap'
const STAGES = ['tests', 'build', 'verify', 'review']

const TESTS_WRITTEN_SCHEMA = {
  type: 'object',
  properties: {
    testFiles: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    failingAsExpected: { type: 'boolean' },
  },
  required: ['testFiles', 'summary', 'failingAsExpected'],
}

const TESTS_APPROVAL_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['approved', 'problems'],
}

const TEST_HASHES_SCHEMA = {
  type: 'object',
  properties: { hashes: { type: 'array', items: { type: 'string' } } },
  required: ['hashes'],
}

const BRANCH_SCHEMA = {
  type: 'object',
  properties: { branch: { type: 'string' } },
  required: ['branch'],
}

const TASK_DONE_SCHEMA = {
  type: 'object',
  properties: {
    done: { type: 'boolean' },
    summary: { type: 'string' },
    testProblems: { type: 'array', items: { type: 'string' } },
  },
  required: ['done', 'summary'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    blocked: { type: 'boolean' },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: { check: { type: 'string' }, detail: { type: 'string' } },
        required: ['check', 'detail'],
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['passed', 'blocked', 'failures'],
}

const FINDINGS_LIST_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      file: { type: 'string' },
      line: { type: 'number' },
      summary: { type: 'string' },
      severity: { type: 'string' },
    },
    required: ['file', 'summary', 'severity'],
  },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: { findings: FINDINGS_LIST_SCHEMA },
  required: ['findings'],
}

const CODEX_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    ran: { type: 'boolean' },
    reason: { type: 'string' },
    findings: FINDINGS_LIST_SCHEMA,
  },
  required: ['ran', 'reason', 'findings'],
}

const FABLE_REVIEW_SCHEMA = {
  type: 'object',
  properties: { approved: { type: 'boolean' }, findings: FINDINGS_LIST_SCHEMA },
  required: ['approved', 'findings'],
}

const FIX_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'number' },
    rejected: { type: 'array', items: { type: 'string' } },
  },
  required: ['fixed', 'rejected'],
}

const COMMIT_SCHEMA = {
  type: 'object',
  properties: {
    committed: { type: 'boolean' },
    sha: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['committed', 'sha', 'reason'],
}

// The branches of this run: the task branch and the branch of the last pull request.
const branches = { task: null, last: null }

function rulesFor() {
  const folder = args.taskFolder
  return [
    `Task folder: ${folder}`,
    `Start each command with \`cd ${folder} &&\`. Edit only inside that task folder.`,
    'Never touch the main folder ../op-yh-26. Never push. Never stash. Never use --no-verify.',
    `Plan: ${args.planDoc}. Task: ${args.taskSlug}. Session id (for reports only): ${args.sessionId}.`,
    'You are a sub-agent of an approved build. The start question, the plan question and the Codex question were already answered by the person: do not ask them and do not start replies with a name.',
    'If the plan gate blocks an edit, stop and report it. Never run plan_gate.py yourself.',
    'The app is Hebrew and right-to-left. Follow design-system-design-instructions/ and PRODUCT.md for anything on screen.',
    'Names of functions and variables are unique and clear. Functions are short and do one thing. No clever one-liners. No dead code.',
  ].join('\n')
}

function labelOf(pr, step) {
  return `${pr.id} · ${step}`
}

function askAgent(pr, step, model, phaseTitle, prompt, schema) {
  const options = { label: labelOf(pr, step), model: model, phase: phaseTitle }
  if (schema) {
    options.schema = schema
  }
  return agent(`${rulesFor()}\n\n${prompt}`, options)
}

function tasksText(pr) {
  return pr.tasks.map((task) => task.block).join('\n\n')
}

function testCommandsText() {
  return 'Unit tests are vitest files named <name>.test.ts next to the code under src/ (pure logic lives in src/lib/). Run them with `npm test`. There are no end-to-end tests in this project: write none.'
}

// Validation of args, before any work starts.
function normalizeTasks(pr) {
  const ids = pr.tasks.map((task) => task.id)
  pr.tasks.forEach((task) => {
    const wanted = Array.isArray(task.dependsOn) ? task.dependsOn : []
    task.dependsOn = wanted.filter((id) => ids.includes(id))
  })
}

function stageProblem(pr) {
  if (pr.startAt && pr.startAt !== 'tests') {
    const hasTestFiles = Array.isArray(pr.testFiles) && pr.testFiles.length > 0
    return hasTestFiles ? null : `${pr.id} starts at ${pr.startAt}, so it needs testFiles`
  }
  return null
}

function prProblem(pr) {
  if (!pr || !pr.id || !pr.title || !pr.block) {
    return 'every pull request needs id, title and block'
  }
  if (pr.risk !== 'normal' && pr.risk !== 'high') {
    return `${pr.id}: risk must be normal or high`
  }
  if (!Array.isArray(pr.tasks) || pr.tasks.length === 0) {
    return `${pr.id}: tasks must be a non-empty list`
  }
  if (pr.startAt && !STAGES.includes(pr.startAt)) {
    return `${pr.id}: startAt must be one of ${STAGES.join(', ')}`
  }
  normalizeTasks(pr)
  try {
    groupIntoWaves(pr.tasks)
  } catch (error) {
    return `${pr.id}: ${error.message}`
  }
  return stageProblem(pr)
}

function argsProblem() {
  if (!args || typeof args !== 'object') {
    return 'args must be an object, not a string'
  }
  if (!args.taskFolder || !args.taskSlug || !args.commitTrailer) {
    return 'args needs taskSlug, taskFolder and commitTrailer'
  }
  if (!Array.isArray(args.prs) || args.prs.length === 0) {
    return 'args.prs must be a non-empty list'
  }
  for (const pr of args.prs) {
    const problem = prProblem(pr)
    if (problem) {
      return problem
    }
  }
  return null
}

function shouldRun(pr, stage) {
  const startAt = pr.startAt || 'tests'
  return STAGES.indexOf(stage) >= STAGES.indexOf(startAt)
}

// Step a: one branch per pull request, named by this script.
function stripPrSuffix(branch) {
  return branch.replace(/-pr\d+$/, '')
}

function baseBranchOf(pr) {
  return branches.last || pr.baseBranch || MAIN_BASE
}

function stackedBranchName(pr, base) {
  if (base === MAIN_BASE) {
    return null
  }
  const taskBranch = branches.task || stripPrSuffix(base)
  return `${taskBranch}-${pr.id.toLowerCase()}`
}

function branchPrompt(wanted) {
  if (!wanted) {
    return 'Run `git branch --show-current` and return it. Do not switch.'
  }
  return `Run \`git branch --show-current\`. If it is already ${wanted}, change nothing. If the branch ${wanted} exists, run \`git switch ${wanted}\`. Otherwise run \`git switch -c ${wanted}\`. Return ${wanted}.`
}

async function prepareBranch(work) {
  const wanted = stackedBranchName(work, work.base)
  const model = wanted ? MODEL.build : MODEL.lookup
  const result = await askAgent(
    work,
    'branch',
    model,
    'Tests first',
    branchPrompt(wanted),
    BRANCH_SCHEMA
  )
  if (!result) {
    return null
  }
  branches.task = branches.task || stripPrSuffix(result.branch)
  branches.last = result.branch
  return result.branch
}

// Step b: tests first.
function writeTestsFirst(pr) {
  const prompt = [
    'Write the tests for this pull request BEFORE any product code. Do not write product code.',
    testCommandsText(),
    'Write the tests that the block lists under "Tests first". Each test checks real behaviour from the block and would fail on a plausible bug.',
    'Run them. Confirm they fail because the code under test does not exist yet (a missing module, function, route or component counts). A failure caused by a mistake in the test itself (a typo, a wrong path to existing code, a bad fixture) does not count: fix the test. A lint report about the not-yet-existing import is expected at this step.',
    `Design:\n${args.design}`,
    `Pull request block:\n${pr.block}`,
    `Tasks:\n${tasksText(pr)}`,
  ].join('\n\n')
  return askAgent(pr, 'tests', MODEL.build, 'Tests first', prompt, TESTS_WRITTEN_SCHEMA)
}

function fixTests(pr, written, problems) {
  const prompt = [
    'Fix exactly these problems in the tests. Change nothing else. Do not write product code.',
    `Problems:\n- ${problems.join('\n- ')}`,
    `Test files:\n${written.testFiles.join('\n')}`,
    'Run the tests again and confirm they still fail because the code under test does not exist yet, not because of a mistake in the test.',
    `Pull request block:\n${pr.block}`,
  ].join('\n\n')
  return askAgent(pr, 'tests fix', MODEL.build, 'Test approval', prompt, TESTS_WRITTEN_SCHEMA)
}

// Step c: a different agent approves the tests.
function approveTests(pr, written) {
  const prompt = [
    'You are a different agent from the one that wrote the tests. Read the block and the tests. Approve only when ALL of these hold:',
    '- every test checks real behaviour from the block;',
    '- every test would fail on a plausible bug;',
    '- no weak assertion: no expect(true), no bare exists check, no lone snapshot;',
    '- no test mocks the unit under test;',
    'When not approved, list each problem so it can be fixed.',
    `The writer's run summary: ${written.summary}`,
    `Test files:\n${written.testFiles.join('\n')}`,
    `Pull request block:\n${pr.block}`,
  ].join('\n')
  return askAgent(
    pr,
    'approve tests',
    MODEL.approve,
    'Test approval',
    prompt,
    TESTS_APPROVAL_SCHEMA
  )
}

async function findTestProblems(pr, written) {
  const problems = []
  if (!written.failingAsExpected) {
    problems.push('the tests did not fail for the right reason when they were run')
  }
  const verdict = await approveTests(pr, written)
  if (!verdict) {
    problems.push('the approver stopped')
  } else if (!verdict.approved) {
    problems.push(...verdict.problems)
  }
  return problems
}

function hashTests(pr, testFiles) {
  const prompt = [
    'Run `git hash-object` on each of these files and return one line per file: `<file> <hash>`.',
    testFiles.join('\n'),
  ].join('\n')
  return askAgent(pr, 'hash tests', MODEL.lookup, 'Test approval', prompt, TEST_HASHES_SCHEMA)
}

async function writeAndApproveTests(pr) {
  phase('Tests first')
  let written = await writeTestsFirst(pr)
  if (!written) {
    return { approved: false, problems: ['the test writer stopped'], testFiles: [], testHashes: [] }
  }
  phase('Test approval')
  let problems = await findTestProblems(pr, written)
  for (let round = 1; round < MAX_TEST_ROUNDS && problems.length > 0; round++) {
    log(`${pr.id}: tests not approved in round ${round}: ${problems.join('; ')}`)
    const fixed = await fixTests(pr, written, problems)
    written = fixed || written
    problems = await findTestProblems(pr, written)
  }
  if (problems.length > 0) {
    return { approved: false, problems: problems, testFiles: written.testFiles, testHashes: [] }
  }
  const hashed = await hashTests(pr, written.testFiles)
  const testHashes = hashed ? hashed.hashes : []
  return { approved: true, problems: [], testFiles: written.testFiles, testHashes: testHashes }
}

// Step d: waves by dependency.
function groupIntoWaves(tasks) {
  const waves = []
  const doneIds = new Set()
  let remaining = tasks.slice()
  while (remaining.length > 0) {
    const wave = remaining.filter((task) => task.dependsOn.every((id) => doneIds.has(id)))
    if (wave.length === 0) {
      throw new Error(
        `tasks depend on each other in a loop: ${remaining.map((task) => task.id).join(', ')}`
      )
    }
    wave.forEach((task) => doneIds.add(task.id))
    remaining = remaining.filter((task) => !doneIds.has(task.id))
    waves.push(wave)
  }
  return waves
}

function buildOneTask(pr, task, testFiles) {
  const prompt = [
    `Build task ${task.id}. Make the approved tests that cover this task pass. Tests of other tasks may still fail: leave them. Build nothing the block does not say.`,
    'Do not change the approved tests. If a test is wrong, do not edit it: report it in testProblems.',
    `Approved test files:\n${testFiles.join('\n')}`,
    `Design:\n${args.design}`,
    `Task block:\n${task.block}`,
  ].join('\n\n')
  return askAgent(pr, `build ${task.id}`, MODEL.build, 'Build', prompt, TASK_DONE_SCHEMA)
}

function waveNames(wave) {
  return wave.map((task) => task.id).join(', ')
}

async function buildTasks(pr, testFiles) {
  phase('Build')
  for (const wave of groupIntoWaves(pr.tasks)) {
    const results = await parallel(wave.map((task) => () => buildOneTask(pr, task, testFiles)))
    const stopped = results.some((result) => result === null || result.done === false)
    if (stopped) {
      return { ok: false, reason: `a build agent stopped in the wave ${waveNames(wave)}` }
    }
    const complaints = results.flatMap((result) => result.testProblems || [])
    if (complaints.length > 0) {
      return {
        ok: false,
        reason: `the builders say these tests are wrong: ${complaints.join('; ')}`,
      }
    }
  }
  return { ok: true, reason: '' }
}

// Step e: verify and fix.
function testHashesText(testHashes) {
  if (testHashes.length === 0) {
    return ''
  }
  return `Approved test files and their \`git hash-object\` values:\n${testHashes.join('\n')}\nRun \`git hash-object\` on each again. A different value is a failure: "approved test changed".`
}

function checkListText() {
  return `In ${args.taskFolder}: \`npm test\`, \`npm run lint\` and \`npm run build\` (the build runs the type check). When the block changes a colour or a screen, also \`npm run contrast\`.`
}

function verifyOnce(pr, stage, round, testHashes) {
  const prompt = [
    `Verify round ${round}. Run every check below. Report each failure with the check and the detail. Fix nothing.`,
    'Set blocked to true only when a failure is not a code problem (the environment or a tool is missing or signed out).',
    checkListText(),
    testHashesText(testHashes),
    `Pull request block (for the pass bars):\n${pr.block}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return askAgent(pr, `verify ${stage} ${round}`, MODEL.build, 'Verify', prompt, VERIFY_SCHEMA)
}

async function verifyRound(pr, stage, round, testHashes) {
  const first = await verifyOnce(pr, stage, round, testHashes)
  const verdict = first || (await verifyOnce(pr, stage, round, testHashes))
  if (!verdict) {
    const failures = [{ check: 'verify', detail: 'the verifier stopped twice' }]
    return { passed: false, blocked: true, failures: failures, notes: [] }
  }
  return {
    passed: verdict.passed,
    blocked: verdict.blocked,
    failures: verdict.failures,
    notes: verdict.notes || [],
  }
}

function fixFailures(pr, stage, round, failures) {
  const lines = failures.map((failure) => `${failure.check}: ${failure.detail}`)
  const prompt = [
    'Fix the code so these checks pass. Do not change the approved tests.',
    `Failures:\n- ${lines.join('\n- ')}`,
    `Pull request block:\n${pr.block}`,
  ].join('\n\n')
  return askAgent(pr, `fix ${stage} ${round}`, MODEL.build, 'Verify', prompt, TASK_DONE_SCHEMA)
}

function needsFix(verdict) {
  return !verdict.passed && !verdict.blocked
}

async function verifyAndFix(pr, stage, testHashes) {
  phase('Verify')
  let verdict = await verifyRound(pr, stage, 1, testHashes)
  for (let round = 1; round < MAX_VERIFY_ROUNDS && needsFix(verdict); round++) {
    await fixFailures(pr, stage, round, verdict.failures)
    verdict = await verifyRound(pr, stage, round + 1, testHashes)
  }
  return verdict
}

function failuresText(verdict) {
  return verdict.failures.map((failure) => `${failure.check}: ${failure.detail}`).join('; ')
}

// Step f: commit.
function commitWork(pr, what) {
  const prompt = [
    `Commit ${what} of "${pr.title}".`,
    `Pull request block:\n${pr.block}`,
    'Stage only the files of this pull request, each by name. Never `git add -A`, never `git add .`. Never stage .env, .env.local or anything under .claude/state.',
    `Message: a plain first sentence that says what changed and why, as the history does (see \`git log --oneline -5\`), a short plain body, then a blank line and exactly:\n${args.commitTrailer}`,
    'Never use --no-verify.',
    'After the commit run `git status --porcelain` and confirm no file of this pull request is left. Return committed true with the new sha, or committed false with the reason.',
  ].join('\n')
  return askAgent(pr, `commit ${what}`, MODEL.build, 'Commit', prompt, COMMIT_SCHEMA)
}

async function commitOrStop(pr, result, what, stoppedAt) {
  const commit = await commitWork(pr, what)
  if (!commit || !commit.committed) {
    const reason = commit ? commit.reason : 'the commit agent stopped'
    return stopPr(result, stoppedAt, `commit failed: ${reason}`)
  }
  result.commits.push(commit.sha)
  return true
}

// Step g: reviews.
function effortFor(pr) {
  return pr.risk === 'high' ? 'xhigh' : 'high'
}

function codeReview(pr) {
  const prompt = [
    `Run the \`code-review\` skill at level ${effortFor(pr)} on \`git diff ${pr.base}...HEAD\` in the folder.`,
    'Return its findings as {file, line, summary, severity}.',
  ].join('\n')
  return askAgent(pr, 'code review', MODEL.review, 'Review', prompt, FINDINGS_SCHEMA)
}

function codexReview(pr) {
  const prompt = [
    'The person approved this Codex review in this session. Do not ask again.',
    `Run: \`codex review --base ${pr.base} -c model="${CODEX_MODEL}" -c model_reasoning_effort="${effortFor(pr)}"\` in the folder. Use the longest Bash timeout (600000 ms).`,
    'Relay its findings as {file, line, summary, severity}. Add nothing of your own.',
    'When codex is missing, signed out or times out, return ran false with the reason and no findings.',
  ].join('\n')
  return askAgent(pr, 'codex review', MODEL.lookup, 'Review', prompt, CODEX_REVIEW_SCHEMA)
}

function fableReview(pr) {
  const prompt = [
    `Final review and validation of \`git diff ${pr.base}...HEAD\` in the folder.`,
    'Focus on the database, migrations, sign-in and security. Approve only when you would put this in production.',
    'Return approved and the findings as {file, line, summary, severity}.',
  ].join('\n')
  return askAgent(pr, 'final review', MODEL.finalReview, 'Review', prompt, FABLE_REVIEW_SCHEMA)
}

function codexIsApproved() {
  return args.codex === 'approved'
}

function codexOrSkip(pr) {
  if (codexIsApproved()) {
    return codexReview(pr)
  }
  log('Codex skipped: the person said no')
  return null
}

function fableIfHigh(pr) {
  return pr.risk === 'high' ? fableReview(pr) : null
}

async function runReviews(pr) {
  phase('Review')
  const [code, codex, fable] = await parallel([
    async () => codeReview(pr),
    async () => codexOrSkip(pr),
    async () => fableIfHigh(pr),
  ])
  return { code: code, codex: codex, fable: fable }
}

function codexStatus(codex) {
  if (!codexIsApproved()) {
    return 'skipped'
  }
  if (codex && codex.ran) {
    return 'ran'
  }
  return `failed: ${codex ? codex.reason : 'the Codex agent stopped'}`
}

function allFindings(reviewed) {
  const lists = [reviewed.code.findings]
  if (reviewed.codex && reviewed.codex.ran) {
    lists.push(reviewed.codex.findings)
  }
  if (reviewed.fable) {
    lists.push(reviewed.fable.findings)
  }
  return lists.flat()
}

// Step h: fix findings.
function fixFindings(pr, findings) {
  const lines = findings.map(
    (finding) => `${finding.file}:${finding.line || '?'} [${finding.severity}] ${finding.summary}`
  )
  const prompt = [
    'Fix every finding that is real. You may reject a finding with a reason; say which and why. Do not change the approved tests: if a finding says a test is wrong, reject it and say so.',
    `Findings:\n- ${lines.join('\n- ')}`,
  ].join('\n\n')
  return askAgent(pr, 'fix findings', MODEL.build, 'Review', prompt, FIX_RESULT_SCHEMA)
}

async function confirmFable(pr, result) {
  if (pr.risk !== 'high') {
    result.fable = 'not needed'
    return true
  }
  const again = await fableReview(pr)
  if (again && again.approved) {
    result.fable = 'approved'
    return true
  }
  result.fable = 'not approved'
  return stopPr(result, 'Review', 'the final review did not approve after the fixes')
}

async function applyFixes(pr, result, findings, testHashes) {
  const fixes = await fixFindings(pr, findings)
  result.findings.fixed = fixes ? fixes.fixed : 0
  result.findings.rejected = fixes ? fixes.rejected : []
  const verified = await verifyAndFix(pr, 'review', testHashes)
  result.checks = verified
  result.notes = verified.notes
  if (!verified.passed) {
    return stopPr(result, 'Verify', `after the review fixes: ${failuresText(verified)}`)
  }
  return commitOrStop(pr, result, 'the review fixes', 'Review')
}

async function reviewAndFix(pr, result, testHashes) {
  const reviewed = await runReviews(pr)
  if (!reviewed.code) {
    return stopPr(result, 'Review', 'the code review did not run')
  }
  if (pr.risk === 'high' && !reviewed.fable) {
    return stopPr(result, 'Review', 'the final review did not run')
  }
  result.codex = codexStatus(reviewed.codex)
  const findings = allFindings(reviewed)
  const fableApproved = pr.risk !== 'high' || reviewed.fable.approved
  if (findings.length === 0 && fableApproved) {
    result.fable = pr.risk === 'high' ? 'approved' : 'not needed'
    return true
  }
  if (findings.length > 0 && !(await applyFixes(pr, result, findings, testHashes))) {
    return false
  }
  return confirmFable(pr, result)
}

// Step i: result per pull request.
function stopPr(result, stoppedAt, reason) {
  result.ready = false
  result.stoppedAt = stoppedAt
  result.reason = reason
  return false
}

function newResult(pr) {
  return {
    id: pr.id,
    branch: null,
    ready: false,
    stoppedAt: null,
    reason: '',
    commits: [],
    checks: null,
    testsApproved: false,
    testFiles: [],
    testHashes: [],
    findings: { fixed: 0, rejected: [] },
    codex: 'skipped',
    fable: pr.risk === 'high' ? 'not approved' : 'not needed',
    notes: [],
  }
}

async function testsStage(pr, result) {
  if (!shouldRun(pr, 'tests')) {
    result.testsApproved = true
    result.testFiles = pr.testFiles
    result.testHashes = pr.testHashes || []
    return true
  }
  const tests = await writeAndApproveTests(pr)
  result.testsApproved = tests.approved
  result.testFiles = tests.testFiles
  result.testHashes = tests.testHashes
  if (!tests.approved) {
    return stopPr(result, 'Test approval', tests.problems.join('; '))
  }
  return true
}

async function buildStage(pr, result) {
  if (!shouldRun(pr, 'build')) {
    return true
  }
  const built = await buildTasks(pr, result.testFiles)
  if (!built.ok) {
    return stopPr(result, 'Build', built.reason)
  }
  return true
}

async function verifyStage(pr, result) {
  if (!shouldRun(pr, 'verify')) {
    return true
  }
  const verified = await verifyAndFix(pr, 'build', result.testHashes)
  result.checks = verified
  result.notes = verified.notes
  if (!verified.passed) {
    return stopPr(result, 'Verify', failuresText(verified))
  }
  phase('Commit')
  return commitOrStop(pr, result, 'the pull request work', 'Commit')
}

async function runPr(pr) {
  const work = Object.assign({}, pr, { base: baseBranchOf(pr) })
  const result = newResult(work)
  result.branch = await prepareBranch(work)
  if (!result.branch) {
    stopPr(result, 'Tests first', 'could not prepare the branch')
    return result
  }
  const stages = [testsStage, buildStage, verifyStage]
  for (const stage of stages) {
    if (!(await stage(work, result))) {
      return result
    }
  }
  result.ready = await reviewAndFix(work, result, result.testHashes)
  return result
}

async function runAllPrs() {
  const results = []
  const notStarted = []
  for (const pr of args.prs) {
    if (results.length > 0 && !results[results.length - 1].ready) {
      notStarted.push(pr.id)
      log(`${pr.id} not started: ${results[results.length - 1].id} is not ready`)
      continue
    }
    results.push(await runPr(pr))
  }
  return { prs: results, notStarted: notStarted }
}

const problemWithArgs = argsProblem()
if (problemWithArgs) {
  return { prs: [], notStarted: [], error: problemWithArgs }
}
return await runAllPrs()
