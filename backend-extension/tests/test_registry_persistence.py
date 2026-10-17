from concurrent.futures import ThreadPoolExecutor

from quantplus_intelligence.news.registry import ConnectorRegistry


def registry(path, budget=2):
    result = ConnectorRegistry(path)
    result.register("official", "filings", "public", budget)
    return result


def test_restart_retains_budgets_failures_circuit_and_empty_successes(tmp_path):
    path = tmp_path / "news.sqlite"
    first = registry(path)
    assert first.admit("official") is None
    second = registry(path)
    assert second.admit("official") is None
    assert first.admit("official") == "budget_exhausted"
    for _ in range(3):
        second.failure("official", "timeout")
    third = registry(path)
    assert third.admit("official") == "circuit_open"
    assert third.status()[0]["failures"] == 3
    third.success("official", empty=True)
    fourth = registry(path)
    status = fourth.status()[0]
    assert status["status"] == "available"
    assert status["empty_results"] == 1
    assert status["successes"] == 1
    assert status["persistent"] is True


def test_two_instances_share_one_request_budget_under_concurrency(tmp_path):
    path = tmp_path / "news.sqlite"
    instances = [registry(path, 10), registry(path, 10)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda index: instances[index % 2].admit("official"), range(30)))
    assert results.count(None) == 10
    assert results.count("budget_exhausted") == 20
