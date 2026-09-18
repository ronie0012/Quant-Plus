# Complete Quant Plus Product Workspace

Build every remaining authenticated sidebar destination as a polished, usable part of the same premium market terminal. Reuse the existing account, holdings, watchlist, analyses, market, news, sentiment, calendar, and Quant AI data so screens feel coherent and realistic. Demonstrative values remain clearly labelled and no performance claims are introduced.

## Shared experience

- Replace the generic section placeholder with purpose-built screens for Markets, Portfolio, Watchlist, Research, Decisions, History, Quant AI, Committee, Agent Activity, Settings, Data Sources, and Help.
- Give every screen a compact command header, useful status indicators, responsive controls, deliberate empty/loading/error states, and unique page metadata.
- Add restrained staged entrances, chart drawing, progress sweeps, live-state pulses, expandable rows, contextual side panels, and smooth view changes while respecting reduced-motion preferences.
- Keep the current sidebar, top bar, visual tokens, and dashboard intact; improve navigation active states and connect cross-screen actions where useful.

## Product screens

1. **Markets** — interactive instrument board, primary price chart, regime/volatility/momentum diagnostics, cross-market comparison, and market-moving news.
2. **Portfolio** — portfolio value and return overview, holdings table, allocation and sector exposure, contribution view, concentration and risk diagnostics.
3. **Watchlist** — searchable sortable watchlist, focused instrument inspector, realistic sparklines, movement filters, and analysis shortcuts.
4. **Research** — research desk grid, latest intelligence feed, category filtering, and a focused report preview with drivers and limitations.
5. **Decisions** — decision queue combining verdict, conviction, risk, rationale, and review status; expandable evidence and action controls.
6. **History** — chronological activity ledger for analyses and decisions with filtering, summaries, and clear provenance.
7. **Quant AI** — full-page market copilot using the existing authenticated streaming AI endpoint, suggested workflows, conversation history for the current visit, and source/context framing.
8. **Committee** — multi-agent investment committee visualization with analyst perspectives, consensus calculation, confidence, disagreements, and a staged deliberation experience.
9. **Agent Activity** — live-style operations monitor showing agent states, recent tasks, throughput, latency bands, and processing trace from available analysis context.
10. **Settings** — profile, display, alert, market preference, and risk-preference controls saved locally for the current browser, with accessible toggles and segmented controls.
11. **Data Sources** — source health, latency, coverage, permissions, freshness, and simulated/live status; unavailable integrations are honestly marked.
12. **Help** — searchable guidance, workflow shortcuts, FAQ accordions, risk disclosure, and support/contact placeholders without inventing contact details.

## Technical details

- Create a reusable authenticated-page component layer for headers, metric strips, charts, tables, filters, inspectors, activity timelines, and controls.
- Keep the dynamic `/app/$section` route and render an explicit component per supported section, with a safe not-found state for unknown slugs.
- Use current React Query hooks and deterministic chart helpers; do not create fake backend records or seed new data.
- Keep all visual colors semantic through the existing design tokens and use existing CSS motion utilities plus focused new utilities only where necessary.
- Ensure controls are keyboard accessible, labels fit at mobile widths, dense tables adapt into readable stacked rows, and no page introduces horizontal viewport overflow.

## Verification

- Check every sidebar destination renders its intended screen and no destination remains a placeholder.
- Validate authenticated navigation, interactive filters/tabs/expanders, Quant AI streaming, loading and empty states.
- Test desktop and mobile layouts for console errors, overflow, overlap, and unreadable controls.
