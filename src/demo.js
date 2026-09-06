// The demo archive.
//
// A self-contained, deterministic dataset so the app can be explored with no
// keys at all — which is how most people will first see it.
//
// This is SYNTHETIC DATA and the UI says so on every screen it touches. It is
// generated, not recorded: there is no snapshot of real market prices here, and
// nothing in this file should ever be read as a market fact. The tickers, names
// and sectors are real because they are stable and useful; every number is made
// up by the generator below.
//
// What makes it worth having: returns are built as a market factor plus an
// idiosyncratic component, so names correlate the way equities actually do.
// A demo built from independent random walks would show a correlation matrix of
// noise and a diversification ratio that flatters the book — the analytics would
// run but would teach the opposite of the truth.

const TRADING_DAYS = 252;

/** Deterministic PRNG (mulberry32) — the same archive on every machine. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller: uniforms to a standard normal, so the tails behave. */
function gauss(next) {
  const u = Math.max(next(), 1e-9);
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * The archive's cast. `beta` drives how much of the market factor each name
 * takes, `idio` its own volatility, `drift` its annual trend. Fundamentals are
 * plausible for the sector but invented.
 */
export const DEMO_NAMES = [
  { symbol: 'AAPL', last: 232.4,  beta: 1.05, idio: 0.013, drift: 0.16, pe: 34.2, eps: 6.79, yield: 0.0045, target: 262, cap: 3.48e12, margin: 0.246, roe: 1.45, de: 1.42 },
  { symbol: 'MSFT', last: 428.9,  beta: 0.95, idio: 0.012, drift: 0.18, pe: 33.1, eps: 12.96, yield: 0.0072, target: 495, cap: 3.19e12, margin: 0.362, roe: 0.35, de: 0.42 },
  { symbol: 'NVDA', last: 141.2,  beta: 1.62, idio: 0.026, drift: 0.34, pe: 47.8, eps: 2.95, yield: 0.0003, target: 178, cap: 3.44e12, margin: 0.512, roe: 1.19, de: 0.13 },
  { symbol: 'AVGO', last: 172.6,  beta: 1.28, idio: 0.019, drift: 0.24, pe: 38.4, eps: 4.49, yield: 0.0128, target: 205, cap: 8.05e11, margin: 0.213, roe: 0.24, de: 0.98 },
  { symbol: 'JPM',  last: 243.8,  beta: 1.08, idio: 0.012, drift: 0.14, pe: 13.2, eps: 18.47, yield: 0.0207, target: 268, cap: 6.85e11, margin: 0.331, roe: 0.17, de: 1.28 },
  { symbol: 'V',    last: 312.5,  beta: 0.92, idio: 0.010, drift: 0.12, pe: 31.6, eps: 9.89, yield: 0.0072, target: 350, cap: 6.10e11, margin: 0.542, roe: 0.51, de: 0.55 },
  { symbol: 'BAC',  last: 44.2,   beta: 1.24, idio: 0.014, drift: 0.11, pe: 13.8, eps: 3.20, yield: 0.0235, target: 50,  cap: 3.36e11, margin: 0.271, roe: 0.10, de: 1.92 },
  { symbol: 'LLY',  last: 782.3,  beta: 0.68, idio: 0.017, drift: 0.21, pe: 61.4, eps: 12.74, yield: 0.0067, target: 940, cap: 7.43e11, margin: 0.189, roe: 0.79, de: 2.14 },
  { symbol: 'JNJ',  last: 158.9,  beta: 0.54, idio: 0.009, drift: 0.05, pe: 22.1, eps: 7.19, yield: 0.0312, target: 172, cap: 3.83e11, margin: 0.204, roe: 0.24, de: 0.51 },
  { symbol: 'UNH',  last: 521.7,  beta: 0.71, idio: 0.015, drift: 0.07, pe: 19.4, eps: 26.89, yield: 0.0161, target: 610, cap: 4.81e11, margin: 0.062, roe: 0.26, de: 0.72 },
  { symbol: 'XOM',  last: 112.4,  beta: 0.84, idio: 0.014, drift: 0.06, pe: 13.9, eps: 8.09, yield: 0.0348, target: 128, cap: 4.94e11, margin: 0.101, roe: 0.14, de: 0.23 },
  { symbol: 'CVX',  last: 156.8,  beta: 0.81, idio: 0.014, drift: 0.04, pe: 15.2, eps: 10.32, yield: 0.0421, target: 175, cap: 2.83e11, margin: 0.087, roe: 0.12, de: 0.19 },
  { symbol: 'CAT',  last: 371.5,  beta: 1.14, idio: 0.015, drift: 0.13, pe: 16.8, eps: 22.11, yield: 0.0152, target: 405, cap: 1.78e11, margin: 0.165, roe: 0.55, de: 2.21 },
  { symbol: 'HON',  last: 214.3,  beta: 0.98, idio: 0.011, drift: 0.08, pe: 24.6, eps: 8.71, yield: 0.0206, target: 235, cap: 1.39e11, margin: 0.152, roe: 0.34, de: 1.18 },
  { symbol: 'PG',   last: 168.2,  beta: 0.42, idio: 0.008, drift: 0.04, pe: 26.3, eps: 6.39, yield: 0.0242, target: 180, cap: 3.96e11, margin: 0.181, roe: 0.31, de: 0.68 },
  { symbol: 'KO',   last: 62.9,   beta: 0.46, idio: 0.008, drift: 0.05, pe: 24.8, eps: 2.54, yield: 0.0308, target: 70,  cap: 2.71e11, margin: 0.226, roe: 0.42, de: 1.63 },
  { symbol: 'NEE',  last: 71.4,   beta: 0.58, idio: 0.013, drift: 0.03, pe: 20.1, eps: 3.55, yield: 0.0295, target: 82,  cap: 1.47e11, margin: 0.242, roe: 0.12, de: 1.44 },
  { symbol: 'AMT',  last: 194.6,  beta: 0.76, idio: 0.014, drift: 0.02, pe: 32.5, eps: 5.99, yield: 0.0338, target: 220, cap: 9.10e10, margin: 0.121, roe: 0.28, de: 3.62 },
  { symbol: 'LIN',  last: 442.8,  beta: 0.86, idio: 0.011, drift: 0.10, pe: 32.9, eps: 13.46, yield: 0.0132, target: 490, cap: 2.11e11, margin: 0.196, roe: 0.17, de: 0.51 },
  { symbol: 'GOOGL', last: 172.9, beta: 1.06, idio: 0.014, drift: 0.15, pe: 23.4, eps: 7.39, yield: 0.0046, target: 205, cap: 2.10e12, margin: 0.286, roe: 0.31, de: 0.09 },

  // The pool widens from here. A screen is only as good as the list it runs
  // over: with twenty candidates a selective thesis cannot fill a twenty-name
  // book, so the offline archive carries enough names for the screen to reject
  // most of them and still leave a portfolio. `eps` is `last / pe` in every row,
  // so the justified-multiple anchor stays internally consistent.
  { symbol: 'ORCL', last: 168.4,  beta: 1.12, idio: 0.016, drift: 0.19,  pe: 29.8, eps: 5.65,  yield: 0.0095, target: 195, cap: 4.68e11, margin: 0.192, roe: 0.62, de: 4.85 },
  { symbol: 'CSCO', last: 58.7,   beta: 0.84, idio: 0.011, drift: 0.07,  pe: 19.4, eps: 3.03,  yield: 0.0272, target: 66,  cap: 2.34e11, margin: 0.221, roe: 0.22, de: 0.62 },
  { symbol: 'TXN',  last: 196.3,  beta: 1.04, idio: 0.014, drift: 0.09,  pe: 32.6, eps: 6.02,  yield: 0.0278, target: 215, cap: 1.79e11, margin: 0.308, roe: 0.29, de: 0.79 },
  { symbol: 'ACN',  last: 342.6,  beta: 1.09, idio: 0.013, drift: 0.06,  pe: 26.1, eps: 13.13, yield: 0.0161, target: 375, cap: 2.14e11, margin: 0.114, roe: 0.27, de: 0.18 },
  { symbol: 'ABBV', last: 196.8,  beta: 0.61, idio: 0.013, drift: 0.13,  pe: 21.4, eps: 9.20,  yield: 0.0332, target: 218, cap: 3.48e11, margin: 0.108, roe: 0.68, de: 6.42 },
  { symbol: 'MRK',  last: 98.4,   beta: 0.52, idio: 0.012, drift: 0.02,  pe: 16.8, eps: 5.86,  yield: 0.0329, target: 118, cap: 2.49e11, margin: 0.253, roe: 0.41, de: 0.72 },
  { symbol: 'ABT',  last: 118.2,  beta: 0.71, idio: 0.010, drift: 0.10,  pe: 24.1, eps: 4.90,  yield: 0.0188, target: 132, cap: 2.05e11, margin: 0.161, roe: 0.18, de: 0.31 },
  { symbol: 'MA',   last: 512.4,  beta: 0.96, idio: 0.011, drift: 0.14,  pe: 34.8, eps: 14.72, yield: 0.0055, target: 570, cap: 4.71e11, margin: 0.451, roe: 1.82, de: 2.42 },
  { symbol: 'WFC',  last: 71.8,   beta: 1.18, idio: 0.014, drift: 0.12,  pe: 13.4, eps: 5.36,  yield: 0.0223, target: 82,  cap: 2.42e11, margin: 0.242, roe: 0.11, de: 1.21 },
  { symbol: 'GS',   last: 548.2,  beta: 1.32, idio: 0.016, drift: 0.16,  pe: 14.6, eps: 37.55, yield: 0.0217, target: 610, cap: 1.71e11, margin: 0.221, roe: 0.13, de: 5.84 },
  { symbol: 'AMZN', last: 218.6,  beta: 1.21, idio: 0.017, drift: 0.17,  pe: 36.4, eps: 6.01,  yield: 0.0,    target: 255, cap: 2.29e12, margin: 0.092, roe: 0.24, de: 0.54 },
  { symbol: 'HD',   last: 398.5,  beta: 1.02, idio: 0.013, drift: 0.06,  pe: 25.8, eps: 15.45, yield: 0.0227, target: 430, cap: 3.96e11, margin: 0.094, roe: 4.12, de: 9.85 },
  { symbol: 'MCD',  last: 296.7,  beta: 0.62, idio: 0.009, drift: 0.05,  pe: 24.9, eps: 11.92, yield: 0.0238, target: 320, cap: 2.13e11, margin: 0.317, roe: null, de: null },
  { symbol: 'TJX',  last: 121.4,  beta: 0.88, idio: 0.012, drift: 0.15,  pe: 27.2, eps: 4.46,  yield: 0.0124, target: 138, cap: 1.36e11, margin: 0.086, roe: 0.61, de: 1.14 },
  { symbol: 'META', last: 582.3,  beta: 1.24, idio: 0.019, drift: 0.22,  pe: 26.1, eps: 22.31, yield: 0.0034, target: 660, cap: 1.47e12, margin: 0.358, roe: 0.36, de: 0.28 },
  { symbol: 'GE',   last: 188.9,  beta: 1.16, idio: 0.017, drift: 0.20,  pe: 34.2, eps: 5.52,  yield: 0.0061, target: 210, cap: 2.05e11, margin: 0.164, roe: 0.29, de: 0.78 },
  { symbol: 'RTX',  last: 121.6,  beta: 0.79, idio: 0.011, drift: 0.14,  pe: 22.8, eps: 5.33,  yield: 0.0207, target: 135, cap: 1.62e11, margin: 0.078, roe: 0.11, de: 0.71 },
  { symbol: 'UNP',  last: 232.4,  beta: 0.94, idio: 0.011, drift: 0.03,  pe: 21.2, eps: 10.96, yield: 0.0229, target: 258, cap: 1.41e11, margin: 0.276, roe: 0.42, de: 1.94 },
  { symbol: 'DE',   last: 421.8,  beta: 1.06, idio: 0.014, drift: 0.08,  pe: 16.4, eps: 25.72, yield: 0.0148, target: 460, cap: 1.15e11, margin: 0.147, roe: 0.32, de: 2.68 },
  { symbol: 'WMT',  last: 88.6,   beta: 0.54, idio: 0.010, drift: 0.18,  pe: 30.2, eps: 2.93,  yield: 0.0094, target: 98,  cap: 7.12e11, margin: 0.028, roe: 0.22, de: 0.72 },
  { symbol: 'COST', last: 912.4,  beta: 0.79, idio: 0.012, drift: 0.16,  pe: 51.8, eps: 17.61, yield: 0.0051, target: 990, cap: 4.05e11, margin: 0.029, roe: 0.31, de: 0.32 },
  { symbol: 'PEP',  last: 152.8,  beta: 0.48, idio: 0.009, drift: -0.02, pe: 21.6, eps: 7.07,  yield: 0.0354, target: 172, cap: 2.10e11, margin: 0.098, roe: 0.49, de: 2.14 },
  { symbol: 'COP',  last: 98.7,   beta: 0.92, idio: 0.016, drift: 0.03,  pe: 12.4, eps: 7.96,  yield: 0.0316, target: 118, cap: 1.13e11, margin: 0.129, roe: 0.16, de: 0.36 },
  { symbol: 'SO',   last: 88.2,   beta: 0.44, idio: 0.010, drift: 0.11,  pe: 21.8, eps: 4.05,  yield: 0.0328, target: 95,  cap: 9.64e10, margin: 0.181, roe: 0.13, de: 1.86 },
  { symbol: 'PLD',  last: 112.4,  beta: 1.08, idio: 0.015, drift: -0.06, pe: 35.4, eps: 3.18,  yield: 0.0354, target: 132, cap: 1.04e11, margin: 0.301, roe: 0.06, de: 0.62 },
  { symbol: 'APD',  last: 312.6,  beta: 0.82, idio: 0.012, drift: 0.09,  pe: 24.8, eps: 12.61, yield: 0.0231, target: 340, cap: 6.96e10, margin: 0.201, roe: 0.16, de: 0.71 },
  { symbol: 'SHW',  last: 368.4,  beta: 1.02, idio: 0.013, drift: 0.07,  pe: 33.6, eps: 10.96, yield: 0.0078, target: 400, cap: 9.28e10, margin: 0.114, roe: 0.68, de: 3.12 },

  // The market proxy itself: beta 1 and no idiosyncratic noise, so every other
  // name's beta is measured against the same factor that generated it.
  { symbol: 'SPY',  last: 571.3,  beta: 1.00, idio: 0.0,   drift: 0.11, pe: 26.4, eps: 21.64, yield: 0.0121, target: null, cap: null, margin: null, roe: null, de: null }
];

/** Sector median P/E for the justified-multiple anchor. Invented, plausible. */
export const DEMO_SECTOR_PE = new Map([
  ['Information Technology', 31.4],
  ['Communication Services', 22.8],
  ['Health Care', 24.6],
  ['Financials', 15.2],
  ['Consumer Discretionary', 26.9],
  ['Consumer Staples', 23.1],
  ['Industrials', 21.7],
  ['Energy', 13.4],
  ['Utilities', 18.9],
  ['Real Estate', 29.2],
  ['Materials', 20.3]
]);

const bySymbol = new Map(DEMO_NAMES.map((n) => [n.symbol, n]));
export const DEMO_SYMBOLS = DEMO_NAMES.map((n) => n.symbol);
export function isDemoSymbol(symbol) {
  return bySymbol.has(String(symbol ?? '').toUpperCase());
}

/* ------------------------------------------------------- the market factor --- */

const SESSIONS = 400;

/**
 * One market path shared by every name — this is what makes the correlation
 * matrix look like equities rather than static. It carries a drawdown, because
 * a risk panel with no bad stretch in it teaches nothing.
 */
let marketCache = null;
function marketPath() {
  if (marketCache) return marketCache;
  const next = rng(20260906);
  const out = [];
  for (let t = 0; t < SESSIONS; t++) {
    // A six-week correction two thirds of the way through the window.
    const stress = t > 250 && t < 285 ? -0.0042 : 0;
    const vol = t > 250 && t < 285 ? 0.016 : 0.0078;
    out.push(0.00045 + stress + gauss(next) * vol);
  }
  marketCache = out;
  return out;
}

/** Trading-day dates ending today, weekends skipped. */
function sessionDates(count) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (out.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(new Date(d).toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out.reverse();
}

const datesCache = sessionDates(SESSIONS);

/**
 * Daily bars for one demo name: market factor scaled by beta, plus its own
 * noise, rescaled so the final close lands exactly on the archive's price.
 */
export function demoBars(symbol) {
  const spec = bySymbol.get(String(symbol).toUpperCase());
  if (!spec) return null;

  const market = marketPath();
  const next = rng(hash(spec.symbol));
  const daily = spec.drift / TRADING_DAYS;

  let price = spec.last * 0.72;
  const closes = [];
  for (let t = 0; t < SESSIONS; t++) {
    const r = daily + spec.beta * market[t] + gauss(next) * spec.idio;
    price *= 1 + r;
    closes.push(price);
  }
  // Land the series on the quoted price so the chart, the quote and the
  // fundamentals all tell the same story.
  const scale = spec.last / closes[closes.length - 1];

  return closes.map((c, t) => {
    const close = c * scale;
    const wobble = spec.idio * 0.55;
    return {
      date: datesCache[t],
      open: close * (1 - wobble * 0.35),
      high: close * (1 + wobble),
      low: close * (1 - wobble),
      close,
      volume: Math.round(2_000_000 + next() * 8_000_000)
    };
  });
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Quotes for the demo names, in the shape fetchQuotes returns. */
export function demoQuotes(symbols) {
  const out = new Map();
  for (const raw of symbols) {
    const sym = String(raw).toUpperCase();
    const spec = bySymbol.get(sym);
    if (!spec) continue;
    const bars = demoBars(sym);
    const last = bars[bars.length - 1].close;
    const prev = bars[bars.length - 2].close;
    out.set(sym, {
      price: last,
      previousClose: prev,
      changePct: (last / prev - 1) * 100,
      currency: 'USD',
      exchange: 'DEMO',
      name: sym
    });
  }
  return out;
}

/** Fundamentals in the shape fetchFundamentals returns. */
export function demoFundamentals(symbol, universe = []) {
  const sym = String(symbol).toUpperCase();
  const spec = bySymbol.get(sym);
  if (!spec) return null;
  const company = universe.find((c) => c.symbol === sym) ?? null;

  return {
    symbol: sym,
    name: company?.name ?? sym,
    sector: company?.sector ?? null,
    industry: null,
    price: spec.last,
    marketCap: spec.cap,
    beta: spec.beta,
    currency: 'USD',
    peTtm: spec.pe,
    pbTtm: null,
    psTtm: null,
    epsTtm: spec.eps,
    dividendYield: spec.yield,
    payoutRatio: null,
    grossMargin: null,
    netMargin: spec.margin,
    roe: spec.roe,
    debtToEquity: spec.de,
    currentRatio: null,
    fcfPerShare: null,
    revenuePerShare: null,
    description: null
  };
}

/** Consensus target in the shape fetchPriceTarget returns. */
export function demoPriceTarget(symbol) {
  const spec = bySymbol.get(String(symbol).toUpperCase());
  if (!spec) return null;
  return {
    consensus: spec.target,
    high: spec.target * 1.18,
    low: spec.target * 0.84,
    median: spec.target
  };
}

export function demoSectorPe() {
  return new Map(DEMO_SECTOR_PE);
}

/* ------------------------------------------------------------- demo wire --- */

/**
 * Headlines for the themes panel. Written for this archive, attributed to a
 * fictional wire so no real outlet is put behind an invented sentence, and
 * carrying no links — there is nothing real to link to.
 */
const DEMO_WIRE = {
  Energy: [
    'OPEC+ holds quotas steady, signalling a wait-and-see stance into the winter',
    'Refining margins widen as maintenance season runs shorter than usual',
    'European gas storage ends the injection season comfortably above the five-year average',
    'Two large offshore projects reach final investment decision in the Gulf'
  ],
  'Information Technology': [
    'Data-centre capital expenditure guidance raised again across the major cloud operators',
    'Memory pricing firms as AI server builds absorb spare capacity',
    'Enterprise software renewals show longer cycles but stable net retention',
    'Advanced packaging capacity remains the binding constraint on accelerator supply'
  ],
  'Health Care': [
    'Obesity-drug supply constraints ease as a second fill-finish site comes online',
    'A late-stage oncology readout beats on progression-free survival',
    'Managed-care utilisation runs above plan for a second consecutive quarter',
    'Regulators signal a faster review path for rare-disease submissions'
  ],
  Financials: [
    'Net interest margins compress modestly as deposit costs catch up with the curve',
    'Credit-card charge-offs normalise toward pre-2020 levels rather than deteriorating',
    'Investment-banking fee pipelines rebuild on renewed sponsor activity',
    'Regional bank commercial real-estate provisions stabilise'
  ],
  Industrials: [
    'Aerospace deliveries improve as supplier bottlenecks clear',
    'Freight rates bottom after eighteen months of decline',
    'Reshoring announcements lift long-cycle equipment order books',
    'Defence budget outlines point to sustained munitions replenishment'
  ],
  'Consumer Staples': [
    'Volume growth returns as price increases lap out of the comparison base',
    'Private-label share gains slow in packaged foods',
    'Input-cost deflation supports gross margin recovery'
  ],
  Utilities: [
    'Load growth forecasts revised upward on data-centre interconnection queues',
    'Rate-case outcomes come in near the requested return on equity',
    'Grid-hardening capital plans extended through the end of the decade'
  ],
  Materials: [
    'Copper inventories draw down as mine supply guidance is trimmed',
    'Chemical operating rates improve from cyclical lows',
    'Steel spreads widen on restocking demand'
  ],
  'Real Estate': [
    'Office leasing stabilises in prime submarkets while commodity space lags',
    'Data-centre and industrial cap rates hold firm against the wider market',
    'Refinancing walls extend as lenders favour modification over foreclosure'
  ],
  'Communication Services': [
    'Advertising spend recovers with brand budgets returning to video',
    'Streaming password-sharing enforcement lifts paid net additions',
    'Fixed-wireless subscriber growth continues to take share from cable'
  ],
  'Consumer Discretionary': [
    'Discretionary spending holds up at the top of the income distribution',
    'Freight and promotional intensity both ease into the holiday build',
    'Electric-vehicle price competition compresses margins across the segment'
  ]
};

/**
 * Headlines for a query. The themes panel passes a sector phrase, the portfolio
 * and single-name panels pass tickers — both are matched against the archive.
 */
export function demoHeadlines(query, { pageSize = 6 } = {}) {
  const q = String(query ?? '').toLowerCase();

  // Sector queries carry their own keywords, e.g. "oil OR gas OR OPEC".
  const sectorHit = Object.keys(DEMO_WIRE).find((sector) => {
    const words = SECTOR_KEYWORDS[sector] ?? [];
    return words.some((w) => q.includes(w));
  });

  const pool = sectorHit
    ? DEMO_WIRE[sectorHit]
    : Object.values(DEMO_WIRE).flat();

  const today = new Date();
  return pool.slice(0, pageSize).map((title, i) => {
    const when = new Date(today);
    when.setDate(when.getDate() - i);
    return {
      title,
      source: 'Demo wire (synthetic)',
      url: null,
      publishedAt: when.toISOString(),
      description: 'Illustrative headline from the bundled demo archive — not a real news story.'
    };
  });
}

/** Words that map a themes query back to a sector in the archive. */
const SECTOR_KEYWORDS = {
  Energy: ['oil', 'gas', 'opec', 'crude', 'refinery'],
  'Information Technology': ['semiconductor', 'artificial intelligence', 'cloud', 'chipmaker'],
  'Health Care': ['pharmaceutical', 'fda', 'biotech', 'drug'],
  Financials: ['interest rates', 'bank', 'federal reserve', 'credit'],
  Industrials: ['manufacturing', 'aerospace', 'defence', 'freight'],
  'Consumer Discretionary': ['retail', 'consumer spending', 'e-commerce'],
  'Consumer Staples': ['grocery', 'consumer goods', 'food prices'],
  'Communication Services': ['streaming', 'advertising', 'telecom'],
  Utilities: ['electricity', 'power grid', 'utility'],
  'Real Estate': ['commercial real estate', 'reit', 'office vacancy'],
  Materials: ['copper', 'steel', 'mining', 'chemicals']
};

/** A demo book: the holdings the Portfolio tab loads in demo mode. */
export const DEMO_PORTFOLIO = [
  { symbol: 'AAPL', quantity: 60, costBasis: 168.40 },
  { symbol: 'MSFT', quantity: 25, costBasis: 331.20 },
  { symbol: 'NVDA', quantity: 90, costBasis: 71.80 },
  { symbol: 'JPM', quantity: 40, costBasis: 182.60 },
  { symbol: 'LLY', quantity: 8, costBasis: 604.10 },
  { symbol: 'XOM', quantity: 85, costBasis: 103.75 },
  { symbol: 'PG', quantity: 45, costBasis: 152.30 },
  { symbol: 'NEE', quantity: 120, costBasis: 64.90 },
  { symbol: 'CAT', quantity: 15, costBasis: 298.40 },
  { symbol: 'KO', quantity: 150, costBasis: 58.20 }
];


/**
 * The themes panel wants headlines grouped by sector. In demo mode it reads the
 * archive directly rather than going through the query matcher, so every sector
 * is populated and the panel shows what it looks like in full.
 */
export function demoSectorHeadlines() {
  const out = {};
  const today = new Date();
  for (const [sector, titles] of Object.entries(DEMO_WIRE)) {
    out[sector] = titles.slice(0, 4).map((title, i) => {
      const when = new Date(today);
      when.setDate(when.getDate() - i);
      return {
        title,
        source: 'Demo wire (synthetic)',
        url: null,
        publishedAt: when.toISOString(),
        description: 'Illustrative headline from the bundled demo archive — not a real news story.'
      };
    });
  }
  return out;
}


/**
 * Sector moves for the themes panel, averaged across the archive names in each
 * sector. The live path reads a sector proxy ETF; the archive has no ETFs, so
 * the sector's own constituents stand in — which is what a sector ETF is.
 */
export function demoSectorMoves(sectors, universe) {
  const out = new Map();
  const sectorOf = new Map(universe.map((c) => [c.symbol, c.sector]));

  for (const sector of sectors) {
    const members = DEMO_NAMES.filter(
      (n) => n.symbol !== 'SPY' && sectorOf.get(n.symbol) === sector
    );
    if (!members.length) continue;

    const changes = members.map((n) => {
      const bars = demoBars(n.symbol);
      return (bars[bars.length - 1].close / bars[bars.length - 2].close - 1) * 100;
    });
    out.set(sector, {
      proxy: `${members.length} demo name${members.length === 1 ? '' : 's'}`,
      changePct: changes.reduce((a, b) => a + b, 0) / changes.length,
      price: null
    });
  }
  return out;
}
