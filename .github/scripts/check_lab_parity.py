"""Fail when a lab is changed in only one of live-demo/ and pre-demo/.

The two trees hold the same 20 labs, intentionally differing in prompts and
deployment names. Fixing a bug in one copy and forgetting the other is the
failure mode this guards: it happened twice during development (the Lab 02
evaluation rubric and the Lab 12 blue/green deployment names).

Set SKIP_LAB_PARITY=1 on a commit that deliberately changes only one side.
"""
import os
import subprocess
import sys

LIVE = "fine-tuning/live-demo/"
PRE = "fine-tuning/pre-demo/"

if os.environ.get("SKIP_LAB_PARITY"):
    print("lab parity check skipped by SKIP_LAB_PARITY")
    sys.exit(0)


def changed_files():
    base = os.environ.get("GITHUB_BASE_REF")
    ref = f"origin/{base}" if base else "HEAD~1"
    result = subprocess.run(
        ["git", "diff", "--name-only", ref, "HEAD"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        return None
    return [p for p in result.stdout.splitlines() if p]


files = changed_files()
if files is None:
    print("no comparable base revision; skipping lab parity check")
    sys.exit(0)

live = {p[len(LIVE):] for p in files if p.startswith(LIVE) and p.endswith(".ipynb")}
pre = {p[len(PRE):] for p in files if p.startswith(PRE) and p.endswith(".ipynb")}

tracked = set(
    subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, check=True
    ).stdout.splitlines()
)

mismatched = []
for name in sorted(live - pre):
    if PRE + name in tracked:
        mismatched.append(f"{LIVE}{name} changed but {PRE}{name} did not")
for name in sorted(pre - live):
    if LIVE + name in tracked:
        mismatched.append(f"{PRE}{name} changed but {LIVE}{name} did not")

for line in mismatched:
    print(f"DIVERGED  {line}")

if mismatched:
    print(
        "\nApply the change to both copies, or set SKIP_LAB_PARITY=1 if the "
        "difference is intentional."
    )
    sys.exit(1)

print("live-demo and pre-demo changed together")
sys.exit(0)
