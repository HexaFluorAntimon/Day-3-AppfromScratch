// Portfolio import and analytics.
//
// The import is deliberately forgiving about SHAPE and strict about CONTENT: it
// accepts whatever column names a broker export happens to use, but a row whose
// ticker or quantity cannot be read is reported as a skipped row with its reason
// rather than being quietly dropped or filled with a default.

import { simpleReturns, stdDev, mean, annualisedVol, annualisedReturn, maxDrawdown, beta } from './analysis.js';

const TRADING_DAYS = 252;

/* ---------------------------------------------------------------- parsing --- */

/**
 * RFC-4180-ish CSV parser: handles quoted fields, embedded commas, escaped
 * quotes, and \r\n. Written out rather than pulled in, so the CSV path has no
 * dependency and works offline.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',' || ch === ';' || ch === '\t') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (ch === '\r') continue;
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** Column-name synonyms seen across common broker exports. */
const COLUMN_HINTS = {
  symbol: ['symbol', 'ticker', 'instrument', 'stock', 'security', 'isin', 'name', 'asset', 'wkn'],
  quantity: ['quantity', 'qty', 'shares', 'units', 'position', 'amount', 'nominal', 'anzahl', 'stück', 'stueck'],
  costBasis: ['cost', 'costbasis', 'cost basis', 'avgprice', 'average price', 'avg cost', 'buyprice',
    'purchase price', 'price paid', 'einstandskurs', 'kaufkurs', 'unit cost', 'costpershare'],
  currency: ['currency', 'ccy', 'währung', 'waehrung'],
  date: ['date', 'purchasedate', 'purchase date', 'trade date', 'opened', 'kaufdatum']
};

function normaliseHeader(h) {
  return String(h).trim().toLowerCase().replace(/[_.\-/]+/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Guess which column is which. Returns an index per field, or -1.
 * A guess is only a starting point — the UI shows the mapping and lets the user
 * correct it before anything is computed.
 */
export function guessMapping(headers) {
  const norm = headers.map(normaliseHeader);
  const mapping = { symbol: -1, quantity: -1, costBasis: -1, currency: -1, date: -1 };

  for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
    // exact match first, then contains
    let idx = norm.findIndex((h) => hints.includes(h));
    if (idx === -1) idx = norm.findIndex((h) => hints.some((hint) => h.includes(hint)));
    mapping[field] = idx;
  }
  return mapping;
}

/** Numbers arrive as "1.234,56", "1,234.56", "$1,234.56" or "(120)". */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;

  let s = String(raw).trim();
  if (!s) return NaN;

  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '').replace(/[^\d.,\-+]/g, '');
  if (!s) return NaN;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // A lone comma: decimal separator unless it groups thousands (1,234).
    const after = s.length - lastComma - 1;
    s = after === 3 && /^\d{1,3},\d{3}$/.test(s) ? s.replace(',', '') : s.replace(',', '.');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * Turn parsed rows + a column mapping into holdings.
 * Returns { holdings, skipped } — skipped rows carry the reason, so the UI can
 * tell the user exactly which lines it could not read and why.
 */
export function buildHoldings(rows, mapping, { hasHeader = true } = {}) {
  const body = hasHeader ? rows.slice(1) : rows;
  const holdings = [];
  const skipped = [];

  body.forEach((row, i) => {
    const lineNo = i + (hasHeader ? 2 : 1);
    const rawSymbol = mapping.symbol >= 0 ? row[mapping.symbol] : undefined;
    const symbol = String(rawSymbol ?? '').trim().toUpperCase();

    if (!symbol) {
      skipped.push({ line: lineNo, reason: 'no ticker in the mapped column', raw: row.join(', ').slice(0, 80) });
      return;
    }
    if (!TICKER_RE.test(symbol)) {
      skipped.push({ line: lineNo, reason: `"${symbol.slice(0, 20)}" is not a ticker symbol`, raw: row.join(', ').slice(0, 80) });
      return;
    }

    const quantity = parseNumber(mapping.quantity >= 0 ? row[mapping.quantity] : NaN);
    if (!Number.isFinite(quantity) || quantity === 0) {
      skipped.push({ line: lineNo, reason: 'quantity missing or zero', raw: row.join(', ').slice(0, 80) });
      return;
    }

    const costBasis = parseNumber(mapping.costBasis >= 0 ? row[mapping.costBasis] : NaN);
    const currency = mapping.currency >= 0 ? String(row[mapping.currency] ?? '').trim().toUpperCase() : '';
    const date = mapping.date >= 0 ? String(row[mapping.date] ?? '').trim() : '';

    const existing = holdings.find((h) => h.symbol === symbol);
    if (existing) {
      // Same name twice: merge into a weighted average cost.
      const totalQty = existing.quantity + quantity;
      if (Number.isFinite(existing.costBasis) && Number.isFinite(costBasis) && totalQty !== 0) {
        existing.costBasis = (existing.costBasis * existing.quantity + costBasis * quantity) / totalQty;
      } else if (!Number.isFinite(existing.costBasis)) {
        existing.costBasis = Number.isFinite(costBasis) ? costBasis : NaN;
      }
      existing.quantity = totalQty;
      existing.mergedRows = (existing.mergedRows ?? 1) + 1;
      return;
    }

    holdings.push({
      symbol,
      quantity,
      costBasis: Number.isFinite(costBasis) ? costBasis : NaN,
      currency: currency || null,
      date: date || null
    });
  });

  return { holdings, skipped };
}

