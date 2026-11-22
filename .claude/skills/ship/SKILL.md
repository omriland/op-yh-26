---
name: ship
description: Put the finished Yahpaz task on its branch and open a pull request with a plain-language description. Merging it puts it live on yahpz.com. Only runs when the person asks for it.
disable-model-invocation: true
---

# Ship: commit, review, pull request

You run every command. The person only reads the result. Tell them in plain words what is
happening: "I am saving the work and opening a pull request."

`<id>` below is the session id from the start context. Every command runs in the task folder
(`../op-yh-26-<slug>`, made by the `yahpaz-task` skill): start each Bash command with
`cd <task folder full path> &&`. `<task folder>` below means that full path.

## Steps

0. Run `git rev-parse --path-format=absolute --git-dir --git-common-dir` in the folder. If
   the two lines are equal, this is the main folder: stop and say the work must be in its
   task folder (run `yahpaz-task`).
1. Run `python3 .claude/hooks/plan_gate.py status --session <id>`. Its `verdict` must be
   `approved`, `small`, `declined` or `session-asked`. A `not-asked` verdict whose `last`
   holds this task's `small` or `approved` record also counts (the task was marked done
   before shipping). If it is `planning`, the plan still waits for the person's yes. If it is
   `not-asked` with no such `last`, the task needs the plan question first. In both cases
   stop and say so.
2. Run `npm test`, `npm run lint` and `npm run build` in the task folder (and `npm run
   contrast` when colours or screens changed). If any fails, stop. Explain in plain words
   what failed and what you will do.
3. Stage only this task's files, each by name. Never `git add -A` or `git add .`. Never
   stage `.env*` or anything under `.claude/state/`. Never use `--no-verify`.
4. Commit with a plain sentence that says what changed and why, as the history does, ending
   with the attribution lines the session gives you.
5. Review before the pull request. Run the `code-review` skill on this branch's changes
   (`git diff origin/infra/bootstrap...HEAD`, or the previous pull request's branch for a
   stacked one). Fix what it finds, run step 2 again, and commit the fixes the same way.
6. When nothing is left uncommitted, record the review:
   `python3 .claude/hooks/review_gate.py done --repo <task folder> "<one-line outcome>"`.
   The review gate stops the pull request until this is recorded for the latest commit.
7. Before pushing, switch GitHub to the `omriland` account if `gh auth status` shows another
   one active (`gh auth switch -u omriland`), and say so in one line.
8. From the task folder, run `git push -u origin <branch>`.
9. From the task folder, run `gh pr create --base infra/bootstrap --title "<plain title>"`.
   For stacked pull requests (yahpaz-build made a branch per pull request, named
   `<branch>-pr<n>`), ship them in order: `git switch <its branch>` in the task folder, run
   steps 2 to 10 there with `--base <previous branch>` (the first one uses
   `--base infra/bootstrap`). After a lower pull request is merged, run
   `git merge origin/infra/bootstrap` in the next branch (never force push) before its push.
   Give it a body made of these headings, in plain language, ending with the pull request
   attribution line the session gives you:
   - **What changed**
   - **Why**
   - **How to check**: the checklist from the plan
   - **Plan**: the Doc link, or "small task: <reason>". When the verdict is
     `session-asked`, use the task kept under `last` in the status. When the task was
     `declined`, or there is no approved plan or small reason, this heading is instead
     **No plan: the person chose to skip it**.
   - **Preview**: the mock-up link, or "Nothing changes on screen"
   - **Check results**: tests, lint, build and the review outcome
   - **Going live**: merging deploys the site (Netlify) and any changed edge function. List
     anything else the plan's live steps name (a migration to apply, a secret, a phone app
     release), or "Nothing else: the merge deploys it".
10. Give the person the pull request link. Say that merging it puts it live on yahpz.com,
    and ask whether to merge it now. Run
    `python3 .claude/hooks/review_gate.py clear --repo <task folder>`. After the last pull
    request of the task, run `python3 .claude/hooks/plan_gate.py done --session <id>` once.

## Merge, only on the person's clear yes

1. `gh pr merge <number> --merge`. Then check `gh pr view <number> --json state` says
   `MERGED`, and tell the person it is on its way live.
2. If the plan named live steps besides the merge, do them now or say plainly which are left.
3. Once every pull request of the task is merged, run
   `python3 .claude/hooks/task.py destroy <slug>` from the main folder. It stops the task's
   server, removes the task folder and deletes the branch. If it refuses because of unsaved
   work, stop and ask. Never pass `--force` without the person's yes.

## Never

- Never work in or edit the main folder `../op-yh-26`.
- Never merge without the person's clear yes to merging.
- Never commit to or push `infra/bootstrap`.
- Never force push.
- If the danger guard blocks a step, stop and tell the person. Do not work around it.
- If the review gate blocks the pull request, do the review in step 5 and record it in
  step 6. Do not work around it.
