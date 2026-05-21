# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-file web app (`dcf_analyzer.html`) that performs AI-powered Discounted Cash Flow analysis. No build step, no package manager, no dependencies to install — open the file directly in a browser.

## Running the app

Open `dcf_analyzer.html` in a browser. The Anthropic API is called directly from the client via `fetch`. To test against the real API, an Anthropic API key must be entered in the UI at runtime.

## Architecture

Everything lives in one file: `dcf_analyzer.html`. It contains:

- **Inline CSS** — all styling, including the design token variables
- **Inline JS** — API call logic, result rendering, chart management
- **CDN dependencies** — Chart.js (bar chart) and Google Fonts (IBM Plex Sans + IBM Plex Mono), both loaded via `<link>`/`<script>` tags; no local copies

### Data flow

1. User enters a company name/ticker and selects a projection horizon (`projectionYears = 5 | 10`)
2. JS builds a system prompt and user message, then POSTs to `https://api.anthropic.com/v1/messages` using model `claude-sonnet-4-20250514` with `max_tokens: 4000`
3. Response is a single JSON object (no markdown fences); stripped and `JSON.parse()`d
4. Parsed JSON is rendered into `.results-panel` via `innerHTML`

### State managed in JS variables

- `projectionYears` — 5 or 10, controls prompt and how many projection rows render
- `activeChart` — Chart.js instance; must be `.destroy()`d before recreating on the same canvas

### Results panel structure (7 collapsible step cards)

Each card renders in order: formula block → prose explanation → data table → supplementary element (chart or sensitivity grid). Cards 01–07 map to: Company Profile → WACC → FCF Projections → Terminal Value → Valuation Bridge → Sensitivity Analysis → Risks & Note.

## Design system

Dark finance-terminal theme. Key CSS variables (defined in `:root`):

| Token | Value | Semantic use |
|---|---|---|
| `--accent` | `#00d4aa` | Confirmed/public data |
| `--accent2` | `#0099ff` | Totals, key outputs |
| `--warn` | `#f59e0b` | Inferred/private data, `⊕` suffix |
| `--danger` | `#ff4f64` | Errors |
| `--mono` | IBM Plex Mono | All numbers and labels |
| `--sans` | IBM Plex Sans | Prose and explanations |

## Critical edge cases

- **Chart re-render**: always call `activeChart.destroy()` before creating a new Chart.js instance; skipping this causes "Canvas already in use"
- **Net debt sign**: `net_debt_b` is positive = net debt, negative = net cash; display as `-d.net_debt_b` in the valuation bridge table
- **Private companies**: `intrinsic_value_per_share` and `upside_downside_pct` will be `null`; show enterprise value in the header instead and omit the per-share row
- **Terminal value sanity check**: if TV as % of EV exceeds 90% or falls below 40%, flag it visually
- **After-tax cost of debt**: compute in the render function as `Kd × (1 − t/100)`, not from the API response

## API JSON schema

The model must return a flat JSON object (no markdown fences). Top-level fields include company metadata, TTM financials (`revenue_ttm_b`, `fcf_ttm_b`, `wacc_pct` + `wacc_breakdown`), a `projections` array (one object per year with `fcf_b`, `pv_fcf_b`, `discount_factor`, etc.), valuation outputs (`enterprise_value_b`, `equity_value_b`, `intrinsic_value_per_share`), a `sensitivity` object with `bull/base/bear` scenarios, and `key_risks`/`analyst_note`. The full schema is documented in `dcf_analyzer_build_instructions.md`.