/* --------------------------------------------------------------- valuation --- */

/**
 * Value the holdings with live quotes. A holding with no quote keeps
 * `price: null` and is excluded from totals, and `pricedCount` says how many
 * were valued — a partial portfolio is never presented as a complete one.
 */
export function valueHoldings(holdings, quotes) {
  const priced = holdings.map((h) => {
    const q = quotes.get(h.symbol) ?? null;
    const price = q?.price ?? null;
    const value = price !== null ? price * h.quantity : null;
    const cost = Number.isFinite(h.costBasis) ? h.costBasis * h.quantity : null;
    const pnl = value !== null && cost !== null ? value - cost : null;
    return {
      ...h,
      price,
      changePct: q?.changePct ?? null,
      value,
      cost,
      pnl,
      pnlPct: pnl !== null && cost ? (pnl / cost) * 100 : null,
      dayPnl: price !== null && Number.isFinite(q?.changePct) && Number.isFinite(q?.previousClose)
        ? (price - q.previousClose) * h.quantity
        : null
    };
  });

  const totalValue = priced.reduce((a, h) => a + (h.value ?? 0), 0);
  // Cost counts ONLY the positions that could be valued. Summing the cost of an
  // unpriced holding against a market value that excludes it would understate
  // P/L by that position's cost — a wrong number, not a missing one.
  const totalCost = priced.reduce((a, h) => a + (h.value !== null ? h.cost ?? 0 : 0), 0);
  const dayPnl = priced.reduce((a, h) => a + (h.dayPnl ?? 0), 0);

  const withWeights = priced.map((h) => ({
    ...h,
    weight: h.value !== null && totalValue > 0 ? h.value / totalValue : null
  }));

  return {
    holdings: withWeights,
    totalValue,
    totalCost: totalCost || null,
    totalPnl: totalCost ? totalValue - totalCost : null,
    totalPnlPct: totalCost ? ((totalValue - totalCost) / totalCost) * 100 : null,
    dayPnl,
    dayPnlPct: totalValue > 0 ? (dayPnl / (totalValue - dayPnl)) * 100 : null,
    pricedCount: withWeights.filter((h) => h.price !== null).length,
    unpriced: withWeights.filter((h) => h.price === null).map((h) => h.symbol)
  };
}

/** Herfindahl index — 1/n when perfectly spread, 1 when it is one position. */
export function concentration(weights) {
  const w = weights.filter((x) => Number.isFinite(x) && x > 0);
  if (!w.length) return { hhi: NaN, effectiveNames: NaN, top5: NaN };
  const hhi = w.reduce((a, x) => a + x * x, 0);
  const sorted = [...w].sort((a, b) => b - a);
  return {
    hhi,
    effectiveNames: 1 / hhi,
    top5: sorted.slice(0, 5).reduce((a, x) => a + x, 0)
  };
}

