#!/usr/bin/env python3
"""Review gate: no pull request until the commit being shipped has been reviewed.

Hook role (no arguments): reads the PreToolUse JSON on stdin (tool_input.command, cwd).
`gh pr create` (or `gh pr new`) and `gh pr ready` are let through only when the review
record of the task folder they come from names its current HEAD commit; otherwise exit 2.
The task folder is the one `gh -R` names (with --head, for the other repo), else the folder
of the command after any `cd` in it, else the event's folder. A pull request is never opened
from a main folder: that is refused whatever the record says.
It looks past the same wrappers as danger_guard.py and inside `sh|bash|zsh -c "..."`.
Pull requests have no file limit in Yahpaz.
The record is one file per task folder, at `git rev-parse --git-path yahpaz-review.json`
(inside the git folder of that worktree, so git never tracks it).
Command role (run by the agent, never by the person). The folder is --repo, else the
current folder:
  review_gate.py done "<one-line outcome, 10 characters or more>" [--repo <task folder>]
  review_gate.py status [--repo <task folder>]
  review_gate.py clear [--repo <task folder>]
`done` is refused in a main folder.
Limits: it enforces a process for agents only. A pull request opened by hand on GitHub,
or with a tool other than `gh` (including `gh api`), is not covered, and an agent could
write the record without reviewing. It is not a security boundary.
"""

import argparse
import json
import os
import re
import sys
from collections import namedtuple
from datetime import datetime, timezone

import _repo

GATED = ("create", "new", "ready")  # `gh pr <this>`
REPO_FLAGS = ("-R", "--repo")
HEAD_FLAGS = ("-H", "--head")
GH_VALUE_FLAGS = REPO_FLAGS + HEAD_FLAGS
RECORD_NAME = "yahpaz-review.json"
GH_REPO_ASSIGNMENT = "GH_REPO="
PrCommand = namedtuple("PrCommand", "words folder env_repo")  # gh words, folder, GH_REPO value
CRUDE = re.compile(r"\bgh\b.*\bpr\b.*\b(create|new|ready)\b", re.S)

BLOCKED = (
    "Review gate: review the changes before opening the pull request. "
    "Run the code-review skill on this branch's changes, fix what it finds (commit the fixes), "
    "then run `python3 .claude/hooks/review_gate.py done --repo <task folder> "
    '"<one-line outcome>"` and try again. '
    "Never ask the person to run anything."
)
NO_GIT = (
    "Review gate: could not read the current commit of this task folder, so the pull request "
    "was stopped. Check that git works here, then try again. "
    "Never ask the person to run anything."
)
NO_FOLDER = (
    "Review gate: could not tell which task folder this pull request comes from, so it was "
    "stopped. Run gh from inside it: cd <task folder> && gh pr create ... "
    "Never ask the person to run anything."
)
FROM_MAIN = (
    "Review gate: pull requests are opened from the task folder, never from the main folder. "
    "cd into the task folder (../op-yh-26-<slug>) and run gh there. "
    "Never ask the person to run anything."
)


def plain_words(words):
    """Return the words after `gh` that are neither flags nor the values of -R and -H."""
    args, plain = words[1:], []
    while args:
        if args[0] in GH_VALUE_FLAGS:
            args = args[2:]
            continue
        if not args[0].startswith("-"):
            plain.append(args[0])
        args = args[1:]
    return plain


def is_gated_pr(words):
    """True when these words are `gh pr create|new|ready`, with any flags between."""
    plain = plain_words(words)
    return len(plain) >= 2 and plain[0] == "pr" and plain[1] in GATED


def env_repo_of(prefix):
    """Return the GH_REPO value set before the command, or None."""
    for word in prefix:
        if word.startswith(GH_REPO_ASSIGNMENT):
            return word[len(GH_REPO_ASSIGNMENT) :]
    return None


