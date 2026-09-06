// The company universe the screener searches.
//
// TWO SOURCES, ALWAYS LABELLED. `SEED_UNIVERSE` below is a hand-checked subset
// of large S&P 500 constituents — ticker, company name and GICS sector only.
// Those three facts are stable and verifiable; no prices, multiples, ratings or
// targets are baked in, because stale numbers presented as current are worse
// than no numbers at all. Every figure in this app is fetched at run time or
// shown as "—".
//
// With an FMP key the app replaces this seed with the REAL, COMPLETE constituent
// list from FMP's /sp500_constituent endpoint (see loadFullUniverse), and the UI
// says which source is in play. Without a key you get the seed, clearly marked
// as a subset rather than passed off as the whole index.

export const SECTORS = [
  'Information Technology',
  'Health Care',
  'Financials',
  'Consumer Discretionary',
  'Communication Services',
  'Industrials',
  'Consumer Staples',
  'Energy',
  'Utilities',
  'Real Estate',
  'Materials'
];

export const SEED_UNIVERSE = [
  // --- Information Technology ---
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Information Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Information Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Information Technology' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Information Technology' },
  { symbol: 'ORCL', name: 'Oracle Corporation', sector: 'Information Technology' },
  { symbol: 'CRM', name: 'Salesforce, Inc.', sector: 'Information Technology' },
  { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', sector: 'Information Technology' },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Information Technology' },
  { symbol: 'CSCO', name: 'Cisco Systems, Inc.', sector: 'Information Technology' },
  { symbol: 'ACN', name: 'Accenture plc', sector: 'Information Technology' },
  { symbol: 'INTC', name: 'Intel Corporation', sector: 'Information Technology' },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated', sector: 'Information Technology' },
  { symbol: 'TXN', name: 'Texas Instruments Incorporated', sector: 'Information Technology' },
  { symbol: 'IBM', name: 'International Business Machines Corporation', sector: 'Information Technology' },
  { symbol: 'AMAT', name: 'Applied Materials, Inc.', sector: 'Information Technology' },
  { symbol: 'MU', name: 'Micron Technology, Inc.', sector: 'Information Technology' },
  { symbol: 'LRCX', name: 'Lam Research Corporation', sector: 'Information Technology' },
  { symbol: 'KLAC', name: 'KLA Corporation', sector: 'Information Technology' },
  { symbol: 'INTU', name: 'Intuit Inc.', sector: 'Information Technology' },
  { symbol: 'NOW', name: 'ServiceNow, Inc.', sector: 'Information Technology' },
  { symbol: 'PANW', name: 'Palo Alto Networks, Inc.', sector: 'Information Technology' },
  { symbol: 'ADI', name: 'Analog Devices, Inc.', sector: 'Information Technology' },
  { symbol: 'MSI', name: 'Motorola Solutions, Inc.', sector: 'Information Technology' },
  { symbol: 'ADSK', name: 'Autodesk, Inc.', sector: 'Information Technology' },

  // --- Health Care ---
  { symbol: 'LLY', name: 'Eli Lilly and Company', sector: 'Health Care' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Health Care' },
  { symbol: 'MRK', name: 'Merck & Co., Inc.', sector: 'Health Care' },
  { symbol: 'UNH', name: 'UnitedHealth Group Incorporated', sector: 'Health Care' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', sector: 'Health Care' },
  { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'Health Care' },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Health Care' },
  { symbol: 'AMGN', name: 'Amgen Inc.', sector: 'Health Care' },
  { symbol: 'DHR', name: 'Danaher Corporation', sector: 'Health Care' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb Company', sector: 'Health Care' },
  { symbol: 'GILD', name: 'Gilead Sciences, Inc.', sector: 'Health Care' },
  { symbol: 'ISRG', name: 'Intuitive Surgical, Inc.', sector: 'Health Care' },
  { symbol: 'VRTX', name: 'Vertex Pharmaceuticals Incorporated', sector: 'Health Care' },
  { symbol: 'REGN', name: 'Regeneron Pharmaceuticals, Inc.', sector: 'Health Care' },
  { symbol: 'MDT', name: 'Medtronic plc', sector: 'Health Care' },
  { symbol: 'CI', name: 'The Cigna Group', sector: 'Health Care' },
  { symbol: 'ELV', name: 'Elevance Health, Inc.', sector: 'Health Care' },

  // --- Financials ---
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', sector: 'Financials' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials' },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financials' },
  { symbol: 'MA', name: 'Mastercard Incorporated', sector: 'Financials' },
  { symbol: 'BAC', name: 'Bank of America Corporation', sector: 'Financials' },
  { symbol: 'WFC', name: 'Wells Fargo & Company', sector: 'Financials' },
  { symbol: 'GS', name: 'The Goldman Sachs Group, Inc.', sector: 'Financials' },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'Financials' },
  { symbol: 'BLK', name: 'BlackRock, Inc.', sector: 'Financials' },
  { symbol: 'SPGI', name: 'S&P Global Inc.', sector: 'Financials' },
  { symbol: 'AXP', name: 'American Express Company', sector: 'Financials' },
  { symbol: 'C', name: 'Citigroup Inc.', sector: 'Financials' },
  { symbol: 'SCHW', name: 'The Charles Schwab Corporation', sector: 'Financials' },
  { symbol: 'CB', name: 'Chubb Limited', sector: 'Financials' },
  { symbol: 'PGR', name: 'The Progressive Corporation', sector: 'Financials' },

  // --- Consumer Discretionary ---
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'HD', name: 'The Home Depot, Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'MCD', name: "McDonald's Corporation", sector: 'Consumer Discretionary' },
  { symbol: 'BKNG', name: 'Booking Holdings Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'LOW', name: "Lowe's Companies, Inc.", sector: 'Consumer Discretionary' },
  { symbol: 'TJX', name: 'The TJX Companies, Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'NKE', name: 'NIKE, Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', sector: 'Consumer Discretionary' },

  // --- Communication Services ---
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication Services' },
  { symbol: 'META', name: 'Meta Platforms, Inc.', sector: 'Communication Services' },
  { symbol: 'NFLX', name: 'Netflix, Inc.', sector: 'Communication Services' },
  { symbol: 'DIS', name: 'The Walt Disney Company', sector: 'Communication Services' },
  { symbol: 'CMCSA', name: 'Comcast Corporation', sector: 'Communication Services' },
  { symbol: 'T', name: 'AT&T Inc.', sector: 'Communication Services' },
  { symbol: 'VZ', name: 'Verizon Communications Inc.', sector: 'Communication Services' },
  { symbol: 'TMUS', name: 'T-Mobile US, Inc.', sector: 'Communication Services' },

  // --- Industrials ---
  { symbol: 'GE', name: 'GE Aerospace', sector: 'Industrials' },
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials' },
  { symbol: 'RTX', name: 'RTX Corporation', sector: 'Industrials' },
  { symbol: 'HON', name: 'Honeywell International Inc.', sector: 'Industrials' },
  { symbol: 'UNP', name: 'Union Pacific Corporation', sector: 'Industrials' },
  { symbol: 'BA', name: 'The Boeing Company', sector: 'Industrials' },
  { symbol: 'DE', name: 'Deere & Company', sector: 'Industrials' },
  { symbol: 'LMT', name: 'Lockheed Martin Corporation', sector: 'Industrials' },
  { symbol: 'UPS', name: 'United Parcel Service, Inc.', sector: 'Industrials' },
  { symbol: 'ETN', name: 'Eaton Corporation plc', sector: 'Industrials' },
  { symbol: 'GD', name: 'General Dynamics Corporation', sector: 'Industrials' },

  // --- Consumer Staples ---
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Staples' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', sector: 'Consumer Staples' },
  { symbol: 'PG', name: 'The Procter & Gamble Company', sector: 'Consumer Staples' },
  { symbol: 'KO', name: 'The Coca-Cola Company', sector: 'Consumer Staples' },
  { symbol: 'PEP', name: 'PepsiCo, Inc.', sector: 'Consumer Staples' },
  { symbol: 'PM', name: 'Philip Morris International Inc.', sector: 'Consumer Staples' },
  { symbol: 'MDLZ', name: 'Mondelez International, Inc.', sector: 'Consumer Staples' },
  { symbol: 'CL', name: 'Colgate-Palmolive Company', sector: 'Consumer Staples' },

  // --- Energy ---
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', sector: 'Energy' },
  { symbol: 'CVX', name: 'Chevron Corporation', sector: 'Energy' },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy' },
  { symbol: 'EOG', name: 'EOG Resources, Inc.', sector: 'Energy' },
  { symbol: 'SLB', name: 'Schlumberger Limited', sector: 'Energy' },
  { symbol: 'PSX', name: 'Phillips 66', sector: 'Energy' },
  { symbol: 'MPC', name: 'Marathon Petroleum Corporation', sector: 'Energy' },
  { symbol: 'WMB', name: 'The Williams Companies, Inc.', sector: 'Energy' },
  { symbol: 'OKE', name: 'ONEOK, Inc.', sector: 'Energy' },
  { symbol: 'HAL', name: 'Halliburton Company', sector: 'Energy' },

  // --- Utilities ---
  { symbol: 'NEE', name: 'NextEra Energy, Inc.', sector: 'Utilities' },
  { symbol: 'SO', name: 'The Southern Company', sector: 'Utilities' },
  { symbol: 'DUK', name: 'Duke Energy Corporation', sector: 'Utilities' },
  { symbol: 'AEP', name: 'American Electric Power Company, Inc.', sector: 'Utilities' },
  { symbol: 'D', name: 'Dominion Energy, Inc.', sector: 'Utilities' },
  { symbol: 'SRE', name: 'Sempra', sector: 'Utilities' },

  // --- Real Estate ---
  { symbol: 'PLD', name: 'Prologis, Inc.', sector: 'Real Estate' },
  { symbol: 'AMT', name: 'American Tower Corporation', sector: 'Real Estate' },
  { symbol: 'EQIX', name: 'Equinix, Inc.', sector: 'Real Estate' },
  { symbol: 'SPG', name: 'Simon Property Group, Inc.', sector: 'Real Estate' },
  { symbol: 'O', name: 'Realty Income Corporation', sector: 'Real Estate' },

  // --- Materials ---
  { symbol: 'LIN', name: 'Linde plc', sector: 'Materials' },
  { symbol: 'SHW', name: 'The Sherwin-Williams Company', sector: 'Materials' },
  { symbol: 'APD', name: 'Air Products and Chemicals, Inc.', sector: 'Materials' },
  { symbol: 'ECL', name: 'Ecolab Inc.', sector: 'Materials' },
  { symbol: 'FCX', name: 'Freeport-McMoRan Inc.', sector: 'Materials' },
  { symbol: 'NEM', name: 'Newmont Corporation', sector: 'Materials' },
  { symbol: 'DOW', name: 'Dow Inc.', sector: 'Materials' }
];

// A sector ETF per GICS sector: used to measure how a *theme* is actually
// trading, rather than asserting a move the tape does not support.
export const SECTOR_PROXY = {
  'Information Technology': 'XLK',
  'Health Care': 'XLV',
  Financials: 'XLF',
  'Consumer Discretionary': 'XLY',
  'Communication Services': 'XLC',
  Industrials: 'XLI',
  'Consumer Staples': 'XLP',
  Energy: 'XLE',
  Utilities: 'XLU',
  'Real Estate': 'XLRE',
  Materials: 'XLB'
};

export const MARKET_PROXY = 'SPY';

/**
 * State of the universe currently in memory, with its provenance.
 * `source` is one of 'seed' | 'fmp' — the UI prints it, so a viewer always
 * knows whether they are searching the full index or the bundled subset.
 */
export function seedUniverse() {
  return {
    companies: [...SEED_UNIVERSE].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    source: 'seed',
    fetchedAt: null
  };
}

/**
 * Replace the seed with the real S&P 500 constituent list from FMP.
 *
 * FMP retired /api/v3 in 2025 — it answers "Legacy Endpoint" for accounts
 * created after 31 August 2025, while older subscriptions still work on it — so
 * the current /stable path is tried first and the legacy one second.
 *
 * Throws on failure: the caller keeps the seed and tells the user why, rather
 * than silently pretending the subset is the whole index.
 */
export async function loadFullUniverse(fmpKey, fetchJson) {
  const k = encodeURIComponent(fmpKey);
  const urls = [
    `https://financialmodelingprep.com/stable/sp500-constituent?apikey=${k}`,
    `https://financialmodelingprep.com/api/v3/sp500_constituent?apikey=${k}`
  ];

  let rows = null;
  let firstError = null;
  for (const url of urls) {
    try {
      const data = await fetchJson(url, 'FMP constituents');
      if (Array.isArray(data) && data.length) {
        rows = data;
        break;
      }
    } catch (err) {
      if (!firstError) firstError = err;
    }
  }

  if (!rows) {
    throw firstError ?? new Error('FMP returned no constituents');
  }
  const companies = rows
    .filter((r) => r && r.symbol)
    .map((r) => ({
      symbol: String(r.symbol).trim(),
      name: String(r.name || r.symbol).trim(),
      sector: String(r.sector || 'Unclassified').trim()
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return { companies, source: 'fmp', fetchedAt: new Date().toISOString() };
}

/** Case-insensitive search over symbol, company name and sector. */
export function searchUniverse(companies, query) {
  if (!query || !query.trim()) return companies;
  const q = query.trim().toUpperCase();
  const compact = q.replace(/\s+/g, '');
  return companies.filter(
    (c) =>
      c.symbol.includes(compact) ||
      c.name.toUpperCase().includes(q) ||
      c.name.toUpperCase().replace(/\s+/g, '').includes(compact) ||
      c.sector.toUpperCase().includes(q)
  );
}

export function findCompany(companies, symbol) {
  if (!symbol) return null;
  const s = String(symbol).trim().toUpperCase();
  return companies.find((c) => c.symbol.toUpperCase() === s) ?? null;
}
