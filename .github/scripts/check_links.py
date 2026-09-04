"""Fail if a markdown link points at a path that is not in the repository.

Checks against git-tracked paths, not the working tree: gitignored files exist
locally but not in a clone, so a working-tree check hides links that 404 for
everyone else.
"""
import os
import re
import subprocess
import sys

LINK = re.compile(r"\]\((?!https?://|mailto:|#)([^)]+)\)")

tracked = set(
    subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, check=True
    ).stdout.splitlines()
)
dirs = set()
for path in tracked:
    parent = os.path.dirname(path)
    while parent:
        dirs.add(parent)
        parent = os.path.dirname(parent)

broken = 0
for doc in sorted(p for p in tracked if p.endswith(".md")):
    base = os.path.dirname(doc)
    with open(doc, encoding="utf-8-sig") as handle:
        text = handle.read()
    for target in LINK.findall(text):
        target = target.split("#", 1)[0].strip().rstrip("/")
        if not target:
            continue
        resolved = os.path.normpath(os.path.join(base, target)).replace("\\", "/")
        if resolved not in tracked and resolved not in dirs:
            print(f"BROKEN  {doc} -> {target}")
            broken += 1

print("all markdown links resolve" if not broken else f"{broken} broken link(s)")
sys.exit(1 if broken else 0)
