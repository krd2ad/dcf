# DCF Analyzer — Claude Code Build Instructions

A single-file web app that uses the Anthropic API to research public company data, infer inputs for private companies, and walk users through a fully-explained Discounted Cash Flow analysis with visible formulas, a 5 or 10-year projection toggle, and sensitivity analysis.

---

## Project setup

Create a single file: `dcf_analyzer.html`

No build step, no dependencies to install. The file runs in any modern browser. The Anthropic API is called directly from the client via `fetch`.

---

## Tech stack

- Vanilla HTML/CSS/JS (no framework)
- Anthropic API: `claude-sonnet-4-20250514` via `/v1/messages`
- Chart.js (loaded from CDN) for the FCF bar chart
- Google Fonts: IBM Plex Sans + IBM Plex Mono (finance terminal aesthetic)

---

## Visual design

Dark finance-terminal theme. Key design tokens:

```css
--bg: #0a0e17;
--surface: #111827;
--surface2: #1a2235;
--border: rgba(255,255,255,0.08);
--border2: rgba(255,255,255,0.14);
--accent: #00d4aa;       /* teal — used for confirmed/public data */
--accent2: #0099ff;      /* blue — used for totals and key outputs */
--text: #e8edf5;
--text2: #8a9ab5;
--text3: #4a5568;
--danger: #ff4f64;
--warn: #f59e0b;         /* amber — used for inferred/private data */
--green: #10b981;
--mono: 'IBM Plex Mono', monospace;
--sans: 'IBM Plex Sans', sans-serif;
```

Typography: IBM Plex Mono for all numbers and labels, IBM Plex Sans for prose and explanations.

---

## Page structure

```
<header>       — Logo mark "DCF", title "Intrinsic Value Analyzer", "NOT FINANCIAL ADVICE" pill
<main>
  .search-section   — Company name/ticker input + RUN ANALYSIS button + example chips
  .projection-toggle — 5 YEAR / 10 YEAR toggle (new)
  .loading-panel    — Animated step-by-step progress (6 steps)
  .error-panel      — Shows API/parse errors
  .results-panel    — Injected dynamically after API response
```

---

## Projection horizon toggle

Add a toggle **above** the run button, between the search input row and the example chips:

```html
<div class="toggle-row">
  <span class="toggle-label">Projection Horizon</span>
  <div class="toggle-group">
    <button class="tog active" data-years="5" onclick="setYears(5)">5 YR</button>
    <button class="tog" data-years="10" onclick="setYears(10)">10 YR</button>
  </div>
</div>
```

Store the selected value in a JS variable `let projectionYears = 5`. The `setYears()` function updates `projectionYears` and swaps the `.active` class between buttons.

Pass `projectionYears` into the API prompt (see below).

Toggle styling — flat, monospace, minimal:

```css
.toggle-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 14px 0 12px;
}
.toggle-label {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text3);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.toggle-group {
  display: flex;
  border: 1px solid var(--border2);
  border-radius: 6px;
  overflow: hidden;
}
.tog {
  background: transparent;
  border: none;
  color: var(--text2);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 6px 16px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  border-right: 1px solid var(--border2);
}
.tog:last-child { border-right: none; }
.tog.active {
  background: rgba(0,212,170,0.12);
  color: var(--accent);
}
```

---

## Formula display (new requirement)

Each step card must show the relevant formula **before** the data table, in a styled formula block. Use this HTML pattern:

```html
<div class="formula-block">
  <span class="formula-label">FORMULA</span>
  <div class="formula-text">WACC = (E/V) × Ke + (D/V) × Kd × (1 − t)</div>
  <div class="formula-vars">
    E = market value of equity · D = market value of debt · V = E + D<br>
    Ke = cost of equity · Kd = cost of debt · t = tax rate
  </div>
</div>
```

CSS for formula blocks:

```css
.formula-block {
  background: rgba(0,153,255,0.05);
  border: 1px solid rgba(0,153,255,0.2);
  border-left: 3px solid var(--accent2);
  border-radius: 0 6px 6px 0;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.formula-label {
  font-size: 9px;
  font-family: var(--mono);
  letter-spacing: 0.15em;
  color: var(--accent2);
  display: block;
  margin-bottom: 6px;
  text-transform: uppercase;
}
.formula-text {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}
.formula-vars {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text3);
  margin-top: 6px;
  line-height: 1.6;
}
```

### Formulas to include per step

**Step 01 — FCF margin:**
```
FCF Margin = Free Cash Flow / Revenue
```

**Step 02 — WACC:**
```
WACC = (E/V) × Ke + (D/V) × Kd × (1 − t)
Cost of Equity (CAPM): Ke = Rf + β × ERP
```
Variables: E = equity value, D = debt value, V = E+D, Ke = cost of equity, Kd = pre-tax cost of debt, t = tax rate, Rf = risk-free rate, β = beta, ERP = equity risk premium

**Step 03 — Discounted FCF:**
```
PV of FCFₙ = FCFₙ / (1 + WACC)ⁿ
```
Variables: FCFₙ = free cash flow in year n, n = year number, WACC = discount rate

