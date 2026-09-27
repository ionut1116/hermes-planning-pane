"""Planning Pane backend, mounted at /api/plugins/planning-pane."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()
_FILE_NAMES = ("task_plan.md", "findings.md", "progress.md")


def _workspace(raw: object) -> Path:
    value = str(raw or os.getcwd())
    path = Path(value).expanduser().resolve()
    if not path.is_dir():
        raise HTTPException(status_code=400, detail=f"Workspace directory does not exist: {value}")
    return path


def _skill_root() -> Path:
    here = Path(__file__).resolve()
    candidates: list[Path] = []
    configured = os.environ.get("HERMES_HOME")
    if configured:
        candidates.append(Path(configured).expanduser() / "skills" / "planning-with-files")
    candidates.extend(parent / "skills" / "planning-with-files" for parent in here.parents)
    candidates.extend(
        (
            Path.home() / ".hermes" / "skills" / "planning-with-files",
            Path("/opt/data/skills/planning-with-files"),
            Path.home() / ".agents" / "skills" / "planning-with-files",
        )
    )
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    raise HTTPException(status_code=503, detail="planning-with-files skill is not installed")


def _run(script_name: str, workspace: Path) -> dict[str, object]:
    script = _skill_root() / "scripts" / script_name
    if not script.is_file():
        raise HTTPException(status_code=503, detail=f"Planning script is missing: {script_name}")
    command = ["powershell", "-NoProfile", "-ExecutionPolicy", "RemoteSigned", "-File", str(script)] if os.name == "nt" else ["bash", str(script)]
    try:
        proc = subprocess.run(
            command,
            cwd=workspace,
            env=os.environ.copy(),
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail=f"Planning action timed out: {script_name}") from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not run {script_name}: {exc}") from exc
    return {
        "ok": proc.returncode == 0,
        "out": proc.stdout,
        "err": proc.stderr,
        "error": None if proc.returncode == 0 else (proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"),
    }


@router.api_route("/files", methods=["GET", "POST"])
async def files(request: Request, dir: str | None = None) -> dict[str, str]:
    # GET too: an older desktop plugin/build sends GET, which otherwise falls through to
    # the headless catch-all ("web UI disabled") on every chat switch.
    if dir is None and request.method == "POST":
        try:
            dir = ((await request.json()) or {}).get("dir")
        except ValueError:
            dir = None
    workspace = _workspace(dir)
    result: dict[str, str] = {}
    for filename in _FILE_NAMES:
        path = workspace / filename
        result[path.stem] = path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""
    return result


@router.post("/init")
async def init_plan(body: dict) -> dict[str, object]:
    workspace = _workspace(body.get("dir"))
    script = "init-session.ps1" if os.name == "nt" else "init-session.sh"
    return _run(script, workspace)


@router.post("/check")
async def check_plan(body: dict) -> dict[str, object]:
    workspace = _workspace(body.get("dir"))
    script = "check-complete.ps1" if os.name == "nt" else "check-complete.sh"
    return _run(script, workspace)


@router.post("/attest")
async def attest_plan(body: dict) -> dict[str, object]:
    workspace = _workspace(body.get("dir"))
    script = "attest-plan.ps1" if os.name == "nt" else "attest-plan.sh"
    return _run(script, workspace)
