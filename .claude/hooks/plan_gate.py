#!/usr/bin/env python3
"""Plan gate: no edits to product code until the person has had a say on a plan.

The person is asked once per session: "Do you want a plan for this?". After that, edits are
held back only while a plan is being written and waits for their yes.

Hook role (no arguments): reads the PreToolUse JSON on stdin (session_id, cwd, tool_input).
  The file's own git folder decides. In a Yahpaz folder (main folder or task folder) the
  product folders are src/ (the web app) and supabase/ (migrations and edge functions,
  which change saved data). An edit there is let through when, for this session, the task
  is approved, small or declined, or the session was asked and no plan is being written.
  It is blocked (exit 2) while a plan is being written, and when this session was never
  asked and has no approval or small reason. Each session has its own state file, so
  sessions open at the same time do not touch each other, and an approval never carries
  over to a new session. Files outside a Yahpaz folder are never held back.
  Main folders: after the plan check, an edit in a main folder (the main checkout, not a
  task folder) outside .claude/state/ asks the person (permissionDecision "ask", exit 0).
  The main folders stay on main; the work happens in the task folder.
Command role (run by the agent, never by the person). Each takes `--session <id>`, or reads
YAHPAZ_SESSION_ID (exported by session_start.py at session start); with neither it fails rather
than guess, because two sessions may be open at once.
  plan_gate.py decline --quote "<person's exact words>"   no plan wanted; marks the session asked
  plan_gate.py approve --doc <https URL | chat-only> --quote "<person's exact words>"
                                                          also marks the session asked
  plan_gate.py small "<reason, 10 characters or more>"
  plan_gate.py clear    a plan is being written (start of yahpaz-plan): edits wait for approve
  plan_gate.py done     the task is finished (run it after every finished task, shipped or
                        not): only "asked" is kept, and the task is kept under "last"
  plan_gate.py status   prints the state and a verdict: approved, small, declined,
                        session-asked (edits allowed), planning or not-asked (blocked)
State, one file per session, ~/.local/state/yahpaz-harness/plan-gate/<session id>.json
(outside every checkout), written in one step (a temporary file, then a rename):
  {"session_id", "asked": bool, "status": null | "planning" | "approved" | "small" |
   "declined", "doc_url", "quote", "reason", "set_at", "last": the task before `done`}
It enforces a process. It is not a security boundary.
"""

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone

import _repo

# The product folders of a Yahpaz folder: the web app, and the database and edge functions.
SOURCE_DIRS = ("src", "supabase")

STATES = os.path.join(_repo.STATE_HOME, "plan-gate")
ENV_NAME = "YAHPAZ_SESSION_ID"
ALLOWED = ("approved", "small", "declined", "session-asked")

NOT_ASKED = (
    "Plan gate: this is product code and this session has no say on a plan yet. "
    'Big task: ask the person with AskUserQuestion "Do you want a plan for this?" (Yes / No). '
    "Yes: use the yahpaz-plan skill. No: run "
    '`python3 .claude/hooks/plan_gate.py decline --session <id> --quote "<their exact words>"`. '
    "Small task: tell the person in one sentence why it is small, then run "
    '`python3 .claude/hooks/plan_gate.py small "<reason>" --session <id>`. '
    "Never ask the person to run anything."
)
PLANNING = (
    "Plan gate: a plan is being written for this task. Show it and wait for the person's "
    "clear yes, then run `python3 .claude/hooks/plan_gate.py approve --session <id> "
    '--doc <link> --quote "<their exact words>"`. Never ask the person to run anything.'
)
MAIN_EDIT = (
    "This file is in the main folder {root}, which stays on main and is not edited. "
    "Edit the copy in the task folder instead. Only the person can allow this."
)


def state_name(session_id):
    return re.sub(r"[^A-Za-z0-9_-]", "", session_id)[:100] + ".json"


def state_file(session_id):
    return os.path.join(STATES, state_name(session_id))


def read_state_file(path, session_id):
    """Return the state in this file when it belongs to this session, else {}."""
    try:
        with open(path) as f:
            state = json.load(f)
    except Exception:
        return {}
    ok = isinstance(state, dict) and state.get("session_id") == session_id
    return state if ok else {}


def read_state(session_id):
    """Return this session's state, or {} when there is none or it cannot be read."""
    if not session_id:
        return {}
    return read_state_file(state_file(session_id), session_id)


def write_state(state):
    os.makedirs(STATES, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=STATES, prefix=".", suffix=".tmp")
    try:
        with os.fdopen(handle, "w") as f:
            json.dump(state, f, indent=1)
            f.write("\n")
        os.replace(temp, state_file(state["session_id"]))
    except OSError:
        if os.path.exists(temp):
            os.remove(temp)
        raise