**Step 04 — Terminal Value:**
```
TV = FCFₙ × (1 + g) / (WACC − g)
PV of TV = TV / (1 + WACC)ⁿ
```
Variables: FCFₙ = final projection year FCF, g = terminal growth rate, n = projection horizon (5 or 10), WACC = discount rate

**Step 05 — Equity Value bridge:**
```
Enterprise Value (EV) = Σ PV(FCFs) + PV(Terminal Value)
Equity Value = EV − Net Debt
Intrinsic Value/Share = Equity Value / Shares Outstanding
```

**Step 06 — Upside/Downside:**
```
Upside/Downside = (Intrinsic Value − Market Price) / Market Price × 100
```

---

## Anthropic API call

### System prompt

Tell the model to return a single valid JSON object with no markdown fences, no preamble, and no trailing text. The full schema:

```json
{
  "company": "string",
  "ticker": "string or null",
  "is_public": true/false,
  "sector": "string",
  "currency": "USD",
  "data_quality": "High / Medium / Low",
  "data_quality_note": "string",
  "current_price": number or null,
  "shares_outstanding_m": number or null,
  "market_cap_b": number or null,
  "revenue_ttm_b": number,
  "revenue_note": "string",
  "fcf_ttm_b": number,
  "fcf_note": "string",
  "fcf_margin_pct": number,
  "net_debt_b": number,
  "wacc_pct": number,
  "wacc_breakdown": {
    "risk_free_rate_pct": number,
    "equity_risk_premium_pct": number,
    "beta": number,
    "cost_of_equity_pct": number,
    "cost_of_debt_pct": number,
    "tax_rate_pct": number,
    "debt_weight_pct": number,
    "equity_weight_pct": number
  },
  "projections": [
    {
      "year": 1,
      "revenue_growth_pct": number,
      "fcf_margin_pct": number,
      "fcf_b": number,
      "discount_factor": number,
      "pv_fcf_b": number
    }
    // repeat for each year (5 or 10, as requested)
  ],
  "sum_pv_fcf_b": number,
  "terminal_growth_rate_pct": number,
  "terminal_value_b": number,
  "pv_terminal_value_b": number,
  "enterprise_value_b": number,
  "equity_value_b": number,
  "intrinsic_value_per_share": number or null,
  "upside_downside_pct": number or null,
  "sensitivity": {
    "bull":  { "wacc_pct": number, "tgr_pct": number, "value": number },
    "base":  { "wacc_pct": number, "tgr_pct": number, "value": number },
    "bear":  { "wacc_pct": number, "tgr_pct": number, "value": number }
  },
  "key_risks": ["string", "string", "string"],
  "key_assumptions_flagged": ["string"],
  "analyst_note": "string"
}
```

Instruct the model to:
- Use real publicly known financial data for public companies (revenue, FCF, balance sheet metrics, consensus growth estimates, beta, capital structure).
- For private companies: infer from industry benchmarks, comparable public companies, and analyst estimates. Flag all inferred fields clearly.
- Return exactly the number of projection years requested (5 or 10). For 10-year runs, use higher near-term growth tapering to lower growth in years 6–10.
- Ensure mathematical consistency: `sum_pv_fcf_b` must equal the sum of all `pv_fcf_b` values; `enterprise_value_b` must equal `sum_pv_fcf_b + pv_terminal_value_b`; `equity_value_b` must equal `enterprise_value_b - net_debt_b`.

### User message

```js
`Conduct a full ${projectionYears}-year DCF analysis for: ${company}`
```

### Fetch call

```js
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,         // use 4000 to accommodate 10-year projection arrays
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  })
});
```

Parse the response: extract `data.content` blocks where `type === 'text'`, join them, strip any accidental markdown fences (` ```json ` or ` ``` `), then `JSON.parse()`. Wrap in try/catch and surface errors to the `.error-panel`.

---

## Loading panel

Six animated steps shown while the API call is in flight. Advance through them on a `setInterval` every ~2200ms:

1. Identifying company & data availability...
2. Gathering financials & consensus estimates...
3. Estimating discount rate (WACC)...
4. Projecting free cash flows...
5. Computing terminal value & intrinsic value...
6. Running sensitivity analysis...

Each step has three states: pending (dim gray), active (teal + pulse animation), done (muted). Clear the interval and lock to step 6 once the API response arrives. Hide the panel with a 600ms delay before showing results.

---

## Results rendering

Inject all results HTML into `.results-panel` via `innerHTML`. Structure:

### Company header bar

Left side: company name (26px, weight 600), then a row of meta tags (ticker, PUBLIC/PRIVATE, sector, data quality). Style the PUBLIC/PRIVATE tag differently — teal border for public, amber for private.

Right side (or below on mobile): the headline output — "INTRINSIC VALUE / SHARE" for public companies (show the dollar value), or "EST. ENTERPRISE VALUE" for private companies (show in $B). Below that, show upside/downside % vs. current market price in green (positive) or red (negative), plus the current market price for reference.

### Step cards (collapsible)

Seven collapsible cards, each with a numbered header (01–07), title, and chevron toggle. Clicking the header shows/hides the body. All cards start open. Use `display: none / block` toggle in JS.

