import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a financial modeling assistant that performs Discounted Cash Flow analysis.

Return a single valid JSON object with NO markdown fences, NO preamble, and NO trailing text. Use real publicly known financial data for public companies (revenue, FCF, balance sheet metrics, consensus growth estimates, beta, capital structure). For private companies: infer from industry benchmarks, comparable public companies, and analyst estimates. Flag all inferred fields in key_assumptions_flagged.

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

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Conduct a full ${projectionYears}-year DCF analysis for: ${company}`,
        },
      ],
    })

    const textBlock = response.content.find((b: any) => b.type === 'text')

    if (!textBlock || textBlock.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response from AI' })
    }

    // Strip any accidental markdown fences
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    return res.status(200).json(parsed)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Analysis failed' })
  }
}
