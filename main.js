// Aura III — app shell: state, routing between the two tabs, and rendering.
//
// Division of labour: src/* computes, main.js displays. No number is derived
// here that is not derived in a module, and nothing is displayed that was not
// computed from real input — a missing input renders as "—".

import { SECTORS, SECTOR_PROXY, MARKET_PROXY, seedUniverse, loadFullUniverse, searchUniverse, findCompany } from './src/universe.js';
import {
  fetchJson, fetchDailyBars, fetchQuotes, fetchFundamentals, fetchPriceTarget,
  fetchSectorPe, fetchHeadlines, safeUrl, clearCache
} from './src/api.js';
import { priceMetrics, entryCeiling, positionSizing, entryLadder, simpleReturns } from './src/analysis.js';
import {
  parseCsv, guessMapping, buildHoldings, valueHoldings, concentration,
  sectorAllocation, alignReturns, covarianceMatrix, correlationFromCov,
  portfolioRiskStats, riskContributions, portfolioVol, portfolioReturnSeries,
  tailRisk, diversificationRatio, topCorrelatedPairs, correlationToBook,
  extremeDays, hitRate
} from './src/portfolio.js';
import { HANDLES, tradesFor, meanDailyReturns, annualisedFor, volFor, minVariance, maxSharpe } from './src/optimize.js';
import {
  THESIS, PARAMS, GATES, CORE_UNIVERSE, CANDIDATE_POOL, HEADLINE_METHOD,
  screenPool, selectBook, sizeBook, allocate, signalSummary
} from './src/thesis.js';
import { buildStockPrompt, buildPortfolioPrompt, buildThemePrompt, buildThesisPrompt, generate, markdownToHtml } from './src/llm.js';
import { fetchSectorHeadlines, fetchSectorMoves, coverageRanking } from './src/themes.js';
import {
  DEMO_SYMBOLS, DEMO_PORTFOLIO, isDemoSymbol, demoBars, demoQuotes,
  demoFundamentals, demoPriceTarget, demoSectorPe, demoHeadlines, demoSectorHeadlines,
  demoSectorMoves
} from './src/demo.js';

/* ------------------------------------------------------------------ state --- */

const KEY_STORE = 'aura3.keys';

const DEMO_STORE = 'aura3.demo';

const state = {
  keys: { twelve: '', fmp: '', news: '', openRouter: '' },
  demo: false,
  universe: seedUniverse(),
  sectorFilter: 'All',
  query: '',
  sort: { field: 'symbol', dir: 1 },
  metrics: new Map(),      // symbol -> priceMetrics
  fundamentals: new Map(), // symbol -> fundamentals
  bars: new Map(),         // symbol -> bars
  marketReturns: null,
  sectorPe: null,
  selected: null,
  assumptions: {
    portfolioValue: 100_000,
    riskPerTradePct: 1,
    marginOfSafety: 15,
    minRewardRisk: 2,
    atrStopMultiple: 2,
    maxWeightPct: 20
  },
  // portfolio tab
  rawRows: null,
  mapping: null,
  holdings: [],
  valued: null,
  risk: null,
  activeHandle: null,
  // thesis tab
  thesis: null,
  thesisMethod: HEADLINE_METHOD,
  thesisRan: false
};

const el = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ----------------------------------------------------------- formatting --- */

const DASH = '—';
const money = (v, d = 2) => (Number.isFinite(v) ? `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}` : DASH);
const money0 = (v) => (Number.isFinite(v) ? `$${Math.round(v).toLocaleString('en-US')}` : DASH);
const pct = (v, d = 1) => (Number.isFinite(v) ? `${v >= 0 ? '' : ''}${(v * 100).toFixed(d)}%` : DASH);
const pctRaw = (v, d = 1) => (Number.isFinite(v) ? `${v.toFixed(d)}%` : DASH);
const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : DASH);
const signClass = (v) => (!Number.isFinite(v) ? 'is-flat' : v > 0.0001 ? 'is-up' : v < -0.0001 ? 'is-down' : 'is-flat');
const compactCap = (v) => {
  if (!Number.isFinite(v)) return DASH;
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M']];
  for (const [size, suffix] of units) if (v >= size) return `$${(v / size).toFixed(2)}${suffix}`;
  return money0(v);
};

function toast(message, tone = 'mint') {
  const box = document.createElement('div');
  box.className = `callout callout--${tone}`;
  box.style.cssText = 'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);z-index:80;max-width:min(90vw,520px);box-shadow:var(--shadow-lift)';
  box.textContent = message;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 6500);
}

/* ------------------------------------------------------------------ keys --- */

function loadKeys() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_STORE) || '{}');
    state.keys = { twelve: '', fmp: '', news: '', openRouter: '', ...saved };
  } catch {
    /* storage unavailable or corrupt — run keyless */
  }
  el('k-twelve').value = state.keys.twelve;
  el('k-fmp').value = state.keys.fmp;
  el('k-news').value = state.keys.news;
  el('k-openrouter').value = state.keys.openRouter;
  renderKeyStatus();
}

function saveKeys() {
  state.keys = {
    twelve: el('k-twelve').value.trim(),
    fmp: el('k-fmp').value.trim(),
    news: el('k-news').value.trim(),
    openRouter: el('k-openrouter').value.trim()
  };
  try {
    localStorage.setItem(KEY_STORE, JSON.stringify(state.keys));
  } catch {
    toast('Could not save keys to this browser — they will work for this session only.', 'accent');
  }
  const covered = ['twelve', 'fmp', 'news'].every((k) => state.keys[k]);
  if (state.demo && covered) {
    // Nothing synthetic would be left to show, so leave demo mode rather than
    // keeping a banner about an archive that is no longer being read.
    state.demo = false;
    try { localStorage.setItem(DEMO_STORE, '0'); } catch { /* ignore */ }
    toast('All three data keys saved — the archive is off and everything is live.');
  } else if (state.demo && keyCount() > 0) {
    toast('Saved. Those services are live now; the archive still covers the rest.');
  }

  clearCache();
  renderKeyStatus();
  renderDemoBanner();
  closeModal();
  bootstrapData();
}

function keyCount() {
  return Object.values(state.keys).filter(Boolean).length;
}

function renderKeyStatus() {
  const n = keyCount();
  const dot = el('key-dot');
  dot.className = `dot ${n === 4 ? 'dot--ok' : n > 0 ? 'dot--warn' : 'dot--off'}`;
  el('key-label').textContent = n === 0 ? 'Keys' : `${n}/4`;

  const priceSource = state.keys.twelve ? 'live' : state.demo ? 'demo archive' : 'no key';
  el('data-badge').textContent = `Prices: ${priceSource}`;
  el('data-badge').className = `tag ${state.keys.twelve ? 'tag--up' : state.demo ? 'tag--accent' : 'tag--neutral'}`;

  // The invitation is pointless once the archive is already running.
  const cta = el('demo-cta');
  if (cta) cta.hidden = state.demo;
}

function openModal() {
  el('keys-overlay').hidden = false;
  document.body.classList.add('is-locked');
}
function closeModal() {
  el('keys-overlay').hidden = true;
  document.body.classList.remove('is-locked');
}

/* ------------------------------------------------------------------ tabs --- */

const VIEWS = ['screener', 'portfolio', 'thesis'];

function viewFromHash() {
  const name = String(location.hash || '').replace('#', '');
  return VIEWS.includes(name) ? name : 'screener';
}

