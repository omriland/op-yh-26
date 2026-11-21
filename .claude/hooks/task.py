#!/usr/bin/env python3
"""Task folders: one git worktree and one dev server per task, next to the main folder.

Run by the agent, never by the person, from the main folder or any task folder:
  task.py new <slug> --branch <type>/<slug> [--base origin/infra/bootstrap]
      makes ../op-yh-26-<slug> on a new branch from the base, copies .env.local, runs npm ci,
      and starts its own Vite server on a free port from 5191 to 5199. Reuses a task that
      already exists.
  task.py list                 the tasks, their branch, link and whether the server runs
  task.py start <slug>         starts the task's server again (after a reboot, for example)
  task.py stop <slug>          stops the task's server
  task.py destroy <slug> [--force]
      stops the server, removes the folder and deletes the branch. Refused while the folder
      has uncommitted changes or the branch's pull request is not merged, unless --force
      (the danger guard asks the person before --force).
State: ~/.local/state/yahpaz-harness/tasks.json, server logs in .../tasks/<slug>.log.
The Google Maps key allows localhost:5175 only, so maps and address search do not load on a
task's port; everything else does.
"""

import argparse
import json
import os
import re
import signal
import socket
import subprocess
import sys

import _repo

TASKS_FILE = os.path.join(_repo.STATE_HOME, "tasks.json")
LOG_DIR = os.path.join(_repo.STATE_HOME, "tasks")
PORTS = range(5191, 5200)
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
BRANCH = re.compile(r"^(feat|fix|chore|docs)/[a-z0-9]+(-[a-z0-9]+)*$")
ENV_FILES = (".env.local", ".env")
INSTALL_TIME_LIMIT = 600  # seconds


def fail(message):
    print("task: " + message, file=sys.stderr)
    return 1


def read_tasks():
    try:
        with open(TASKS_FILE) as f:
            tasks = json.load(f)
    except (OSError, ValueError):
        return {}
    return tasks if isinstance(tasks, dict) else {}


def write_tasks(tasks):
    os.makedirs(_repo.STATE_HOME, exist_ok=True)
    temp = TASKS_FILE + ".tmp"
    with open(temp, "w") as f:
        json.dump(tasks, f, indent=1)
        f.write("\n")
    os.replace(temp, TASKS_FILE)


def main_folder():
    """Return the main checkout of op-yh-26 that the current folder belongs to, or None."""
    top = _repo.repo_top(os.getcwd())
    if top is None or not _repo.is_yahpaz_repo(top):
        return None
    return _repo.main_checkout_of(top)


def task_folder_for(main, slug):
    return os.path.join(os.path.dirname(main), f"{os.path.basename(main)}-{slug}")


def port_is_free(port):
    with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as probe:
        return probe.connect_ex(("::1", port)) != 0


def free_port(tasks):
    taken = {task.get("port") for task in tasks.values()}
    for port in PORTS:
        if port not in taken and port_is_free(port):
            return port
    return None


def pid_alive(pid):
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def server_running(task):
    return pid_alive(task.get("pid")) and not port_is_free(task["port"])


def link_of(task):
    return f"http://localhost:{task['port']}/"


def run(cmd, folder, limit=60):
    """Run a command in folder. Return (exit code, output)."""
    try:
        done = subprocess.run(
            cmd,
            cwd=folder,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
            timeout=limit,
        )
    except (OSError, subprocess.SubprocessError) as problem:
        return 1, str(problem)
    return done.returncode, done.stdout


def copy_env_files(main, folder):
    for name in ENV_FILES:
        source = os.path.join(main, name)
        target = os.path.join(folder, name)
        if os.path.isfile(source) and not os.path.exists(target):
            with open(source, "rb") as reader, open(target, "wb") as writer:
                writer.write(reader.read())


