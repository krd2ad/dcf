export interface FinancialSnapshot {
  revenue_ttm_b: number;
  fcf_ttm_b: number;
  net_debt_b: number;
  shares_outstanding_m: number;
  beta: number | null;
  market_cap_b: number | null;
  source: 'yahoo';
}

function getRaw(obj: unknown, ...keys: string[]): number | null {
  let cursor: unknown = obj;
  for (const key of keys) {
    if (cursor === null || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (typeof cursor === 'number' && isFinite(cursor)) return cursor;
  return null;
}

export async function fetchYahooFinancials(ticker: string): Promise<FinancialSnapshot | null> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
      `?modules=financialData,defaultKeyStatistics,cashflowStatementHistoryQuarterly,balanceSheetHistoryQuarterly`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DCF-Analyzer/1.0)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) return null;

    const json: unknown = await response.json();

    // Navigate to result[0]
    const result =
      (json as Record<string, unknown>)?.quoteSummary as Record<string, unknown> | undefined;
    const resultArr = result?.result as unknown[] | undefined;
    if (!Array.isArray(resultArr) || resultArr.length === 0) return null;

    const data = resultArr[0] as Record<string, unknown>;

    const financialData = data.financialData as Record<string, unknown> | undefined;
    const defaultKeyStatistics = data.defaultKeyStatistics as Record<string, unknown> | undefined;

    // --- revenue_ttm_b ---
    const revenueRaw = getRaw(financialData, 'totalRevenue', 'raw');
    if (revenueRaw === null) return null;
    const revenue_ttm_b = revenueRaw / 1e9;

    // --- fcf_ttm_b ---
    // Preferred: freeCashflow.raw
    let fcf_ttm_b: number | null = null;
    const fcfRaw = getRaw(financialData, 'freeCashflow', 'raw');
    if (fcfRaw !== null) {
      fcf_ttm_b = fcfRaw / 1e9;
    } else {
      // Fallback: operatingCashflow + capitalExpenditures (capex is negative in Yahoo)
      const ocf = getRaw(financialData, 'operatingCashflow', 'raw');
      const capex = getRaw(financialData, 'capitalExpenditures', 'raw');
      if (ocf !== null && capex !== null) {
        fcf_ttm_b = (ocf + capex) / 1e9;
      }
    }
    if (fcf_ttm_b === null) return null;

    // --- net_debt_b ---
    const totalDebt = getRaw(financialData, 'totalDebt', 'raw');
    const totalCash = getRaw(financialData, 'totalCash', 'raw');
    if (totalDebt === null || totalCash === null) return null;
    const net_debt_b = (totalDebt - totalCash) / 1e9;

    // --- shares_outstanding_m ---
    const sharesRaw = getRaw(defaultKeyStatistics, 'sharesOutstanding', 'raw');
    if (sharesRaw === null) return null;
    const shares_outstanding_m = sharesRaw / 1e6;

    // --- beta (nullable) ---
    const betaRaw = getRaw(defaultKeyStatistics, 'beta', 'raw');
    const beta: number | null = betaRaw;

    // --- market_cap_b (nullable) ---
    const mcapRaw = getRaw(defaultKeyStatistics, 'marketCap', 'raw');
    const market_cap_b: number | null = mcapRaw !== null ? mcapRaw / 1e9 : null;

    return {
      revenue_ttm_b,
      fcf_ttm_b,
      net_debt_b,
      shares_outstanding_m,
      beta,
      market_cap_b,
      source: 'yahoo',
    };
  } catch {
    return null;
  }
}
