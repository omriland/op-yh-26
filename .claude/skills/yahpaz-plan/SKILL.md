---
name: yahpaz-plan
description: Plan a big Yahpaz task before building it. Writes the plan as a Claude Doc (a plain part for the person, then a high-level design with diagrams), links a preview of the screen when one changes, then stops until the person clearly says yes. The build is the yahpaz-build skill. Use when the person answers yes to "Do you want a plan for this?" or asks for a plan (see "Plan first" in CLAUDE.md).
---

# Plan, wait for a yes, then build

The person reading the plan may not be technical. Sections 1 to 5 of the plan are for them:
short sentences, plain words, no jargon. Never ask them to run a command.

`GATE` below means `python3 .claude/hooks/plan_gate.py`, always with `--session <id>` (the
session id from the start context). You run it; the person never does.

## Steps

1. Run `GATE clear`. This task now waits for a plan: edits under `src/` and `supabase/` are
   blocked until the person says yes, even if the session already had its plan question.
2. Run this as one Workflow. Hand the reading to Haiku agents (one per area, model `haiku`)
   and the drafting to one Opus agent (model `opus`): it gets the task, what the Haiku agents
   found, and template.md, and returns the full plan text. You review it against the
   template, then write the Doc.
3. Preview. If anything a person sees changes, build a static mock-up of the changed screen
   (an Artifact page, Hebrew and right-to-left like the app, in the app's own look from
   `design-system-design-instructions/` and `PRODUCT.md`). Otherwise the plan says "Nothing
   changes on screen".
4. Write the plan as a Claude Doc with the Claude Docs connector, titled "Plan: <task>".
   Use all twelve sections of [template.md](template.md), in that order, with its writing
   rules. The diagrams are always included. The Pull requests section defines the cuts, the
   tests that are written first, and the live steps besides the merge.
5. Post the Doc link and the preview link with a three-line summary. Ask **"Shall I build
   this?"** Then stop. Do not edit any code in this turn.
6. Only after a message from the person that clearly says yes to this plan, run
   `GATE approve --doc <Doc link> --quote "<their exact words>"`.
7. Build with the `yahpaz-build` skill, one pull request block at a time, in the plan's order.
8. yahpaz-build runs the checks (tests, lint, build) and returns a report.
9. If a screen changed, show the result: open the task's own link (from
   `python3 .claude/hooks/task.py list`) and share screenshots of the changed screens.
10. Report against the section 5 checklist: each line is "done" or "not done", with why.
    Add the yahpaz-build report (the checks and the review outcome). Put the same report in
    the Doc under a "Result" heading.
11. Run `GATE done`: the task is finished, so the next big task is judged on its own. The
    plan stays on record for the `ship` skill.

## What counts as a yes

- A yes is a clear go-ahead for this plan: "yes", "go ahead", "build it", "approved".
- Not a yes: a question, silence, "looks nice", "interesting", or a yes to something else.
  Answer what they said, then ask again.
- If they ask for a change, update the Doc first, then ask again.
- If the scope changes after approval, run `GATE clear`, update the Doc and ask again.
- Never write the approval for them and never guess their words.

## Special cases

- **No Claude Docs connector.** Say so plainly ("I cannot create a shared document here, so
  the plan is below"), put the full plan in the chat, and use `--doc chat-only` at step 6.
- **A new conversation on the same task.** The earlier approval no longer counts. Show the
  existing Doc, ask the person to confirm, then run `GATE approve` again.
- **The task is small after all.** Tell the person in one sentence why, then run
  `GATE small "<reason>"`.
- **The plan gate blocks an edit.** Do not work around it. Come back to the step you skipped.
