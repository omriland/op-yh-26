#!/usr/bin/env python3
"""Danger guard: blocks a short list of shell commands that are hard to undo, and asks the
person before anything changes the main folder or goes live outside a pull request.

Reads the PreToolUse JSON on stdin (tool_input.command, cwd). Two answers:
  block  exit 2 with the reason on stderr (force pushes, pushes to main or infra/bootstrap,
         `supabase db reset`, `task.py destroy` without a task name, docker prune and
         down -v, recursive deletes outside the build folders).
  ask    exit 0 with permissionDecision "ask" on stdout, so Claude Code shows the person a
         prompt that only they can accept. Used for the main folder (below), for
         `task.py destroy --force` (it throws away unsaved work), and for anything that
         goes live without a merged pull request: `supabase db push`, `supabase functions
         deploy`, `supabase migration repair` and `netlify deploy --prod`.
A block wins over an ask found in the same command line.
Looks past wrappers (sudo, time, nohup, env, command, exec, nice, npx, VAR=value)
and inside `sh -c "..."`, `bash -c "..."` and `zsh -c "..."`. It follows `cd` and `git -C`
inside the command, so the folder a command runs in is the one it really runs in.
Main folder: the main checkout of op-yh-26 (not a task folder, which is a git worktree).
It stays on infra/bootstrap. These ask the person:
  git switch, checkout, commit, reset, merge, rebase, pull, stash, restore, clean,
  cherry-pick, revert, am, apply, add, rm, mv; git branch with a delete, force, move or
  copy flag; and a redirection (`>`, `>>`, `>|`, `tee`) that writes into the main folder
  outside .claude/state/. Allowed there: status, log, diff, fetch, show, worktree
  add/list/prune/remove, plain `git branch`, rev-parse, config, ls-files, remote.
  When the folder cannot be told (`cd "$X" && git commit`), the command is asked as if main.
  Other git repos are left alone.
  Also asked there: git symbolic-ref (with a value), update-ref, read-tree, checkout-index,
  `git worktree remove --force`, and `gh pr checkout`.
It also looks past shell keywords (if, then, do, while, {, !), follows subshells (a cd inside
( ) ends at the closing parenthesis), and ignores the body of a heredoc.
Not covered: find -delete, xargs/eval, commands hidden inside scripts, and file writes that
are not a redirection or tee (sed -i, cp, mv, install, python writes). A `cd` to a folder
that does not exist, or with a flag, makes the folder unknown (asked as if main). The
folder of `git --git-dir/--work-tree`, `GIT_DIR=`, `env -C` and `sudo -D` is also unknown.
"""

import json
import os
import re
import shlex
import sys
from collections import namedtuple

import _repo