function setView(view) {
  const active = VIEWS.includes(view) ? view : 'screener';
  for (const name of VIEWS) {
    el(`view-${name}`).hidden = name !== active;
    el(`tab-${name}`).setAttribute('aria-selected', String(name === active));
  }
  const hash = `#${active}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);

  // Opening the thesis tab is the request to run it — a committee dashboard that
  // waits to be told to fetch is a dashboard nobody reads. It runs once; the
  // button re-runs it.
  if (active === 'thesis' && !state.thesisRan) runThesis();
}

/* ------------------------------------------------------------ data routing --- */

/**
 * One place decides where each figure comes from.
 *
 * The rule is per service and always the same: a key means live, no key in demo
 * mode means the bundled archive, and no key outside demo mode means nothing at
 * all. Live therefore always wins — entering a Twelve Data key switches prices
 * to real while the archive still supplies fundamentals, and every panel reports
 * which of the two it is showing. Nothing here ever silently fills a live gap
 * with demo data.
 */
const useDemo = (service) => state.demo && !state.keys[service];

async function getBars(symbol, outputsize = 400) {
  if (state.keys.twelve) return fetchDailyBars(symbol, state.keys.twelve, outputsize);
  if (useDemo('twelve') && isDemoSymbol(symbol)) return demoBars(symbol);
  return null;
}

async function getQuotes(symbols) {
  if (state.keys.twelve) return fetchQuotes(symbols, state.keys.twelve);
  if (useDemo('twelve')) return demoQuotes(symbols);
  return new Map();
}

async function getFundamentals(symbol) {
  if (state.keys.fmp) return fetchFundamentals(symbol, state.keys.fmp);
  if (useDemo('fmp') && isDemoSymbol(symbol)) return demoFundamentals(symbol, state.universe.companies);
  return null;
}

async function getPriceTarget(symbol) {
  if (state.keys.fmp) return fetchPriceTarget(symbol, state.keys.fmp);
  if (useDemo('fmp') && isDemoSymbol(symbol)) return demoPriceTarget(symbol);
  return null;
}

async function getSectorPeMap() {
  if (state.keys.fmp) return fetchSectorPe(state.keys.fmp);
  if (useDemo('fmp')) return demoSectorPe();
  return null;
}

async function getHeadlines(query, options = {}) {
  if (state.keys.news) return fetchHeadlines(query, state.keys.news, options);
  if (useDemo('news')) return demoHeadlines(query, options);
  return [];
}

/** Which services are running on the archive right now. */
function demoServices() {
  if (!state.demo) return [];
  return [
    !state.keys.twelve && 'prices',
    !state.keys.fmp && 'fundamentals',
    !state.keys.news && 'headlines'
  ].filter(Boolean);
}

function setDemo(on) {
  state.demo = on;
  try {
    localStorage.setItem(DEMO_STORE, on ? '1' : '0');
  } catch { /* private mode: the choice lasts for this tab only */ }

  clearCache();
  state.metrics.clear();
  state.fundamentals.clear();
  state.bars.clear();
  state.marketReturns = null;
  state.sectorPe = null;
  state.selected = null;

  renderDemoBanner();
  renderKeyStatus();
  if (on) primeDemoMetrics();
  renderScreener();
  bootstrapData();
}

/**
 * Fill the screener from the archive straight away.
 *
 * Against a live API this has to be a deliberate, batched action — eight names
 * a minute. The archive is generated locally at no cost, so making someone click
 * a button to see a table of dashes fill in would be ceremony for its own sake.
 */
function primeDemoMetrics() {
  const market = demoBars(MARKET_PROXY);
  if (market) {
    state.bars.set(MARKET_PROXY, market);
    state.marketReturns = simpleReturns(market.map((b) => b.close));
  }
  for (const symbol of DEMO_SYMBOLS) {
    if (symbol === MARKET_PROXY) continue;
    const bars = demoBars(symbol);
    if (!bars) continue;
    state.bars.set(symbol, bars);
    state.metrics.set(symbol, priceMetrics(bars, state.marketReturns));
    const f = demoFundamentals(symbol, state.universe.companies);
    if (f) state.fundamentals.set(symbol, f);
  }
  state.sectorPe = demoSectorPe();
}

/** The banner that makes demo mode impossible to miss. */
function renderDemoBanner() {
  const services = demoServices();
  const bar = el('demo-bar');
  const pill = el('demo-pill');

  // The banner explains; the pill persists. The banner scrolls away with the
  // page, so on its own it would let a synthetic number be read as a real one
  // further down — the pill lives in the sticky masthead and never leaves.
  if (pill) pill.hidden = !services.length;
  if (!services.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const live = ['twelve', 'fmp', 'news'].filter((k) => state.keys[k]).length;
  bar.innerHTML = `
    <div class="demo-bar__inner">
      <span class="demo-bar__tag">Demo data</span>
      <span>
        Showing a <strong>synthetic archive</strong> for ${esc(services.join(', '))} — generated
        numbers, not market data.${live ? ' Your keys are live for the rest.' : ''}
        Each service switches to live the moment its key is saved, or turn the
        archive off here.
      </span>
      <button class="btn btn--sm" id="btn-demo-off">Turn off</button>
    </div>`;
  el('btn-demo-off').addEventListener('click', () => setDemo(false));
}

/* ------------------------------------------------------------------- tape --- */

async function renderTape() {
  const track = el('tape-track');
  const symbols = [MARKET_PROXY, 'XLE', 'XLK', 'XLF', 'XLV', 'XLI'];

  if (!state.keys.twelve && !state.demo) {
    // A single item must not scroll: the marquee translates by -50%, which is
    // only seamless when the track is the same content twice.
    track.classList.add('tape__track--static');
    track.innerHTML = `<span class="tape__item">Add a Twelve Data key for live prices &middot; every figure in this app is computed from data you supply, never sampled or simulated</span>`;
    return;
  }
  track.classList.remove('tape__track--static');
  try {
    const quotes = await getQuotes(symbols);
    if (!quotes.size) {
      track.innerHTML = `<span class="tape__item">No quotes returned</span>`;
      return;
    }
    const items = [...quotes.entries()].map(([sym, q]) => {
      const cls = signClass(q.changePct / 100);
      return `<span class="tape__item"><b>${esc(sym)}</b> ${num(q.price)} <span class="${cls}">${Number.isFinite(q.changePct) ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : DASH}</span></span>`;
    });
    // Duplicated so the marquee wraps seamlessly at -50%.
    track.innerHTML = items.concat(items).join('');
  } catch (err) {
    track.innerHTML = `<span class="tape__item">Quotes unavailable: ${esc(err.message)}</span>`;
  }
}

/* -------------------------------------------------------------- screener --- */

function renderSectorChips() {
  const wrap = el('sector-chips');
  const sectors = ['All', ...SECTORS];
  wrap.innerHTML = sectors
    .map(
      (s) =>
        `<button class="chip" data-sector="${esc(s)}" aria-pressed="${s === state.sectorFilter}">${esc(s === 'All' ? 'All sectors' : s)}</button>`
    )
    .join('');
  wrap.querySelectorAll('[data-sector]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.sectorFilter = btn.dataset.sector;
      renderSectorChips();
      renderScreener();
    })
  );
}

function filteredCompanies() {
  let rows = searchUniverse(state.universe.companies, state.query);
  if (state.sectorFilter !== 'All') rows = rows.filter((c) => c.sector === state.sectorFilter);

  const maxPe = Number(el('f-pe-max').value);
  const minYield = Number(el('f-yield-min').value);
  const maxVol = Number(el('f-vol-max').value);
  const minMom = Number(el('f-mom-min').value);

  // A metric filter only excludes names whose value is KNOWN to miss the bar.
  // Rows with no data loaded are kept and shown as "—", so a filter never
  // silently hides the index behind missing data.
  rows = rows.filter((c) => {
    const f = state.fundamentals.get(c.symbol);
    const m = state.metrics.get(c.symbol);
    if (Number.isFinite(maxPe) && el('f-pe-max').value !== '' && f && Number.isFinite(f.peTtm) && f.peTtm > maxPe) return false;
    if (Number.isFinite(minYield) && el('f-yield-min').value !== '' && f && Number.isFinite(f.dividendYield) && f.dividendYield * 100 < minYield) return false;
    if (Number.isFinite(maxVol) && el('f-vol-max').value !== '' && m && Number.isFinite(m.vol) && m.vol * 100 > maxVol) return false;
    if (Number.isFinite(minMom) && el('f-mom-min').value !== '' && m && Number.isFinite(m.ret3m) && m.ret3m * 100 < minMom) return false;
    return true;
  });

  const { field, dir } = state.sort;
  const valueOf = (c) => {
    if (field === 'symbol') return c.symbol;
    const m = state.metrics.get(c.symbol);
    const f = state.fundamentals.get(c.symbol);
    if (field === 'price') return m?.last ?? null;
    if (field === 'ret3m') return m?.ret3m ?? null;
    if (field === 'vol') return m?.vol ?? null;
    if (field === 'peTtm') return f?.peTtm ?? null;
    if (field === 'dividendYield') return f?.dividendYield ?? null;
    return null;
  };

  // In demo mode the archive covers a subset of the universe: float those names
  // to the top so what the app can actually show is what you see first.
  const demoFirst = state.demo && !state.keys.twelve && state.sort.field === 'symbol';

  return [...rows].sort((a, b) => {
    if (demoFirst) {
      const da = isDemoSymbol(a.symbol) ? 0 : 1;
      const db = isDemoSymbol(b.symbol) ? 0 : 1;
      if (da !== db) return da - db;
    }
    const va = valueOf(a);
    const vb = valueOf(b);
    if (typeof va === 'string') return va.localeCompare(vb) * dir;
    // Rows without a value always sort last, whichever direction is active.
    if (va === null && vb === null) return a.symbol.localeCompare(b.symbol);
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va - vb) * dir;
  });
}

const PAGE_SIZE = 60;

function renderScreener() {
  const rows = filteredCompanies();
  const page = rows.slice(0, PAGE_SIZE);

  el('screener-count').textContent =
    `${rows.length} name${rows.length === 1 ? '' : 's'}${rows.length > PAGE_SIZE ? ` · showing ${PAGE_SIZE}` : ''}`;

  el('screener-body').innerHTML = page
    .map((c) => {
      const m = state.metrics.get(c.symbol);
      const f = state.fundamentals.get(c.symbol);
      const selected = state.selected === c.symbol ? ' class="is-selected"' : '';
      return `<tr${selected} data-symbol="${esc(c.symbol)}" style="cursor:pointer">
        <td><span class="sym">${esc(c.symbol)}</span><span class="co-name">${esc(c.name)}</span></td>
        <td class="num">${money(m?.last)}</td>
        <td class="num ${signClass(m?.ret3m)}">${pct(m?.ret3m)}</td>
        <td class="num">${pct(m?.vol, 0)}</td>
        <td class="num">${num(f?.peTtm, 1)}</td>
        <td class="num">${pct(f?.dividendYield, 2)}</td>
      </tr>`;
    })
    .join('');

  el('screener-body').querySelectorAll('[data-symbol]').forEach((tr) =>
    tr.addEventListener('click', () => selectCompany(tr.dataset.symbol))
  );

  document.querySelectorAll('#screener-table th.sortable').forEach((th) => {
    const active = th.dataset.sort === state.sort.field;
    th.innerHTML = th.textContent.replace(/[ ↑↓]+$/, '') + (active ? ` <span class="sort-arrow">${state.sort.dir === 1 ? '↑' : '↓'}</span>` : '');
  });
}

/** Load metrics for the visible page, respecting the free-tier request budget. */
async function loadVisibleMetrics() {
  if (!state.keys.twelve && !state.demo) {
    toast('Add a Twelve Data key, or switch on demo data, to load prices and metrics.', 'accent');
    return;
  }
  const btn = el('btn-load-metrics');
  // Eight is the free tier's per-minute ceiling; the archive has no such limit.
  const rows = filteredCompanies().slice(0, state.keys.twelve ? 8 : 24);
  btn.disabled = true;
  btn.textContent = `Loading 0/${rows.length}`;

  let done = 0;
  for (const c of rows) {
    try {
      if (!state.bars.has(c.symbol)) {
        const bars = await getBars(c.symbol, 300);
        if (bars) state.bars.set(c.symbol, bars);
      }
      const bars = state.bars.get(c.symbol);
      if (bars) state.metrics.set(c.symbol, priceMetrics(bars, state.marketReturns));
      if (!state.fundamentals.has(c.symbol)) {
        const f = await getFundamentals(c.symbol);
        if (f) state.fundamentals.set(c.symbol, f);
      }
    } catch (err) {
      console.warn(`[metrics] ${c.symbol}: ${err.message}`);
      toast(`${c.symbol}: ${err.message}`, 'clay');
      break;
    }
    done++;
    btn.textContent = `Loading ${done}/${rows.length}`;
    renderScreener();
  }

  btn.disabled = false;
  btn.textContent = 'Load metrics for visible';
  if (done) toast(`Loaded ${done} name${done === 1 ? '' : 's'}. Free tiers allow 8 price calls a minute, so this runs in batches.`);
}

/* -------------------------------------------------------- company detail --- */

async function selectCompany(symbol) {
  const company = findCompany(state.universe.companies, symbol);
  if (!company) return;
  state.selected = symbol;
  renderScreener();

  const panel = el('detail-panel');
  panel.innerHTML = `<div class="card plate card-pad"><div class="loading"><div class="spinner"></div><p class="loading__text">Analysing ${esc(symbol)}</p></div></div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    if (!state.bars.has(symbol)) {
      const bars = await getBars(symbol, 400);
      if (bars) state.bars.set(symbol, bars);
    }
    const bars = state.bars.get(symbol) ?? null;
    const metrics = bars ? priceMetrics(bars, state.marketReturns) : null;
    if (metrics) state.metrics.set(symbol, metrics);

    let fundamentals = state.fundamentals.get(symbol) ?? null;
    if (!fundamentals) {
      try {
        fundamentals = await getFundamentals(symbol);
        if (fundamentals) state.fundamentals.set(symbol, fundamentals);
      } catch (err) {
        toast(`Fundamentals: ${err.message}`, 'clay');
      }
    }

    const target = await getPriceTarget(symbol);
    const sectorPe = state.sectorPe?.get(company.sector) ?? null;

    renderDetail({ company, metrics, fundamentals, target, sectorPe, bars });
  } catch (err) {
    panel.innerHTML = `<div class="card plate card-pad"><p class="eyebrow">Plate V &middot; ${esc(symbol)}</p>
      <div class="callout callout--clay" style="margin-top:0.6rem">Could not analyse ${esc(symbol)}: ${esc(err.message)}</div></div>`;
  }
}

function renderDetail({ company, metrics, fundamentals, target, sectorPe, bars }) {
  const a = state.assumptions;
  const price = metrics?.last ?? fundamentals?.price ?? null;

  const ceiling = entryCeiling({
    price,
    eps: fundamentals?.epsTtm ?? null,
    sectorPe,
    analystTarget: target?.consensus ?? null,
    sma50: metrics?.sma50 ?? null,
    atr14: metrics?.atr14 ?? null,
    swingLow: metrics?.swingLow20 ?? null,
    marginOfSafety: a.marginOfSafety / 100,
    minRewardRisk: a.minRewardRisk,
    atrStopMultiple: a.atrStopMultiple
  });

  const sizing = positionSizing({
    price,
    atr14: metrics?.atr14 ?? null,
    portfolioValue: a.portfolioValue,
    riskPerTradePct: a.riskPerTradePct,
    atrStopMultiple: a.atrStopMultiple,
    assetVol: metrics?.vol ?? null,
    target: target?.consensus ?? null,
    maxWeightPct: a.maxWeightPct
  });

  const ladder = entryLadder(ceiling.ceiling, sizing.stopPrice, sizing.recommended ?? 0);

  const verdictTag =
    ceiling.verdict === 'at-or-below'
      ? `<span class="tag tag--up">At or below the ceiling</span>`
      : ceiling.verdict === 'above'
        ? `<span class="tag tag--down">${pctRaw(ceiling.premiumPct)} above the ceiling</span>`
        : `<span class="tag tag--neutral">Ceiling not computable</span>`;

  const anchorRows = ceiling.anchors
    .map((an) => {
      const binding = an.id === ceiling.binding;
      return `<div class="ladder__row${binding ? ' is-binding' : ''}">
        <span class="ladder__label">${binding ? '<b>' : ''}${esc(an.short)}${binding ? '</b> — binding' : ''}
          <span class="co-name">${esc(an.detail)}</span></span>
        <span class="ladder__price">${an.available && Number.isFinite(an.price) ? money(an.price) : DASH}</span>
      </div>`;
    })
    .join('');

  const sizingRows = sizing.rules
    .map((r) => {
      const binding = r.id === sizing.binding;
      return `<div class="ladder__row${binding ? ' is-binding' : ''}">
        <span class="ladder__label">${binding ? '<b>' : ''}${esc(r.short)}${binding ? '</b> — binding' : ''}
          <span class="co-name">${esc(r.detail)}</span></span>
        <span class="ladder__price">${r.available && Number.isFinite(r.shares) ? `${r.shares.toLocaleString()} sh` : DASH}</span>
      </div>`;
    })
    .join('');

  const ladderRows = ladder.length
    ? `<div class="ladder" style="margin-top:0.6rem">${ladder
        .map(
          (t) => `<div class="ladder__row"><span class="ladder__label">${esc(t.label)}
            <span class="co-name">${(t.portion * 100).toFixed(0)}% of the position</span></span>
            <span class="ladder__price">${t.shares} sh @ ${money(t.price)}</span></div>`
        )
        .join('')}</div>`
    : '';

  const needsKeys = [];
  if (!state.keys.twelve && !state.demo) needsKeys.push('Twelve Data for prices, ATR and volatility');
  if (!state.keys.fmp && !state.demo) needsKeys.push('FMP for EPS, sector multiples and consensus targets');

  el('detail-panel').innerHTML = `
    <div class="card plate card-pad">
      <div class="section-head">
        <div>
          <p class="eyebrow">Plate V &middot; Entry and size</p>
          <h2 style="font-size:var(--t-h1);margin-top:0.2rem">
            <span class="sym" style="font-size:1.1em">${esc(company.symbol)}</span>
            <span class="soft" style="font-weight:500;font-size:0.8em"> ${esc(company.name)}</span>
          </h2>
          <p class="t-xs muted">${esc(company.sector)}${fundamentals?.industry ? ` &middot; ${esc(fundamentals.industry)}` : ''}</p>
        </div>
        <div class="row" style="gap:0.5rem">
          <span class="num-lg">${money(price)}</span>
          ${Number.isFinite(metrics?.dayChangePct) ? `<span class="pill-stat ${signClass(metrics.dayChangePct / 100)}"><span class="delta ${signClass(metrics.dayChangePct / 100)}"></span>${pctRaw(Math.abs(metrics.dayChangePct), 2)}</span>` : ''}
        </div>
      </div>

      ${needsKeys.length ? `<div class="callout" style="margin-bottom:1rem">Missing: ${esc(needsKeys.join('; '))}. Anchors that need those inputs are shown as ${DASH} rather than estimated.</div>` : ''}

      <div class="grid-4" style="margin-bottom:1.2rem">
        <div class="metric metric-box"><span class="metric__label">Ceiling</span>
          <span class="metric__value">${ceiling.ceiling !== null ? money(ceiling.ceiling) : DASH}</span>
          <span class="metric__note">${ceiling.availableCount}/4 anchors</span></div>
        <div class="metric metric-box"><span class="metric__label">Recommended</span>
          <span class="metric__value">${sizing.recommended !== null ? `${sizing.recommended.toLocaleString()} sh` : DASH}</span>
          <span class="metric__note">${sizing.capital !== null ? `${money0(sizing.capital)} · ${pctRaw(sizing.weightPct)}` : 'needs ATR'}</span></div>
        <div class="metric metric-box"><span class="metric__label">Stop</span>
          <span class="metric__value">${sizing.stopPrice !== null ? money(sizing.stopPrice) : DASH}</span>
          <span class="metric__note">${sizing.stopDistance !== null ? `${a.atrStopMultiple}× ATR = ${num(sizing.stopDistance)}` : DASH}</span></div>
        <div class="metric metric-box"><span class="metric__label">Risk if stopped</span>
          <span class="metric__value">${sizing.riskAmount !== null ? money0(sizing.riskAmount) : DASH}</span>
          <span class="metric__note">${sizing.riskPctOfAccount !== null ? `${pctRaw(sizing.riskPctOfAccount, 2)} of account` : DASH}</span></div>
      </div>

      <div class="grid-2">
        <div>
          <div class="row-between" style="margin-bottom:0.5rem">
            <p class="eyebrow">Maximum meaningful price</p>${verdictTag}
          </div>
          <div class="ladder">${anchorRows}</div>
          <p class="t-xs muted" style="margin-top:0.5rem">
            The ceiling is the strictest of the anchors — whichever binds is the
            reason not to pay more.
          </p>
          ${ladderRows ? `<p class="eyebrow" style="margin-top:1rem">Staged entry</p>${ladderRows}` : ''}
        </div>

        <div>
          <p class="eyebrow" style="margin-bottom:0.5rem">How many shares</p>
          <div class="ladder">${sizingRows}</div>
          <p class="t-xs muted" style="margin-top:0.5rem">
            Three rules that answer different questions; the recommendation is the
            smallest, because the point of computing them is to respect the tightest.
          </p>

          <p class="eyebrow" style="margin-top:1rem;margin-bottom:0.5rem">Price and risk</p>
          <div class="grid-2" style="gap:0.5rem">
            <div class="metric"><span class="metric__label">Vol (1y)</span><span class="metric__value">${pct(metrics?.vol, 0)}</span></div>
            <div class="metric"><span class="metric__label">Beta</span><span class="metric__value">${num(metrics?.beta)}</span></div>
            <div class="metric"><span class="metric__label">50d avg</span><span class="metric__value">${money(metrics?.sma50)}</span></div>
            <div class="metric"><span class="metric__label">200d avg</span><span class="metric__value">${money(metrics?.sma200)}</span></div>
            <div class="metric"><span class="metric__label">52w range</span><span class="metric__value" style="font-size:0.85rem">${money(metrics?.low52, 0)}–${money(metrics?.high52, 0)}</span></div>
            <div class="metric"><span class="metric__label">Max DD (1y)</span><span class="metric__value">${pct(metrics?.maxDrawdown1y, 0)}</span></div>
            <div class="metric"><span class="metric__label">P/E (TTM)</span><span class="metric__value">${num(fundamentals?.peTtm, 1)}</span></div>
            <div class="metric"><span class="metric__label">Yield</span><span class="metric__value">${pct(fundamentals?.dividendYield, 2)}</span></div>
            <div class="metric"><span class="metric__label">Market cap</span><span class="metric__value">${compactCap(fundamentals?.marketCap)}</span></div>
            <div class="metric"><span class="metric__label">Consensus</span><span class="metric__value">${money(target?.consensus)}</span></div>
          </div>
        </div>
      </div>

      <div class="row-between" style="margin-top:1.3rem">
        <p class="eyebrow">Written read</p>
        <button class="btn btn--sm btn--accent" id="btn-stock-note">Explain these numbers</button>
      </div>
      <div id="stock-note" style="margin-top:0.6rem"></div>
    </div>`;

  el('btn-stock-note').addEventListener('click', () =>
    writeStockNote({ company, metrics, fundamentals, ceiling, sizing })
  );
}

