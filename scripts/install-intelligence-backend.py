"""Install the reviewable extension into the existing backend, without replacing services."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "backend-extension" / "quantplus_intelligence"
MARKER = "# QuantPlus intelligence extension (additive, numerical scores owned by code)"
ROUTES = '''
# QuantPlus intelligence extension (additive, numerical scores owned by code)
from quantplus_intelligence.api import router as intelligence_router
app.include_router(intelligence_router, prefix="/api/v1")
app.include_router(intelligence_router, prefix="/api", include_in_schema=False)
'''

FYERS_FIXES = (
    ('str(row.get("exchange", "")).upper() == "NSE"',
     'str(row.get("exchange", "")).upper() in ("NSE", "10")'),
    ('str(row.get("segment", "")).upper() in ("CM", "CASH", "EQ")',
     'str(row.get("segment", "")).upper() in ("CM", "CASH", "EQ", "10")'),
)


def patched_fyers(source):
    for before, after in FYERS_FIXES:
        if before in source:
            source = source.replace(before, after, 1)
        elif after not in source:
            raise SystemExit("FYERS session parser changed: inspect it before applying the numeric enum fix")
    return source


def install(target):
    target = target.resolve(strict=True)
    main = target / "app" / "main.py"
    if not main.is_file() or not (target / "app" / "data" / "fyers_provider.py").is_file():
        raise SystemExit("Target must be the existing QuantPlus FastAPI/FYERS backend")
    existing = main.read_text(encoding="utf-8")
    fyers = target / "app" / "data" / "fyers_provider.py"
    previous_fyers = fyers.read_text(encoding="utf-8")
    updated_fyers = patched_fyers(previous_fyers)
    destination = target / SOURCE.name
    if destination.exists() and not (destination / "__init__.py").read_text(encoding="utf-8").startswith('"""QuantPlus live intelligence.'):
        raise SystemExit("Refusing to overwrite an unrelated package")
    shutil.copytree(SOURCE, destination, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    if MARKER not in existing:
        main.write_text(existing.rstrip() + "\n" + ROUTES, encoding="utf-8")
    if previous_fyers != updated_fyers:
        fyers.write_text(updated_fyers, encoding="utf-8")
    print(f"Installed {SOURCE.name} and additive API registration in {main}")
    print("FYERS session parser supports textual and numeric NSE/CM identifiers")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default=r"D:\QP\agent-service")
    args = parser.parse_args()
    install(Path(args.backend))
