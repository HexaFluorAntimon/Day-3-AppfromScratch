// Runs the thesis end to end against the deterministic demo archive and prints
// the result. This is how the written deliverables get their figures: the FRD,
// the executive summary and the committee deck quote this output rather than
// numbers typed by hand, so a change to a threshold shows up in the documents
// instead of quietly contradicting them.
//
//   node scripts/run-thesis.mjs          human-readable
//   node scripts/run-thesis.mjs --json   machine-readable

import { DEMO_NAMES, DEMO_SECTOR_PE, demoBars } from '../src/demo.js';
import { CANDIDATE_POOL, PARAMS, THESIS, HEADLINE_METHOD, screenPool, selectBook, sizeBook, allocate, signalSummary } from '../src/thesis.js';
import { priceMetrics, simpleReturns, sma } from '../src/analysis.js';
import { alignReturns, covarianceMatrix, correlationFromCov, portfolioRiskStats, portfolioReturnSeries, tailRisk, diversificationRatio, riskContributions, topCorrelatedPairs } from '../src/portfolio.js';
import { minVariance, maxSharpe, meanDailyReturns, annualisedFor, volFor } from '../src/optimize.js';

const asJson = process.argv.includes('--json');
const fundamental = new Map(DEMO_NAMES.map((n) => [n.symbol, n]));

/* --- assemble the candidate rows exactly as the browser would --- */

const marketBars = demoBars('SPY');
const marketReturns = simpleReturns(marketBars.map((b) => b.close));
const barsBySymbol = new Map([['SPY', marketBars]]);

const rows = CANDIDATE_POOL.map((c) => {
  const f = fundamental.get(c.symbol);
  const bars = demoBars(c.symbol);
  barsBySymbol.set(c.symbol, bars);
  const m = priceMetrics(bars, marketReturns);
  const closes = bars.map((b) => b.close);
  const sma200 = sma(closes, 200);

  return {
    symbol: c.symbol,
    sector: c.sector,
    pe: f.pe,
    eps: f.eps,
    roe: f.roe,
    margin: f.margin,
    debtEquity: f.de,
    dividendYield: f.yield,
    sectorPe: DEMO_SECTOR_PE.get(c.sector) ?? NaN,
    price: m.last,
    sma50: m.sma50,
    sma200,
    mom3m: m.ret3m,
    vol: m.vol,
    beta: m.beta,
    atr: m.atr14,
    high52: m.high52,
    low52: m.low52
  };
});

/* --- screen, select, optimise, allocate --- */

const screen = screenPool(rows);
const book = selectBook(screen.passing);
const symbols = book.holdings.map((h) => h.symbol);
const prices = new Map(book.holdings.map((h) => [h.symbol, h.price]));

const aligned = alignReturns(barsBySymbol, symbols, 60);
const cov = covarianceMatrix(aligned.returns, aligned.symbols);
const meanDaily = meanDailyReturns(aligned.returns, aligned.symbols);

const cap = PARAMS.maxWeight;
// Scores must be in the same order as `aligned.symbols`, which alignReturns may
// have reordered or shortened relative to the book.
const scoreBySymbol = new Map(book.holdings.map((h) => [h.symbol, h.score]));
const scores = aligned.symbols.map((s) => scoreBySymbol.get(s) ?? 0);

const sized = sizeBook({ symbols: aligned.symbols, cov, meanDaily, scores, optimisers: { minVariance, maxSharpe } });

const report = {};
for (const [label, sizing] of Object.entries(sized)) {
  const w = sizing.weights;
  const stats = portfolioRiskStats({
    returns: aligned.returns,
    symbols: aligned.symbols,
    weights: w,
    cov,
    marketReturns
  });
  const series = portfolioReturnSeries(aligned.returns, aligned.symbols, w);
  report[label] = {
    weights: w,
    bandShift: sizing.bandShift,
    zeroed: sizing.zeroed,
    vol: volFor(w, cov),
    ret: annualisedFor(aligned.returns, aligned.symbols, w),
    sharpe: stats.sharpe,
    maxDrawdown: stats.maxDrawdown,
    beta: stats.beta,
    diversification: diversificationRatio(w, cov),
    tail: tailRisk(series, PARAMS.capital, 0.95)
  };
}

const headline = HEADLINE_METHOD;
const chosen = report[headline];
const alloc = allocate({ symbols: aligned.symbols, weights: chosen.weights, prices, capital: PARAMS.capital });
const contributions = riskContributions(chosen.weights, cov);
const pairs = topCorrelatedPairs(correlationFromCov(cov), aligned.symbols, 5);

/* --- output --- */

const pctf = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const numf = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

