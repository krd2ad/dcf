import Anthropic from '@anthropic-ai/sdk'
import { fetchYahooFinancials } from './lib/yahoo.js'
import { fetchEdgarFinancials } from './lib/edgar.js'
import type { FinancialSnapshot as YahooSnapshot } from './lib/yahoo.js'
import type { FinancialSnapshot as EdgarSnapshot } from './lib/edgar.js'

type FinancialSnapshot = YahooSnapshot | EdgarSnapshot

const SYSTEM_PROMPT = `You are a financial modeling assistant that performs Discounted Cash Flow analysis.

Return a single valid JSON object with NO markdown fences, NO preamble, and NO trailing text.

When verified financial figures are provided in the user message, you MUST use them exactly as given for revenue_ttm_b, fcf_ttm_b, net_debt_b, shares_outstanding_m, and beta (if provided). Do not override these with your own estimates. Only infer fields that are not provided.

For private companies or when no verified data is available: infer all inputs from industry benchmarks and comparable public companies. Flag all inferred fields in key_assumptions_flagged.

Return exactly the number of projection years requested (5 or 10). For 10-year runs, use higher near-term growth tapering to lower growth in years 6–10.

Ensure mathematical consistency:
- sum_pv_fcf_b must equal the sum of all pv_fcf_b values
- enterprise_value_b must equal sum_pv_fcf_b + pv_terminal_value_b
- equity_value_b must equal enterprise_value_b - net_debt_b

Return this exact JSON schema:
{
  "company": "string",
  "ticker": "string or null",
  "is_public": true/false,
  "sector": "string",
  "currency": "USD",
  "data_quality": "High | Medium | Low",
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
    "bull": { "wacc_pct": number, "tgr_pct": number, "value": number },
    "base": { "wacc_pct": number, "tgr_pct": number, "value": number },
    "bear": { "wacc_pct": number, "tgr_pct": number, "value": number }
  },
  "key_risks": ["string", "string", "string"],
  "key_assumptions_flagged": ["string"],
  "analyst_note": "string"
}`

async function resolveTicker(company: string): Promise<string | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(company)}&quotesCount=1&newsCount=0`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DCF-Analyzer/1.0)', 'Accept': 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json() as any
    const symbol = data?.quotes?.[0]?.symbol
    return typeof symbol === 'string' ? symbol : null
  } catch {
    return null
  }
}

async function fetchFinancials(company: string): Promise<FinancialSnapshot | null> {
  // Resolve ticker — try the input directly first, then Yahoo search
  const tickerGuess = /^[A-Z]{1,5}$/.test(company.trim()) ? company.trim() : null
  const ticker = tickerGuess ?? await resolveTicker(company)
  if (!ticker) return null

  // Yahoo Finance first, EDGAR as fallback
  const yahoo = await fetchYahooFinancials(ticker)
  if (yahoo) return yahoo

  const edgar = await fetchEdgarFinancials(ticker)
  return edgar
}

function buildFinancialsContext(snap: FinancialSnapshot): string {
  const lines = [
    `VERIFIED FINANCIAL DATA (source: ${snap.source.toUpperCase()} — use these exact figures):`,
    `- Revenue (TTM): $${snap.revenue_ttm_b.toFixed(2)}B`,
    `- Free Cash Flow (TTM): $${snap.fcf_ttm_b.toFixed(2)}B`,
    `- Net Debt: $${snap.net_debt_b.toFixed(2)}B (positive = net debt, negative = net cash)`,
    `- Shares Outstanding: ${snap.shares_outstanding_m.toFixed(0)}M`,
  ]
  if (snap.beta !== null) lines.push(`- Beta: ${snap.beta.toFixed(2)}`)
  // Intentionally omit market_cap_b — it is always stale from the API snapshot.
  // Market cap is recalculated server-side from live price × shares after the Alpaca call.
  return lines.join('\n')
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  if (origin === 'https://krd2ad.github.io') return true
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true
  if (/^https:\/\/[^.]+\.github\.io$/.test(origin)) return true
  return false
}

function setCorsHeaders(req: any, res: any) {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-site-password')
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const sitePassword = process.env.SITE_PASSWORD
    if (sitePassword && req.headers['x-site-password'] !== sitePassword) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { company, projectionYears } = req.body ?? {}

    if (!company || !projectionYears) {
      return res.status(400).json({ error: 'Missing required fields: company and projectionYears' })
    }

    if (projectionYears !== 5 && projectionYears !== 10) {
      return res.status(400).json({ error: 'projectionYears must be 5 or 10' })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Missing Anthropic API key' })
    }

    // Fetch real financials before calling Claude (non-fatal if unavailable)
    const financials = await fetchFinancials(company)

    const userMessage = financials
      ? `${buildFinancialsContext(financials)}\n\nConduct a full ${projectionYears}-year DCF analysis for: ${company}`
      : `Conduct a full ${projectionYears}-year DCF analysis for: ${company}`

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const textBlock = response.content.find((b: any) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response from AI' })
    }

    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    // Override current_price with live Alpaca price, then recalculate derived fields
    if (parsed.is_public && parsed.ticker && process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY) {
      try {
        const alpacaRes = await fetch(
          `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(parsed.ticker)}/trades/latest`,
          {
            headers: {
              'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
              'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
            },
          },
        )
        if (alpacaRes.ok) {
          const alpacaData = await alpacaRes.json() as any
          const livePrice = alpacaData?.trade?.p
          const priceTimestamp: string | undefined = alpacaData?.trade?.t

          if (typeof livePrice === 'number' && livePrice > 0) {
            parsed.current_price = livePrice
            if (priceTimestamp) parsed.price_timestamp = priceTimestamp

            // Recalculate upside/downside against live price
            if (typeof parsed.intrinsic_value_per_share === 'number') {
              parsed.upside_downside_pct =
                ((parsed.intrinsic_value_per_share - livePrice) / livePrice) * 100
            }

            // Recalculate market cap from live price × shares outstanding.
            // shares_outstanding_m is in millions, so divide by 1000 to get billions.
            const sharesM: unknown = parsed.shares_outstanding_m
            if (typeof sharesM === 'number' && sharesM > 0) {
              const calculatedMarketCapB = (livePrice * sharesM) / 1000
              const apiMarketCapB: unknown = parsed.market_cap_b
              const divergence =
                typeof apiMarketCapB === 'number' && apiMarketCapB > 0
                  ? Math.abs(apiMarketCapB - calculatedMarketCapB) / calculatedMarketCapB
                  : 1

              parsed.market_cap_b = calculatedMarketCapB
              parsed.market_cap_source = 'calculated'
              if (divergence > 0.05 && typeof apiMarketCapB === 'number') {
                parsed.market_cap_api_stale = true
                parsed.market_cap_api_b = apiMarketCapB
              }
            }
          }
        }
      } catch {
        // Non-fatal — return whatever Claude + pre-fetch provided
      }
    }

    return res.status(200).json(parsed)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Analysis failed' })
  }
}
