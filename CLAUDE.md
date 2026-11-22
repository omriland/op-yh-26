# op-yh-26 (Yahpaz web app)

The Yahpaz volunteer and event system: a Hebrew, right-to-left web app (Vite, React,
TypeScript) on Supabase (Postgres with RLS, edge functions), hosted on Netlify at yahpz.com.
The Android app (`../yahpaz-android`) and the iPhone app (`../yahpaz-ios`) read the same
database; they keep their own way of working. `README.md` and `PRODUCT.md` describe the
product; `docs/` holds the decisions.

The branch `infra/bootstrap` is production: a push to it deploys the site (Netlify) and
changed edge functions (`.github/workflows/deploy-edge-functions.yml`). So nothing is pushed
to it directly: every change goes through a pull request, and merging it puts it live.

## Who you are working with

The person may not be technical (for example a product manager).

- Use plain words and short sentences. No jargon, no file names, no code, unless they ask.
- Never ask the person to run a command, open a terminal or edit a file. You do it.
- When something fails, say what happened and what you will do next. Do not paste error text.
- Ask one question at a time, and offer a suggested answer.
- Say what you checked and what you could not check. Never say "done" for unchecked work.

## Plan first

Before a big task, the person decides whether they want a plan to read and approve first. A
task is **big** if any of these is true:

- It changes what someone sees or can do in Yahpaz.
- It touches more than three files.
- It changes saved data (tables, RLS, RPCs, migrations), sign-in, an edge function, or
  anything the phone apps read.
- It cannot be fully described in two sentences.

If unsure, it is big. **Small** means a typo, wording, a colour, or a bug with one obvious cause.

- **Big, the first one of the session:** ask with the `AskUserQuestion` tool: "Do you want a
  plan for this?" (Yes / No). Yes: use the `yahpaz-plan` skill. It writes the plan, then
  stops. After the person's clear yes, build with `yahpaz-build`. No: run
  `python3 .claude/hooks/plan_gate.py decline --session <id> --quote "<their exact words>"`
  yourself and do the work.
- **Big, later in the session:** once the question has been asked in this session, whatever
  the answer, do not ask it again. Make a plan only when the person asks for one.
- **Small:** tell the person in one sentence why it is small, then run
  `python3 .claude/hooks/plan_gate.py small "<reason>" --session <id>` yourself and do the work.
- **Task finished** (built and checked, shipped or not): run
  `python3 .claude/hooks/plan_gate.py done --session <id>`, so the next task is judged on
  its own. A small task does not count as the plan question: after `done`, a later edit
  needs its own small reason or the question.
- `<id>` is the session id from the start context.
- **Task folder.** Once the task is clear (after the working-mode question), run the
  `yahpaz-task` skill: one task folder and branch per task, none for a session of questions
  only. There are no tickets.

## Agents

- **Model routing.** Pass the model explicitly for every agent and workflow agent you start.
  Planning is Opus (`opus`). Implementation and fixes are Sonnet (`sonnet`). Research,
  lookups and quick answers are Haiku (`haiku`), never Sonnet. The final review and
  validation of very important changes (database, migrations, RLS, sign-in, security, or a
  big change) is Fable 5.2 (`fable`).
- **Workflow or single agent.** Run the Workflow tool for multi-step loops, for several tasks
  that can run at the same time, and for build, verify and review pipelines. A Workflow is
  the default for building an approved plan (the `yahpaz-build` skill). One agent is enough
  for one lookup or one small change. When unsure and there is more than one step, use a
  Workflow.
- **Tests first, for product code only.** The tests are part of the plan. One agent writes
  them before the code; a different agent checks and approves them before the build. Real
  unit tests (vitest, `src/**/*.test.ts`) that check behaviour. No test that is easy to pass
  or that checks nothing. No tests for the harness itself (hooks, skills, docs): check those
  by reading, linting and running the command once.
- **Readable pull requests.** Unique, clear names for functions and variables; short
  functions that do one thing; no clever one-liners; no dead code. There is no file limit on
  a pull request; the plan defines the pull request cuts up front.
- **Codex review is optional and always asked first.** Sending code to Codex leaves this
  machine. Before a Codex review, ask with the `AskUserQuestion` tool: "I need to run a Codex
  review. Can I run it, and install it if it is missing?" Install or run it only after a yes.
  Skip it when the person says no or says to skip it. Model `gpt-6-sol`, effort `high`
  (`xhigh` for database or big changes).

## Task folders

- Every task works in `../op-yh-26-<slug>` (a git worktree next to the main folder), made by
  `python3 .claude/hooks/task.py new` through the `yahpaz-task` skill, on a branch
  `<feat|fix|chore|docs>/<slug>` from the latest `origin/infra/bootstrap`.
- The main folder `../op-yh-26` stays on `infra/bootstrap`: never edit, switch, commit,
  stash or pull there. The guards ask the person first.