Card order:
1. Company & Financial Profile
2. Discount Rate (WACC)
3. Free Cash Flow Projections (5 or 10 Years) — title should reflect selected horizon
4. Terminal Value
5. Valuation Bridge & Intrinsic Value
6. Sensitivity Analysis
7. Key Risks & Investment Note

Each card body contains, in order:
1. **Formula block** (see formula section above)
2. **Step explanation** paragraph (prose, 2–3 sentences, `color: var(--text2)`)
3. **Data table** (monospace, right-aligned numbers, source/notes column)
4. Any supplementary elements (chart, sensitivity grid, flags)

### Data tables

Four columns: Metric | Value | Notes. Style:
- Header row: 11px, `var(--text3)`, letter-spacing
- Number cells: right-aligned, `color: var(--accent)`, monospace
- Inferred/assumed cells: add amber color `var(--warn)` and an `⊕` suffix character
- Source/notes cells: 11px, `var(--text3)`
- Subtle bottom border on each row; none on the last row
- Totals/key output rows: slightly heavier, `var(--accent2)`, `font-weight: 500`

### FCF bar chart (Step 03)

Use Chart.js bar chart inside a `<div style="position:relative; width:100%; height:200px">`. Two dataset series:
- "FCF ($B)" — blue bars (`rgba(0,153,255,0.5)` fill, `#0099ff` border)
- "PV of FCF ($B)" — teal bars (`rgba(0,212,170,0.5)` fill, `#00d4aa` border)

Disable the default Chart.js legend; render a custom HTML legend above the chart with small colored squares. X-axis labels: Y1, Y2, ... Y5 or Y10. Y-axis callback: `'$' + v.toFixed(0) + 'B'`. Dark grid lines (`rgba(255,255,255,0.06)`), dark tick labels (`#4a5568`). Destroy and recreate the chart instance on each new analysis run (track the instance in a variable `let activeChart = null`).

### Sensitivity grid (Step 06)

Three cards side-by-side in a CSS grid (`repeat(auto-fit, minmax(140px, 1fr))`):
- BULL — green value
- BASE — teal value
- BEAR — red value

Each card shows: scenario label, value (per share for public, EV for private), and `WACC X.X% · TGR X.X%` below.

Below the grid, show a "Flagged Assumptions" section if `key_assumptions_flagged` is non-empty — list each item in amber monospace with a `⊕` prefix.

### Private company warning banner

If `is_public === false` or `data_quality === 'Low'`, render a banner below the profile table:

```html
<div class="source-note">
  <span>⚠ Private company:</span> key inputs are inferred from industry benchmarks
  and comparable public companies. Treat all figures as estimates.
</div>
```

Styling: amber-tinted background (`rgba(245,158,11,0.05)`), amber border (`rgba(245,158,11,0.15)`), 11px monospace, `var(--text3)` body with `var(--warn)` for the `<span>`.

### Disclaimer bar

Always shown at the bottom of results. Red-tinted background. Bold red "Not financial advice." prefix followed by the full disclaimer text explaining this is AI-generated, educational only, not a buy/sell recommendation, and that users should consult a licensed financial professional.

---

## Example chips

Pre-populate the input and shift focus on click — do not auto-run:

```js
function setExample(name) {
  companyInput.value = name;
  companyInput.focus();
}
```

Suggested chips: AAPL, MSFT, NVDA, Stripe (private), SpaceX (private).

---

## Error handling

- API non-2xx: extract `error.message` from the response JSON
- JSON parse failure: show "Could not parse model response. Please try again."
- Display in `.error-panel` with a red-bordered card
- Always re-enable the run button and hide the loading panel on error

---

## Responsive layout

At `max-width: 600px`:
- Stack the company header (name + intrinsic value) vertically
- Intrinsic value aligns left instead of right
- Reduce main padding to 24px 16px, header to 16px
- The sensitivity grid already collapses gracefully via `auto-fit`

---

## Notes & edge cases

- **10-year runs**: the model needs `max_tokens: 4000` to fit a 10-element projections array plus all other fields. Use 4000 for all runs.
- **Chart re-renders**: always call `activeChart.destroy()` before creating a new Chart.js instance on the same canvas element. Failing to do so causes a "Canvas already in use" error.
- **Net debt sign convention**: `net_debt_b` is positive when the company has net debt, negative when it has net cash. In the valuation bridge table, display this as "− Net Debt / + Cash" with the value shown as `-d.net_debt_b` to make the direction intuitive.
- **After-tax cost of debt**: compute in the render function as `Kd × (1 − t/100)` rather than relying on the model to pre-compute it, to ensure consistency.
- **TV as % of total**: compute in render as `(pv_terminal_value_b / enterprise_value_b) × 100`. This is a useful sanity check — for healthy companies it typically runs 60–80%; if it exceeds 90% or falls below 40%, flag it visually.
- **Private companies with no per-share output**: `intrinsic_value_per_share` and `upside_downside_pct` will be null. The header should show enterprise value instead, and the valuation bridge should stop at equity value without the per-share row.