# Recursive deletes are allowed only for these, and never under SOURCE_DIRS.
BUILD_DIRS = ("dist", "dist-ssr", "coverage")  # directly under the project root
CACHE_DIRS = ("__pycache__", ".ruff_cache", "node_modules", ".vite")  # anywhere outside SOURCE_DIRS
SOURCE_DIRS = ("src", "supabase")  # the web app, and the database and edge functions
# Wrapper commands to look past, with the flags of each that take a value.
WRAPPERS = {
    "sudo": ("-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U"),
    "time": (),
    "nohup": (),
    "command": (),
    "env": ("-u", "-C", "-S", "-P"),
    "exec": ("-a",),
    "nice": ("-n",),
    "npx": ("-p", "--package"),
}
ASSIGNMENT = re.compile(r"^[A-Za-z_]\w*=")
# Words that start a command inside if/while/for blocks and groups.
SHELL_KEYWORDS = ("if", "then", "else", "elif", "do", "while", "until", "!", "{")
FOLDER_PREFIX_ASSIGNMENTS = ("GIT_DIR=", "GIT_WORK_TREE=")
FOLDER_PREFIX_FLAGS = ("-C", "-D")  # env -C and sudo -D change the folder a command runs in
CD_COMMANDS = ("cd", "pushd", "popd")
SUBSHELL_OPEN = ["("]
SUBSHELL_CLOSE = [")"]
HEREDOC_START = re.compile(r"(?<!<)<<(?!<)-?\s*(['\"]?)([A-Za-z_]\w*)\1")
TASK_SCRIPT = os.path.join(".claude", "hooks", "task.py")
TASK_DESTROY_NEEDS_NAME = "task.py destroy needs the task name: task.py destroy <slug>"
TASK_DESTROY_FORCE_ASK = (
    "task.py destroy --force throws away unsaved or unmerged work in the task folder. "
    "Only the person can allow this."
)
GOES_LIVE_ASK = (
    "{what} changes production directly, outside a merged pull request. "
    "Production changes go live by merging the pull request. Only the person can allow this."
)
GIT_OPTIONS_WITH_VALUE = ("-c", "-C", "--git-dir", "--work-tree", "--namespace")
GIT_FOLDER_OPTIONS = ("--git-dir", "--work-tree")
Step = namedtuple("Step", "words cwd prefix")  # prefix: words dropped before the command
PROTECTED = ("main", "master", _repo.MAIN_BRANCH)
SEPARATORS = set(";|&()")
UNKNOWN_PATH_CHARS = "$~*`"
ASK = "ask"
BLOCK = "block"
# git commands that change a checkout, its index or its history.
MAIN_GIT_CHANGES = (
    "switch",
    "checkout",
    "commit",
    "reset",
    "merge",
    "rebase",
    "pull",
    "stash",
    "restore",
    "clean",
    "cherry-pick",
    "revert",
    "am",
    "apply",
    "add",
    "rm",
    "mv",
    "update-ref",
    "read-tree",
    "checkout-index",
)
READ_ONLY_FORMS = {"stash": ("list", "show"), "apply": ("--check", "--stat", "--numstat")}
BRANCH_SHORT_FLAGS = "DdfmMcC"
BRANCH_LONG_FLAGS = ("--delete", "--force", "--move", "--copy")
REDIRECT_TOKENS = (">", ">>", ">|", "&>", "&>>")
MAIN_FOLDER_ASK = (
    "This is the main folder {root}, which stays on infra/bootstrap. "
    "Work in the task folder (../{repo}-<slug>) instead. Only the person can allow this."
)
UNKNOWN_FOLDER_ASK = (
    "Could not tell which folder this command changes; it may be the main folder, which stays "
    "on infra/bootstrap. Work in the task folder (../op-yh-26-<slug>) instead. "
    "Only the person can allow this."
)
UNKNOWN_BRANCH_BLOCK = (
    "could not tell which branch is pushed; cd into the task folder by its full path"
)


def without_heredoc_bodies(command):
    """Drop the lines of heredoc bodies: they are text, not commands."""
    kept, end_word = [], None
    for line in command.split("\n"):
        if end_word is not None:
            if line.strip() == end_word:
                end_word = None
            continue
        kept.append(line)
        start = HEREDOC_START.search(line)
        if start:
            end_word = start.group(2)
    return "\n".join(kept)


def parenthesis_markers(token):
    """Return one marker segment for each ( or ) in a separator token."""
    markers = []
    for char in token:
        if char == "(":
            markers.append(SUBSHELL_OPEN)
        elif char == ")":
            markers.append(SUBSHELL_CLOSE)
    return markers