async function writeStockNote({ company, metrics, fundamentals, ceiling, sizing }) {
  const box = el('stock-note');

  if (!state.keys.openRouter) {
    box.innerHTML = `<div class="loading"><div class="spinner"></div><p class="loading__text">Fetching headlines</p></div>`;
    let items = [];
    try {
      items = await getHeadlines(`${company.name} OR ${company.symbol}`, { pageSize: 6 });
    } catch {
      items = [];
    }
    box.innerHTML = `
      ${headlineList(items, { synthetic: !state.keys.news && state.demo })}
      <div class="callout" style="margin-top:${items.length ? '0.9rem' : '0'}">
        Add an OpenRouter key to have the model explain these figures${items.length ? ' against those stories' : ''}.
        The numbers above are already computed and do not need it.
      </div>`;
    return;
  }
  if (!metrics) {
    box.innerHTML = `<div class="callout callout--clay">No price data loaded for ${esc(company.symbol)} — nothing to explain yet.</div>`;
    return;
  }
  box.innerHTML = `<div class="loading"><div class="spinner"></div><p class="loading__text">Writing</p></div>`;

  let headlines = [];
  try {
    headlines = await getHeadlines(`${company.name} OR ${company.symbol}`, { pageSize: 8 });
  } catch (err) {
    console.warn(`[news] ${err.message}`);
  }

  try {
    const prompt = buildStockPrompt({
      company, metrics, fundamentals, ceiling, sizing, headlines,
      assumptions: state.assumptions
    });
    const text = await generate(prompt, state.keys.openRouter);
    box.innerHTML = `<div class="note">${markdownToHtml(text)}</div>
      <div style="margin-top:1rem">${headlineList(headlines, { synthetic: !state.keys.news && state.demo })}</div>`;
  } catch (err) {
    box.innerHTML = `<div class="callout callout--clay">${esc(err.message)}</div>`;
  }
}

/* ---------------------------------------------------------------- themes --- */

async function findThemes() {
  const body = el('themes-body');
  const btn = el('btn-themes');

  if (!state.keys.news && !state.demo) {
    body.innerHTML = `<div class="callout">A news key is needed to read headlines — newsdata.io (a key starting <span class="mono">pub_</span>) or NewsAPI.org. Without one there is nothing to derive themes from, and inventing them would defeat the point.</div>`;
    return;
  }
  btn.disabled = true;
  body.innerHTML = `<div class="loading"><div class="spinner"></div><p class="loading__text">Reading the last seven days</p></div>`;

  try {
    const { bySector: sectorHeadlines, errors } = state.keys.news
      ? await fetchSectorHeadlines(state.keys.news)
      : { bySector: demoSectorHeadlines(), errors: [] };
    const ranking = coverageRanking(sectorHeadlines);

    if (!ranking.length) {
      // No stories and a refused request are different facts — say which.
      body.innerHTML = errors.length
        ? `<div class="callout callout--clay">
             <strong>The news service refused the request.</strong><br>${esc(errors[0].message)}
           </div>`
        : `<div class="callout">No headlines came back for any sector in the last seven days.</div>`;
      btn.disabled = false;
      return;
    }

    const partialWarning = errors.length
      ? `<div class="callout callout--clay" style="margin-bottom:0.8rem">
           ${errors.length} sector${errors.length === 1 ? '' : 's'} could not be fetched: ${esc(errors[0].message)}
         </div>`
      : '';

    // The proxy-ETF prices are a garnish on the story counts. Twelve Data's free
    // tier bills per symbol, so this is the call most likely to hit a 429 — and a
    // price failure must not take the news panel down with it.
    let moves = new Map();
    let movesError = null;
    try {
      const shown = ranking.slice(0, 6).map((r) => r.sector);
      moves = state.keys.twelve
        ? await fetchSectorMoves(state.keys.twelve, shown)
        : state.demo
          ? demoSectorMoves(shown, state.universe.companies)
          : new Map();
    } catch (err) {
      movesError = err.message;
    }

    const coverageHtml = `<div class="grid-3" style="gap:0.6rem;margin-bottom:1rem">
      ${ranking
        .slice(0, 6)
        .map((r) => {
          const mv = moves.get(r.sector);
          return `<button class="card card--sunk card-pad" data-theme-sector="${esc(r.sector)}" style="text-align:left;border:0;cursor:pointer">
            <p class="eyebrow">${esc(r.sector)}</p>
            <div class="row-between" style="margin-top:0.3rem">
              <span class="num">${r.count} stor${r.count === 1 ? 'y' : 'ies'}</span>
              ${mv && Number.isFinite(mv.changePct)
                ? `<span class="tag ${mv.changePct >= 0 ? 'tag--up' : 'tag--down'}">${esc(mv.proxy)} ${mv.changePct >= 0 ? '+' : ''}${mv.changePct.toFixed(2)}%</span>`
                : `<span class="tag tag--neutral">no proxy price</span>`}
            </div>
          </button>`;
        })
        .join('')}
    </div>`;

    let themesHtml = '';
    if (state.keys.openRouter) {
      const text = await generate(buildThemePrompt(sectorHeadlines), state.keys.openRouter, { maxTokens: 900 });
      themesHtml = `<div class="note">${markdownToHtml(text)}</div>`;
    } else {
      const sourceWord = state.keys.news ? 'live' : 'from the demo archive';
      themesHtml = `<div class="callout">Headline counts above are ${sourceWord}. Add an OpenRouter key to have the themes named and tied back to the specific stories.</div>`;
    }

    const movesNote = movesError
      ? `<p class="t-xs muted" style="margin-bottom:0.6rem">Sector proxy prices unavailable: ${esc(movesError)}</p>`
      : '';
    body.innerHTML = partialWarning + movesNote + coverageHtml + themesHtml;
    body.querySelectorAll('[data-theme-sector]').forEach((card) =>
      card.addEventListener('click', () => {
        state.sectorFilter = card.dataset.themeSector;
        renderSectorChips();
        renderScreener();
        el('screener-table').scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
    );
  } catch (err) {
    body.innerHTML = `<div class="callout callout--clay">${esc(err.message)}</div>`;
  }
  btn.disabled = false;
}

/* ------------------------------------------------------- portfolio import --- */


async function handleFile(file) {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const rows = await parseExcel(file);
      ingestRows(rows, file.name);
    } else {
      const text = await file.text();
      ingestRows(parseCsv(text), file.name);
    }
  } catch (err) {
    toast(`Could not read ${file.name}: ${err.message}`, 'clay');
  }
}

/**
 * Excel needs a parser, and SheetJS is loaded on demand rather than shipped in
 * the bundle. If the CDN cannot be reached the failure is explicit and the
 * remedy (save as CSV) is stated, rather than an empty table.
 */
async function parseExcel(file) {
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('could not load the Excel parser — save the file as CSV and try again'));
      document.head.appendChild(s);
    });
  }
  const buffer = await file.arrayBuffer();
  const wb = window.XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function ingestRows(rows, label) {
  if (rows.length < 2) {
    toast('That file has no data rows below the header.', 'clay');
    return;
  }
  state.rawRows = rows;
  state.mapping = guessMapping(rows[0]);
  renderMapping(label);
}

function renderMapping(label) {
  const headers = state.rawRows[0];
  const options = (selected) =>
    [`<option value="-1"${selected === -1 ? ' selected' : ''}>— not present —</option>`]
      .concat(
        headers.map(
          (h, i) => `<option value="${i}"${selected === i ? ' selected' : ''}>${esc(String(h).slice(0, 40))}</option>`
        )
      )
      .join('');

  const preview = state.rawRows.slice(1, 4)
    .map((r) => `<tr>${r.slice(0, 6).map((c) => `<td>${esc(String(c).slice(0, 22))}</td>`).join('')}</tr>`)
    .join('');

  el('mapping-panel').hidden = false;
  el('mapping-panel').innerHTML = `
    <div class="card plate card-pad">
      <div class="section-head">
        <div>
          <p class="eyebrow">Plate VII &middot; Column mapping</p>
          <h2 style="font-size:var(--t-h1);margin-top:0.2rem">Check the mapping</h2>
          <p class="t-xs muted">${esc(label)} &middot; ${state.rawRows.length - 1} data row${state.rawRows.length === 2 ? '' : 's'}</p>
        </div>
        <button class="btn btn--primary" id="btn-confirm-mapping">Use this mapping</button>
      </div>

      <div class="grid-3" style="gap:0.7rem">
        <div><label class="field-label" for="m-symbol">Ticker column *</label>
          <select id="m-symbol">${options(state.mapping.symbol)}</select></div>
        <div><label class="field-label" for="m-quantity">Quantity column *</label>
          <select id="m-quantity">${options(state.mapping.quantity)}</select></div>
        <div><label class="field-label" for="m-costBasis">Cost per share</label>
          <select id="m-costBasis">${options(state.mapping.costBasis)}</select></div>
      </div>

      <p class="eyebrow" style="margin-top:1rem;margin-bottom:0.4rem">First rows as read</p>
      <div class="scroll-x"><table><thead><tr>${headers.slice(0, 6).map((h) => `<th>${esc(String(h).slice(0, 22))}</th>`).join('')}</tr></thead>
        <tbody>${preview}</tbody></table></div>
    </div>`;

  el('btn-confirm-mapping').addEventListener('click', () => {
    state.mapping = {
      symbol: Number(el('m-symbol').value),
      quantity: Number(el('m-quantity').value),
      costBasis: Number(el('m-costBasis').value),
      currency: -1,
      date: -1
    };
    if (state.mapping.symbol < 0 || state.mapping.quantity < 0) {
      toast('A ticker column and a quantity column are both required.', 'clay');
      return;
    }
    confirmMapping();
  });
}

