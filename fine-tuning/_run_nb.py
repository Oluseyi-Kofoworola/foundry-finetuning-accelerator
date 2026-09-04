"""
_run_nb.py — Safe headless executor for the pre-demo notebooks.

Runs every cell live against the real Foundry resource, but NEUTRALIZES
cells that would (a) submit a NEW multi-hour billable fine-tuning job,
(b) create a model deployment via shell, or (c) call the tracing helper
that is known to hang in a kernel. Each cell has a hard timeout so a hang
becomes a recorded error instead of blocking forever.

Does NOT write back to the .ipynb (shipped outputs are preserved).

Usage:
    python _run_nb.py 04_knowledge_retrieval.ipynb [cell_timeout_seconds]
Exit code 0 = no cell errored; 1 = at least one cell errored.
"""
from __future__ import annotations
import sys, os, time
from pathlib import Path

import nbformat
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError, CellTimeoutError

# Whole-cell neutralization: these cells exist only to do the risky op.
CELL_SKIP = (
    "fine_tuning.jobs.create(",      # new billable training job
    "account deployment create",     # shell deployment create
    "files.create(",                 # uploaded training files
    "files.delete(",                 # uploaded training-file cleanup
    "requests.put(",                 # ARM deployment create/update
    "requests.delete(",              # ARM deployment cleanup
    "agents.create_agent(",          # persistent Foundry agents
    "agents.delete_agent(",          # persistent Foundry-agent cleanup
)
# Line-level neutralization: comment ONLY the offending line so the rest of
# the cell (e.g. load_dotenv / env setup) still runs.
LINE_SKIP = (
    "enable_foundry_tracing(",        # known to hang the kernel
)
SKIP_MARK = "pass  # [TEST-RUNNER] neutralized risky/hang-prone cell"


def main() -> int:
    nb_name = sys.argv[1]
    cell_timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 240

    here = Path(__file__).resolve().parent
    os.chdir(here)  # notebooks expect cwd == fine-tuning/
    nb_path = here / "pre-demo" / nb_name
    nb = nbformat.read(nb_path, as_version=4)

    neutralized = 0
    for cell in nb.cells:
        if cell.cell_type != "code":
            continue
        src = cell.source or ""
        if any(p in src for p in CELL_SKIP):
            cell.source = SKIP_MARK
            neutralized += 1
            continue
        if any(p in src for p in LINE_SKIP):
            new_lines = []
            for line in src.splitlines():
                if any(p in line for p in LINE_SKIP):
                    new_lines.append("# [TEST-RUNNER] " + line)
                    neutralized += 1
                else:
                    new_lines.append(line)
            cell.source = "\n".join(new_lines)

    client = NotebookClient(
        nb,
        timeout=cell_timeout,
        kernel_name="python3",
        allow_errors=True,          # keep going; we collect errors ourselves
        record_timing=False,
    )

    t0 = time.time()
    try:
        client.execute()
    except (CellExecutionError, CellTimeoutError) as e:
        print(f"[runner] fatal: {e}")
    dur = time.time() - t0

    # Collect per-cell errors from outputs
    errors = []
    code_cells = 0
    for idx, cell in enumerate(nb.cells):
        if cell.cell_type != "code":
            continue
        code_cells += 1
        for out in cell.get("outputs", []):
            if out.get("output_type") == "error":
                first = (out.get("evalue", "") or "").splitlines()
                errors.append((idx, out.get("ename", "?"), first[0] if first else ""))

    print(f"\n==== {nb_name} ====")
    print(f"code_cells={code_cells} neutralized={neutralized} "
          f"errors={len(errors)} duration={dur:.0f}s")
    for idx, ename, evalue in errors:
        print(f"  ERROR cell#{idx}: {ename}: {evalue[:160]}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
