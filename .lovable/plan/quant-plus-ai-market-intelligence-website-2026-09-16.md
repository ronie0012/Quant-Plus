# Quant Plus — AI Market Intelligence Website

Build the full Quant Plus experience exactly to the brief: near-black, monochromatic, blue used only as a signal, cinematic scroll storytelling, and a product dashboard that looks real. All market numbers are clearly demonstrative sample data — no invented accuracy claims, no fake testimonials, no profit promises.

## Structure

One cinematic home page at `/` carrying the full narrative (data → signals → AI reasoning → risk → clarity), plus standalone pages for the nav items so each is shareable and search-friendly:

- `/` — hero, market intelligence, signal engine, AI analyst, dashboard reveal, capabilities, market explorer, research, portfolio, risk engine, coverage, philosophy, final showcase, CTA, footer
- `/markets` — living market visualization and the interactive market explorer
- `/research` — research terminal cards
- `/ai` — AI market analyst interface
- `/platform` — capabilities and full dashboard showcase

Each page gets its own title, description, and social preview text.

## Sections on the home page

1. Fixed minimal nav: logo left, Markets/Research/AI/Platform center, Log in + Get Started right. Transparent at top, blur + hairline border on scroll. Full-screen mobile menu.
2. Hero (100svh): eyebrow "AI-POWERED MARKET INTELLIGENCE", headline "See the market differently.", supporting line, restrained CTAs. Sequenced load: background, nav, eyebrow, line-by-line headline, copy, CTAs, then the visual.
3. Market Intelligence Field — the signature visual: thousands of thin animated lines forming an evolving market structure, white/grey with rare bright blue signal pulses. Drawn on canvas for performance; simplified on mobile; static frame when reduced motion is on.
4. Market intelligence section: wide living visualization across S&P 500, NASDAQ, NIFTY 50, NIFTY 500, BTC, ETH, Gold, USD/INR — moving price lines, volatility shaping the form.
5. Signal engine: DATA → PRICE → VOLUME → MOMENTUM → VOLATILITY → SENTIMENT → QUANT MODEL → AI ANALYSIS as an SVG pipeline where a signal travels with scroll and ends at "MARKET INTELLIGENCE".
6. AI analyst: "Ask the market." Analytical interface — question, stepped processing lines, then regime / key drivers / confidence output. Framed as analysis, never prediction.
7. Dashboard reveal: browser frame assembling itself piece by piece — nav, chart, metrics, AI insight, signals, portfolio.
8. "Everything you need. One intelligence layer." — six numbered capabilities revealed in sequence.
9. Market explorer: asset list, large interactive chart with crosshair, AI market summary panel.
10. Research terminal cards (Market Brief, Sector Rotation, Volatility Watch, Macro Monitor, Earnings Intelligence, AI Market Thesis) with data shifting and mini-charts on hover.
11. Portfolio intelligence: value, day P&L, exposure split, risk level, plus a plain-language explanation.
12. Risk engine on a darker ground: radial network of exposure, correlation, volatility, drawdown, liquidity, concentration; hovering a metric highlights related assets.
13. Coverage section: real capabilities only; anything not yet live is labelled COMING SOON.
14. Philosophy: near-empty, huge type — MARKETS, NOISE, SIGNAL, INTELLIGENCE animating in.
15. Final showcase: largest dashboard, floating over near-black with faint radial light, scaling 0.82 → 1.0 on scroll.
16. CTA "Make the market make sense." with Explore Quant Plus and Join the Waitlist, then a minimal institutional footer with links, social, and a market-risk disclosure.

Waitlist and Log in are visual only in this build — say the word and I'll wire real sign-up and a stored waitlist afterwards.

## Look and feel

- Backgrounds #05070C / #080B12, panels #0B1220 / #0F1726, text #F1F3F7 / #8A94A6 / #505969, accent #2E7DFF with #6EA8FF, plus green/amber/red only for market state.
- Inter for text, JetBrains Mono for labels and market data. Tight line-height on large type, wide letter spacing on small uppercase labels, weight and scale instead of decoration.
- Continuous scroll: pinned sections, masked and clip-path reveals, scale and parallax — no white gaps between sections. Nothing moves without a reason.

## Responsive and performance

Mobile is composed separately rather than shrunk: simpler visuals, fewer lines, preserved typography and story, no horizontal overflow. Canvas visuals pause off-screen and respect reduced-motion. Checked at 390×844, 412×915, 768×1024, 1440×900 and 1920×1080.

## Technical notes

- TanStack Start routes under `src/routes`; shared chrome in `__root.tsx`.
- Tailwind v4 tokens defined in `src/styles.css` (`@theme inline`), fonts loaded via `<link>` in the root head. No hardcoded color utilities in components.
- GSAP + ScrollTrigger for scroll choreography; Motion for small entrances. Canvas 2D for the market field, wave and risk network — no Three.js unless a section genuinely needs it, keeping the bundle light.
- Components split per brief (Navbar, Hero, MarketField, MarketTicker, SignalEngine, AIAnalyst, DashboardPreview, MarketExplorer, ResearchSection, PortfolioIntelligence, RiskEngine, ProductShowcase, CTA, Footer) with sample data in separate modules and animation logic in hooks.
- Recharts only where a product chart benefits; custom SVG/canvas otherwise.
