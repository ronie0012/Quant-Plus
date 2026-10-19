"""Install the reviewable extension into the existing backend, without replacing services."""
from __future__ import annotations

import argparse
import runpy
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "backend-extension" / "quantplus_intelligence"
stream_patch = runpy.run_path(str(ROOT / "scripts" / "patch-shared-live-feed.py"))
patched_live_market = stream_patch["patched_live_market"]
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


def install(target, *, check=False):
    target = target.resolve(strict=True)
    main = target / "app" / "main.py"
    live_market = target / "app" / "data" / "live_market.py"
    if not main.is_file() or not (target / "app" / "data" / "fyers_provider.py").is_file() or not live_market.is_file():
        raise SystemExit("Target must be the existing QuantPlus FastAPI/FYERS backend")
    existing = main.read_text(encoding="utf-8")
    fyers = target / "app" / "data" / "fyers_provider.py"
    previous_fyers = fyers.read_text(encoding="utf-8")
    updated_fyers = patched_fyers(previous_fyers)
    previous_market = live_market.read_text(encoding="utf-8")
    updated_market = patched_live_market(previous_market)
    tests = target / "tests" / "test_fyers_integration.py"
    previous_tests = tests.read_text(encoding="utf-8") if tests.is_file() else None
    updated_tests = stream_patch["patched_fyers_tests"](previous_tests) if previous_tests is not None else None
    # Validate every source patch before copying or changing any backend files.
    compile(updated_fyers, str(fyers), "exec")
    destination = target / SOURCE.name
    if destination.exists() and not (destination / "__init__.py").read_text(encoding="utf-8").startswith('"""QuantPlus live intelligence.'):
        raise SystemExit("Refusing to overwrite an unrelated package")
    if check:
        print("Backend intelligence installer preflight passed (read/compile only)")
        print("Shared LiveMarket patch: " + ("already installed" if updated_market == previous_market else "installation required"))
        return
    shutil.copytree(SOURCE, destination, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    if MARKER not in existing:
        main.write_text(existing.rstrip() + "\n" + ROUTES, encoding="utf-8")
    if previous_fyers != updated_fyers:
        fyers.write_text(updated_fyers, encoding="utf-8")
    if previous_market != updated_market:
        live_market.write_text(updated_market, encoding="utf-8")
    if previous_tests != updated_tests:
        tests.write_text(updated_tests, encoding="utf-8")
    print(f"Installed {SOURCE.name} and additive API registration in {main}")
    print("FYERS session parser supports textual and numeric NSE/CM identifiers")
    print("Shared FYERS stream supports owner interests, index wire names and genuine provider timestamps")
    print("Restart the backend through its normal launcher to load the installed source")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default=r"D:\QP\agent-service")
    parser.add_argument("--check", action="store_true", help="validate source compatibility without writing or installing")
    args = parser.parse_args()
    install(Path(args.backend), check=args.check)
