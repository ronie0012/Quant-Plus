"""Run desired-behavior regressions; historical findings remain in audit evidence."""
import subprocess
import sys
raise SystemExit(subprocess.call([sys.executable, "-B", "-m", "pytest", "backend-extension/tests/test_integrity_regressions.py", "backend-extension/tests/test_backend_pit_regressions.py", "-q", "-p", "no:cacheprovider"]))
