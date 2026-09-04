"""Fail if any tracked notebook is not valid JSON."""
import json
import subprocess
import sys

notebooks = [
    p for p in subprocess.run(
        ["git", "ls-files", "*.ipynb"], capture_output=True, text=True, check=True
    ).stdout.splitlines() if p
]

bad = []
for path in notebooks:
    try:
        with open(path, encoding="utf-8-sig") as handle:
            json.load(handle)
    except Exception as exc:  # noqa: BLE001 - report any parse failure
        bad.append(f"{path}: {exc}")

for line in bad:
    print(f"INVALID  {line}")
print(f"{len(notebooks)} notebooks checked, {len(bad)} invalid")
sys.exit(1 if bad else 0)
