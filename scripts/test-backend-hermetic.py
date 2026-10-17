"""Run backend tests in a disposable checkout with fake keys and blocked network."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import json
from datetime import datetime, timezone
from uuid import uuid4

root = Path(__file__).resolve().parents[1]
backend = Path(os.environ.get("QUANTPLUS_BACKEND_PATH", "D:/QP/agent-service"))
isolated_python = root / ".local-data/backend-runtime/Scripts/python.exe"
runner = os.environ.get("QUANTPLUS_BACKEND_PYTHON") or (str(isolated_python) if isolated_python.exists() else sys.executable)
stage = root / ".intelligence-test" / ("backend-" + uuid4().hex)
stage.mkdir(parents=True)
for name in ["app", "tests", "contract", "scripts", "quantplus_intelligence"]:
    if (backend / name).exists():
        shutil.copytree(backend / name, stage / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".env*"))
for argument in sys.argv[1:]:
    patch = Path(argument).resolve()
    for entry in json.loads((patch / "manifest.json").read_text(encoding="utf-8")):
        destination = stage / entry["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(patch / entry["path"], destination)
tracked = subprocess.check_output(["git", "-C", str(backend), "ls-files", "data"], text=True).splitlines()
for relative in tracked:
    source = backend / relative
    if source.is_file() and source.suffix in {".json", ".jsonl", ".md", ".txt", ".csv", ".log"}:
        target = stage / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
(stage / "offline_guard.py").write_text('''import socket
original_connect = socket.socket.connect
def deny_external(self, address):
    # Windows asyncio implements its self-pipe through a loopback socketpair.
    if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1", "localhost"}:
        return original_connect(self, address)
    raise RuntimeError("Hermetic suite blocked unintended external network access")
socket.socket.connect = deny_external
''', encoding="utf-8")
environment = {key: value for key, value in os.environ.items() if not any(term in key.upper() for term in ["KEY", "TOKEN", "SECRET", "DATABASE_URL", "MONGO_URL"])}
environment.update({"PYTHONPATH": str(stage), "CODECRAFT_KEY_1": "offline-test-key-one",
                    "CODECRAFT_KEY_2": "offline-test-key-two", "STOCK_PREDICTION_WARM_ENABLED": "false",
                    "DATA_RAW_ROOT": str(stage / "data/raw"), "QP_DB_PATH": str(stage / "test.db")})
print(f"Isolated backend test artifacts: {stage}", flush=True)
try:
    result = subprocess.run([runner, "-B", "-m", "pytest", "tests", "--ignore=tests/test_technical.py",
                             "-q", "--tb=short", "-p", "no:cacheprovider", "-p", "offline_guard"], cwd=stage, env=environment, timeout=180,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    evidence = root / "audit/implementation/backend-checks"
    evidence.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + stage.name[-8:]
    (evidence / (stamp + ".log")).write_text(result.stdout, encoding="utf-8")
    (evidence / (stamp + ".json")).write_text(json.dumps({"exit_code": result.returncode, "stage": str(stage),
        "patches": sys.argv[1:], "python_executable": runner, "excluded_live_test": "tests/test_technical.py"}, indent=2) + "\n", encoding="utf-8")
    print(result.stdout, flush=True)
    print(f"Saved backend evidence: {evidence / stamp}", flush=True)
    raise SystemExit(result.returncode)
except subprocess.TimeoutExpired:
    raise SystemExit("Backend suite exceeded its 180-second deadline; not a passing check")
