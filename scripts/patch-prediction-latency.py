"""Guarded source-only patch for the separately checked-out local agent service.

  python scripts/patch-prediction-latency.py --check
  python scripts/patch-prediction-latency.py --apply
  python scripts/patch-prediction-latency.py --self-test

All hunks are validated before writing. Exact already-applied hunks are no-ops;
unexpected source fails closed. Other source bytes and line endings are kept.
No application imports, credentials, data, dependencies, or service operations.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import stat
import tempfile


PATCHES = {
    "app/gateway/codecraft.py": [(
        "from tenacity import (retry, stop_after_attempt, wait_exponential,\n"
        "                        retry_if_exception_type, retry_if_not_exception_type)",
        "from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception",
    ), (
        'def _status_of(exc: Exception) -> int | None:\n'
        '    return getattr(exc, "status_code", None)\n\nclass Gateway:',
        'def _status_of(exc: Exception) -> int | None:\n'
        '    return getattr(exc, "status_code", None)\n\n'
        'def _retryable_transport_error(exc: BaseException) -> bool:\n'
        '    # APIStatusError includes terminal 4xx, not just server failures. Let the\n'
        '    # outer loop quarantine/rotate immediately instead of waiting 2+4+8+16s.\n'
        '    if isinstance(exc, (APIConnectionError, APITimeoutError)):\n'
        '        return True\n'
        '    code = getattr(exc, "status_code", None)\n'
        '    return isinstance(exc, APIStatusError) and code is not None and (\n'
        '        code == 408 or 500 <= code < 600)\n\nclass Gateway:',
    ), (
        '           retry=(retry_if_exception_type(_TRANSIENT)\n'
        '                  & retry_if_not_exception_type(RateLimitError)),',
        '           retry=retry_if_exception(_retryable_transport_error),',
    )],
    "app/agents/analysts.py": [(
        '    prov = YFinanceProvider()\n'
        '    parts = []\n'
        '    for sym, key in (("^NSEI", "nifty"), ("^INDIAVIX", "indiavix")):\n'
        '        try:\n'
        '            df = prov.ohlcv(sym, as_of, "1d", lookback=25)\n'
        '            c = df["Close"].dropna()\n'
        '            ret = float(c.iloc[-1] / c.iloc[0] - 1) if len(c) > 1 else 0.0\n'
        '            parts.append(f"{sym}: {key}_last={float(c.iloc[-1]):.2f} {key}_ret20d={ret:+.2%}")\n'
        '        except Exception as e:\n'
        '            parts.append(f"{sym}: unavailable ({type(e).__name__})")',
        '    from concurrent.futures import ThreadPoolExecutor\n'
        '    prov = YFinanceProvider()\n'
        '    def index_stats(item):\n'
        '        sym, key = item\n'
        '        try:\n'
        '            df = prov.ohlcv(sym, as_of, "1d", lookback=25)\n'
        '            c = df["Close"].dropna()\n'
        '            ret = float(c.iloc[-1] / c.iloc[0] - 1) if len(c) > 1 else 0.0\n'
        '            return f"{sym}: {key}_last={float(c.iloc[-1]):.2f} {key}_ret20d={ret:+.2%}"\n'
        '        except Exception as e:\n'
        '            return f"{sym}: unavailable ({type(e).__name__})"\n'
        '    # Independent reads share the same PIT cutoff. map preserves prompt order;\n'
        '    # both feeds still settle before the model and grounding validation run.\n'
        '    with ThreadPoolExecutor(max_workers=2) as executor:\n'
        '        parts = list(executor.map(index_stats, (("^NSEI", "nifty"), ("^INDIAVIX", "indiavix"))))',
    )],
    "app/api/stocks.py": [(
        '        resume = row and ((retry and row[2].startswith("failed")) or\n'
        '                          (row[2] in ("running", "queued") and row[0] not in _active_sessions))\n'
        '        as_of = datetime.fromisoformat(row[1]) if resume else now',
        '        resume = row and ((retry and row[2].startswith("failed")) or\n'
        '                          (row[2] in ("running", "queued") and row[0] not in _active_sessions))\n'
        '        # Automatic refresh is new research once its cutoff expires. Repeatedly\n'
        '        # resuming an old failed/orphaned run can never make that cutoff fresh.\n'
        '        # Foreground retries still resume the original evidence/checkpoints.\n'
        '        if resume and refresh_ahead and age >= ttl:\n'
        '            resume = False\n'
        '        as_of = datetime.fromisoformat(row[1]) if resume else now',
    )],
}


def transform(source: bytes, hunks: list[tuple[str, str]], name: str) -> bytes:
    for number, (before, after) in enumerate(hunks, 1):
        variants = [(before.replace("\n", ending).encode(), after.replace("\n", ending).encode())
                    for ending in ("\n", "\r\n")]
        old_count = sum(source.count(old) for old in {old for old, _ in variants})
        new_count = sum(source.count(new) for new in {new for _, new in variants})
        if old_count == 1 and new_count == 0:
            for old, new in variants:
                if old in source:
                    source = source.replace(old, new, 1)
                    break
        elif old_count != 0 or new_count != 1:
            raise ValueError(f"{name}: hunk {number} has unexpected source; no files written")
    return source


def plan(root: Path):
    changes = []
    for name, hunks in PATCHES.items():
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"{name}: expected a regular backend source file")
        before = path.read_bytes()
        changes.append((path, before, transform(before, hunks, name)))
    return changes


def install(root: Path, apply: bool):
    changes = plan(root)
    # Recheck all originals immediately before making the first write.
    if apply and any(path.read_bytes() != before for path, before, _ in changes):
        raise ValueError("Source changed during validation; no files written")
    for path, before, after in changes:
        if before == after:
            print(f"{path.relative_to(root)}: already applied")
            continue
        if apply:
            fd, temporary = tempfile.mkstemp(prefix=".prediction-patch-", dir=path.parent)
            try:
                with os.fdopen(fd, "wb") as output:
                    output.write(after)
                os.chmod(temporary, stat.S_IMODE(path.stat().st_mode))
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        print(f"{path.relative_to(root)}: {'patched' if apply else 'ready'}")


def self_test():
    # Verify LF/CRLF, idempotence, unrelated bytes, and all-file preflight.
    for ending in ("\n", "\r\n"):
        for name, hunks in PATCHES.items():
            source = ("# user work\n" + "\n\n".join(old for old, _ in hunks) + "\n# end\n").replace("\n", ending).encode()
            patched = transform(source, hunks, name)
            assert transform(patched, hunks, name) == patched
            assert patched.startswith(("# user work" + ending).encode())
            assert patched.endswith(("# end" + ending).encode())
    with tempfile.TemporaryDirectory(prefix="qp-prediction-patch-") as directory:
        root = Path(directory)
        originals = {}
        for name, hunks in PATCHES.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            originals[path] = "\n\n".join(old for old, _ in hunks).encode()
            path.write_bytes(originals[path])
        conflict = root / "app/api/stocks.py"
        conflict.write_bytes(b"# unexpected user source\n")
        originals[conflict] = conflict.read_bytes()
        try:
            install(root, apply=True)
        except ValueError:
            pass
        else:
            raise AssertionError("Unexpected source must fail closed")
        assert all(path.read_bytes() == original for path, original in originals.items())
    print("Installer self-test passed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", type=Path, default=Path(r"D:\QP\agent-service"))
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--apply", action="store_true")
    action.add_argument("--check", action="store_true")
    action.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        try:
            install(args.backend.resolve(), args.apply)
        except (OSError, ValueError) as error:
            parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
