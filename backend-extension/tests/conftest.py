import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.append(os.environ.get("QUANTPLUS_BACKEND_PATH", r"D:\QP\agent-service"))
