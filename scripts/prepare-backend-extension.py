"""Stage changed extension files and the pinned PDF dependency for review/application."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
backend = Path("D:/QP/agent-service")
output = root / "audit/implementation/backend-patch-extension"
manifest = []


def save(relative, raw):
    original = backend / relative
    if original.exists() and original.read_bytes() == raw:
        return
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    manifest.append({"path": relative,
        "before_sha256": hashlib.sha256(original.read_bytes()).hexdigest() if original.exists() else None,
        "after_sha256": hashlib.sha256(raw).hexdigest()})


source = root / "backend-extension/quantplus_intelligence"
for path in source.rglob("*"):
    if path.is_file() and path.suffix in {".py", ".json"} and "__pycache__" not in path.parts:
        save("quantplus_intelligence/" + path.relative_to(source).as_posix(), path.read_bytes())
save("requirements-quantplus.txt", (root / "backend-extension/requirements.txt").read_bytes())
lock = root / "backend-extension/requirements.lock.txt"
if lock.exists():
    save("requirements.lock.txt", lock.read_bytes())
requirements = (backend / "requirements.txt").read_text(encoding="utf-8")
if "-r requirements-quantplus.txt" not in requirements:
    save("requirements.txt", (requirements.rstrip() + "\n-r requirements-quantplus.txt\n").encode())
(output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Prepared {len(manifest)} extension files at {output}")
