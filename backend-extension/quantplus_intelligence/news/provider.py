from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ProviderResult:
    articles: list[dict] = field(default_factory=list)
    status: str = "available"
    provider: str = "unknown"
    reason: str | None = None
    # Items excluded because their provenance could not be established (e.g. ambiguous time).
    quarantined: list[dict] = field(default_factory=list)


class NewsProvider(Protocol):
    name: str

    async def search(self, query: str, limit: int = 20) -> ProviderResult: ...
