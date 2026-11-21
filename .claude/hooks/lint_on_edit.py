#!/usr/bin/env python3
"""Lint on edit: lints the one file an agent just edited, and fixes what it can.

Reads the PostToolUse JSON on stdin (tool_input.file_path, cwd).
The file's own git folder is the project: the tools run with that folder as their working
folder, so a task folder is linted as itself. oxlint is taken from the file's own
node_modules, else from the main checkout of the same repo (oxlint needs no config to run).
Files outside op-yh-26 folders are left alone.
Exit 2 with the remaining problems on stderr, which Claude Code shows to the agent.
TS, TSX, JS and MJS: oxlint --fix; like `npm run lint`, only errors stop the agent (oxlint
exits 0 on warnings, and the project carries old ones). The harness's own Python: ruff check --fix and ruff format
(ruff from .venv, PATH, or `uvx ruff`).
A missing tool, a slow tool, odd input or any surprise: exit 0, so an edit is never held up.
Limits: it only sees edits made with the edit tools, not files changed by shell commands.
Errors that need the whole project (tsc) are not covered: run `npm run build` before shipping.
"""

import json
import os
import shutil
import subprocess
import sys

import _repo

PYTHON = (".py",)
SCRIPT = (".ts", ".tsx", ".js", ".cjs", ".mjs", ".jsx")
SKIP_DIRS = {"node_modules", "dist", "dist-ssr", ".venv", "coverage", ".git"}
GENERATED = {"package-lock.json", "deno.lock"}
TIME_LIMIT = 20  # seconds, for each command
MAX_LINES = 20


def run(cmd, root):
    """Run one command from the project root. Return (exit code, output), or None."""
    try:
        done = subprocess.run(
            cmd,
            cwd=root,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
            timeout=TIME_LIMIT,
        )
        return done.returncode, done.stdout
    except (OSError, subprocess.SubprocessError):
        return None  # could not start, or too slow: never a reason to stop the agent


def is_skipped(rel):
    """True for files that are not ours to lint, by their path relative to the project."""
    parts = rel.split(os.sep)
    name = parts[-1]
    return bool(SKIP_DIRS.intersection(parts[:-1])) or name in GENERATED or name.endswith(".lock")


def edited_file(event):
    """Return (full path, path relative to the project, project root), or None when the
    file is not ours to lint."""
    tool_input = event["tool_input"]
    path = tool_input.get("file_path") or tool_input["notebook_path"]
    full = os.path.realpath(os.path.join(event.get("cwd") or os.getcwd(), path))
    if not os.path.isfile(full):
        return None
    root = _repo.repo_top(full)
    if root is None or not _repo.is_yahpaz_repo(root):
        return None
    rel = os.path.relpath(full, root)
    if is_skipped(rel):
        return None
    return full, rel, root


def tool_folders(root):
    """Return the folders to look for a tool in: the project, then its main checkout."""
    main_folder = _repo.main_checkout_of(root)
    return [root] if main_folder == root else [root, main_folder]


def oxlint(root):
    """Return the command that runs oxlint here, or None."""
    for folder in tool_folders(root):
        path = os.path.join(folder, "node_modules", ".bin", "oxlint")
        if os.access(path, os.X_OK):
            return [path]
    return None


def ruff(root):
    """Return the command prefix that runs ruff here, or None."""
    for folder in tool_folders(root):
        local = os.path.join(folder, ".venv", "bin", "ruff")
        if os.access(local, os.X_OK):
            return [local]
    found = shutil.which("ruff")
    if found:
        return [found]
    if shutil.which("uvx"):
        return ["uvx", "ruff"]
    return None


def steps(full, root):
    """Return the commands for this file, or a string naming the tool that is missing."""
    ext = os.path.splitext(full)[1].lower()
    if ext in PYTHON:
        tool = ruff(root)
        if not tool:
            return "ruff not found"
        return [
            tool + ["check", "--fix", "--output-format", "concise", full],
            tool + ["format", "--quiet", full],
        ]
    if ext in SCRIPT:
        tool = oxlint(root)
        if not tool:
            return "oxlint not found (run npm ci in the project folder)"
        return [tool + ["--fix", full]]
    return []


def main():
    target = edited_file(json.load(sys.stdin))
    if not target:
        return 0
    full, rel, root = target
    commands = steps(full, root)
    if isinstance(commands, str):
        print(f"lint_on_edit: {commands}, skipped {rel}")
        return 0
    problems = []
    for cmd in commands:
        result = run(cmd, root)
        if result is None:
            continue
        code, output = result
        if code != 0:
            problems += [line for line in output.replace(root + os.sep, "").splitlines() if line]
    if not problems:
        return 0
    more = ["..."] if len(problems) > MAX_LINES else []
    print(
        "\n".join(
            [f"Lint problems left in {rel} after automatic fixes:"]
            + problems[:MAX_LINES]
            + more
            + ["Fix these before continuing; do not ask the person to run anything."]
        ),
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)  # not something this hook understands: stay out of the way
