#!/usr/bin/env python3
"""Session start: tells the agent who it works with, the session id and the working mode.

Hook role (no arguments, SessionStart): reads the event JSON on stdin (session_id, source).
  Exports YAHPAZ_SESSION_ID through CLAUDE_ENV_FILE when Claude Code provides that file, and
  prints `hookSpecificOutput.additionalContext`: the person's first name, the session id, the
  recorded working mode, and whether the start question is still to be asked.
Command role (run by the agent, never by the person):
  session_start.py set-mode <orchestrator|regular> [--default] --session <id>
State, one file per session, ~/.local/state/yahpaz-harness/sessions/<session id>.json:
  {"session_id", "mode", "mode_default": bool}
The first name comes from `git config yahpaz.name`, else the first word of `git config
user.name`, else the OS user.
"""

import argparse
import getpass
import json
import os
import re
import sys

import _repo

STATES = os.path.join(_repo.STATE_HOME, "sessions")
ENV_NAME = "YAHPAZ_SESSION_ID"
SCRIPT = "python3 .claude/hooks/session_start.py"
MODES = ("orchestrator", "regular")
ORCHESTRATOR = (
    "Use sub agents wherever possible and makes sense. Preserve your context aggressively. "
    "They do the heavy lifting you coordinate and integrate."
)
REGULAR = "Work directly, and delegate only when it clearly helps."


def state_file(session_id):
    return os.path.join(STATES, re.sub(r"[^A-Za-z0-9_-]", "", session_id)[:100] + ".json")


def read_state(session_id):
    try:
        with open(state_file(session_id)) as f:
            state = json.load(f)
    except (OSError, ValueError):
        return {}
    return state if isinstance(state, dict) and state.get("session_id") == session_id else {}


def write_state(state):
    os.makedirs(STATES, exist_ok=True)
    path = state_file(state["session_id"])
    temp = path + ".tmp"
    with open(temp, "w") as f:
        json.dump(state, f, indent=1)
        f.write("\n")
    os.replace(temp, path)


def first_name():
    folder = os.getcwd()
    chosen = _repo.git_output(folder, "config", "yahpaz.name")
    if chosen:
        return chosen.split()[0]
    words = (_repo.git_output(folder, "config", "user.name") or "").split()
    if words:
        return words[0]
    try:
        return getpass.getuser().capitalize() or "Someone"
    except Exception:
        return "Someone"


def export_id(session_id):
    """Make the session id visible to later shell commands, when Claude Code allows it."""
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if not env_file or not re.fullmatch(r"[A-Za-z0-9_.-]+", session_id):
        return
    line = f"export {ENV_NAME}='{session_id}'\n"
    try:
        if os.path.exists(env_file):
            with open(env_file) as f:
                if line in f.read():
                    return
        with open(env_file, "a") as f:
            f.write(line)
    except OSError:
        pass


def context(who, session_id, state):
    sid = session_id or "<id>"
    mode = state.get("mode")
    lines = [
        "Yahpaz harness context (from .claude/hooks/session_start.py; see CLAUDE.md).",
        f"Person's first name: {who}",
        f"Session id: {session_id or 'unknown'}",
        f"Recorded mode: {mode or 'not chosen yet'}",
        "",
        "Rules for this session:",
        f'1. Start every reply with "{who}".',
    ]
    if mode:
        lines.append(f"2. The start question was answered (mode: {mode}). Do not ask it again.")
    else:
        lines += [
            "2. Before other work, ask one question with AskUserQuestion: "
            '"Which working mode?" with the options "Orchestrator mode" (description: '
            f'"{ORCHESTRATOR}") and "Regular mode" (description: "{REGULAR}"). '
            f"Then record the answer yourself: `{SCRIPT} set-mode <orchestrator|regular> "
            f"--session {sid}`. If AskUserQuestion is not available (a headless run), do not "
            f"ask: run `{SCRIPT} set-mode regular --default --session {sid}`.",
        ]
    return "\n".join(lines)


def start():
    event = json.load(sys.stdin)
    session_id = " ".join(str(event.get("session_id") or "").split())[:200]
    state = read_state(session_id) if session_id else {}
    if session_id:
        export_id(session_id)
    output = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context(first_name(), session_id, state),
        }
    }
    print(json.dumps(output))
    return 0


class Parser(argparse.ArgumentParser):
    def error(self, message):
        print("session_start: " + message, file=sys.stderr)
        sys.exit(1)


def command(argv):
    parser = Parser(prog="session_start.py")
    sub = parser.add_subparsers(dest="cmd")
    set_mode = sub.add_parser("set-mode")
    set_mode.add_argument("mode", choices=MODES)
    set_mode.add_argument("--default", action="store_true")
    set_mode.add_argument("--session", default="")
    args = parser.parse_args(argv)
    if args.cmd != "set-mode":
        parser.error("use set-mode <orchestrator|regular> --session <id>")
    session_id = " ".join((args.session or os.environ.get(ENV_NAME) or "").split())
    if not session_id:
        parser.error(f"which session? Pass --session <id> (or set {ENV_NAME})")
    write_state({"session_id": session_id, "mode": args.mode, "mode_default": args.default})
    print(f"mode: {args.mode}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.exit(command(sys.argv[1:]))
    try:
        sys.exit(start())
    except Exception:
        sys.exit(0)  # never hold up a session start
