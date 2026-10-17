"""Record the installed, validated Windows/Python dependency closure without changing it."""
from importlib import metadata
from pathlib import Path
import platform
import sys
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

backend = Path("D:/QP/agent-service")
prepare = "--prepare" in sys.argv
pending = []


def read(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("-r "):
            read(path.parent / line[3:].strip())
        else:
            pending.append(Requirement(line))


read(backend / "requirements.txt")
read(Path(__file__).resolve().parents[1] / "backend-extension/requirements.txt")
seen, pinned, failures = set(), {}, []
while pending:
    requirement = pending.pop()
    key = (canonicalize_name(requirement.name), tuple(sorted(requirement.extras)))
    if requirement.marker and not requirement.marker.evaluate():
        continue
    try:
        distribution = metadata.distribution(requirement.name)
    except metadata.PackageNotFoundError:
        failures.append(f"Missing {requirement}")
        continue
    if requirement.specifier and distribution.version not in requirement.specifier and not (prepare and key[0] == "fastapi"):
        failures.append(f"{requirement} requires a different version than installed {distribution.version}")
    if key in seen:
        continue
    seen.add(key)
    pinned[key[0]] = distribution.version
    for raw in distribution.requires or []:
        child = Requirement(raw)
        if child.marker and not any(child.marker.evaluate({"extra": extra}) for extra in ["", *requirement.extras]):
            continue
        child.marker = None
        pending.append(child)
if failures:
    raise SystemExit("Cannot certify a lock:\n" + "\n".join(sorted(set(failures))))
path = Path("backend-extension/requirements.lock.txt")
if prepare:
    path = Path(".local-data/backend-runtime.in")
    path.parent.mkdir(parents=True, exist_ok=True)
    pinned.pop("fastapi", None)
    pinned.pop("starlette", None)
    path.write_text("# Provisional resolver input, not a certified lock.\nfastapi>=0.115,<0.116\n" + "\n".join(f"{name}=={version}" for name, version in sorted(pinned.items())) + "\n", encoding="utf-8")
    print(f"Prepared isolated resolver input at {path}")
    raise SystemExit(0)
path.write_text(f"# Validated dependency closure: {platform.system()}, Python {platform.python_version()}\n"
                "# Install the separate backend with: python -m pip install -r requirements.lock.txt\n"
                + "\n".join(f"{name}=={version}" for name, version in sorted(pinned.items())) + "\n", encoding="utf-8")
print(f"Pinned {len(pinned)} installed dependencies at {path}")
