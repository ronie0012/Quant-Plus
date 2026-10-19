"""Focused agent-service regressions without credentials, real data or network.

Run: python -B scripts/test-prediction-backend.py
Benchmark: python -B scripts/test-prediction-backend.py -k benchmark -s
Set QUANTPLUS_BACKEND_PATH to use a different checkout of the same backend.
"""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BACKEND = Path(os.environ.get("QUANTPLUS_BACKEND_PATH", str(ROOT.parent / "QP" / "agent-service")))
FILES = [
    "test_prediction_execution_regressions.py", "test_prediction_latency.py",
    "test_prediction_serving.py", "test_stock_integration.py", "test_gateway_limits.py",
    "test_full_session.py", "test_research_grounding_boundary.py", "test_api_ws.py",
]
GUARD = '''import _socket
import socket
import sys
def deny(*args, **kwargs):
    raise AssertionError("Network disabled in prediction checks")
def connect(sock, address):
    # Windows asyncio's private socketpair needs loopback; providers do not.
    if sys._getframe(1).f_code is socket.socketpair.__code__:
        return _socket.socket.connect(sock, address)
    return deny()
socket.socket.connect = connect
socket.socket.connect_ex = deny
socket.create_connection = deny
'''


def main():
    if not all((BACKEND / "tests" / name).is_file() for name in FILES):
        raise SystemExit("Expected the QuantPlus backend and focused prediction tests; set QUANTPLUS_BACKEND_PATH")
    environment = {key: value for key, value in os.environ.items() if not any(
        marker in key.upper() for marker in ("KEY", "TOKEN", "SECRET", "PASSWORD", "DATABASE", "MONGO"))}
    environment.update({f"CODECRAFT_KEY_{i}": f"offline-fixture-{i}" for i in range(1, 6)})
    environment.update({"PYTHONDONTWRITEBYTECODE": "1", "INTELLIGENCE_SCHEDULER_ENABLED": "false",
        "STOCK_PREDICTION_WARM_ENABLED": "false"})
    work_root = Path(tempfile.gettempdir()) / "omnirush"
    work_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="qp-prediction-checks-", dir=work_root) as directory:
        temporary = Path(directory)
        (temporary / "qp_prediction_offline.py").write_text(GUARD, encoding="utf-8")
        environment.update({"PYTHONPATH": os.pathsep.join((str(BACKEND), directory)),
            "QP_DB_PATH": str(temporary / "tests.db"), "DATA_RAW_ROOT": str(temporary / "raw")})
        arguments = sys.argv[1:] or ["-k", "not benchmark"]
        # Explicit rootdir is essential when Windows temp and checkout use different drives:
        # otherwise module node IDs can collapse and unrelated autouse fixtures overlap.
        result = subprocess.run([sys.executable, "-B", "-m", "pytest",
            *[str(BACKEND / "tests" / name) for name in FILES], "--rootdir", str(BACKEND),
            "-q", "--tb=short", "-p", "no:cacheprovider", "-p", "qp_prediction_offline",
            "--deselect", "tests/test_api_ws.py::test_agent_schemas_and_ts_client",
            *arguments], cwd=directory, env=environment, timeout=120)
        raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
