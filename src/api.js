// Data layer: Twelve Data (prices), Financial Modeling Prep (fundamentals),
// NewsAPI (headlines), OpenRouter (narration, in llm.js).
//
// Rules this module holds to:
//   1. No key, no data — never a placeholder that looks like a real quote.
//      Callers get null / [] and the UI renders "—" plus a "needs key" state.
//   2. Failures are specific. The service's own message is surfaced verbatim
//      with its HTTP status, so "wrong key" never looks like "no data".
//   3. Free tiers are small. Requests are batched where the API allows it and
//      cached per session, because Twelve Data's free plan allows 8 calls/min.

const cache = new Map();
const CACHE_TTL_MS = 60_000;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, at: Date.now() });
}

export function clearCache() {
  cache.clear();
}

/** Hint text for the HTTP statuses these APIs actually return. */
function statusHint(status) {
  return {
    401: 'the key looks invalid or missing',
    402: 'the plan does not cover this endpoint, or credits are exhausted',
    403: 'this endpoint is not on your plan',
    404: 'no such symbol or endpoint',
    429: 'rate limited — free tiers are small, wait a moment and retry'
  }[status];
}

/**
 * JSON fetch that fails loudly and legibly.
 * Reads the body as text first so a non-JSON error page yields a readable
 * message instead of "Unexpected token < in JSON".
 */
export async function fetchJson(url, label) {
  const res = await fetch(url);
  const body = await res.text();

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`${label}: (HTTP ${res.status}) ${body.slice(0, 180).trim() || 'non-JSON response'}`);
  }

  // Twelve Data reports errors in-band with HTTP 200.
  if (data && data.status === 'error') {
    throw new Error(`${label}: ${data.message || 'request failed'}`);
  }
  // FMP uses { "Error Message": ... }
  if (data && data['Error Message']) {
    throw new Error(`${label}: ${data['Error Message']}`);
  }
  // NewsAPI uses { status: 'error', message }
  if (data && data.status === 'error' && data.message) {
    throw new Error(`${label}: ${data.message}`);
  }
  if (!res.ok) {
    const hint = statusHint(res.status);
    throw new Error(`${label}: (HTTP ${res.status})${hint ? ' ' + hint : ''}`);
  }
  return data;
}

/* ------------------------------------------------------------ Twelve Data --- */

/**
 * Daily bars, oldest first, as { date, open, high, low, close, volume }.
 * `outputsize` caps at 5000 on the free plan; 400 sessions is ~19 months,
 * enough for a 200-day moving average plus a year of realised volatility.
 */
export async function fetchDailyBars(symbol, twelveKey, outputsize = 400) {
  if (!twelveKey) return null;
  const key = `bars:${symbol}:${outputsize}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1day&outputsize=${outputsize}&apikey=${encodeURIComponent(twelveKey)}`;
  const raw = await fetchJson(url, `Twelve Data ${symbol}`);

  const values = raw?.values ?? [];
  if (!values.length) throw new Error(`Twelve Data ${symbol}: no bars returned`);

  const bars = values
    .map((b) => ({
      date: b.datetime,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume)
    }))
    .filter((b) => Number.isFinite(b.close))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  cacheSet(key, bars);
  return bars;
}

/**
 * Latest quote for many symbols in ONE request — Twelve Data accepts a
 * comma-separated symbol list, which is what keeps a 40-position portfolio
 * inside the 8-calls-per-minute free tier.
 * Returns a Map<symbol, {price, changePct, previousClose}>; symbols the API
 * did not answer for are simply absent, never invented.
 */