if (asJson) {
  console.log(JSON.stringify({ thesis: THESIS.short, params: PARAMS, screen, book, report, alloc, contributions, pairs, alignedSymbols: aligned.symbols, sessions: aligned.returns[aligned.symbols[0]]?.length ?? null }, null, 2));
} else {
  console.log(`\n=== ${THESIS.name} (${THESIS.short}) ===\n`);
  console.log(`Pool ${screen.counts.pool} · pass ${screen.counts.pass} · fail ${screen.counts.fail} · incomplete ${screen.counts.incomplete}\n`);

  console.log('--- SCREEN ---');
  console.log('RANK SYM   SECTOR                    P/E   REL   ROE   MRGN  D/E   3M      VOL    BETA  SCORE  VERDICT');
  for (const r of screen.all.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))) {
    console.log(
      String(r.rank ?? '-').padStart(4),
      r.symbol.padEnd(6),
      r.sector.slice(0, 24).padEnd(25),
      numf(r.pe, 1).padStart(5),
      numf(r.pe / r.sectorPe, 2).padStart(5),
      pctf(r.roe, 0).padStart(5),
      pctf(r.margin, 1).padStart(6),
      numf(r.debtEquity, 2).padStart(5),
      pctf(r.mom3m, 1).padStart(7),
      pctf(r.vol, 1).padStart(6),
      numf(r.beta, 2).padStart(5),
      numf(r.score, 3).padStart(6),
      ' ' + r.verdict + (r.failed.length ? `  (${r.failed.join(', ')})` : '')
    );
  }

  console.log(`\n--- BOOK: ${book.holdings.length} names, ${new Set(book.holdings.map((h) => h.sector)).size} sectors ---`);
  book.relaxations.forEach((r) => console.log('  ! ' + r));

  console.log('\n--- METHOD COMPARISON ---');
  console.log('METHOD              VOL     RET     SHARPE  MAXDD   BETA   DIVRATIO  INDEP BETS  VaR95($)   ES95($)  ZEROED  BANDSHIFT');
  for (const [label, r] of Object.entries(report)) {
    console.log(
      label.padEnd(20),
      pctf(r.vol).padStart(6),
      pctf(r.ret).padStart(7),
      numf(r.sharpe).padStart(7),
      pctf(r.maxDrawdown).padStart(7),
      numf(r.beta).padStart(6),
      numf(r.diversification?.ratio).padStart(9),
      numf(r.diversification?.independentBets, 1).padStart(11),
      Math.round(r.tail?.varMoney ?? 0).toLocaleString('en-US').padStart(10),
      Math.round(r.tail?.esMoney ?? 0).toLocaleString('en-US').padStart(9),
      String(r.zeroed).padStart(6),
      pctf(r.bandShift).padStart(10),
      label === headline ? '   <- headline' : ''
    );
  }

  console.log(`\n--- $${(PARAMS.capital / 1e6).toFixed(1)}M ALLOCATION (${headline}, ${pctf(cap, 0)} cap) ---`);
  console.log('SYM   SECTOR                    TARGET   PRICE      SHARES      VALUE    ACTUAL  RISK SHARE');
  alloc.lines
    .slice()
    .sort((a, b) => (b.targetWeight ?? 0) - (a.targetWeight ?? 0))
    .forEach((l) => {
      const i = aligned.symbols.indexOf(l.symbol);
      const row = book.holdings.find((h) => h.symbol === l.symbol);
      console.log(
        l.symbol.padEnd(6),
        (row?.sector ?? '').slice(0, 24).padEnd(25),
        pctf(l.targetWeight).padStart(6),
        ('$' + numf(l.price)).padStart(9),
        String(l.shares ?? '—').padStart(8),
        ('$' + Math.round(l.value ?? 0).toLocaleString('en-US')).padStart(11),
        pctf(l.actualWeight).padStart(7),
        pctf(contributions?.[i]).padStart(11)
      );
    });
  console.log(`\nInvested $${Math.round(alloc.invested).toLocaleString('en-US')} · residual cash $${Math.round(alloc.cash).toLocaleString('en-US')} · ${alloc.priced}/${alloc.lines.length} priced`);

  console.log('\n--- MOST CORRELATED PAIRS ---');
  pairs.forEach((p) => console.log(`  ${p.a}/${p.b}  ${numf(p.rho)}`));

  console.log('\n--- SIGNALS (first 5) ---');
  book.holdings.slice(0, 5).forEach((h) => {
    console.log(`  ${h.symbol}: ` + signalSummary(h).map((s) => `${s.label} ${s.value}`).join(' · '));
  });
  console.log(`\nSessions of overlapping history: ${aligned.returns[aligned.symbols[0]]?.length ?? '—'}\n`);
}