def verdict(state, session_id):
    """Say what the state means for this session. Any doubt is "not-asked"."""
    if not session_id or state.get("session_id") != session_id:
        return "not-asked"
    status = state.get("status")
    if status in ("approved", "small", "declined", "planning"):
        return status
    return "session-asked" if state.get("asked") is True else "not-asked"


def event_folder(event):
    return event.get("cwd") or os.getcwd()


def edit_target(event):
    """Return the real path of the file this edit changes. Raises on odd input."""
    tool_input = event["tool_input"]
    path = tool_input.get("file_path") or tool_input["notebook_path"]
    return os.path.realpath(os.path.join(event_folder(event), path))


def is_source_file(target, root):
    return any(_repo.is_inside(target, os.path.join(root, name)) for name in SOURCE_DIRS)


def plan_message(event, target, root):
    """Return the text that blocks this edit, or None when the plan gate lets it through."""
    if not is_source_file(target, root):
        return None
    session_id = event.get("session_id")
    found = verdict(read_state(session_id), session_id)
    if found in ALLOWED:
        return None
    return PLANNING if found == "planning" else NOT_ASKED


def hook():
    try:
        event = json.load(sys.stdin)
        target = edit_target(event)
        root = _repo.repo_top(target)
        if root is None or not _repo.is_yahpaz_repo(root):
            return 0
        message = plan_message(event, target, root)
        main_edit = _repo.is_main_folder_change(root, target)
    except Exception:
        return 0  # not something this gate understands: let it through
    if message:
        print(message, file=sys.stderr)
        return 2
    if main_edit:
        _repo.print_ask(MAIN_EDIT.format(root=root))
    return 0


class Parser(argparse.ArgumentParser):
    def error(self, message):
        print("plan_gate: " + message, file=sys.stderr)
        sys.exit(1)


def command(argv):
    parser = Parser(prog="plan_gate.py")
    sub = parser.add_subparsers(dest="cmd")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--session", default="")
    decline = sub.add_parser("decline", parents=[common])
    decline.add_argument("--quote", default="")
    approve = sub.add_parser("approve", parents=[common])
    approve.add_argument("--doc", default="")
    approve.add_argument("--quote", default="")
    sub.add_parser("small", parents=[common]).add_argument("reason")
    for name in ("clear", "done", "status"):
        sub.add_parser(name, parents=[common])
    args = parser.parse_args(argv)
    if not args.cmd:
        parser.error("use decline, approve, small, clear, done or status")
    session_id = " ".join((args.session or os.environ.get(ENV_NAME) or "").split())
    if not session_id:
        parser.error(f"which session? Pass --session <id> (or set {ENV_NAME})")

    old = read_state(session_id)
    if args.cmd == "status":
        shown = dict(old or {"session_id": session_id, "asked": False, "status": None})
        shown["verdict"] = verdict(old, session_id)
        print(json.dumps(shown))
        return 0

    state = {
        "session_id": session_id,
        "asked": old.get("asked") is True,
        "status": None,
        "doc_url": None,
        "quote": None,
        "reason": None,
        # timezone.utc, not datetime.UTC: the hook must run on a python3 older than 3.11.
        "set_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),  # noqa: UP017
        "last": old.get("last"),
    }
    if args.cmd == "decline":
        quote = args.quote.strip()
        if not quote:
            parser.error("decline needs --quote with the person's exact words")
        state.update(status="declined", asked=True, quote=quote)
    elif args.cmd == "approve":
        doc, quote = args.doc.strip(), args.quote.strip()
        if not quote:
            parser.error("approve needs --quote with the person's exact words")
        if doc != "chat-only" and not (doc.startswith("https://") and len(doc) > 8):
            parser.error("approve needs --doc with an https link, or chat-only")
        state.update(status="approved", asked=True, doc_url=doc, quote=quote)
    elif args.cmd == "small":
        reason = args.reason.strip()
        if len(reason) < 10:
            parser.error("small needs a real reason (10 characters or more)")
        state.update(status="small", reason=reason)
    elif args.cmd == "clear":
        state.update(status="planning")
    elif old.get("status"):  # done: the task ends; only "asked" and the task as "last"
        keys = ("status", "doc_url", "quote", "reason", "set_at")
        state.update(last={key: old.get(key) for key in keys})
    write_state(state)
    print(f"{state['status'] or 'done'} (session asked: {'yes' if state['asked'] else 'no'})")
    return 0


if __name__ == "__main__":
    sys.exit(command(sys.argv[1:]) if len(sys.argv) > 1 else hook())
