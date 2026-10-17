# End-to-end HTTP latency (2026-10-14T17:08:06.631Z)

Machine: 11th Gen Intel(R) Core(TM) i5-11300H @ 3.10GHz (8 threads), 8 GB, win32 10.0.22631, Node v22.14.0. Mode: LAST_SESSION_PRACTICE.

Client and server on the same machine over loopback; market-data provider replaced by a local stub, so provider and model latency are excluded. Worker off during measurement.

| Operation | n | p50 ms | p95 ms | p99 ms | max ms |
| --- | --- | --- | --- | --- | --- |
| order_ack_practice_market_fill | 300 | 35.59 | 70.57 | 80.964 | 88.763 |
| read_holdings | 300 | 12.95 | 19.158 | 22.267 | 24.866 |
| read_accounts | 300 | 13.735 | 19.215 | 21.861 | 24.169 |
| read_orders_page_50 | 300 | 55.581 | 81.81 | 116.832 | 203.146 |

Targets (roadmap, proposed): warm read p95 < 250 ms, order acknowledgement p95 < 500 ms. Met: **yes**.