def segments(command):
    """Split a command line into simple commands, each a list of words. A ( or ) comes out
    as its own one-word segment (SUBSHELL_OPEN, SUBSHELL_CLOSE)."""
    text = without_heredoc_bodies(command)
    try:
        lexer = shlex.shlex(text.replace("\n", " ; "), posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        lexer.commenters = ""
        tokens = list(lexer)
    except ValueError:
        tokens = re.sub(r"&&|\|\||[;|\n]", " ; ", text).split()
    out, current = [], []
    for token in tokens:
        if token and set(token) <= SEPARATORS:
            out.append(current)
            out += parenthesis_markers(token)
            current = []
        else:
            current.append(token)
    out.append(current)
    return [s for s in out if s]


def strip_prefix(words):
    """Drop leading VAR=value assignments, shell keywords and wrapper commands with their flags."""
    while words:
        name = os.path.basename(words[0])
        if ASSIGNMENT.match(words[0]) or words[0] in SHELL_KEYWORDS:
            words = words[1:]
        elif name in WRAPPERS:
            takes_value = WRAPPERS[name]
            words = words[1:]
            while words and words[0].startswith("-"):
                flag = words[0]
                words = words[2:] if flag in takes_value else words[1:]
                if flag == "--":
                    break
        else:
            break
    return words


def prefix_moves_folder(prefix):
    """True when the words dropped before a command change the folder it runs in
    (GIT_DIR=, GIT_WORK_TREE=, env -C, sudo -D, --chdir)."""
    for word in prefix:
        if word.startswith(FOLDER_PREFIX_ASSIGNMENTS) or word in FOLDER_PREFIX_FLAGS:
            return True
        if word.startswith("--chdir"):
            return True
    return False


def short_flag(words, letters):
    return any(re.match(r"^-[A-Za-z0-9]+$", w) and set(w[1:]) & set(letters) for w in words)


def has_unknown_path_chars(path):
    return any(char in path for char in UNKNOWN_PATH_CHARS)


def expand_home(path):
    """Expand a leading ~ or ~/ to the home folder."""
    if path == "~" or path.startswith("~/"):
        return os.path.expanduser(path)
    return path


def follow_cd(words, cwd):
    """Return the folder after a cd, pushd or popd command, or None when it cannot be told:
    popd, a flag, an unexpanded variable, or a folder that does not exist (the cd fails)."""
    if os.path.basename(words[0]) == "popd":
        return None
    target = expand_home(words[1] if len(words) > 1 else "~")
    if target.startswith("-") or has_unknown_path_chars(target):
        return None
    if cwd is None and not os.path.isabs(target):
        return None
    folder = os.path.realpath(os.path.join(cwd or "", target))
    return folder if os.path.isdir(folder) else None


def walk_commands(command, cwd):
    """Yield a Step (words, folder, prefix) for each simple command in the line, in order.
    A cd moves the folder for the commands after it; a subshell puts it back when it closes."""
    saved_folders = []
    for words in segments(command):
        if words == SUBSHELL_OPEN:
            saved_folders.append(cwd)
            continue
        if words == SUBSHELL_CLOSE:
            cwd = saved_folders.pop() if saved_folders else cwd
            continue
        stripped = strip_prefix(words)
        if not stripped:
            continue
        if os.path.basename(stripped[0]) in CD_COMMANDS:
            cwd = follow_cd(stripped, cwd)
            continue
        prefix = words[: len(words) - len(stripped)]
        folder = None if prefix_moves_folder(prefix) else cwd
        yield Step(stripped, folder, prefix)


def git_folder_and_arguments(words, cwd):
    """Return (folder the git command runs in or None, the arguments after the global options)."""
    folder = cwd
    args = words[1:]
    while args and args[0].startswith("-"):
        option = args[0]
        if option == "-C" and len(args) > 1:
            folder = join_git_folder(folder, args[1])
            args = args[2:]
        elif option in GIT_OPTIONS_WITH_VALUE:
            folder = None if option in GIT_FOLDER_OPTIONS else folder
            args = args[2:]
        else:
            folder = None if option.startswith(GIT_FOLDER_OPTIONS) else folder
            args = args[1:]
    return folder, args


def join_git_folder(folder, directory):
    """Apply one `git -C <directory>` to the folder the command runs in."""
    directory = expand_home(directory)
    if has_unknown_path_chars(directory):
        return None
    if os.path.isabs(directory):
        return os.path.realpath(directory)
    if folder is None:
        return None
    return os.path.realpath(os.path.join(folder, directory))


def block_for(rule):
    """Turn a rule text (or None) into a finding."""
    return (BLOCK, rule) if rule else None


def main_folder_reason(root):
    return MAIN_FOLDER_ASK.format(root=root, repo=os.path.basename(root))


def is_yahpaz_main_folder(root):
    return root is not None and _repo.is_yahpaz_repo(root) and _repo.is_main_checkout(root)


def is_read_only_form(args):
    """True for forms of a changing git command that change nothing: stash list, apply --check."""
    allowed = READ_ONLY_FORMS.get(args[0], ())
    return any(word in allowed for word in args[1:])


def branch_changes(options):
    """True for git branch with a delete, force, move or copy flag (also combined: -Df)."""
    return short_flag(options, BRANCH_SHORT_FLAGS) or any(o in BRANCH_LONG_FLAGS for o in options)


def symbolic_ref_writes(options):
    """True for `git symbolic-ref HEAD <ref>` (two values) and for -d."""
    values = [option for option in options if not option.startswith("-")]
    return len(values) >= 2 or "-d" in options


def worktree_force_remove(options):
    return "remove" in options and ("--force" in options or short_flag(options, "f"))


def changes_checkout(args):
    """True when these git arguments change the checkout, its index, its branches or its HEAD."""
    name, options = args[0], args[1:]
    if name in MAIN_GIT_CHANGES:
        return not is_read_only_form(args)
    if name == "branch":
        return branch_changes(options)
    if name == "symbolic-ref":
        return symbolic_ref_writes(options)
    if name == "worktree":
        return worktree_force_remove(options)
    return False


def main_folder_change_reason(folder):
    """Return the ask reason when a change made in this folder is a change to a main folder
    (an unknown folder counts as one), else None."""
    if folder is None:
        return UNKNOWN_FOLDER_ASK
    root = _repo.repo_top(folder)
    if is_yahpaz_main_folder(root):
        return main_folder_reason(root)
    return None


def main_checkout_git_change(args, folder):
    """Return the ask reason when this git command changes a main folder (or may), else None."""
    if not args or not changes_checkout(args):
        return None
    return main_folder_change_reason(folder)


def check_push(args, folder):
    flags = [a for a in args if a.startswith("-")]
    names = [a for a in args if not a.startswith("-")]
    refs = names[1:]  # names[0] is the remote
    if (
        short_flag(flags, "f")
        or any(f.startswith("--force") for f in flags)
        or any(r.startswith("+") for r in refs)
    ):
        return BLOCK, "force pushes are not allowed"
    if "--all" in flags or "--mirror" in flags:
        return BLOCK, "pushing to infra/bootstrap is not allowed"
    targets = [r.split(":")[-1].replace("refs/heads/", "") for r in refs] or ["HEAD"]
    if "HEAD" in targets:
        branch = None if folder is None else _repo.git_output(folder, "branch", "--show-current")
        if branch is None:
            return BLOCK, UNKNOWN_BRANCH_BLOCK
        targets.append(branch)
    if any(t in PROTECTED for t in targets):
        return (
            BLOCK,
            "pushing to infra/bootstrap is not allowed: it goes live through a pull request",
        )
    return None


def check_git(words, cwd):
    folder, args = git_folder_and_arguments(words, cwd)
    if not args:
        return None
    if args[0] == "push":
        return check_push(args[1:], folder)
    reason = main_checkout_git_change(args, folder)
    return (ASK, reason) if reason else None


def check_docker(words):
    if "prune" in words:
        return "docker prune commands are not allowed"
    if (words[0] == "docker-compose" or "compose" in words) and "down" in words:
        after = words[words.index("down") + 1 :]
        if "--volumes" in after or short_flag(after, "v"):
            return "removing the stack with its data (down -v) is not allowed"
    return None


def rm_full_path(cwd, target):
    """Return the path a delete would reach, with the folders above it resolved."""
    full = os.path.normpath(os.path.join(cwd or "", target))
    if target.endswith(os.sep):  # rm follows a link only when it ends with a slash
        return os.path.realpath(full)
    return os.path.join(os.path.realpath(os.path.dirname(full)), os.path.basename(full))


def rm_root(cwd, target, full):
    """Return the Yahpaz git folder the delete is measured against, or None. An absolute target
    is measured against its own folder, a relative one against the folder the command runs in."""
    if cwd and not os.path.isabs(target):
        root = _repo.repo_top(cwd)
    else:
        root = _repo.repo_top(os.path.dirname(full))
    if root is None or not _repo.is_yahpaz_repo(root):
        return None
    return root


def check_rm(words, cwd):
    args = words[1:]
    if "--" in args:
        cut = args.index("--")
        flags, targets = [a for a in args[:cut] if a.startswith("-")], args[cut + 1 :]
        targets += [a for a in args[:cut] if not a.startswith("-")]
    else:
        flags = [a for a in args if a.startswith("-")]
        targets = [a for a in args if not a.startswith("-")]
    if not ("--recursive" in flags or short_flag(flags, "rR")):
        return None
    rule = "deleting folders is only allowed for this project's build folders"
    for target in targets:
        if has_unknown_path_chars(target) or ".." in target:
            return rule
        if cwd is None and not os.path.isabs(target):
            return rule
        full = rm_full_path(cwd, target)
        root = rm_root(cwd, target, full)
        if root is None or not full.startswith(root + os.sep):
            return rule
        parts = os.path.relpath(full, root).split(os.sep)
        if parts[0] in SOURCE_DIRS:
            return rule
        if parts[0] not in BUILD_DIRS and not set(parts) & set(CACHE_DIRS):
            return rule
    return None


def write_targets(words):
    """Return the words that name a file this command writes: after `>`, `>>`, `>|`, and
    each argument of tee that is not a flag."""
    targets = []
    for index, word in enumerate(words[:-1]):
        if word in REDIRECT_TOKENS:
            targets.append(words[index + 1])
    if os.path.basename(words[0]) == "tee":
        targets += [word for word in words[1:] if not word.startswith("-")]
    return targets


def resolved_write_target(target, cwd):
    """Return the real path of a write target, or None when it cannot or need not be checked
    (a known gap: a relative target while the folder is unknown)."""
    target = expand_home(target)
    if target.startswith("/dev/") or has_unknown_path_chars(target):
        return None
    if cwd is None and not os.path.isabs(target):
        return None
    full = os.path.normpath(os.path.join(cwd or "", target))
    return os.path.join(os.path.realpath(os.path.dirname(full)), os.path.basename(full))


def main_folder_write_reason(full):
    """Return the ask reason when this file is in a main folder outside .claude/state/."""
    root = _repo.repo_top(os.path.dirname(full))
    if not is_yahpaz_main_folder(root) or not _repo.is_main_folder_change(root, full):
        return None
    return main_folder_reason(root)


def check_redirects(words, cwd):
    """Ask when a redirection or tee writes into a main folder.
    Not covered: sed -i, cp, mv, install, python writes and scripts."""
    for target in write_targets(words):
        full = resolved_write_target(target, cwd)
        reason = main_folder_write_reason(full) if full else None
        if reason:
            return ASK, reason
    return None


def shell_command_text(words):
    """Return the string given to sh/bash/zsh -c (also -lc, -ic...), or None when there is none."""
    for index, word in enumerate(words[1:-1], 1):
        if re.match(r"^-[A-Za-z]*c$", word):
            return words[index + 1]
        if not word.startswith("-"):
            return None  # a script file, not -c
    return None


def check_shell(words, cwd, depth):
    """Run the same checks on the string given to sh/bash/zsh -c."""
    inner = shell_command_text(words)
    if inner is None:
        return None
    if depth >= 3:
        return BLOCK, "deeply nested shell commands are not allowed"
    return check(inner, cwd, depth + 1)


def check_gh(words, cwd):
    """Ask for `gh pr checkout` in a main folder: it switches the branch."""
    if "pr" not in words or "checkout" not in words:
        return None
    reason = main_folder_change_reason(cwd)
    return (ASK, reason) if reason else None


def runs_task_script(words):
    """True for `python3 .claude/hooks/task.py ...` (any path to it)."""
    return any(word.endswith(TASK_SCRIPT) or word.endswith("task.py") for word in words[1:2])


def check_task_script(words):
    """destroy needs a task name; --force asks the person first."""
    arguments = words[2:]
    if not arguments or arguments[0] != "destroy":
        return None
    names = [word for word in arguments[1:] if not word.startswith("-")]
    if not names:
        return BLOCK, TASK_DESTROY_NEEDS_NAME
    if "--force" in arguments or short_flag(arguments[1:], "f"):
        return ASK, TASK_DESTROY_FORCE_ASK
    return None


def check_supabase(words):
    """Block a database reset; ask before anything that changes production directly."""
    plain = [word for word in words[1:] if not word.startswith("-")]
    if plain[:2] == ["db", "reset"]:
        return BLOCK, "supabase db reset deletes the database"
    goes_live = (
        ["db", "push"],
        ["functions", "deploy"],
        ["migration", "repair"],
        ["secrets", "set"],
    )
    for pair in goes_live:
        if plain[:2] == pair:
            return ASK, GOES_LIVE_ASK.format(what="supabase " + " ".join(pair))
    return None


def check_netlify(words):
    """Ask before a production deploy by hand."""
    if "deploy" in words and ("--prod" in words or "--production" in words):
        return ASK, GOES_LIVE_ASK.format(what="netlify deploy --prod")
    return None


def check_command(step, depth, line):
    """Return the finding for one simple command (not a cd), or None."""
    words, cwd = step.words, step.cwd
    name = os.path.basename(words[0])
    if name == "git":
        return check_git(words, cwd)
    if name in ("docker", "docker-compose"):
        return block_for(check_docker(words))
    if name == "rm":
        return block_for(check_rm(words, cwd))
    if name == "gh":
        return check_gh(words, cwd)
    if name == "supabase":
        return check_supabase(words)
    if name in ("netlify", "ntl"):
        return check_netlify(words)
    if name in ("sh", "bash", "zsh"):
        return check_shell(words, cwd, depth)
    if name.startswith("python") and runs_task_script(words):
        return check_task_script(words)
    return None


def check(command, cwd, depth=0):
    """Return (BLOCK or ASK, reason) for a command line, or None. A block returns at once;
    the first ask is kept, so a later block still wins."""
    first_ask = None
    for step in walk_commands(command, cwd):
        finding = check_command(step, depth, command) or check_redirects(step.words, step.cwd)
        if finding and finding[0] == BLOCK:
            return finding
        if finding and first_ask is None:
            first_ask = finding
    return first_ask


def main():
    try:
        event = json.load(sys.stdin)
        command = event["tool_input"]["command"]
        cwd = os.path.realpath(event.get("cwd") or os.getcwd())
        finding = check(command, cwd)
    except Exception:
        return 0  # not something this guard understands: let it through
    if finding is None:
        return 0
    level, reason = finding
    if level == ASK:
        _repo.print_ask(reason)
        return 0
    print(
        f"Danger guard: {reason}. Explain to the person in plain words and ask an engineer.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