def start_server(slug, task):
    os.makedirs(LOG_DIR, exist_ok=True)
    vite = os.path.join(task["folder"], "node_modules", ".bin", "vite")
    log = open(os.path.join(LOG_DIR, f"{slug}.log"), "a")
    process = subprocess.Popen(
        [vite, "--port", str(task["port"]), "--strictPort"],
        cwd=task["folder"],
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    task["pid"] = process.pid


def stop_server(task):
    pid = task.get("pid")
    if pid_alive(pid):
        try:
            os.killpg(pid, signal.SIGTERM)
        except OSError:
            os.kill(pid, signal.SIGTERM)
    task["pid"] = None


def make_worktree(main, folder, branch, base):
    remote_branch = base.split("/", 1)[1] if base.startswith("origin/") else None
    if remote_branch:
        run(["git", "fetch", "origin", remote_branch], main)
    code, output = run(["git", "worktree", "add", "-b", branch, folder, base], main)
    return None if code == 0 else output.strip()


def new_task(args):
    main = main_folder()
    if main is None:
        return fail("run this inside op-yh-26 or one of its task folders")
    if not SLUG.match(args.slug):
        return fail("the name is lower case words joined by dashes, for example event-filters")
    if not BRANCH.match(args.branch):
        return fail("the branch is <feat|fix|chore|docs>/<slug>, for example feat/event-filters")
    tasks = read_tasks()
    if args.slug in tasks and os.path.isdir(tasks[args.slug]["folder"]):
        task = tasks[args.slug]
        print(f"reused {task['folder']} on {task['branch']}, {link_of(task)}")
        return 0
    port = free_port(tasks)
    if port is None:
        return fail("all nine task ports are taken: destroy a finished task first")
    folder = task_folder_for(main, args.slug)
    if os.path.exists(folder):
        return fail(f"{folder} already exists but is not a known task: check it first")
    problem = make_worktree(main, folder, args.branch, args.base)
    if problem:
        return fail(f"could not make the task folder: {problem}")
    copy_env_files(main, folder)
    code, output = run(
        ["npm", "ci", "--prefer-offline", "--no-audit", "--no-fund"], folder, INSTALL_TIME_LIMIT
    )
    if code != 0:
        return fail("npm ci failed in the task folder:\n" + output[-2000:])
    task = {"folder": folder, "branch": args.branch, "port": port, "pid": None}
    start_server(args.slug, task)
    tasks[args.slug] = task
    write_tasks(tasks)
    print(f"made {folder} on {args.branch}, {link_of(task)}")
    return 0


def list_tasks(_args):
    tasks = read_tasks()
    if not tasks:
        print("no tasks")
        return 0
    for slug, task in sorted(tasks.items()):
        state = "running" if server_running(task) else "stopped"
        exists = "" if os.path.isdir(task["folder"]) else " (folder missing)"
        print(f"{slug}  {task['branch']}  {link_of(task)}  {state}{exists}")
    return 0


def known_task(slug):
    tasks = read_tasks()
    if slug not in tasks:
        return tasks, None
    return tasks, tasks[slug]


def start_task(args):
    tasks, task = known_task(args.slug)
    if task is None:
        return fail(f"no task named {args.slug}")
    if server_running(task):
        print(f"already running, {link_of(task)}")
        return 0
    if not port_is_free(task["port"]):
        return fail(f"port {task['port']} is used by another program")
    start_server(args.slug, task)
    write_tasks(tasks)
    print(f"started, {link_of(task)}")
    return 0


def stop_task(args):
    tasks, task = known_task(args.slug)
    if task is None:
        return fail(f"no task named {args.slug}")
    stop_server(task)
    write_tasks(tasks)
    print("stopped")
    return 0


def pr_state(folder, branch):
    code, output = run(["gh", "pr", "view", branch, "--json", "state", "-q", ".state"], folder)
    return output.strip() if code == 0 else "NONE"


def destroy_refusal(task):
    """Return why the task must not be removed without --force, or None."""
    folder = task["folder"]
    if not os.path.isdir(folder):
        return None
    code, dirty = run(["git", "status", "--porcelain"], folder)
    if code != 0:
        return "could not read the task folder's git state"
    if dirty.strip():
        return "the task folder has uncommitted changes"
    state = pr_state(folder, task["branch"])
    if state != "MERGED":
        return f"the branch's pull request is not merged (state: {state})"
    return None


def destroy_task(args):
    main = main_folder()
    if main is None:
        return fail("run this inside op-yh-26 or one of its task folders")
    tasks, task = known_task(args.slug)
    if task is None:
        return fail(f"no task named {args.slug}")
    if os.path.realpath(os.getcwd()).startswith(os.path.realpath(task["folder"])):
        return fail("run destroy from another folder than the task folder itself")
    refusal = None if args.force else destroy_refusal(task)
    if refusal:
        return fail(refusal + "; stopped (ask the person before using --force)")
    stop_server(task)
    if os.path.isdir(task["folder"]):
        remove = ["git", "worktree", "remove", task["folder"]]
        code, output = run(remove + (["--force"] if args.force else []), main)
        if code != 0:
            return fail("could not remove the task folder: " + output.strip())
    run(["git", "branch", "-D", task["branch"]], main)
    del tasks[args.slug]
    write_tasks(tasks)
    print(f"removed {args.slug}")
    return 0


class Parser(argparse.ArgumentParser):
    def error(self, message):
        print("task: " + message, file=sys.stderr)
        sys.exit(1)


def parse(argv):
    parser = Parser(prog="task.py")
    sub = parser.add_subparsers(dest="cmd")
    new = sub.add_parser("new")
    new.add_argument("slug")
    new.add_argument("--branch", required=True)
    new.add_argument("--base", default=f"origin/{_repo.MAIN_BRANCH}")
    sub.add_parser("list")
    for name in ("start", "stop"):
        sub.add_parser(name).add_argument("slug")
    destroy = sub.add_parser("destroy")
    destroy.add_argument("slug")
    destroy.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    if not args.cmd:
        parser.error("use new, list, start, stop or destroy")
    return args


COMMANDS = {
    "new": new_task,
    "list": list_tasks,
    "start": start_task,
    "stop": stop_task,
    "destroy": destroy_task,
}

if __name__ == "__main__":
    arguments = parse(sys.argv[1:])
    sys.exit(COMMANDS[arguments.cmd](arguments))
