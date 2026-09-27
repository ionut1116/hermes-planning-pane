from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "planning-pane/dashboard/plugin_api.py"
FRONTEND = ROOT / "planning-pane/plugin.js"

spec = spec_from_file_location("planning_pane_test", BACKEND)
module = module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)
assert hasattr(module, "router")

source = FRONTEND.read_text(encoding="utf-8")
assert "pluginCtx = ctx" in source
assert "ctx.rest" not in source
assert "pluginCtx.rest('/files?dir='" in source
assert "flex h-full min-h-0 w-full flex-col" in source
assert "max-w-2xl" not in source
assert "jsx(ScrollArea" not in source
assert "w-full flex-1 min-h-0 resize-none overflow-auto" in source

from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()
app.include_router(module.router, prefix="/api/plugins/planning-pane")
client = TestClient(app)

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    (root / "task_plan.md").write_text("# Plan\n\n## Goal\nFull plan text\n", encoding="utf-8")
    response = client.post("/api/plugins/planning-pane/files", json={"dir": directory})
    assert response.status_code == 200, response.text
    assert response.json() == {"task_plan": "# Plan\n\n## Goal\nFull plan text\n", "findings": "", "progress": ""}
    assert client.get("/api/plugins/planning-pane/files", params={"dir": directory}).json() == response.json()

print("planning-pane checks passed")