def find_pr_in_shell_text(step, depth):
    """Look for a pull request command inside `sh -c "..."`. Return a PrCommand or None."""
    from danger_guard import shell_command_text

    inner = shell_command_text(step.words)
    if inner is None:
        return None
    if depth >= 3:
        return PrCommand([], None, None)  # too deep to follow: any doubt is a yes
    return find_pr_command(inner, step.cwd, depth + 1)


def find_pr_command(command, cwd, depth=0):
    """Return a PrCommand for the first command in this line that opens a pull request, or
    None. A `cd` earlier in the line moves the folder."""
    try:
        from danger_guard import walk_commands  # one parser for all hooks
    except Exception:
        return PrCommand(None, cwd, None) if CRUDE.search(command) else None  # any doubt is a yes
    for step in walk_commands(command, cwd):
        name = os.path.basename(step.words[0])
        if name == "gh" and is_gated_pr(step.words):
            return PrCommand(step.words, step.cwd, env_repo_of(step.prefix))
        if name in ("sh", "bash", "zsh"):
            found = find_pr_in_shell_text(step, depth)
            if found:
                return found
    return None


def equals_form_value(word, names):
    """Return x for a word like `--repo=x`, else None."""
    for name in names:
        if name.startswith("--") and word.startswith(name + "="):
            return word[len(name) + 1 :]
    return None


def attached_short_value(word, names):
    """Return x for a word like `-Bx` (a one-letter flag with its value attached), else None."""
    for name in names:
        is_short = len(name) == 2 and not name.startswith("--")
        if is_short and word.startswith(name) and len(word) > len(name):
            return word[len(name) :]
    return None


def flag_value(words, names):
    """Return the value of a flag given as `-R x`, `--repo x` or `--repo=x`, else None."""
    for index, word in enumerate(words):
        if word in names:
            return words[index + 1] if index + 1 < len(words) else None
        value = equals_form_value(word, names)
        if value is None:
            value = attached_short_value(word, names)
        if value is not None:
            return value
    return None


def worktree_with_branch(main_folder, branch):
    """Return the folder of the worktree that has this branch checked out, or None."""
    listing = _repo.git_output(main_folder, "worktree", "list", "--porcelain")
    if not listing:
        return None
    folder = None
    for line in listing.splitlines():
        if line.startswith("worktree "):
            folder = line[len("worktree ") :]
        elif line == f"branch refs/heads/{branch}":
            return os.path.realpath(folder) if folder else None
    return None


def repo_name_of(repo_flag):
    """Return NAME from OWNER/NAME, with a trailing .git removed."""
    name = repo_flag.split("/")[-1]
    return name[: -len(".git")] if name.endswith(".git") else name


def pr_folder(pr_command):
    """Return the task folder this pull request comes from, or None when it cannot be told.
    With --head, the folder that has that branch checked out (in the repo -R or GH_REPO names,
    else the repo of the current folder); without it, the current folder."""
    if pr_command.folder is None:
        return None
    top = _repo.repo_top(pr_command.folder)
    if top is None:
        return None
    main_folder = _repo.main_checkout_of(top)
    repo_flag = flag_value(pr_command.words or [], REPO_FLAGS) or pr_command.env_repo
    name = repo_name_of(repo_flag) if repo_flag else os.path.basename(main_folder)
    head = flag_value(pr_command.words or [], HEAD_FLAGS)
    if head is None:
        same_repo = name == os.path.basename(main_folder) or _repo.is_yahpaz_repo(top)
        return top if same_repo else None
    other_main = os.path.join(os.path.dirname(main_folder), name)
    return worktree_with_branch(other_main, head.split(":")[-1])


def names_another_repo(pr_command):
    """True when -R or GH_REPO names a repo that is not op-yh-26."""
    repo_flag = flag_value(pr_command.words or [], REPO_FLAGS) or pr_command.env_repo
    return bool(repo_flag) and repo_name_of(repo_flag) not in _repo.REPO_NAMES


