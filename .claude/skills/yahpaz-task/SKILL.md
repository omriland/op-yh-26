---
name: yahpaz-task
description: Give the task its own folder, branch and local link before any change to the Yahpaz web app. Use once the person's task is clear, right after the working-mode question. Not for a session that is only questions.
---

# One task folder per task

Every change to the Yahpaz web app happens in its own task folder: a copy of the project on
its own branch, with its own local link. The main folder `op-yh-26` stays on
`infra/bootstrap` (the branch that is live on yahpz.com). The person may not be technical:
short sentences, plain words, and never ask them to run a command.

`TASK` below means `python3 .claude/hooks/task.py`. You run it; the person never does.

## When

- Once the task is clear, after the working-mode question, before any other work.
- Once per task. If `TASK list` already shows a task for this work, reuse it.
- A session that is only questions gets no task folder. If it turns into a task, run this then.

## Steps

1. Pick a short name (the slug): lower case words joined by dashes, for example
   `event-filters`. Pick the type: `feat` (something new), `fix` (something broken), `chore`
   (upkeep), `docs` (text only). The branch is `<type>/<slug>`.
2. Run `TASK new <slug> --branch <type>/<slug>`. It makes `../op-yh-26-<slug>` from the
   latest `origin/infra/bootstrap`, copies `.env.local`, installs the packages, and starts the
   task's own local server on a port from 5191 to 5199. It prints the folder and the link.
3. Tell the person in one line that the work has its own copy and its own link. Add that maps
   and address search do not load on that link (the Maps key allows port 5175 only).
4. From now on, start every command with `cd <task folder full path> &&` and edit files by
   their task folder path.
5. If all nine ports are taken, say so and offer to remove a finished task (ask first).

## Commits

- Message: a plain sentence that says what changed and why, as the history already does
  (for example "Event form: one שמירה button and a מחיקה button with confirm."). End with
  the attribution lines the session gives you.
- Stage files by name. Never `git add -A` or `git add .`. Never stage `.env*`.
- Never use `--no-verify`.

## After the work is merged

`TASK destroy <slug>`, run from another folder (the main folder is fine). It refuses while
the pull request is not merged or the folder has uncommitted work. Never pass `--force`
without the person's yes.
