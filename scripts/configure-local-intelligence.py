"""Enable durable local intelligence without changing secrets or existing settings."""
from pathlib import Path
from datetime import datetime, timezone
import shutil
from uuid import uuid4
from dotenv import dotenv_values

root = Path(__file__).resolve().parents[1]
backend = Path("D:/QP/agent-service")
path = backend / ".env"
existing = dotenv_values(path)
settings = {"INTELLIGENCE_NEWS_ARCHIVE_PATH": "data/news_archive.sqlite3",
            "INTELLIGENCE_HISTORY_PATH": "data/sentiment_history.sqlite3"}
missing = {key: value for key, value in settings.items() if not existing.get(key)}
if missing:
    backup = root / ".local-data/backups" / ("backend-intelligence-env-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8])
    backup.mkdir(parents=True)
    if path.exists():
        shutil.copy2(path, backup / ".env")
    with path.open("a", encoding="utf-8") as output:
        output.write("\n# Durable local news evidence, attachments, connector budgets and sentiment history\n")
        for key, value in missing.items():
            output.write(f"{key}={value}\n")
    print("Enabled local persistence for: " + ", ".join(missing))
    print(f"Previous configuration preserved privately at {backup}")
else:
    print("Existing local intelligence persistence settings preserved")