async function confirmMapping() {
  const { holdings, skipped } = buildHoldings(state.rawRows, state.mapping, { hasHeader: true });
  if (!holdings.length) {
    toast('No readable positions in that file — check the column mapping.', 'clay');
    return;
  }
  state.holdings = holdings;
  state.skipped = skipped;
  el('import-panel').hidden = true;
  el('mapping-panel').hidden = true;
  await analysePortfolio();
}

/* ----------------------------------------------------- portfolio analysis --- */

async function analysePortfolio() {
  const body = el('portfolio-body');
  body.hidden = false;
  body.innerHTML = `<div class="card plate card-pad"><div class="loading"><div class="spinner"></div><p class="loading__text">Valuing ${state.holdings.length} positions</p></div></div>`;

  const symbols = state.holdings.map((h) => h.symbol);
  let quotes = new Map();

  try {
    quotes = await getQuotes(symbols);
  } catch (err) {
    toast(`Quotes: ${err.message}`, 'clay');
  }
  state.valued = valueHoldings(state.holdings, quotes);

  // History for the risk model: one call per name, so it is opt-in.
  state.risk = null;
  renderPortfolio();
}

async function loadRiskModel() {
  if (!state.keys.twelve && !state.demo) {
    toast('A Twelve Data key, or demo data, is needed for the history the risk model runs on.', 'accent');
    return;
  }
  const btn = el('btn-risk');
  btn.disabled = true;

  const symbols = state.valued.holdings.filter((h) => h.price !== null).map((h) => h.symbol);
  let done = 0;

  for (const sym of symbols) {
    if (!state.bars.has(sym)) {
      try {
        btn.textContent = `Loading ${done + 1}/${symbols.length}`;
        const bars = await getBars(sym, 400);
        if (bars) state.bars.set(sym, bars);
      } catch (err) {
        toast(`${sym}: ${err.message}`, 'clay');
        break;
      }
    }
    done++;
  }

  // The market proxy, for beta.
  if (!state.bars.has(MARKET_PROXY)) {
    try {
      const bars = await getBars(MARKET_PROXY, 400);
      if (bars) {
        state.bars.set(MARKET_PROXY, bars);
        state.marketReturns = simpleReturns(bars.map((b) => b.close));
      }
    } catch {
      /* beta stays unavailable, which the UI shows as — */
    }
  }

  const aligned = alignReturns(state.bars, symbols, 60);
  if (!aligned.symbols.length) {
    toast('Not enough overlapping history across these names to build a risk model.', 'clay');
    btn.disabled = false;
    btn.textContent = 'Load risk model';
    return;
  }

  const cov = covarianceMatrix(aligned.returns, aligned.symbols);
  const weights = aligned.symbols.map((s) => {
    const h = state.valued.holdings.find((x) => x.symbol === s);
    return h?.weight ?? 0;
  });
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const normalised = weights.map((w) => w / wSum);

  state.risk = {
    ...aligned,
    cov,
    correlation: correlationFromCov(cov),
    weights: normalised,
    meanDaily: meanDailyReturns(aligned.returns, aligned.symbols),
    stats: portfolioRiskStats({
      returns: aligned.returns,
      symbols: aligned.symbols,
      weights: normalised,
      cov,
      marketReturns: state.marketReturns
    }),
    contributions: riskContributions(normalised, cov)
  };

  // Everything below reads the matrices already built above — no extra requests.
  const series = portfolioReturnSeries(aligned.returns, aligned.symbols, normalised);
  const value = state.valued.totalValue;
  state.risk.series = series;
  state.risk.tail = tailRisk(series, value, 0.95);
  state.risk.diversification = diversificationRatio(normalised, cov);
  state.risk.pairs = topCorrelatedPairs(state.risk.correlation, aligned.symbols, 5);
  state.risk.bookCorrelation = correlationToBook(state.risk.correlation, aligned.symbols);
  state.risk.extremes = extremeDays(series, aligned.dates, value);
  state.risk.hitRate = hitRate(series);

  btn.disabled = false;
  btn.textContent = 'Reload risk model';
  renderPortfolio();
}

/**
 * Why a cost basis is missing — the two reasons need different remedies, and
 * "no cost column" when the column exists would send someone re-exporting a
 * file that was already fine.
 */
function costNote(v) {
  if (v.totalCost !== null) return '';
  const hasCostData = v.holdings.some((h) => Number.isFinite(h.costBasis));
  if (!hasCostData) return 'no cost column mapped';
  return v.pricedCount === 0 ? 'needs live prices — add a Twelve Data key' : 'no cost for the priced positions';
}

function renderPortfolio() {
  const v = state.valued;
  const conc = concentration(v.holdings.map((h) => h.weight));
  const sectors = sectorAllocation(v.holdings, state.universe.companies);
  const risk = state.risk;

  const rows = [...v.holdings]
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .map(
      (h) => `<tr>
        <td><span class="sym">${esc(h.symbol)}</span>${h.mergedRows ? `<span class="co-name">${h.mergedRows} rows merged</span>` : ''}</td>
        <td class="num">${h.quantity.toLocaleString()}</td>
        <td class="num">${money(h.price)}</td>
        <td class="num">${money0(h.value)}</td>
        <td class="num">${h.weight !== null ? pct(h.weight) : DASH}</td>
        <td class="num">${money(h.costBasis)}</td>
        <td class="num ${signClass(h.pnl)}">${h.pnl !== null ? money0(h.pnl) : DASH}</td>
        <td class="num ${signClass(h.pnlPct)}">${h.pnlPct !== null ? pctRaw(h.pnlPct) : DASH}</td>
      </tr>`
    )
    .join('');

  const sectorBars = sectors
    .map(
      (s) => `<div style="margin-bottom:0.5rem">
        <div class="row-between t-sm"><span>${esc(s.sector)}</span><span class="num">${pct(s.weight)}</span></div>
        <div class="bar" style="margin-top:0.2rem"><div class="bar__fill" style="width:${(s.weight * 100).toFixed(1)}%"></div></div>
      </div>`
    )
    .join('');

  el('portfolio-body').innerHTML = `
    <div class="stack-lg">
      <!-- TOTALS -->
      <div class="card plate card-pad">
        <div class="section-head">
          <div>
            <p class="eyebrow">Plate VIII &middot; Overview</p>
            <h2 style="font-size:var(--t-h1);margin-top:0.2rem">${state.holdings.length} positions</h2>
            <p class="t-xs muted">${v.pricedCount} priced live${v.unpriced.length ? ` &middot; no quote for ${esc(v.unpriced.join(', '))}` : ''}</p>
          </div>
          <button class="btn btn--sm" id="btn-reimport">Import another file</button>
        </div>

        <div class="grid-4">
          <div class="metric metric-box"><span class="metric__label">Market value</span>
            <span class="metric__value" style="font-size:1.2rem">${money0(v.totalValue)}</span></div>
          <div class="metric metric-box"><span class="metric__label">Cost basis</span>
            <span class="metric__value" style="font-size:1.2rem">${v.totalCost !== null ? money0(v.totalCost) : DASH}</span>
            <span class="metric__note">${costNote(v)}</span></div>
          <div class="metric metric-box"><span class="metric__label">Unrealised P/L</span>
            <span class="metric__value ${signClass(v.totalPnl)}" style="font-size:1.2rem">${v.totalPnl !== null ? money0(v.totalPnl) : DASH}</span>
            <span class="metric__note ${signClass(v.totalPnlPct)}">${v.totalPnlPct !== null ? pctRaw(v.totalPnlPct) : ''}</span></div>
          <div class="metric metric-box"><span class="metric__label">Today</span>
            <span class="metric__value ${signClass(v.dayPnl)}" style="font-size:1.2rem">${v.dayPnl ? money0(v.dayPnl) : DASH}</span>
            <span class="metric__note ${signClass(v.dayPnlPct)}">${Number.isFinite(v.dayPnlPct) && v.dayPnl ? pctRaw(v.dayPnlPct, 2) : ''}</span></div>
        </div>

        ${state.skipped?.length ? `<div class="callout callout--clay" style="margin-top:1rem">
          <strong>${state.skipped.length} row${state.skipped.length === 1 ? '' : 's'} skipped.</strong>
          ${state.skipped.slice(0, 4).map((s) => `Line ${s.line}: ${esc(s.reason)}`).join(' · ')}
        </div>` : ''}
      </div>

      <!-- HOLDINGS + SECTORS -->
      <div class="grid-side">
        <div class="card plate card-pad">
          <p class="eyebrow" style="margin-bottom:0.6rem">Holdings</p>
          <div class="table-wrap"><table>
            <thead><tr><th>Name</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Value</th>
              <th class="num">Weight</th><th class="num">Cost</th><th class="num">P/L</th><th class="num">P/L %</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        </div>

        <div class="stack">
          <div class="card plate card-pad">
            <p class="eyebrow" style="margin-bottom:0.6rem">Concentration</p>
            <div class="grid-2" style="gap:0.5rem">
              <div class="metric"><span class="metric__label">Herfindahl</span><span class="metric__value">${num(conc.hhi, 3)}</span></div>
              <div class="metric"><span class="metric__label">Effective names</span><span class="metric__value">${num(conc.effectiveNames, 1)}</span></div>
              <div class="metric"><span class="metric__label">Top 5 weight</span><span class="metric__value">${pct(conc.top5)}</span></div>
              <div class="metric"><span class="metric__label">Positions</span><span class="metric__value">${state.holdings.length}</span></div>
            </div>
            <p class="t-xs muted" style="margin-top:0.5rem">
              ${Number.isFinite(conc.effectiveNames) ? `Spread like ${conc.effectiveNames.toFixed(1)} equally weighted names.` : ''}
            </p>
          </div>

          <div class="card plate card-pad">
            <p class="eyebrow" style="margin-bottom:0.6rem">Sector mix</p>
            ${sectorBars || `<p class="t-sm muted">No sector data — these names are not in the loaded universe.</p>`}
          </div>
        </div>
      </div>

      <!-- RISK -->
      <div class="card plate card-pad">
        <div class="section-head">
          <div>
            <p class="eyebrow">Plate IX &middot; Risk</p>
            <h2 style="font-size:var(--t-h1);margin-top:0.2rem">Risk model</h2>
          </div>
          <button class="btn btn--sm" id="btn-risk">${risk ? 'Reload risk model' : 'Load risk model'}</button>
        </div>
        ${risk ? renderRiskBlock(risk) : `<p class="t-sm muted">
          The handles need a covariance matrix, which needs daily history per name —
          one API call each. Load it when you are ready; on the free tier that is
          eight names a minute.</p>`}
      </div>

      ${risk ? renderHandlesBlock() : ''}

      <!-- NEWS READ -->
      <div class="card plate card-pad">
        <div class="section-head">
          <div>
            <p class="eyebrow">Plate XI &middot; Current events</p>
            <h2 style="font-size:var(--t-h1);margin-top:0.2rem">What the news bears on</h2>
          </div>
          <button class="btn btn--sm btn--accent" id="btn-pf-note">Read my book</button>
        </div>
        <div id="pf-note"></div>
      </div>
    </div>`;

  el('btn-reimport').addEventListener('click', () => {
    el('import-panel').hidden = false;
    el('portfolio-body').hidden = true;
    state.valued = null;
    state.risk = null;
  });
  el('btn-risk').addEventListener('click', loadRiskModel);
  el('btn-pf-note').addEventListener('click', writePortfolioNote);
  if (risk) wireHandles();
}

function renderRiskBlock(risk) {
  const s = risk.stats;
  const contribRows = risk.symbols
    .map((sym, i) => ({ sym, weight: risk.weights[i], rc: risk.contributions[i] }))
    .sort((a, b) => b.rc - a.rc)
    .slice(0, 8)
    .map(
      (r) => `<div style="margin-bottom:0.45rem">
        <div class="row-between t-sm"><span class="sym">${esc(r.sym)}</span>
          <span class="num">${pct(r.rc)} of risk · ${pct(r.weight)} of capital</span></div>
        <div class="bar" style="margin-top:0.2rem"><div class="bar__fill${r.rc > r.weight * 1.3 ? ' bar__fill--accent' : ''}" style="width:${(Math.max(0, r.rc) * 100).toFixed(1)}%"></div></div>
      </div>`
    )
    .join('');

  return `
    <div class="grid-4" style="margin-bottom:1.1rem">
      <div class="metric metric-box"><span class="metric__label">Volatility</span><span class="metric__value">${pct(s.annVol)}</span><span class="metric__note">annualised</span></div>
      <div class="metric metric-box"><span class="metric__label">Return</span><span class="metric__value ${signClass(s.annReturn)}">${pct(s.annReturn)}</span><span class="metric__note">trailing, annualised</span></div>
      <div class="metric metric-box"><span class="metric__label">Sharpe</span><span class="metric__value">${num(s.sharpe)}</span><span class="metric__note">rf 4%</span></div>
      <div class="metric metric-box"><span class="metric__label">Max drawdown</span><span class="metric__value is-down">${pct(s.maxDrawdown)}</span></div>
      <div class="metric metric-box"><span class="metric__label">Beta</span><span class="metric__value">${num(s.beta)}</span><span class="metric__note">vs ${MARKET_PROXY}</span></div>
      <div class="metric metric-box"><span class="metric__label">Observations</span><span class="metric__value">${s.observations}</span><span class="metric__note">overlapping days</span></div>
      <div class="metric metric-box"><span class="metric__label">Names modelled</span><span class="metric__value">${risk.symbols.length}</span></div>
      <div class="metric metric-box"><span class="metric__label">Excluded</span><span class="metric__value">${risk.dropped.length}</span><span class="metric__note">${risk.dropped.length ? esc(risk.dropped.map((d) => d.symbol).join(', ')) : 'none'}</span></div>
    </div>
    <p class="eyebrow" style="margin-bottom:0.5rem">Risk contribution vs capital weight</p>
    ${contribRows}
    <p class="t-xs muted" style="margin-bottom:1.2rem">An ochre bar marks a position supplying more risk than its capital share — the ones that dominate quietly.</p>

    ${renderTailBlock(risk)}
    ${renderStructureBlock(risk)}
    ${renderHeatmap(risk)}`;
}

