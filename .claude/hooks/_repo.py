"""Shared helpers for the hooks: which git folder a path belongs to, and where state lives.

Standard library only. The hooks never take the project folder from the environment: it keeps
naming the main checkout while the work happens in a task folder (a git worktree). They find
the repo from the event's folder, the edited file's path, or the folder of the command.

Two kinds of state:
  per session (plan gate, working mode) and the task list: STATE_HOME, outside every checkout
  per commit (the review record): `git rev-parse --git-path yahpaz-review.json`, one per worktree
"""

import json
import os
import subprocess
from collections import namedtuple

REPO_NAMES = ("op-yh-26",)
MAIN_BRANCH = "infra/bootstrap"  # the production branch: Netlify and the edge-function deploy
STATE_HOME = os.path.join(os.path.expanduser("~"), ".local", "state", "yahpaz-harness")
GIT_TIME_LIMIT = 3  # seconds, for each local git command
HARNESS_MARKER = os.path.join(".claude", "hooks", "_repo.py")  # a folder that holds this file
GitDirs = namedtuple("GitDirs", "git_dir common_dir")


def git_output(folder, *args):
    """Return the stripped output of `git -C folder ...`, or None when it fails.
    None and "" differ: "" is a successful command with no output."""
    try:
        done = subprocess.run(
            ["git", "-C", folder, *args],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            errors="replace",
            timeout=GIT_TIME_LIMIT,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout.strip() if done.returncode == 0 else None


def nearest_existing_folder(path):
    """Walk up from path until a folder that exists is found."""
    folder = path if os.path.isdir(path) else os.path.dirname(path)
    while folder and not os.path.isdir(folder):
        parent = os.path.dirname(folder)
        if parent == folder:
            return None
        folder = parent
    return folder or None


def repo_top(path):
    """Return the real path of the git folder that holds path, or None. A path inside a
    .git folder has no work tree: it belongs to the folder that owns that git folder."""
    folder = nearest_existing_folder(os.path.abspath(path))
    if folder is None:
        return None
    top = git_output(folder, "rev-parse", "--show-toplevel")
    if top:
        return os.path.realpath(top)
    common = git_output(folder, "rev-parse", "--path-format=absolute", "--git-common-dir")
    return os.path.dirname(os.path.realpath(common)) if common else None


def git_dirs(top):
    """Return GitDirs(git_dir, common_dir) as real paths, or None."""
    output = git_output(top, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir")
    if not output:
        return None
    lines = output.splitlines()
    if len(lines) != 2:
        return None
    return GitDirs(os.path.realpath(lines[0]), os.path.realpath(lines[1]))


def is_inside(path, folder):
    """True when path is folder or under it. Case is ignored: macOS folders usually are."""
    path, folder = path.lower(), folder.lower()
    return path == folder or path.startswith(folder + os.sep)


def is_main_checkout(top):
    """True when top is a main checkout, not a linked worktree."""
    dirs = git_dirs(top)
    return dirs is not None and dirs.git_dir == dirs.common_dir


def main_checkout_of(top):
    """Return the main checkout that top belongs to (top itself when it is the main one)."""
    dirs = git_dirs(top)
    if dirs is None:
        return top
    return os.path.dirname(dirs.common_dir)


def is_yahpaz_repo(top):
    """True when top is the main checkout or a task folder of op-yh-26: its main folder has
    that name, or the folder holds the harness itself (a clone under another name)."""
    if os.path.basename(main_checkout_of(top)) in REPO_NAMES:
        return True
    return os.path.isfile(os.path.join(top, HARNESS_MARKER))


def is_main_folder_change(root, path):
    """True when path is in the main checkout root, outside its .claude/state/ folder."""
    if not is_main_checkout(root):
        return False
    return not is_inside(path, os.path.join(root, ".claude", "state"))


def git_path_of(top, name):
    """Return the absolute path git keeps for name in this worktree, or None."""
    path = git_output(top, "rev-parse", "--path-format=absolute", "--git-path", name)
    return path or None


def print_ask(reason):
    """Ask the person, through Claude Code's own prompt. The caller then exits 0."""
    answer = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(answer))
