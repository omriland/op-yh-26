---
name: yahpaz-build
description: Build an approved Yahpaz plan with the Workflow tool: tests written first and approved by another agent, the build, a verify-and-fix loop, then code review (Codex only after asking, Fable for high-risk changes), until each pull request is ready to ship. Use after the person said yes to a yahpaz-plan plan.
---

# Build an approved plan

You run every step. The person only reads the result, in plain words.

`<id>` is the session id from the start context.

## Steps

1. Preconditions. `python3 .claude/hooks/plan_gate.py status --session <id>` says
   `approved`. The task folder exists (`../op-yh-26-<slug>`, made by `yahpaz-task`). The plan
   Doc is open.
2. Codex question, once per task, BEFORE the workflow (a workflow cannot ask the person). Ask
   with `AskUserQuestion`, exactly: "I need to run a Codex review. Can I run it, and install it
   if it is missing?" Options: "Yes" and "No, skip Codex". On yes: if `command -v codex`
   fails, install it with `npm install -g @openai/codex`. If `codex login status` says signed
   out, tell the person in one line and treat it as No. Record `codex` as `approved` or
   `declined`.
3. Call the Workflow tool with `scriptPath` set to the full path of `build.workflow.js` in this
   skill folder of the task folder, and `args` shaped as below. Do not rewrite the script
   inline. Do not build with single agents instead.
4. `args` is an object, never a JSON string:
   `{ taskSlug, sessionId, taskFolder, planDoc, design, codex, commitTrailer, prs }`
   - `taskFolder`: full path of the task folder.
   - `planDoc`: the Doc link.
   - `design`: the class diagram and the flows the PR blocks name, as text.
   - `codex`: `'approved'` or `'declined'`.
   - `commitTrailer`: the attribution lines the session gives for commits, word for word.
   - `prs`, in the plan's order, each
     `{ id: 'PR1', title, block, risk: 'normal' | 'high', tasks }`.
     The script makes one branch per pull request after the first, named
     `<task branch>-pr<n>`, and bases each one on the previous one. Pass `baseBranch` only
     when running a later pull request alone (the previous pull request's branch).
     `block` is the PR block from the Doc, word for word.
     `tasks` is `[ { id: 'T1', dependsOn: ['...'], block } ]`, each block word for word.
     To go on with a stopped pull request, add `startAt` (`'build'`, `'verify'` or `'review'`)
     and, for these, `testFiles` and `testHashes` from its earlier result.
5. Read the result. If it has `error`, fix the args and run again. For each PR it is ready, or
   stopped with where and why. Tell the person in plain words. For a stopped PR: fix the cause
   with them, then run the workflow again with only the remaining PRs, each with `startAt` by
   its `stoppedAt`: Test approval starts at tests; Build at `build`; Verify or Commit at
   `verify`; Review at `review`. Resume with `resumeFromRunId` only when an agent died.
6. Hand the report to `yahpaz-plan` step 10, which puts it under "Result" in the Doc. Shipping
   stays the `ship` skill, only when the person asks.