/** What a bad day costs, in money rather than in standard deviations. */
function renderTailBlock(risk) {
  const t = risk.tail;
  const e = risk.extremes;
  if (!t) return '';

  return `
    <div class="card card--sunk card-pad" style="margin-bottom:1.1rem">
      <p class="eyebrow" style="margin-bottom:0.7rem">What a bad day costs</p>
      <div class="grid-4">
        <div class="metric"><span class="metric__label">Value at risk (95%, 1d)</span>
          <span class="metric__value is-down">${money0(t.varMoney)}</span>
          <span class="metric__note">${pct(t.varPct, 2)} — the worst day in 20</span></div>
        <div class="metric"><span class="metric__label">Expected shortfall</span>
          <span class="metric__value is-down">${money0(t.esMoney)}</span>
          <span class="metric__note">average of the worst ${t.tailDays} days</span></div>
        <div class="metric"><span class="metric__label">Worst day on record</span>
          <span class="metric__value is-down">${e ? money0(e.worst.money) : DASH}</span>
          <span class="metric__note">${e?.worst.date ? `${pct(e.worst.pct, 2)} on ${esc(e.worst.date)}` : DASH}</span></div>
        <div class="metric"><span class="metric__label">Sessions closing up</span>
          <span class="metric__value">${pct(risk.hitRate, 0)}</span>
          <span class="metric__note">of ${t.observations} days</span></div>
      </div>
      <p class="t-xs muted" style="margin-top:0.6rem">
        Read from the realised distribution of these weights, not a normal curve —
        equity tails are fatter than the bell, exactly where it matters.
      </p>
    </div>`;
}

/** How much diversification the book is actually earning. */
function renderStructureBlock(risk) {
  const d = risk.diversification;
  if (!d) return '';

  const pairs = (risk.pairs ?? []).map((p) => {
    const tone = p.rho > 0.8 ? 'tag--down' : p.rho > 0.6 ? 'tag--accent' : 'tag--mint';
    return `<span class="tag ${tone}">${esc(p.a)} · ${esc(p.b)} ${p.rho.toFixed(2)}</span>`;
  }).join(' ');

  const bets = d.independentBets;
  const names = risk.symbols.length;
  const verdict = bets < names * 0.45
    ? `These ${names} positions behave like <strong>${bets.toFixed(1)} independent bets</strong> — the names overlap more than the count suggests.`
    : `These ${names} positions behave like <strong>${bets.toFixed(1)} independent bets</strong>, which is genuine diversification for a book this size.`;

  return `
    <div class="card card--sunk card-pad" style="margin-bottom:1.1rem">
      <p class="eyebrow" style="margin-bottom:0.7rem">Is the diversification real?</p>
      <div class="grid-3" style="gap:0.9rem;margin-bottom:0.7rem">
        <div class="metric"><span class="metric__label">Diversification ratio</span>
          <span class="metric__value">${num(d.ratio, 2)}×</span>
          <span class="metric__note">1.0 = one bet in many names</span></div>
        <div class="metric"><span class="metric__label">Volatility saved</span>
          <span class="metric__value is-up">${pct(d.volSaved, 1)}</span>
          <span class="metric__note">${pct(d.weightedAvgVol, 1)} apart → ${pct(d.portfolioVol, 1)} together</span></div>
        <div class="metric"><span class="metric__label">Independent bets</span>
          <span class="metric__value">${num(bets, 1)}</span>
          <span class="metric__note">out of ${names} positions</span></div>
      </div>
      <p class="t-sm soft">${verdict}</p>
      ${pairs ? `<p class="eyebrow" style="margin:0.9rem 0 0.4rem">Most correlated pairs — one bet, not two</p>
        <div class="row wrap" style="gap:0.35rem">${pairs}</div>` : ''}
    </div>`;
}

/** The correlation matrix, as a matrix. */
function renderHeatmap(risk) {
  const c = risk.correlation;
  const syms = risk.symbols;
  if (!c || syms.length < 2 || syms.length > 14) return '';

  const shade = (rho) => {
    if (!Number.isFinite(rho)) return 'background:var(--creme-deep);color:var(--ink-mute)';
    // One hue, varying weight: dark green = moves together, pale = independent.
    const t = Math.max(0, Math.min(1, (rho + 0.2) / 1.2));
    const bg = `color-mix(in srgb, var(--green-60) ${(t * 100).toFixed(0)}%, var(--creme))`;
    return `background:${bg};color:${t > 0.55 ? '#fff' : 'var(--ink)'}`;
  };

  const header = `<tr><th style="position:static"></th>${syms
    .map((sy) => `<th class="num" style="position:static;padding:0.3rem 0.15rem">${esc(sy)}</th>`).join('')}</tr>`;

  const rows = syms.map((sy, i) => `
    <tr><td class="sym" style="padding:0.3rem 0.5rem 0.3rem 0">${esc(sy)}</td>
      ${syms.map((_, j) => `<td style="padding:2px"><div class="heat-cell" style="${shade(c[i][j])}">${
        Number.isFinite(c[i][j]) ? c[i][j].toFixed(2) : DASH}</div></td>`).join('')}
    </tr>`).join('');

  return `
    <div class="card card--sunk card-pad">
      <p class="eyebrow" style="margin-bottom:0.7rem">Correlation matrix</p>
      <div class="scroll-x"><table style="width:auto">${header}${rows}</table></div>
      <p class="t-xs muted" style="margin-top:0.6rem">
        Darker means the pair moved together over the ${risk.stats.observations} sessions
        modelled. Dark blocks are where the diversification you think you have goes missing.
      </p>
    </div>`;
}

function renderHandlesBlock() {
  return `
    <div class="card plate card-pad">
      <div class="section-head">
        <div>
          <p class="eyebrow">Plate X &middot; Handles</p>
          <h2 style="font-size:var(--t-h1);margin-top:0.2rem">Pull a handle</h2>
          <p class="t-sm soft" style="max-width:62ch;margin-top:0.3rem">
            Each one is a real optimisation over your holdings — long-only, weights
            summing to 1, capped at your maximum position weight. You get target
            weights, the trades to reach them, and what they change.
          </p>
        </div>
      </div>
      <div class="row wrap" style="gap:0.4rem">
        ${HANDLES.map((h) => `<button class="chip" data-handle="${esc(h.id)}" aria-pressed="${state.activeHandle === h.id}">${esc(h.label)}</button>`).join('')}
      </div>
      <div id="handle-result" style="margin-top:1rem"></div>
    </div>`;
}

function wireHandles() {
  document.querySelectorAll('[data-handle]').forEach((btn) =>
    btn.addEventListener('click', () => runHandle(btn.dataset.handle))
  );
  if (state.activeHandle) runHandle(state.activeHandle);
}

function runHandle(id) {
  const handle = HANDLES.find((h) => h.id === id);
  const risk = state.risk;
  const box = el('handle-result');
  if (!handle || !risk) return;

  state.activeHandle = id;
  document.querySelectorAll('[data-handle]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.handle === id))
  );

  const cap = state.assumptions.maxWeightPct / 100;
  const n = risk.symbols.length;

  // Inputs some handles need that may legitimately be missing.
  const betas = risk.symbols.map((s) => {
    const bars = state.bars.get(s);
    if (!bars || !state.marketReturns) return NaN;
    const m = priceMetrics(bars, state.marketReturns);
    return m.beta;
  });
  const yields = risk.symbols.map((s) => state.fundamentals.get(s)?.dividendYield ?? NaN);

  if (handle.requires === 'yields' && !yields.some(Number.isFinite)) {
    box.innerHTML = `<div class="callout">${esc(handle.label)} needs dividend yields, which come from FMP. Add an FMP key and load metrics for these names first — the handle is not run on assumed yields.</div>`;
    return;
  }
  if (handle.requires === 'betas' && !betas.some(Number.isFinite)) {
    box.innerHTML = `<div class="callout">${esc(handle.label)} needs per-name betas, which need the ${MARKET_PROXY} history. Reload the risk model with a Twelve Data key.</div>`;
    return;
  }

  const currentVol = portfolioVol(risk.weights, risk.cov);
  const result = handle.run({
    cov: risk.cov,
    meanDaily: risk.meanDaily,
    currentWeights: risk.weights,
    betas,
    yields,
    currentVol,
    riskFree: 0.04,
    cap,
    n
  });

  if (!result || !result.weights) {
    box.innerHTML = `<div class="callout callout--clay">${esc(handle.label)} did not produce a feasible answer — with ${n} names a ${state.assumptions.maxWeightPct}% cap may be too tight to reach a full allocation. Raise the cap and try again.</div>`;
    return;
  }

  const target = result.weights;
  const trade = tradesFor({
    holdings: state.valued.holdings,
    targetWeights: target,
    symbols: risk.symbols,
    totalValue: state.valued.totalValue,
    minTradeValue: 1
  });

  const beforeVol = currentVol;
  const afterVol = volFor(target, risk.cov);
  const beforeRet = annualisedFor(risk.returns, risk.symbols, risk.weights);
  const afterRet = annualisedFor(risk.returns, risk.symbols, target);
  const beforeHhi = risk.weights.reduce((a, w) => a + w * w, 0);
  const afterHhi = target.reduce((a, w) => a + w * w, 0);

  const tradeRows = trade.trades
    .filter((t) => t.action !== 'hold')
    .map(
      (t) => `<tr>
        <td><span class="sym">${esc(t.symbol)}</span></td>
        <td class="num"><span class="trade-${t.action}">${t.action === 'buy' ? 'Buy' : 'Sell'} ${t.shares.toLocaleString()}</span></td>
        <td class="num">${money0(t.value)}</td>
        <td class="num">${pct(t.currentWeight)} → ${pct(t.targetWeight)}</td>
      </tr>`
    )
    .join('');

  box.innerHTML = `
    <div class="card card--mint card-pad" style="margin-bottom:0.9rem">
      <p class="eyebrow">${esc(handle.tagline)}</p>
      <p class="t-sm" style="margin-top:0.3rem;max-width:70ch">${esc(handle.description)}</p>
      ${result.converged === false ? `<p class="t-xs" style="margin-top:0.4rem"><strong>Note:</strong> the solver hit its iteration limit; treat these weights as approximate.</p>` : ''}
    </div>

    <div class="grid-4" style="margin-bottom:1rem">
      <div class="metric metric-box"><span class="metric__label">Volatility</span>
        <span class="metric__value">${pct(beforeVol)} → <span class="${afterVol < beforeVol ? 'is-up' : 'is-down'}">${pct(afterVol)}</span></span></div>
      <div class="metric metric-box"><span class="metric__label">Trailing return</span>
        <span class="metric__value">${pct(beforeRet)} → <span class="${afterRet > beforeRet ? 'is-up' : 'is-down'}">${pct(afterRet)}</span></span></div>
      <div class="metric metric-box"><span class="metric__label">Concentration</span>
        <span class="metric__value">${num(beforeHhi, 3)} → <span class="${afterHhi < beforeHhi ? 'is-up' : 'is-down'}">${num(afterHhi, 3)}</span></span></div>
      <div class="metric metric-box"><span class="metric__label">Turnover</span>
        <span class="metric__value">${pctRaw(trade.turnoverPct)}</span>
        <span class="metric__note">${trade.tradeCount} trade${trade.tradeCount === 1 ? '' : 's'}</span></div>
    </div>

    ${tradeRows
      ? `<p class="eyebrow" style="margin-bottom:0.4rem">Trades to get there</p>
         <div class="scroll-x"><table><thead><tr><th>Name</th><th class="num">Action</th><th class="num">Value</th><th class="num">Weight</th></tr></thead>
         <tbody>${tradeRows}</tbody></table></div>
         <p class="t-xs muted" style="margin-top:0.5rem">
           Whole shares only, so the achieved weights drift ${pctRaw(trade.driftPct, 2)} from target in total.
           Prices are the live quotes above; a real fill will differ.
         </p>`
      : `<div class="callout">Your current weights already satisfy this objective — no trades needed.</div>`}`;
}

/**
 * The headlines themselves, rendered without any model.
 *
 * Fetching them and then showing nothing because a *different* key is missing
 * wastes the request and hides data the app already holds. Only the written
 * synthesis needs OpenRouter; the stories do not.
 */