def recorded_sha(folder):
    """Return the commit the review record of this folder names, or None."""
    path = _repo.git_path_of(folder, RECORD_NAME)
    try:
        with open(path) as f:
            return json.load(f).get("sha")
    except Exception:
        return None


def hook():
    try:
        event = json.load(sys.stdin)
        command = event["tool_input"]["command"]
        cwd = os.path.realpath(event.get("cwd") or os.getcwd())
        found = find_pr_command(command, cwd)
    except Exception:
        return 0  # not something this gate understands: let it through
    if not found:
        return 0
    if names_another_repo(found):
        return 0  # a pull request for another repo: not this gate's pull request
    folder = pr_folder(found)
    if folder is None:
        print(NO_FOLDER, file=sys.stderr)
        return 2
    if not _repo.is_yahpaz_repo(folder):
        return 0  # not a Yahpaz folder: not this gate's pull request
    if _repo.is_main_checkout(folder):
        print(FROM_MAIN, file=sys.stderr)
        return 2
    head = _repo.git_output(folder, "rev-parse", "HEAD")
    if not head:
        print(NO_GIT, file=sys.stderr)
        return 2
    if recorded_sha(folder) == head:
        return 0
    print(BLOCKED, file=sys.stderr)
    return 2


def fail(message):
    print("review_gate: " + message, file=sys.stderr)
    return 1


class Parser(argparse.ArgumentParser):
    def error(self, message):
        print("review_gate: " + message, file=sys.stderr)
        sys.exit(1)


def parse_arguments(argv):
    parser = Parser(prog="review_gate.py")
    sub = parser.add_subparsers(dest="cmd")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--repo", default="")
    sub.add_parser("done", parents=[common]).add_argument("outcome")
    sub.add_parser("status", parents=[common])
    sub.add_parser("clear", parents=[common])
    args = parser.parse_args(argv)
    if not args.cmd:
        parser.error('use done "<one-line outcome>", status or clear')
    return args


def record_review(folder, outcome_text):
    """Write the review record of this task folder. Return the exit code."""
    if _repo.is_main_checkout(folder):
        return fail("record the review in the task folder, or pass --repo <task folder>")
    outcome = " ".join(outcome_text.split())
    if len(outcome) < 10:
        return fail("done needs a real one-line outcome (10 characters or more)")
    head = _repo.git_output(folder, "rev-parse", "HEAD")
    dirty = _repo.git_output(folder, "status", "--porcelain", "--untracked-files=no")
    path = _repo.git_path_of(folder, RECORD_NAME)
    if head is None or dirty is None or path is None:
        return fail("could not read the git state of this folder")
    if dirty:
        return fail("commit your changes first: the review must cover what will be pushed")
    record = {
        "sha": head,
        # timezone.utc, not datetime.UTC: the hook must run on a python3 older than 3.11.
        "reviewed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),  # noqa: UP017
        "outcome": outcome,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(record, f, indent=1)
        f.write("\n")
    print("recorded " + head[:12])
    return 0


def show_record(folder):
    path = _repo.git_path_of(folder, RECORD_NAME)
    try:
        with open(path) as f:
            print(f.read().strip())
    except (OSError, TypeError):
        print('{"status": "none"}')
    return 0


def clear_record(folder):
    path = _repo.git_path_of(folder, RECORD_NAME)
    if path and os.path.exists(path):
        os.remove(path)
    print("cleared")
    return 0


def command(argv):
    args = parse_arguments(argv)
    if args.repo and not os.path.isdir(args.repo):
        return fail("not a folder: " + args.repo)
    folder = _repo.repo_top(args.repo or os.getcwd())
    if folder is None:
        return fail("not inside a git folder")
    if not _repo.is_yahpaz_repo(folder):
        return fail("not an op-yh-26 folder")
    if args.cmd == "done":
        return record_review(folder, args.outcome)
    if args.cmd == "status":
        return show_record(folder)
    return clear_record(folder)


if __name__ == "__main__":
    sys.exit(command(sys.argv[1:]) if len(sys.argv) > 1 else hook())
