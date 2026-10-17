"""Apply only reviewed backend files, refusing to overwrite concurrent backend edits.

Usage: python scripts/apply-backend-integrity.py [patch-directory]
(default: audit/implementation/backend-patch). A manifest entry with
before_sha256 = null is a new file that must not already exist.
"""
from pathlib import Path
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone

backend = Path("D:/QP/agent-service")
patch = Path(sys.argv[1] if len(sys.argv) > 1 else "D:/Quant-Plus/audit/implementation/backend-patch").resolve()
manifest = json.loads((patch / "manifest.json").read_text(encoding="utf-8"))
for entry in manifest:
    target = backend / entry["path"]
    if entry["before_sha256"] is None:
        if target.exists():
            raise SystemExit(f"Backend already has {entry['path']}; prepare and review again")
        continue
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    if digest != entry["before_sha256"]:
        raise SystemExit(f"Backend changed since review: {entry['path']}; prepare and review again")
    if hashlib.sha256((patch / entry["path"]).read_bytes()).hexdigest() != entry["after_sha256"]:
        raise SystemExit(f"Patch file changed since review: {entry['path']}")
backup = Path("D:/Quant-Plus/.local-data/backups") / datetime.now(timezone.utc).strftime(
    f"backend-{patch.name}-%Y%m%dT%H%M%SZ")
for entry in manifest:
    relative = entry["path"]
    if entry["before_sha256"] is not None:
        destination = backup / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backend / relative, destination)
    (backend / relative).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(patch / relative, backend / relative)
print(f"Applied {len(manifest)} reviewed backend changes. Originals preserved at {backup}")