function headlineList(headlines, { synthetic = false } = {}) {
  if (!headlines.length) return '';
  const items = headlines.slice(0, 8).map((h) => {
    const href = safeUrl(h.url);
    const when = h.publishedAt ? new Date(h.publishedAt) : null;
    const stamp = when && !Number.isNaN(when.valueOf()) ? when.toISOString().slice(0, 10) : '';
    const title = href
      ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(h.title)}</a>`
      : esc(h.title);
    return `<li style="margin-bottom:0.5rem">
      <span class="t-sm">${title}</span>
      <span class="co-name">${esc(h.source)}${stamp ? ` · ${esc(stamp)}` : ''}</span>
    </li>`;
  }).join('');

  return `
    <p class="eyebrow" style="margin:0.2rem 0 0.5rem">
      ${headlines.length} headline${headlines.length === 1 ? '' : 's'}${synthetic ? ' · from the demo archive' : ''}
    </p>
    <ul style="list-style:none;padding:0;margin:0">${items}</ul>`;
}

async function writePortfolioNote() {
  const box = el('pf-note');

  if (!state.keys.openRouter) {
    // No model available, but the stories are still worth showing.
    box.innerHTML = `<div class="loading"><div class="spinner"></div><p class="loading__text">Fetching headlines</p></div>`;
    const top = state.valued
      ? [...state.valued.holdings].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 4)
      : [];
    let items = [];
    try {
      items = await getHeadlines(top.map((h) => h.symbol).join(' OR ') || 'markets', { pageSize: 8 });
    } catch (err) {
      box.innerHTML = `<div class="callout callout--clay">${esc(err.message)}</div>`;
      return;
    }
    box.innerHTML = `
      ${headlineList(items, { synthetic: !state.keys.news && state.demo })}
      <div class="callout" style="margin-top:${items.length ? '0.9rem' : '0'}">
        ${items.length
          ? 'These are the stories the note would read. Add an OpenRouter key to have them tied to your holdings and the risk figures above.'
          : 'Add a news key for headlines, and an OpenRouter key for the written read. Everything above is computed without either.'}
      </div>`;
    return;
  }

  if (!state.risk) {
    box.innerHTML = `<div class="callout">Load the risk model first — the note reads the computed risk figures rather than guessing at them.</div>`;
    return;
  }
  box.innerHTML = `<div class="loading"><div class="spinner"></div><p class="loading__text">Reading your book</p></div>`;

  const v = state.valued;
  const top = [...v.holdings].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 6);

  let headlines = [];
  try {
    const query = top.slice(0, 4).map((h) => h.symbol).join(' OR ');
    headlines = await getHeadlines(query, { pageSize: 10 });
  } catch (err) {
    console.warn(`[news] ${err.message}`);
  }

  const handle = state.activeHandle ? HANDLES.find((h) => h.id === state.activeHandle) : null;
  let handleResult = null;
  if (handle && state.risk) {
    const cap = state.assumptions.maxWeightPct / 100;
    const r = handle.run({
      cov: state.risk.cov, meanDaily: state.risk.meanDaily, currentWeights: state.risk.weights,
      betas: state.risk.symbols.map(() => NaN), yields: state.risk.symbols.map(() => NaN),
      currentVol: portfolioVol(state.risk.weights, state.risk.cov), riskFree: 0.04, cap, n: state.risk.symbols.length
    });
    if (r?.weights) {
      const t = tradesFor({
        holdings: v.holdings, targetWeights: r.weights, symbols: state.risk.symbols,
        totalValue: v.totalValue, minTradeValue: 1
      });
      handleResult = {
        label: handle.label,
        beforeVol: portfolioVol(state.risk.weights, state.risk.cov),
        afterVol: volFor(r.weights, state.risk.cov),
        beforeReturn: annualisedFor(state.risk.returns, state.risk.symbols, state.risk.weights),
        afterReturn: annualisedFor(state.risk.returns, state.risk.symbols, r.weights),
        tradeCount: t.tradeCount,
        turnoverPct: t.turnoverPct,
        topTrades: t.trades.filter((x) => x.action !== 'hold').slice(0, 3)
          .map((x) => `${x.action} ${x.shares} ${x.symbol}`).join(', ') || 'none'
      };
    }
  }

  try {
    const prompt = buildPortfolioPrompt({
      summary: {
        positionCount: state.holdings.length,
        pricedCount: v.pricedCount,
        totalValue: v.totalValue,
        totalCost: v.totalCost,
        totalPnl: v.totalPnl,
        totalPnlPct: v.totalPnlPct,
        dayPnl: v.dayPnl,
        dayPnlPct: v.dayPnlPct
      },
      stats: state.risk.stats,
      sectors: sectorAllocation(v.holdings, state.universe.companies),
      concentration: concentration(v.holdings.map((h) => h.weight)),
      topPositions: top,
      headlines,
      handleResult,
      structure: {
        tail: state.risk.tail,
        diversification: state.risk.diversification,
        pairs: state.risk.pairs,
        extremes: state.risk.extremes,
        hitRate: state.risk.hitRate
      }
    });
    const text = await generate(prompt, state.keys.openRouter, { maxTokens: 1300 });
    box.innerHTML = `<div class="note">${markdownToHtml(text)}</div>
      <div style="margin-top:1rem">${headlineList(headlines, { synthetic: !state.keys.news && state.demo })}</div>`;
  } catch (err) {
    box.innerHTML = `<div class="callout callout--clay">${esc(err.message)}</div>`;
  }
}

/* ------------------------------------------------------------- bootstrap --- */

/* =============================================================== thesis tab === */

/**
 * Run the whole thesis: load what the gates need, screen the pool, select the
 * book, size it three ways, and allocate the mandate.
 *
 * The expensive part is history — every momentum and risk gate needs bars, and
 * Twelve Data's free tier bills one credit per symbol at eight per minute. So
 * the loop is sequential with a visible counter and it stops on the first
 * failure rather than hammering a rate limit. Whatever loaded is what the screen
 * runs on, and the header says how many that was: a partial screen reported
 * honestly beats a complete screen built on substituted numbers.
 */
async function runThesis() {
  state.thesisRan = true;
  const btn = el('btn-thesis-run');
  const body = el('thesis-body');
  btn.disabled = true;

  const pool = CANDIDATE_POOL;
  const loaded = [];
  const failures = [];

  const paint = (n) => {
    body.innerHTML = `<div class="card plate card-pad"><div class="loading"><div class="spinner"></div>
      <p class="loading__text">Screening ${n}/${pool.length} candidates</p></div></div>`;
    btn.textContent = `Loading ${n}/${pool.length}`;
  };
  paint(0);

  // The market proxy first: beta is a gate, so without it every candidate would
  // report beta unknown and nothing would qualify.
  if (!state.marketReturns) {
    try {
      const bars = await getBars(MARKET_PROXY, 400);
      if (bars) {
        state.bars.set(MARKET_PROXY, bars);
        state.marketReturns = simpleReturns(bars.map((b) => b.close));
      }
    } catch (err) {
      failures.push(`${MARKET_PROXY}: ${err.message}`);
    }
  }

  if (!state.sectorPe) state.sectorPe = await getSectorPeMap();

  for (const candidate of pool) {
    const { symbol } = candidate;
    try {
      if (!state.bars.has(symbol)) {
        const bars = await getBars(symbol, 400);
        if (bars) state.bars.set(symbol, bars);
      }
      if (!state.fundamentals.has(symbol)) {
        const f = await getFundamentals(symbol);
        if (f) state.fundamentals.set(symbol, f);
      }
      loaded.push(candidate);
      paint(loaded.length);
    } catch (err) {
      // A rate limit is the expected failure on a free tier, and it is terminal
      // for this pass — continuing would just collect more of the same error.
      failures.push(`${symbol}: ${err.message}`);
      break;
    }
  }

  const rows = loaded.map((c) => thesisRow(c));
  const screen = screenPool(rows);
  const book = selectBook(screen.passing);

  let sized = null;
  let risk = null;
  let alloc = null;

  if (book.holdings.length >= 2) {
    const symbols = book.holdings.map((h) => h.symbol);
    const aligned = alignReturns(state.bars, symbols, 60);
    if (aligned.symbols.length >= 2) {
      const cov = covarianceMatrix(aligned.returns, aligned.symbols);
      const meanDaily = meanDailyReturns(aligned.returns, aligned.symbols);
      const scoreBySymbol = new Map(book.holdings.map((h) => [h.symbol, h.score]));
      const scores = aligned.symbols.map((s) => scoreBySymbol.get(s) ?? 0);

      sized = sizeBook({ symbols: aligned.symbols, cov, meanDaily, scores, optimisers: { minVariance, maxSharpe } });
      risk = { aligned, cov, meanDaily, correlation: correlationFromCov(cov) };

      // Every method gets its statistics, so the comparison table is real rather
      // than a claim about the one we picked.
      for (const [label, sizing] of Object.entries(sized)) {
        const w = sizing.weights;
        const series = portfolioReturnSeries(aligned.returns, aligned.symbols, w);
        sizing.stats = {
          ...portfolioRiskStats({ returns: aligned.returns, symbols: aligned.symbols, weights: w, cov, marketReturns: state.marketReturns }),
          vol: volFor(w, cov),
          ret: annualisedFor(aligned.returns, aligned.symbols, w),
          diversification: diversificationRatio(w, cov),
          tail: tailRisk(series, PARAMS.capital, 0.95),
          contributions: riskContributions(w, cov)
        };
      }

      const method = sized[state.thesisMethod] ? state.thesisMethod : HEADLINE_METHOD;
      state.thesisMethod = method;
      const prices = new Map(book.holdings.map((h) => [h.symbol, h.price]));
      alloc = allocate({ symbols: aligned.symbols, weights: sized[method].weights, prices });
      risk.pairs = topCorrelatedPairs(risk.correlation, aligned.symbols, 5);
    }
  }

  state.thesis = { screen, book, sized, risk, alloc, loaded: loaded.length, pool: pool.length, failures };

  btn.disabled = false;
  btn.textContent = 'Re-run the screen';
  renderThesis();
}

/**
 * One candidate row, assembled from whatever the app has loaded. Missing figures
 * stay missing — the gates are built to say so rather than to guess.
 */
function thesisRow(candidate) {
  const { symbol, sector } = candidate;
  const f = state.fundamentals.get(symbol) ?? null;
  const bars = state.bars.get(symbol) ?? null;
  const m = bars ? priceMetrics(bars, state.marketReturns) : null;
  if (m) state.metrics.set(symbol, m);

  const sectorPe = state.sectorPe?.get?.(sector);

  return {
    symbol,
    sector,
    name: findCompany(state.universe.companies, symbol)?.name ?? symbol,
    pe: f?.peTtm ?? NaN,
    eps: f?.epsTtm ?? NaN,
    roe: f?.roe ?? NaN,
    margin: f?.netMargin ?? NaN,
    debtEquity: f?.debtToEquity ?? NaN,
    dividendYield: f?.dividendYield ?? NaN,
    sectorPe: Number.isFinite(sectorPe) ? sectorPe : NaN,
    price: m?.last ?? NaN,
    sma50: m?.sma50 ?? NaN,
    sma200: m?.sma200 ?? NaN,
    mom3m: m?.ret3m ?? NaN,
    vol: m?.vol ?? NaN,
    beta: m?.beta ?? NaN,
    atr: m?.atr14 ?? NaN,
    high52: m?.high52 ?? NaN,
    low52: m?.low52 ?? NaN
  };
}

function renderThesis() {
  const t = state.thesis;
  const body = el('thesis-body');
  if (!t) return;

  const badge = el('thesis-badge');
  badge.textContent = `${t.screen.counts.pass}/${t.loaded} qualify · ${t.book.holdings.length} held`;
  badge.className = t.book.holdings.length >= PARAMS.minNames ? 'tag tag--up' : 'tag tag--accent';

  body.innerHTML = [
    renderThesisStatement(t),
    renderThesisScreen(t),
    t.sized ? renderThesisMethods(t) : renderThesisBlocked(t),
    t.alloc ? renderThesisAllocation(t) : '',
    t.risk ? renderThesisRisk(t) : '',
    renderThesisSignals(t),
    '<div id="thesis-note"></div>'
  ].join('');

  document.querySelectorAll('[data-method]').forEach((b) =>
    b.addEventListener('click', () => {
      state.thesisMethod = b.dataset.method;
      const symbols = t.risk.aligned.symbols;
      const prices = new Map(t.book.holdings.map((h) => [h.symbol, h.price]));
      t.alloc = allocate({ symbols, weights: t.sized[state.thesisMethod].weights, prices });
      renderThesis();
    })
  );
}

function renderThesisStatement(t) {
  const gateRows = GATES.map(
    (g) => `<tr><td class="mono t-xs">${esc(g.group)}</td><td>${esc(g.label)}</td><td class="mono t-xs">${esc(g.rule())}</td></tr>`
  ).join('');

  const partial =
    t.loaded < t.pool
      ? `<div class="callout callout--accent" style="margin-top:0.9rem">
           <strong>Screened ${t.loaded} of ${t.pool} candidates.</strong> Loading stopped early —
           ${esc(t.failures[t.failures.length - 1] ?? 'a data call failed')}.
           The screen ran on what loaded; nothing was substituted for the rest.
         </div>`
      : '';

  return `
    <div class="card plate card-pad">
      <div class="section-head">
        <div>
          <p class="eyebrow">Plate XIII &middot; The thesis</p>
          <h2 style="font-size:var(--t-h1);margin-top:0.2rem">${esc(THESIS.name)}</h2>
        </div>
        <span class="tag tag--neutral mono">${esc(THESIS.short)}</span>
      </div>

      <p class="soft" style="max-width:74ch;margin-top:0.5rem">${esc(THESIS.claim)}</p>

      <div class="grid-3" style="gap:0.9rem;margin-top:1.1rem">
        ${THESIS.why.map((w) => `<p class="t-sm soft">${esc(w)}</p>`).join('')}
      </div>

      <p class="eyebrow" style="margin-top:1.3rem;margin-bottom:0.4rem">The gates &mdash; every one mechanical</p>
      <div class="scroll-x"><table>
        <thead><tr><th>Sleeve</th><th>Test</th><th>Threshold</th></tr></thead>
        <tbody>${gateRows}</tbody>
      </table></div>

      <p class="t-xs muted" style="margin-top:0.7rem">
        A gate whose input is missing counts as <strong>not passed</strong>, never as passed.
        Ranking is a composite z-score across the survivors, weighted
        ${Object.entries(THESIS.sleeveWeights).map(([k, v]) => `${(v * 100).toFixed(0)}% ${k}`).join(' / ')}.
      </p>
      ${partial}
    </div>`;
}

function renderThesisScreen(t) {
  const rows = t.screen.all
    .slice()
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.symbol.localeCompare(b.symbol))
    .map((r) => {
      const held = t.book.holdings.some((h) => h.symbol === r.symbol);
      const tone = r.verdict === 'pass' ? 'is-up' : r.verdict === 'incomplete' ? 'is-flat' : 'is-down';
      const reason =
        r.verdict === 'pass'
          ? held ? 'held' : 'qualified, not selected'
          : r.verdict === 'incomplete'
            ? `no data: ${r.unknown.join(', ')}`
            : r.failed.join(', ');
      return `<tr${held ? ' class="is-selected"' : ''}>
        <td class="mono">${r.rank ?? '—'}</td>
        <td class="mono"><strong>${esc(r.symbol)}</strong></td>
        <td class="t-xs">${esc(r.sector)}</td>
        <td class="mono num">${num(r.pe, 1)}</td>
        <td class="mono num">${Number.isFinite(r.pe / r.sectorPe) ? num(r.pe / r.sectorPe, 2) + '×' : DASH}</td>
        <td class="mono num">${pct(r.roe, 0)}</td>
        <td class="mono num">${pct(r.margin, 1)}</td>
        <td class="mono num">${num(r.debtEquity, 2)}</td>
        <td class="mono num ${signClass(r.mom3m)}">${pct(r.mom3m, 1)}</td>
        <td class="mono num">${pct(r.vol, 1)}</td>
        <td class="mono num">${num(r.beta, 2)}</td>
        <td class="mono num">${num(r.score, 2)}</td>
        <td class="t-xs ${tone}">${esc(reason)}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="card plate card-pad">
      <div class="section-head">
        <div>
          <p class="eyebrow">Plate XIV &middot; The screen</p>
          <h2 style="font-size:var(--t-h1);margin-top:0.2rem">${t.screen.counts.pass} of ${t.loaded} qualify</h2>
          <p class="t-sm soft" style="margin-top:0.3rem;max-width:66ch">
            The rejections are the interesting column. A thesis that admits everything
            is not a thesis, so every name is listed with the gate that stopped it.
          </p>
        </div>
        <div class="row wrap" style="gap:0.4rem">
          <span class="tag tag--up">${t.screen.counts.pass} pass</span>
          <span class="tag tag--down">${t.screen.counts.fail} fail</span>
          ${t.screen.counts.incomplete ? `<span class="tag tag--neutral">${t.screen.counts.incomplete} no data</span>` : ''}
        </div>
      </div>
      <div class="scroll-x" style="margin-top:0.8rem"><table id="thesis-screen-table">
        <thead><tr>
          <th>#</th><th>Ticker</th><th>Sector</th><th class="num">P/E</th><th class="num">vs sector</th>
          <th class="num">ROE</th><th class="num">Margin</th><th class="num">D/E</th>
          <th class="num">3-month</th><th class="num">Vol</th><th class="num">Beta</th>
          <th class="num">Score</th><th>Outcome</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${t.book.relaxations.length
        ? `<div class="callout callout--accent" style="margin-top:0.9rem">
             ${t.book.relaxations.map((r) => `<p class="t-sm">${esc(r)}</p>`).join('')}
           </div>`
        : ''}
    </div>`;
}

function renderThesisMethods(t) {
  const rows = Object.entries(t.sized)
    .map(([label, s]) => {
      const st = s.stats;
      const active = label === state.thesisMethod;
      return `<tr${active ? ' class="is-selected"' : ''}>
        <td>${active ? '<strong>' : ''}${esc(label)}${active ? '</strong>' : ''}${label === HEADLINE_METHOD ? ' <span class="tag tag--accent t-xs">headline</span>' : ''}</td>
        <td class="mono num">${pct(st.vol)}</td>
        <td class="mono num ${signClass(st.ret)}">${pct(st.ret)}</td>
        <td class="mono num">${num(st.sharpe)}</td>
        <td class="mono num is-down">${pct(st.maxDrawdown)}</td>
        <td class="mono num">${num(st.beta)}</td>
        <td class="mono num">${num(st.diversification?.independentBets, 1)}</td>
        <td class="mono num">${money0(st.tail?.varMoney)}</td>
        <td class="mono num">${s.zeroed}</td>
        <td><button class="chip" data-method="${esc(label)}" aria-pressed="${active}">${active ? 'showing' : 'show'}</button></td>
      </tr>`;
    })
    .join('');

  return `
    <div class="card plate card-pad">
      <div class="section-head">
        <div>
          <p class="eyebrow">Plate XV &middot; Sizing</p>
          <h2 style="font-size:var(--t-h1);margin-top:0.2rem">Four ways to weight the same names</h2>
          <p class="t-sm soft" style="margin-top:0.3rem;max-width:70ch">
            Selection and sizing are separate decisions. The screen chose the names;
            these choose the amounts, each solved from scratch over the same
            covariance matrix with a ${pct(PARAMS.maxWeight, 0)} cap and a
            ${pct(PARAMS.minWeight, 0)} floor.
          </p>
        </div>
      </div>
      <div class="scroll-x" style="margin-top:0.8rem"><table id="thesis-method-table">
        <thead><tr>
          <th>Method</th><th class="num">Vol</th><th class="num">Return</th><th class="num">Sharpe</th>
          <th class="num">Max DD</th><th class="num">Beta</th><th class="num">Indep. bets</th>
          <th class="num">VaR 95%</th><th class="num">Zeroed</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="t-xs muted" style="margin-top:0.7rem">
        <strong>Zeroed</strong> counts the selected names each optimiser wanted to hold at
        nothing before the floor was applied. Minimum variance and maximum Sharpe both
        want a corner solution here — the floor is what keeps the portfolio the thesis
        selected. Equal weight is the benchmark the other three have to beat to have
        earned their complexity.
      </p>
    </div>`;
}

function renderThesisBlocked(t) {
  return `
    <div class="card plate card-pad">
      <p class="eyebrow">Plate XV &middot; Sizing</p>
      <h2 style="font-size:var(--t-h1);margin-top:0.2rem">Not enough qualified names to optimise</h2>
      <p class="t-sm soft" style="margin-top:0.4rem;max-width:64ch">
        ${t.book.holdings.length} name${t.book.holdings.length === 1 ? '' : 's'} cleared the gates, and a
        covariance matrix needs at least two with overlapping history. Add a Twelve Data
        key, or turn the demo archive on, so the momentum and risk gates have prices to read.
      </p>
    </div>`;
}

function renderThesisAllocation(t) {
  const a = t.alloc;
  const s = t.sized[state.thesisMethod];
  const symbols = t.risk.aligned.symbols;
  const bySymbol = new Map(t.book.holdings.map((h) => [h.symbol, h]));

  const rows = a.lines
    .slice()
    .sort((x, y) => (y.targetWeight ?? 0) - (x.targetWeight ?? 0))
    .map((l) => {
      const i = symbols.indexOf(l.symbol);
      const h = bySymbol.get(l.symbol);
      const riskShare = s.stats.contributions?.[i];
      // Ochre marks a position supplying more risk than capital — the one place
      // the accent colour is allowed to mean something.
      const hot = Number.isFinite(riskShare) && Number.isFinite(l.actualWeight) && riskShare > l.actualWeight * 1.25;
      return `<tr>
        <td class="mono"><strong>${esc(l.symbol)}</strong></td>
        <td class="t-xs">${esc(h?.sector ?? '')}</td>
        <td class="mono num">${pct(l.targetWeight)}</td>
        <td class="mono num">${money(l.price)}</td>
        <td class="mono num">${l.shares === null ? DASH : l.shares.toLocaleString('en-US')}</td>
        <td class="mono num">${money0(l.value)}</td>
        <td class="mono num">${pct(l.actualWeight)}</td>
        <td class="mono num${hot ? ' is-accent' : ''}">${pct(riskShare)}${hot ? ' ▲' : ''}</td>
      </tr>`;
    })
    .join('');

  const sectors = new Map();
  for (const l of a.lines) {
    const sec = bySymbol.get(l.symbol)?.sector ?? 'Unknown';
    sectors.set(sec, (sectors.get(sec) ?? 0) + (l.value ?? 0));
  }
  const sectorBars = [...sectors.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([sec, v]) => {
      const share = a.invested ? v / a.invested : 0;
      return `<div class="bar-row">
        <span class="bar-row__label t-xs">${esc(sec)}</span>
        <span class="bar-row__track"><span class="bar-row__fill" style="width:${(share * 100).toFixed(1)}%"></span></span>
        <span class="bar-row__value mono t-xs">${pct(share)}</span>
      </div>`;
    })
    .join('');

  return `
    <div class="card plate card-pad">
      <div class="section-head">
        <div>
          <p class="eyebrow">Plate XVI &middot; The allocation</p>
          <h2 style="font-size:var(--t-h1);margin-top:0.2rem">${money0(PARAMS.capital)} deployed</h2>
          <p class="t-sm soft" style="margin-top:0.3rem">
            ${esc(state.thesisMethod)} &middot; whole shares only, so the residual is cash.
          </p>
        </div>
        <div class="grid-3" style="gap:0.9rem;min-width:260px">
          <div class="metric"><span class="metric__label">Invested</span><span class="metric__value">${money0(a.invested)}</span></div>
          <div class="metric"><span class="metric__label">Cash</span><span class="metric__value">${money0(a.cash)}</span></div>
          <div class="metric"><span class="metric__label">Names</span><span class="metric__value">${a.priced}</span></div>
        </div>
      </div>
      <div class="scroll-x" style="margin-top:0.8rem"><table id="thesis-alloc-table">
        <thead><tr>
          <th>Ticker</th><th>Sector</th><th class="num">Target</th><th class="num">Price</th>
          <th class="num">Shares</th><th class="num">Value</th><th class="num">Actual</th><th class="num">Risk share</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="eyebrow" style="margin-top:1.2rem;margin-bottom:0.5rem">By sector</p>
      ${sectorBars}
      <p class="t-xs muted" style="margin-top:0.8rem">
        ▲ marks a position contributing materially more risk than capital. Risk share is
        the position's share of total portfolio variance, which is the number that decides
        what a bad day costs — not the weight.
      </p>
    </div>`;
}

function renderThesisRisk(t) {
  const s = t.sized[state.thesisMethod];
  const st = s.stats;
  const d = st.diversification;
  const tail = st.tail;

  return `
    <div class="card plate card-pad">
      <div class="section-head">
        <div>
          <p class="eyebrow">Plate XVII &middot; Risk</p>
          <h2 style="font-size:var(--t-h1);margin-top:0.2rem">What it costs to be wrong</h2>
        </div>
        <span class="tag tag--neutral mono t-xs">${t.risk.aligned.returns[t.risk.aligned.symbols[0]]?.length ?? 0} overlapping sessions</span>
      </div>

      <div class="grid-4" style="margin-top:0.9rem">
        <div class="metric"><span class="metric__label">Annualised vol</span><span class="metric__value">${pct(st.vol)}</span></div>
        <div class="metric"><span class="metric__label">Annualised return</span><span class="metric__value ${signClass(st.ret)}">${pct(st.ret)}</span></div>
        <div class="metric"><span class="metric__label">Sharpe</span><span class="metric__value">${num(st.sharpe)}</span></div>
        <div class="metric"><span class="metric__label">Max drawdown</span><span class="metric__value is-down">${pct(st.maxDrawdown)}</span></div>
        <div class="metric"><span class="metric__label">Beta to ${MARKET_PROXY}</span><span class="metric__value">${num(st.beta)}</span></div>
      </div>

      <div class="grid-2" style="gap:1.1rem;margin-top:1.2rem">
        <div>
          <p class="eyebrow" style="margin-bottom:0.4rem">A bad day, in money</p>
          <p class="t-sm soft">
            On the worst 5% of sessions in this window, a ${money0(PARAMS.capital)} book loses
            <strong>${money0(Math.abs(tail?.varMoney ?? NaN))}</strong> or more. When that
            happens, the average loss is <strong>${money0(Math.abs(tail?.esMoney ?? NaN))}</strong>.
          </p>
          <p class="t-xs muted" style="margin-top:0.4rem">
            Read from the realised distribution, not a normal curve — the tail is where the
            normal assumption is most wrong and it matters most.
          </p>
        </div>
        <div>
          <p class="eyebrow" style="margin-bottom:0.4rem">Is the diversification real?</p>
          <p class="t-sm soft">
            ${t.book.holdings.length} positions behave like
            <strong>${num(d?.independentBets, 1)} independent bets</strong>
            (diversification ratio ${num(d?.ratio)}). Everything above that number is
            the same bet held more than once.
          </p>
          ${t.risk.pairs?.length
            ? `<p class="t-xs muted" style="margin-top:0.4rem">Most correlated:
                 ${t.risk.pairs.slice(0, 3).map((p) => `${esc(p.a)}/${esc(p.b)} ${num(p.rho)}`).join(' · ')}</p>`
            : ''}
        </div>
      </div>
    </div>`;
}

function renderThesisSignals(t) {
  if (!t.book.holdings.length) return '';
  const cards = t.book.holdings
    .map((h) => {
      const signals = signalSummary(h);
      if (!signals.length) return '';
      return `<div class="signal-card">
        <div class="row" style="justify-content:space-between;align-items:baseline">
          <span class="mono"><strong>${esc(h.symbol)}</strong></span>
          <span class="mono t-xs muted">${money(h.price)}</span>
        </div>
        ${signals
          .map(
            (s) => `<div class="signal-row">
              <span class="t-xs muted">${esc(s.label)}</span>
              <span class="mono t-xs is-${esc(s.tone)}">${esc(s.value)}</span>
            </div>`
          )
          .join('')}
      </div>`;
    })
    .join('');

  return `
    <div class="card plate card-pad">
      <div class="section-head">
        <div>
          <p class="eyebrow">Plate XVIII &middot; Signals</p>
          <h2 style="font-size:var(--t-h1);margin-top:0.2rem">Where each holding stands</h2>
          <p class="t-sm soft" style="margin-top:0.3rem;max-width:66ch">
            State, not advice: distance from the two moving averages, position in the
            52-week range, and the stop two average true ranges below the last close.
          </p>
        </div>
      </div>
      <div class="signal-grid" style="margin-top:0.9rem">${cards}</div>
    </div>`;
}

/**
 * The executive commentary. The model is handed the computed figures and asked
 * to explain them; it is never asked for a number. Without a key the panel says
 * what the key would add rather than pretending a model ran.
 */
async function writeThesisNote() {
  const t = state.thesis;
  const box = el('thesis-note');
  if (!t || !box) return;
  if (!t.sized) {
    toast('Run the screen first — there is nothing to comment on yet.', 'accent');
    return;
  }
  if (!state.keys.openRouter) {
    box.innerHTML = `
      <div class="card plate card-pad">
        <p class="eyebrow">Plate XIX &middot; Executive commentary</p>
        <h2 style="font-size:var(--t-h1);margin-top:0.2rem">This one needs a model</h2>
        <p class="t-sm soft" style="margin-top:0.4rem;max-width:64ch">
          Every figure above was computed here and is real. The commentary is the one
          thing the archive does not fake: writing "AI-generated" prose with no model
          call would be the single piece of invention that actually misleads. Add an
          OpenRouter key and this panel explains the book in the committee's language.
        </p>
      </div>`;
    return;
  }

  const s = t.sized[state.thesisMethod];
  box.innerHTML = `<div class="card plate card-pad"><div class="loading"><div class="spinner"></div>
    <p class="loading__text">Writing the commentary</p></div></div>`;

  const symbols = t.risk.aligned.symbols;
  const prompt = buildThesisPrompt({
    thesis: THESIS,
    params: PARAMS,
    method: state.thesisMethod,
    counts: t.screen.counts,
    loaded: t.loaded,
    pool: t.pool,
    holdings: t.alloc.lines.map((l) => {
      const i = symbols.indexOf(l.symbol);
      const h = t.book.holdings.find((x) => x.symbol === l.symbol);
      return {
        symbol: l.symbol,
        sector: h?.sector ?? null,
        rank: h?.rank ?? null,
        weight: l.actualWeight,
        value: l.value,
        riskShare: s.stats.contributions?.[i] ?? null,
        pe: h?.pe ?? null,
        relativePe: Number.isFinite(h?.pe / h?.sectorPe) ? h.pe / h.sectorPe : null,
        roe: h?.roe ?? null,
        mom3m: h?.mom3m ?? null
      };
    }),
    rejected: t.screen.all
      .filter((r) => r.verdict !== 'pass')
      .map((r) => ({ symbol: r.symbol, sector: r.sector, reasons: r.failed.length ? r.failed : r.unknown })),
    stats: {
      vol: s.stats.vol,
      ret: s.stats.ret,
      sharpe: s.stats.sharpe,
      maxDrawdown: s.stats.maxDrawdown,
      beta: s.stats.beta,
      independentBets: s.stats.diversification?.independentBets ?? null,
      varMoney: s.stats.tail?.varMoney ?? null,
      esMoney: s.stats.tail?.esMoney ?? null,
      capital: PARAMS.capital,
      invested: t.alloc.invested,
      cash: t.alloc.cash
    },
    comparison: Object.entries(t.sized).map(([label, x]) => ({
      method: label,
      vol: x.stats.vol,
      ret: x.stats.ret,
      sharpe: x.stats.sharpe,
      zeroed: x.zeroed
    })),
    pairs: t.risk.pairs ?? [],
    synthetic: useDemo('twelve') || useDemo('fmp')
  });

  try {
    const text = await generate(prompt, state.keys.openRouter);
    box.innerHTML = `
      <div class="card plate card-pad">
        <div class="section-head">
          <div>
            <p class="eyebrow">Plate XIX &middot; Executive commentary</p>
            <h2 style="font-size:var(--t-h1);margin-top:0.2rem">The committee read</h2>
          </div>
          <span class="tag tag--neutral t-xs">written from the figures above</span>
        </div>
        <div class="note" style="margin-top:0.8rem">${markdownToHtml(text)}</div>
        <p class="t-xs muted" style="margin-top:0.9rem">
          The model received the computed figures and explained them. It calculated
          nothing and was given no licence to add a number.
        </p>
      </div>`;
  } catch (err) {
    box.innerHTML = `<div class="card plate card-pad">
      <p class="eyebrow">Plate XIX &middot; Executive commentary</p>
      <p class="t-sm is-down" style="margin-top:0.4rem">Commentary: ${esc(err.message)}</p>
    </div>`;
  }
}

async function bootstrapData() {
  renderTape();

  // The real constituent list, when a key allows it.
  if (state.keys.fmp && state.universe.source !== 'fmp') {
    try {
      state.universe = await loadFullUniverse(state.keys.fmp, fetchJson);
      toast(`Loaded ${state.universe.companies.length} S&P 500 constituents from FMP.`);
    } catch (err) {
      // The constituent list is a paid FMP endpoint. Falling back to the bundled
      // subset is the designed behaviour, not a failure, so this is stated once
      // and quietly — the universe badge already says which list is in use.
      const restricted = /\b402\b|restricted|not available under your current subscription/i.test(err.message);
      toast(
        restricted
          ? 'The full constituent list is a paid FMP endpoint — using the bundled 121-name subset. Everything else works normally.'
          : `Constituent list: ${err.message} — using the bundled subset.`,
        restricted ? 'mint' : 'accent'
      );
    }
  }
  renderUniverseBadge();
  renderSectorChips();
  renderScreener();

  if (!state.sectorPe) {
    state.sectorPe = await getSectorPeMap();
  }
  if (!state.marketReturns) {
    try {
      const bars = await getBars(MARKET_PROXY, 400);
      if (bars) {
        state.bars.set(MARKET_PROXY, bars);
        state.marketReturns = simpleReturns(bars.map((b) => b.close));
      }
    } catch {
      /* beta stays unavailable */
    }
  }
}

function renderUniverseBadge() {
  const u = state.universe;
  const badge = el('universe-badge');
  if (u.source === 'fmp') {
    badge.textContent = `Universe: ${u.companies.length} constituents (live from FMP)`;
    badge.className = 'tag tag--up';
  } else if (state.demo && !state.keys.fmp) {
    badge.textContent = `Universe: ${u.companies.length} names · ${DEMO_SYMBOLS.length - 1} with demo data`;
    badge.className = 'tag tag--accent';
    badge.title = 'The screener lists the bundled subset; the demo archive carries prices and fundamentals for its own names';
  } else {
    badge.textContent = `Universe: ${u.companies.length}-name bundled subset`;
    badge.className = 'tag tag--neutral';
    badge.title = 'Add an FMP key to load the full S&P 500 constituent list';
  }
}

function wireAssumptions() {
  const bind = (id, out, key, fmt) => {
    const input = el(id);
    const update = () => {
      const value = Number(input.value);
      state.assumptions[key] = value;
      if (out) el(out).textContent = fmt(value);
      if (state.selected) selectCompany(state.selected);
    };
    input.addEventListener('change', update);
    if (input.type === 'range') input.addEventListener('input', () => {
      if (out) el(out).textContent = fmt(Number(input.value));
    });
  };

  bind('a-portfolio', null, 'portfolioValue', (v) => String(v));
  bind('a-risk', 'a-risk-out', 'riskPerTradePct', (v) => `${v.toFixed(2)}%`);
  bind('a-mos', 'a-mos-out', 'marginOfSafety', (v) => `${v}%`);
  bind('a-rr', 'a-rr-out', 'minRewardRisk', (v) => `${v.toFixed(1)}:1`);
  bind('a-atr', 'a-atr-out', 'atrStopMultiple', (v) => `${v.toFixed(1)}x`);
  bind('a-maxw', 'a-maxw-out', 'maxWeightPct', (v) => `${v}%`);
}

function init() {
  loadKeys();
  // First visit with no keys: start in demo mode rather than showing a grid of
  // em dashes. `DEMO_STORE` records a deliberate choice either way, so turning it
  // off stays off — the default only applies before any choice has been made.
  try {
    const stored = localStorage.getItem(DEMO_STORE);
    if (stored === '1') state.demo = true;
    else if (stored === '0') state.demo = false;
    else state.demo = keyCount() === 0;
  } catch {
    state.demo = keyCount() === 0;
  }
  // Order matters: the demo flag is resolved after loadKeys() ran, so the badges
  // it painted are stale — repaint them before anything is shown.
  renderDemoBanner();
  if (state.demo && !state.keys.twelve) primeDemoMetrics();
  renderKeyStatus();

  VIEWS.forEach((name) => el(`tab-${name}`).addEventListener('click', () => setView(name)));
  setView(viewFromHash());
  window.addEventListener('hashchange', () => setView(viewFromHash()));

  el('btn-thesis-run').addEventListener('click', runThesis);
  el('btn-thesis-note').addEventListener('click', writeThesisNote);

  el('btn-keys').addEventListener('click', openModal);
  el('btn-keys-close').addEventListener('click', closeModal);
  el('btn-keys-save').addEventListener('click', saveKeys);
  el('btn-keys-clear').addEventListener('click', () => {
    ['k-twelve', 'k-fmp', 'k-news', 'k-openrouter'].forEach((id) => (el(id).value = ''));
    try { localStorage.removeItem(KEY_STORE); } catch { /* ignore */ }
    state.keys = { twelve: '', fmp: '', news: '', openRouter: '' };
    renderKeyStatus();
    renderDemoBanner();
    toast('Keys cleared from this browser.');
  });
  el('keys-overlay').addEventListener('click', (e) => {
    if (e.target === el('keys-overlay')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el('keys-overlay').hidden) closeModal();
  });

  el('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderScreener();
  });
  ['f-pe-max', 'f-yield-min', 'f-vol-max', 'f-mom-min'].forEach((id) =>
    el(id).addEventListener('input', renderScreener)
  );
  el('btn-load-metrics').addEventListener('click', loadVisibleMetrics);
  el('btn-themes').addEventListener('click', findThemes);

  document.querySelectorAll('#screener-table th.sortable').forEach((th) =>
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      state.sort = state.sort.field === field ? { field, dir: -state.sort.dir } : { field, dir: field === 'symbol' ? 1 : -1 };
      renderScreener();
    })
  );

  // Import
  const dz = el('dropzone');
  el('btn-choose').addEventListener('click', () => el('file-input').click());
  el('file-input').addEventListener('change', (e) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  });
  el('btn-demo-book').addEventListener('click', () => {
    // Ten names the archive prices, so the risk model and every handle run.
    if (!state.demo) setDemo(true);
    const rows = [['ticker', 'quantity', 'cost_basis']].concat(
      DEMO_PORTFOLIO.map((h) => [h.symbol, String(h.quantity), String(h.costBasis)])
    );
    ingestRows(rows, 'demo-book.csv (synthetic)');
  });

  el('btn-demo-on').addEventListener('click', () => setDemo(true));
  el('btn-demo-modal').addEventListener('click', () => { closeModal(); setDemo(true); });
  ['dragenter', 'dragover'].forEach((evt) =>
    dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.add('is-over'); })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.remove('is-over'); })
  );
  dz.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  wireAssumptions();
  renderUniverseBadge();
  renderSectorChips();
  renderScreener();
  bootstrapData();
}

init();
