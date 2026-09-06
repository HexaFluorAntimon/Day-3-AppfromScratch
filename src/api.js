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
 * FMP's legacy-endpoint refusal is a five-line paragraph. Keep the meaning and
 * the remedy, drop the prose, so the message fits the toast that shows it.
 */
function compactFmpMessage(message) {
  const text = String(message);
  if (/legacy endpoint/i.test(text)) {
    return 'this endpoint was retired by FMP for accounts created after 31 Aug 2025 — the app already retries on their current API, so this plan likely does not include it';
  }
  if (/exclusive endpoint|upgrade|premium/i.test(text)) {
    return `not included in this FMP plan (${text.slice(0, 90).trim()})`;
  }
  return text.length > 180 ? `${text.slice(0, 180).trim()}…` : text;
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

  // Several of these services report failure in-band, each in its own shape:
  //   Twelve Data  { status: 'error', message }
  //   newsdata.io  { status: 'error', results: { message } }
  //   NewsAPI      { status: 'error', code, message }   (with an HTTP status)
  // Pull the message from wherever it actually is and keep the code and status,
  // because the caller matches on them to explain what to do next. Losing them
  // here is how a refused key came to read as "no results".
  if (data && data.status === 'error') {
    const message = data.message ?? data.results?.message ?? data.error ?? 'request failed';
    const parts = [`${label}:`];
    if (!res.ok) parts.push(`(HTTP ${res.status})`);
    if (data.code) parts.push(`[${data.code}]`);
    parts.push(compactFmpMessage(message));
    throw new Error(parts.join(' '));
  }
  // FMP uses { "Error Message": ... }
  if (data && data['Error Message']) {
    throw new Error(`${label}: ${compactFmpMessage(data['Error Message'])}`);
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
  // Twelve Data bills a comma-separated quote request ONE CREDIT PER SYMBOL, not
  // one per request — so a 20-symbol batch costs 20 of the free tier's 8 credits
  // a minute and returns 429. Eight per request is the most the plan allows.
  const CHUNK = 8;

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

const FMP = 'https://financialmodelingprep.com';

/**
 * FMP retired the /api/v3 and /api/v4 paths in 2025: they now answer
 * "Legacy Endpoint" for any account created after 31 August 2025, while
 * long-standing subscriptions still work on them. So every call tries the
 * current /stable path first and falls back to the legacy one, which keeps the
 * app working on both kinds of account without guessing which you hold.
 */
async function fmpFetch(urlBuilders, fmpKey, label) {
  const k = encodeURIComponent(fmpKey);
  let firstError = null;
  for (const build of urlBuilders) {
    try {
      return await fetchJson(build(k), label);
    } catch (err) {
      if (!firstError) firstError = err;
    }
  }
  throw firstError ?? new Error(`${label}: no endpoint answered`);
}

/**
 * Read one number from whichever of several response shapes actually carries it.
 *
 * The stable API renamed a number of fields (mktCap -> marketCap, peRatioTTM ->
 * priceToEarningsRatioTTM, and so on) and the two generations are both in the
 * wild. Trying the known aliases in order means a rename costs a missing field
 * at worst — and a field that is genuinely absent stays null, so it renders as
 * "—" instead of being filled with something plausible.
 */
function pickNum(sources, names) {
  for (const src of sources) {
    if (!src) continue;
    for (const n of names) {
      const v = src[n];
      if (v === null || v === undefined || v === '') continue;
      const asNumber = Number(v);
      if (Number.isFinite(asNumber)) return asNumber;
    }
  }
  return null;
}

function pickStr(sources, names) {
  for (const src of sources) {
    if (!src) continue;
    for (const n of names) {
      const v = src[n];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

/** FMP returns either a bare object or a one-element array depending on route. */
const firstRow = (data) => (Array.isArray(data) ? data[0] ?? null : data ?? null);

/**
 * Fundamentals for one symbol: valuation multiples, growth, margins, yield,
 * beta. Every field may legitimately be null — the free tier does not cover
 * everything, and a null renders as "—" rather than a guess.
 */
export async function fetchFundamentals(symbol, fmpKey) {
  if (!fmpKey) return null;
  const key = `fund:${symbol}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const sym = encodeURIComponent(symbol);

  const [profileRes, metricsRes, ratiosRes, quoteRes] = await Promise.allSettled([
    fmpFetch([
      (k) => `${FMP}/stable/profile?symbol=${sym}&apikey=${k}`,
      (k) => `${FMP}/api/v3/profile/${sym}?apikey=${k}`
    ], fmpKey, `FMP profile ${symbol}`),
    fmpFetch([
      (k) => `${FMP}/stable/key-metrics-ttm?symbol=${sym}&apikey=${k}`,
      (k) => `${FMP}/api/v3/key-metrics-ttm/${sym}?apikey=${k}`
    ], fmpKey, `FMP metrics ${symbol}`),
    fmpFetch([
      (k) => `${FMP}/stable/ratios-ttm?symbol=${sym}&apikey=${k}`,
      (k) => `${FMP}/api/v3/ratios-ttm/${sym}?apikey=${k}`
    ], fmpKey, `FMP ratios ${symbol}`),
    // The quote carries market cap and P/E on plans where the profile does not.
    fmpFetch([
      (k) => `${FMP}/stable/quote?symbol=${sym}&apikey=${k}`,
      (k) => `${FMP}/api/v3/quote/${sym}?apikey=${k}`
    ], fmpKey, `FMP quote ${symbol}`)
  ]);

  const profile = profileRes.status === 'fulfilled' ? firstRow(profileRes.value) : null;
  const metrics = metricsRes.status === 'fulfilled' ? firstRow(metricsRes.value) : null;
  const ratios = ratiosRes.status === 'fulfilled' ? firstRow(ratiosRes.value) : null;
  const quote = quoteRes.status === 'fulfilled' ? firstRow(quoteRes.value) : null;

  // Nothing came back at all: report the first real error instead of an empty shell.
  if (!profile && !metrics && !ratios && !quote) {
    const failed = [profileRes, metricsRes, ratiosRes, quoteRes].find((r) => r.status === 'rejected');
    throw failed ? failed.reason : new Error(`FMP ${symbol}: no data returned`);
  }

  const all = [profile, quote, ratios, metrics];

  const fundamentals = {
    symbol: symbol.toUpperCase(),
    name: pickStr([profile, quote], ['companyName', 'name']),
    sector: pickStr([profile], ['sector']),
    industry: pickStr([profile], ['industry']),
    price: pickNum([profile, quote], ['price']),
    marketCap: pickNum([profile, quote], ['marketCap', 'mktCap', 'marketCapitalization']),
    beta: pickNum([profile], ['beta']),
    currency: pickStr([profile], ['currency']) ?? 'USD',
    peTtm: pickNum(all, ['priceToEarningsRatioTTM', 'peRatioTTM', 'pe', 'peRatio', 'priceEarningsRatioTTM']),
    pbTtm: pickNum(all, ['priceToBookRatioTTM', 'pbRatioTTM', 'priceToBookRatio']),
    psTtm: pickNum(all, ['priceToSalesRatioTTM', 'priceToSalesRatio']),
    epsTtm: pickNum(all, ['netIncomePerShareTTM', 'epsTTM', 'eps', 'earningsPerShareTTM']),
    dividendYield: pickNum(all, ['dividendYieldTTM', 'dividendYielTTM', 'dividendYieldPercentageTTM', 'dividendYield']),
    payoutRatio: pickNum(all, ['payoutRatioTTM', 'dividendPayoutRatioTTM']),
    grossMargin: pickNum(all, ['grossProfitMarginTTM']),
    netMargin: pickNum(all, ['netProfitMarginTTM', 'netIncomeMarginTTM']),
    roe: pickNum(all, ['returnOnEquityTTM']),
    debtToEquity: pickNum(all, ['debtToEquityRatioTTM', 'debtEquityRatioTTM']),
    currentRatio: pickNum(all, ['currentRatioTTM']),
    fcfPerShare: pickNum(all, ['freeCashFlowPerShareTTM']),
    revenuePerShare: pickNum(all, ['revenuePerShareTTM']),
    description: pickStr([profile], ['description'])
  };

  // A yield quoted as a percentage (2.4) rather than a fraction (0.024) would
  // otherwise read as 240%. Percentages are the giveaway: no real dividend
  // yield is above 100% as a fraction.
  if (fundamentals.dividendYield !== null && fundamentals.dividendYield > 1) {
    fundamentals.dividendYield /= 100;
  }

  cacheSet(key, fundamentals);
  return fundamentals;
}

/** Analyst consensus price target, or null when the plan does not include it. */
export async function fetchPriceTarget(symbol, fmpKey) {
  if (!fmpKey) return null;
  const key = `target:${symbol}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const sym = encodeURIComponent(symbol);
  try {
    const data = await fmpFetch([
      (k) => `${FMP}/stable/price-target-consensus?symbol=${sym}&apikey=${k}`,
      (k) => `${FMP}/api/v4/price-target-consensus?symbol=${sym}&apikey=${k}`
    ], fmpKey, `FMP target ${symbol}`);

    const row = firstRow(data);
    const result = row
      ? {
          consensus: pickNum([row], ['targetConsensus', 'consensus']),
          high: pickNum([row], ['targetHigh', 'high']),
          low: pickNum([row], ['targetLow', 'low']),
          median: pickNum([row], ['targetMedian', 'median'])
        }
      : null;
    cacheSet(key, result);
    return result;
  } catch {
    // Consensus targets sit behind a paid tier on most accounts. That is a
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

  // Weekends and holidays have no snapshot; step back until one answers.
  const dates = [0, 1, 2, 3, 4].map((back) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
  );

  for (const date of dates) {
    try {
      const data = await fmpFetch([
        (k) => `${FMP}/stable/sector-pe-snapshot?date=${date}&exchange=NASDAQ&apikey=${k}`,
        (k) => `${FMP}/stable/sector-pe-snapshot?date=${date}&apikey=${k}`,
        (k) => `${FMP}/api/v4/sector_price_earning_ratio?date=${date}&exchange=NYSE&apikey=${k}`
      ], fmpKey, 'FMP sector P/E');

      const map = new Map();
      for (const row of Array.isArray(data) ? data : []) {
        const pe = pickNum([row], ['pe', 'peRatio', 'priceEarningsRatio']);
        const sector = pickStr([row], ['sector']);
        if (sector && pe !== null && pe > 0) map.set(sector, pe);
      }
      if (map.size) {
        cacheSet(key, map);
        return map;
      }
    } catch {
      // try the previous day
    }
  }

  cacheSet(key, null);
  return null;
}

/* ------------------------------------------------------------------- news --- */

/**
 * Which news service a key belongs to, decided by the key itself.
 *
 * newsdata.io keys are prefixed "pub_"; NewsAPI.org keys are 32 hex characters.
 * Detecting rather than asking means you paste whichever key you have and it
 * works — and it matters which one, because NewsAPI.org's free Developer plan
 * REFUSES browser requests from a deployed origin (localhost only, HTTP 426).
 * On GitHub Pages that plan cannot work at all, whereas newsdata.io's free tier
 * allows browser calls.
 */
export function newsProvider(key) {
  const k = String(key ?? '').trim();
  if (!k) return null;
  if (/^pub_/i.test(k)) return 'newsdata';
  return 'newsapi';
}

/**
 * Headlines for a query (a ticker, a company name, or a sector theme).
 *
 * Returns [] only when there is no key or no query. A service that answers with
 * an error THROWS, so the caller can say what went wrong — silently returning an
 * empty list made a refused request look like a quiet news week.
 */
export async function fetchHeadlines(query, newsKey, { pageSize = 12, days = 7 } = {}) {
  if (!newsKey || !query) return [];

  const provider = newsProvider(newsKey);
  const key = `news:${provider}:${query}:${pageSize}:${days}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const articles = provider === 'newsdata'
    ? await fetchNewsdata(query, newsKey, pageSize)
    : await fetchNewsapi(query, newsKey, pageSize, days);

  cacheSet(key, articles);
  return articles;
}

/**
 * newsdata.io. Its free tier serves browser requests, which is what makes it
 * usable from a static page on GitHub Pages.
 *
 * The query grammar is stricter than NewsAPI's: `q` is capped at 100 characters
 * and rejects unbalanced quotes, so the caller's phrase is trimmed to fit rather
 * than being sent and refused.
 */
async function fetchNewsdata(query, apiKey, pageSize) {
  const q = String(query).slice(0, 95).replace(/["']/g, '').trim();
  const url =
    `https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(apiKey)}` +
    `&q=${encodeURIComponent(q)}&language=en`;

  const raw = await fetchJson(url, 'newsdata.io');

  // newsdata.io reports failure in-band: { status: "error", results: { message } }
  if (raw?.status === 'error') {
    const message = raw.results?.message ?? raw.message ?? 'request failed';
    throw new Error(`newsdata.io: ${message}`);
  }

  return (raw?.results ?? []).slice(0, pageSize).map((a) => ({
    title: a.title ?? '',
    source: a.source_name || a.source_id || 'Unknown',
    url: a.link ?? null,
    publishedAt: a.pubDate ?? null,
    description: a.description ?? ''
  }));
}

/** NewsAPI.org. Works on localhost; its free plan refuses deployed origins. */
async function fetchNewsapi(query, apiKey, pageSize, days) {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const url =
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}` +
    `&from=${from}&language=en&sortBy=publishedAt&pageSize=${pageSize}` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  let raw;
  try {
    raw = await fetchJson(url, 'NewsAPI');
  } catch (err) {
    // 426 is NewsAPI's "this plan may not be used from a browser on a deployed
    // site". Name the actual remedy instead of leaving a status code.
    if (/\b426\b|upgrade required|corsNotAllowed|not allowed on the Developer plan|browser/i.test(err.message)) {
      throw new Error(
        'NewsAPI: the free Developer plan only serves requests from localhost, so it cannot work on a deployed page. Use a newsdata.io key (starts with "pub_") instead.'
      );
    }
    throw err;
  }

  return (raw?.articles ?? []).map((a) => ({
    title: a.title ?? '',
    source: a.source?.name ?? 'Unknown',
    url: a.url ?? null,
    publishedAt: a.publishedAt ?? null,
    description: a.description ?? ''
  }));
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