- Start each command with `cd <task folder> &&` and edit files by their task folder path.
- The hook commands (`python3 .claude/hooks/...`) work from either folder, except
  `review_gate.py done`, which needs `--repo <task folder>` when run from the main folder.
  Their state lives in `~/.local/state/yahpaz-harness/`, outside every checkout.

## Running and checking

You run these; the person never does.

| Need | Command (in the task folder) |
|---|---|
| The task's link, and is it running? | `python3 .claude/hooks/task.py list` |
| Start its server again | `python3 .claude/hooks/task.py start <slug>` |
| Unit tests | `npm test` |
| Lint | `npm run lint` |
| Type check and build | `npm run build` |
| Colour contrast | `npm run contrast` |

- Each task has its own local server on a port from 5191 to 5199. The main folder's server
  is http://localhost:5175. The Google Maps key allows port 5175 only, so maps and address
  search do not load on a task's link; check those after the merge, or on 5175 when the
  person asks.
- All tasks use the one real Supabase project (`rtvizpsfvtjowbimugns`); there is no local
  database. Reading is fine. Writing test data, applying a migration or deploying an edge
  function by hand changes production: ask the person first.
- Before saying work is finished, run the tests, lint and build in the task folder and report
  the result in plain words.

## Architecture rules

- All text a person reads is Hebrew, right-to-left. Follow
  `design-system-design-instructions/` and `PRODUCT.md` for anything on screen.
- Pure logic lives in `src/lib/` with a test next to it (`<name>.test.ts`). Pages and
  components stay thin.
- Schema changes go only through a new file in `supabase/migrations/`. Every table has RLS.
  A migration goes live only when it is applied to the project: through the list in the
  edge-function deploy workflow, or by hand after the merge with the person's yes. Say which
  in the plan and in the pull request.
- The phone apps read the same tables, RPCs and edge functions. A change that removes or
  renames something they use needs a phone release first; name it in the plan.
- Never put a secret in code. Never touch `.env*` files.
- Android and iPhone releases still copy their installer and `version.json` into
  `public/android/` or `public/ios/`; in this repo that is a pull request like any other.

## Skills

- `yahpaz-task`: make the task folder, its branch and its own local server.
- `yahpaz-plan`: write the plan as a Claude Doc (plain part, then a high-level design with
  diagrams) and wait for a yes. The build is `yahpaz-build`.
- `yahpaz-build`: builds an approved plan with a Workflow (tests first, build, verify and
  fix, review), one pull request block at a time.
- `ship`: only when the person asks for it. Commits, reviews and opens a pull request; merges
  it only on the person's yes, then removes the task folder.

## Guard rails

- **Plan gate** stops edits under `src/` and `supabase/` of any op-yh-26 folder until the
  session has had the plan question (or the task has an approved plan or a stated small
  reason), and while a plan waits for a yes.
- **Danger guard** stops pushing to `infra/bootstrap` or `main`, force pushes,
  `supabase db reset`, `task.py destroy` without a task name (with `--force` it asks the
  person), docker prune and `down -v`, and deleting folders other than the build folders.
  It asks the person before anything that changes production outside a pull request:
  `supabase db push`, `supabase functions deploy`, `supabase migration repair`,
  `supabase secrets set` and `netlify deploy --prod`.
- **Main folder.** Changing git commands, file edits and obvious redirections (`>`, `>>`,
  `tee`) in `../op-yh-26` ask the person first. Read-only git and
  `git worktree add/list/prune/remove` are allowed there.
- **Review gate** stops a pull request from being opened until you have run the `code-review`
  skill on the latest commit of the task folder, fixed what it found and recorded the outcome
  (the `ship` skill does this). It is per task folder, and never from the main folder.
- **Lint on edit** lints each edited file with oxlint (and the harness's Python with ruff)
  right after you edit it, fixing what it can. It stops only on errors, like `npm run lint`
  (the project has about 200 old warnings). When it reports problems, fix them before doing
  anything else. The full checks above still run before shipping.

If blocked, do not work around it (no shell edits, no other route). Tell the person in plain
words what was stopped and why, then follow the plan path or ask them.

## Sessions

- **Name first.** Start every reply with the person's first name, so they can see you still
  follow these instructions. The name is in the context you get when the session starts
  (from `git config yahpaz.name`). If it is missing, ask once.
- **Start question.** At the very beginning of a new session, before other work, ask one
  question with the `AskUserQuestion` tool: the working mode. Follow the chosen mode until
  the session ends:
  - Orchestrator mode: "Use sub agents wherever possible and makes sense. Preserve your
    context aggressively. They do the heavy lifting you coordinate and integrate."
  - Regular mode: work directly, and delegate only when it clearly helps.
  - Record the answer yourself:
    `python3 .claude/hooks/session_start.py set-mode <mode> --session <id>`.
  - Never ask twice in one conversation. After a resume, a fork or a compaction the answer is
    in the start context or earlier in the conversation. If the question tool is not
    available, use regular mode (`set-mode regular --default`).