export function sectorAllocation(holdings, universe) {
  const bySector = new Map();
  for (const h of holdings) {
    if (h.value === null) continue;
    const company = universe.find((c) => c.symbol.toUpperCase() === h.symbol.toUpperCase());
    const sector = company?.sector ?? 'Unclassified';
    bySector.set(sector, (bySector.get(sector) ?? 0) + h.value);
  }
  const total = [...bySector.values()].reduce((a, b) => a + b, 0);
  return [...bySector.entries()]
    .map(([sector, value]) => ({ sector, value, weight: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------- risk model --- */

/**
 * Align each holding's return series on the dates they share, so the covariance
 * matrix is built from genuinely simultaneous observations. A name with too
 * little overlapping history is reported in `dropped` rather than padded.
 */
export function alignReturns(barsBySymbol, symbols, minSessions = 60) {
  const dateSets = [];
  const usable = [];
  const dropped = [];

  for (const sym of symbols) {
    const bars = barsBySymbol.get(sym);
    if (!bars || bars.length < minSessions) {
      dropped.push({ symbol: sym, reason: `only ${bars?.length ?? 0} sessions of history` });
      continue;
    }
    usable.push(sym);
    dateSets.push(new Set(bars.map((b) => b.date)));
  }
  if (!usable.length) return { symbols: [], dates: [], returns: {}, dropped };

  let common = dateSets[0];
  for (const s of dateSets.slice(1)) common = new Set([...common].filter((d) => s.has(d)));
  const dates = [...common].sort();

  if (dates.length < minSessions) {
    return { symbols: [], dates, returns: {}, dropped: [...dropped, { symbol: '(all)', reason: `only ${dates.length} overlapping sessions` }] };
  }

  const returns = {};
  for (const sym of usable) {
    const byDate = new Map(barsBySymbol.get(sym).map((b) => [b.date, b.close]));
    const closes = dates.map((d) => byDate.get(d));
    returns[sym] = simpleReturns(closes);
  }
  return { symbols: usable, dates, returns, dropped };
}

export function covarianceMatrix(returns, symbols) {
  const n = symbols.length;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  const means = symbols.map((s) => mean(returns[s]));
  const len = Math.min(...symbols.map((s) => returns[s].length));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const a = returns[symbols[i]].slice(-len);
      const b = returns[symbols[j]].slice(-len);
      let cov = 0;
      for (let t = 0; t < len; t++) cov += (a[t] - means[i]) * (b[t] - means[j]);
      cov /= Math.max(1, len - 1);
      m[i][j] = cov;
      m[j][i] = cov;
    }
  }
  return m;
}

export function correlationFromCov(cov) {
  const n = cov.length;
  const sd = cov.map((row, i) => Math.sqrt(row[i]));
  return cov.map((row, i) => row.map((v, j) => (sd[i] && sd[j] ? v / (sd[i] * sd[j]) : NaN)));
}

/** Annualised portfolio volatility from weights and a daily covariance matrix. */
export function portfolioVol(weights, cov) {
  let variance = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) variance += weights[i] * weights[j] * cov[i][j];
  }
  return Math.sqrt(Math.max(0, variance) * TRADING_DAYS);
}

/** Weighted daily return series for a set of weights. */
export function portfolioReturnSeries(returns, symbols, weights) {
  const len = Math.min(...symbols.map((s) => returns[s].length));
  const out = [];
  for (let t = 0; t < len; t++) {
    let r = 0;
    symbols.forEach((s, i) => {
      r += weights[i] * returns[s][returns[s].length - len + t];
    });
    out.push(r);
  }
  return out;
}

/** Each position's share of total portfolio variance. */
export function riskContributions(weights, cov) {
  const n = weights.length;
  const marginal = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) marginal[i] += weights[j] * cov[i][j];
  }
  const variance = weights.reduce((a, w, i) => a + w * marginal[i], 0);
  return weights.map((w, i) => (variance > 0 ? (w * marginal[i]) / variance : NaN));
}

/**
 * Headline risk figures for a weighted portfolio.
 * `riskFree` is annual and decimal (0.04 = 4%).
 */
export function portfolioRiskStats({ returns, symbols, weights, cov, marketReturns = null, riskFree = 0.04 }) {
  const series = portfolioReturnSeries(returns, symbols, weights);
  const vol = portfolioVol(weights, cov);
  const ret = annualisedReturn(series);
  const equity = series.reduce((acc, r) => {
    acc.push((acc[acc.length - 1] ?? 1) * (1 + r));
    return acc;
  }, []);

  return {
    annReturn: ret,
    annVol: vol,
    sharpe: Number.isFinite(ret) && vol > 0 ? (ret - riskFree) / vol : NaN,
    maxDrawdown: maxDrawdown(equity),
    beta: marketReturns ? beta(series, marketReturns) : NaN,
    dailyVol: stdDev(series),
    observations: series.length
  };
}

