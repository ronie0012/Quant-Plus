"""Prepare a hash-guarded global auth patch, without modifying the running backend."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
backend = Path("D:/QP/agent-service")
output = root / "audit/implementation/backend-patch-auth"
manifest = []


def save(relative, source):
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(source, encoding="utf-8", newline="")
    original = backend / relative
    manifest.append({"path": relative,
                     "before_sha256": hashlib.sha256(original.read_bytes()).hexdigest() if original.exists() else None,
                     "after_sha256": hashlib.sha256(target.read_bytes()).hexdigest()})


main = (backend / "app/main.py").read_text(encoding="utf-8")
anchor = 'app.include_router(router)'
if main.count(anchor) != 1 or "InternalAuthMiddleware" in main:
    raise SystemExit("Inspect backend: auth patch anchor changed or middleware already installed")
main = main.replace(anchor, 'from quantplus_intelligence.internal_auth import InternalAuthMiddleware\n'
                    'app.add_middleware(InternalAuthMiddleware)\n' + anchor, 1)
save("app/main.py", main)
save("quantplus_intelligence/internal_auth.py",
     (root / "backend-extension/quantplus_intelligence/internal_auth.py").read_text(encoding="utf-8"))
# Legacy behavior tests now explicitly use an authenticated internal client.
# Dedicated denial tests remain separate and never inherit these credentials.
for path in (backend / "tests").glob("test_*.py"):
    source = path.read_text(encoding="utf-8")
    if "TestClient(app)" not in source:
        continue
    source = source.replace("TestClient(app)",
                            'TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"})')
    save(path.relative_to(backend).as_posix(), source)
conftest = (backend / "tests/conftest.py").read_text(encoding="utf-8")
conftest += '\nos.environ["WEBSITE_API_KEY"] = "offline-internal-test-key"\n'
save("tests/conftest.py", conftest)
(output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Prepared {len(manifest)} files at {output}")
