"""Fail if environment-specific or identifying values reach the repository.

Catches the things that actually leaked during development: a local virtualenv
name stamped into notebook kernel metadata, a developer's home path in saved
cell output, a real resource endpoint, and hardcoded deployed hostnames.
"""
import re
import subprocess
import sys

BINARY_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".pdf")

PATTERNS = {
    "local user path": r"[A-Za-z]:\\\\?Users\\\\?[A-Za-z0-9._-]+",
    "home path": r"/home/[a-z0-9._-]+/|/Users/[a-z0-9._-]+/",
    "non-generic kernel": r'"display_name":\s*"(?!Python 3")[^"]*"',
    "live container app host": r"[a-z0-9-]+\.[a-z0-9-]+\.azurecontainerapps\.io",
    "concrete resource host": r"(?!<)[a-z0-9-]+\.(?:openai|cognitiveservices)\.azure\.com",
    "bare GUID": r"(?<![0-9a-f])(?!00000000)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
}

# Built-in Azure role definition IDs and documented placeholders are expected.
ALLOWLIST = re.compile(
    r"YOUR-RESOURCE-NAME|your-resource|<your-resource>|example\.com"
    r"|5e0bd9bd-7b93-4f28-af87-19fc36ad61bd"  # Cognitive Services OpenAI Contributor
    r"|a97b65f3-24c7-4388-baec-2e87135dc908"  # Cognitive Services User
    r"|7f951dda-4ed3-4680-a7ca-43fe172d538d"  # AcrPull
    r"|a001fd3d-188f-4b5d-821b-7da978bf7442"  # Cognitive Services Contributor
    r"|1407120a-92aa-4202-b7e9-c0e197c71c8f",  # Search Index Data Reader
    re.IGNORECASE,
)

files = [
    p for p in subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, check=True
    ).stdout.splitlines()
    if p and not p.lower().endswith(BINARY_SUFFIXES)
]

findings = 0
for path in files:
    try:
        with open(path, encoding="utf-8-sig") as handle:
            lines = handle.read().splitlines()
    except (UnicodeDecodeError, FileNotFoundError):
        continue
    for number, line in enumerate(lines, 1):
        if line.lstrip().startswith('"image/png"'):
            continue
        for label, pattern in PATTERNS.items():
            match = re.search(pattern, line)
            if match and not ALLOWLIST.search(match.group(0)):
                print(f"LEAK  {path}:{number}  [{label}]  {match.group(0)[:60]}")
                findings += 1

print("no environment-specific values found" if not findings else f"{findings} finding(s)")
sys.exit(1 if findings else 0)
