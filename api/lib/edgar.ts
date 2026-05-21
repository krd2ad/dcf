export interface FinancialSnapshot {
  revenue_ttm_b: number;
  fcf_ttm_b: number;
  net_debt_b: number;
  shares_outstanding_m: number;
  beta: number | null;
  market_cap_b: number | null;
  source: 'edgar';
}

const EDGAR_HEADERS = {
  'User-Agent': 'DCF-Analyzer contact@example.com',
  'Accept': 'application/json',
};

interface FilingEntry {
  end: string;
  val: number;
  form: string;
  filed?: string;
  fp?: string;
  fy?: number;
}

type NamespaceFacts = Record<string, { units?: { USD?: FilingEntry[]; shares?: FilingEntry[] } }>;

interface CompanyFacts {
  facts: {
    'us-gaap'?: NamespaceFacts;
    'dei'?: NamespaceFacts;
  };
}

const TWO_YEARS_AGO = new Date(Date.now() - 2 * 365.25 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

/**
 * Returns the most recent 10-K/10-Q value for a concept, or null if not found
 * or if the most recent entry is older than 2 years (stale data).
 */
function getLatestAnnual(
  facts: CompanyFacts,
  concept: string,
  namespace: 'us-gaap' | 'dei' = 'us-gaap',
  unit: 'USD' | 'shares' = 'USD',
): number | null {
  const ns = facts.facts[namespace];
  const entries = ns?.[concept]?.units?.[unit];
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const filtered = entries.filter((e) => e.form === '10-K' || e.form === '10-Q');
  if (filtered.length === 0) return null;

  filtered.sort((a, b) => (a.end > b.end ? -1 : a.end < b.end ? 1 : 0));

  if (filtered[0].end < TWO_YEARS_AGO) return null;

  return filtered[0].val;
}

/**
 * Tries each concept in order; returns the first non-null recent value.
 */
function getFirstNonNull(
  facts: CompanyFacts,
  concepts: string[],
  namespace: 'us-gaap' | 'dei' = 'us-gaap',
  unit: 'USD' | 'shares' = 'USD',
): number | null {
  for (const concept of concepts) {
    const val = getLatestAnnual(facts, concept, namespace, unit);
    if (val !== null) return val;
  }
  return null;
}

export async function fetchEdgarFinancials(ticker: string): Promise<FinancialSnapshot | null> {
  try {
    // Step 1 — resolve ticker to CIK
    const tickerRes = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: EDGAR_HEADERS,
    });
    if (!tickerRes.ok) return null;

    const tickerMap = (await tickerRes.json()) as Record<
      string,
      { cik_str: number; ticker: string; title?: string }
    >;

    const upperTicker = ticker.toUpperCase();
    const entry = Object.values(tickerMap).find(
      (e) => e.ticker.toUpperCase() === upperTicker
    );
    if (!entry) return null;

    const paddedCik = String(entry.cik_str).padStart(10, '0');

    // Step 2 — fetch company facts
    const factsRes = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`,
      { headers: EDGAR_HEADERS }
    );
    if (!factsRes.ok) return null;

    const facts = (await factsRes.json()) as CompanyFacts;

    // Step 3 — extract TTM values

    // Revenue
    const revenueRaw = getFirstNonNull(facts, [
      'Revenues',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'SalesRevenueNet',
    ]);
    if (revenueRaw === null) return null;

    // Operating cash flow
    const ocfRaw = getFirstNonNull(facts, [
      'NetCashProvidedByUsedInOperatingActivities',
    ]);
    if (ocfRaw === null) return null;

    // Capex (positive in EDGAR — subtract to get FCF)
    const capexRaw = getFirstNonNull(facts, [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'CapitalExpendituresIncurringObligation',
    ]) ?? 0;

    // Cash
    const cashRaw = getFirstNonNull(facts, [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsAndShortTermInvestments',
    ]);
    if (cashRaw === null) return null;

    // Long-term debt
    const ltDebtRaw = getFirstNonNull(facts, [
      'LongTermDebt',
      'LongTermDebtNoncurrent',
    ]) ?? 0;

    // Short-term debt (defaults to 0 if not found)
    const stDebtRaw = getFirstNonNull(facts, [
      'ShortTermBorrowings',
      'CommercialPaper',
      'DebtCurrent',
    ]) ?? 0;

    // Shares outstanding — try us-gaap USD, then us-gaap shares unit, then dei shares unit
    const sharesRaw =
      getFirstNonNull(facts, ['CommonStockSharesOutstanding'], 'us-gaap', 'USD') ??
      getFirstNonNull(facts, ['CommonStockSharesOutstanding'], 'us-gaap', 'shares') ??
      getFirstNonNull(facts, ['EntityCommonStockSharesOutstanding'], 'dei', 'shares');
    if (sharesRaw === null) return null;

    // Derived values
    const revenue_ttm_b = revenueRaw / 1e9;
    const fcf_ttm_b = (ocfRaw - capexRaw) / 1e9;
    const net_debt_b = (ltDebtRaw + stDebtRaw - cashRaw) / 1e9;
    const shares_outstanding_m = sharesRaw / 1e6;

    return {
      revenue_ttm_b,
      fcf_ttm_b,
      net_debt_b,
      shares_outstanding_m,
      beta: null,
      market_cap_b: null,
      source: 'edgar',
    };
  } catch {
    return null;
  }
}