/* --------------------------------------------------- tail and structure --- */

/**
 * Historical Value at Risk and Expected Shortfall from the realised return
 * distribution — no normality assumed, because equity returns are not normal
 * and a parametric VaR flatters the tail precisely where it matters.
 *
 * `confidence` 0.95 answers: on the worst 1 day in 20, how much is lost?
 * Expected shortfall answers the sharper question: on those days, how much on
 * average? Both are returned as fractions and as money.
 */
export function tailRisk(dailyReturns, portfolioValue, confidence = 0.95) {
  const sorted = dailyReturns.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length < 30) return null;

  const idx = Math.max(0, Math.floor((1 - confidence) * sorted.length) - 1);
  const varFrac = sorted[idx];
  const tail = sorted.slice(0, idx + 1);
  const esFrac = tail.reduce((a, b) => a + b, 0) / tail.length;

  return {
    confidence,
    varPct: varFrac,
    varMoney: varFrac * portfolioValue,
    esPct: esFrac,
    esMoney: esFrac * portfolioValue,
    observations: sorted.length,
    tailDays: tail.length
  };
}

/**
 * The diversification ratio: the weighted average of the parts' volatility
 * divided by the volatility of the whole.
 *
 * 1.0 means the names move as one and the book is a single bet wearing eight
 * names; higher means correlation is genuinely working for you. `independentBets`
 * squares it — the effective number of uncorrelated positions actually held,
 * which is usually a good deal smaller than the position count.
 */
export function diversificationRatio(weights, cov) {
  const vols = cov.map((row, i) => Math.sqrt(Math.max(0, row[i]) * TRADING_DAYS));
  const weightedAvgVol = weights.reduce((a, w, i) => a + w * vols[i], 0);
  const total = portfolioVol(weights, cov);
  if (!(total > 0) || !Number.isFinite(weightedAvgVol)) return null;
  const ratio = weightedAvgVol / total;
  return {
    ratio,
    weightedAvgVol,
    portfolioVol: total,
    independentBets: ratio * ratio,
    volSaved: weightedAvgVol - total
  };
}

/**
 * The most correlated pairs in the book. Two names at 0.85 are close to one
 * position held twice — which is the kind of thing a weights table hides and a
 * correlation matrix makes obvious.
 */
export function topCorrelatedPairs(correlation, symbols, limit = 5) {
  const pairs = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const rho = correlation[i][j];
      if (Number.isFinite(rho)) pairs.push({ a: symbols[i], b: symbols[j], rho });
    }
  }
  return pairs.sort((x, y) => y.rho - x.rho).slice(0, limit);
}

/** Each name's average correlation to the rest of the book. */
export function correlationToBook(correlation, symbols) {
  return symbols.map((sym, i) => {
    const others = correlation[i].filter((_, j) => j !== i).filter(Number.isFinite);
    return { symbol: sym, avgRho: others.length ? others.reduce((a, b) => a + b, 0) / others.length : NaN };
  });
}

/**
 * The best and worst single sessions the current weights would have produced,
 * with their dates. A number like "-4.1% on 2026-04-07" lands harder than an
 * annualised volatility, because it is a day that actually happened.
 */
export function extremeDays(dailyReturns, dates, portfolioValue) {
  if (!dailyReturns.length) return null;
  // `dates` covers closes; returns start one session later.
  const offset = Math.max(0, dates.length - dailyReturns.length);
  let worst = { r: Infinity, i: -1 };
  let best = { r: -Infinity, i: -1 };
  dailyReturns.forEach((r, i) => {
    if (!Number.isFinite(r)) return;
    if (r < worst.r) worst = { r, i };
    if (r > best.r) best = { r, i };
  });
  const at = (i) => dates[offset + i] ?? null;
  return {
    worst: { pct: worst.r, money: worst.r * portfolioValue, date: at(worst.i) },
    best: { pct: best.r, money: best.r * portfolioValue, date: at(best.i) }
  };
}

/** Share of sessions closing up — a plain read on consistency. */
export function hitRate(dailyReturns) {
  const valid = dailyReturns.filter(Number.isFinite);
  if (!valid.length) return NaN;
  return valid.filter((r) => r > 0).length / valid.length;
}