export async function fetchQuotes(symbols, twelveKey) {
  const out = new Map();
  if (!twelveKey || !symbols.length) return out;

  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const CHUNK = 20;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const url =
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(chunk.join(','))}` +
      `&apikey=${encodeURIComponent(twelveKey)}`;
    const raw = await fetchJson(url, 'Twelve Data quotes');

    // One symbol returns the object directly; several return a map keyed by symbol.
    const entries = chunk.length === 1 ? { [chunk[0]]: raw } : raw;
    for (const [sym, q] of Object.entries(entries || {})) {
      if (!q || q.status === 'error') continue;
      const price = Number(q.close ?? q.price);
      if (!Number.isFinite(price)) continue;
      out.set(sym.toUpperCase(), {
        price,
        previousClose: Number(q.previous_close),
        changePct: Number(q.percent_change),
        currency: q.currency || 'USD',
        exchange: q.exchange || null,
        name: q.name || null
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------- FMP --- */

/**
 * Fundamentals for one symbol: valuation multiples, growth, margins, yield,
 * beta. Every field may legitimately be null — FMP's free tier does not cover
 * everything, and a null renders as "—" rather than a guess.
 */
export async function fetchFundamentals(symbol, fmpKey) {
  if (!fmpKey) return null;
  const key = `fund:${symbol}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const k = encodeURIComponent(fmpKey);
  const sym = encodeURIComponent(symbol);

  const [profileRes, metricsRes, ratiosRes] = await Promise.allSettled([
    fetchJson(`https://financialmodelingprep.com/api/v3/profile/${sym}?apikey=${k}`, `FMP profile ${symbol}`),
    fetchJson(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${sym}?apikey=${k}`, `FMP metrics ${symbol}`),
    fetchJson(`https://financialmodelingprep.com/api/v3/ratios-ttm/${sym}?apikey=${k}`, `FMP ratios ${symbol}`)
  ]);

  const profile = profileRes.status === 'fulfilled' ? profileRes.value?.[0] ?? null : null;
  const metrics = metricsRes.status === 'fulfilled' ? metricsRes.value?.[0] ?? null : null;
  const ratios = ratiosRes.status === 'fulfilled' ? ratiosRes.value?.[0] ?? null : null;

  // Nothing came back at all: report the first real error instead of an empty shell.
  if (!profile && !metrics && !ratios) {
    const firstError = [profileRes, metricsRes, ratiosRes].find((r) => r.status === 'rejected');
    throw firstError ? firstError.reason : new Error(`FMP ${symbol}: no data returned`);
  }

  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

  const fundamentals = {
    symbol: symbol.toUpperCase(),
    name: profile?.companyName ?? null,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    price: num(profile?.price),
    marketCap: num(profile?.mktCap),
    beta: num(profile?.beta),
    currency: profile?.currency ?? 'USD',
    peTtm: num(ratios?.peRatioTTM ?? metrics?.peRatioTTM),
    pbTtm: num(ratios?.priceToBookRatioTTM),
    psTtm: num(ratios?.priceToSalesRatioTTM),
    epsTtm: num(metrics?.netIncomePerShareTTM),
    dividendYield: num(ratios?.dividendYielTTM ?? ratios?.dividendYieldTTM ?? metrics?.dividendYieldTTM),
    payoutRatio: num(ratios?.payoutRatioTTM),
    grossMargin: num(ratios?.grossProfitMarginTTM),
    netMargin: num(ratios?.netProfitMarginTTM),
    roe: num(ratios?.returnOnEquityTTM),
    debtToEquity: num(ratios?.debtEquityRatioTTM),
    currentRatio: num(ratios?.currentRatioTTM),
    fcfPerShare: num(metrics?.freeCashFlowPerShareTTM),
    revenuePerShare: num(metrics?.revenuePerShareTTM),
    description: profile?.description ?? null
  };

  cacheSet(key, fundamentals);
  return fundamentals;
}

/** Analyst consensus price target, or null when the plan does not include it. */
export async function fetchPriceTarget(symbol, fmpKey) {
  if (!fmpKey) return null;
  const key = `target:${symbol}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  try {
    const data = await fetchJson(
      `https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(fmpKey)}`,
      `FMP target ${symbol}`
    );
    const row = Array.isArray(data) ? data[0] : data;
    const pick = (v) => (Number.isFinite(Number(v)) && v ? Number(v) : null);
    const result = row
      ? { consensus: pick(row.targetConsensus), high: pick(row.targetHigh), low: pick(row.targetLow), median: pick(row.targetMedian) }
      : null;
    cacheSet(key, result);
    return result;
  } catch {
    // Consensus targets sit behind a paid tier on some accounts. That is a
    // missing input, not a broken app: the valuation anchor is skipped and the
    // entry ceiling is built from the anchors that ARE available.
    cacheSet(key, null);
    return null;
  }
}

/** Sector-level TTM P/E medians, used as the "justified multiple" anchor. */
export async function fetchSectorPe(fmpKey) {
  if (!fmpKey) return null;
  const key = 'sectorPe';
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const data = await fetchJson(
      `https://financialmodelingprep.com/api/v4/sector_price_earning_ratio?date=${today}&exchange=NYSE&apikey=${encodeURIComponent(fmpKey)}`,
      'FMP sector P/E'
    );
    const map = new Map();
    for (const row of Array.isArray(data) ? data : []) {
      const pe = Number(row.pe);
      if (row.sector && Number.isFinite(pe)) map.set(row.sector, pe);
    }
    const result = map.size ? map : null;
    cacheSet(key, result);
    return result;
  } catch {
    cacheSet(key, null);
    return null;
  }
}

/* ---------------------------------------------------------------- NewsAPI --- */

/**
 * Headlines for a query (a ticker, a company name, or a sector theme).
 * Returns [] when there is no key — the UI then says "add a NewsAPI key for
 * live headlines" instead of showing a curated feed dressed up as live news.
 */
export async function fetchHeadlines(query, newsKey, { pageSize = 12, days = 7 } = {}) {
  if (!newsKey || !query) return [];
  const key = `news:${query}:${pageSize}:${days}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const url =
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}` +
    `&from=${from}&language=en&sortBy=publishedAt&pageSize=${pageSize}` +
    `&apiKey=${encodeURIComponent(newsKey)}`;

  const raw = await fetchJson(url, 'NewsAPI');
  const articles = (raw?.articles ?? []).map((a) => ({
    title: a.title ?? '',
    source: a.source?.name ?? 'Unknown',
    url: a.url ?? null,
    publishedAt: a.publishedAt ?? null,
    description: a.description ?? ''
  }));
  cacheSet(key, articles);
  return articles;
}

/** True when a URL is safe to render as a link. */
export function safeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
