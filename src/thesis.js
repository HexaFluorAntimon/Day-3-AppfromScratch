// The investment thesis, as code.
//
// Quality at a Reasonable Price, with momentum confirmation (QARP-M).
//
// The point of putting the thesis in a module rather than in prose is that the
// screen becomes reproducible: the same function decides what the dashboard
// shows and what the written documents claim, so the two cannot drift apart.
//
// Nothing here invents an input. Every gate returns `true`, `false`, or `null`,
// and `null` means "this rule could not be evaluated because a figure is
// missing". A rule that cannot be evaluated never counts as a pass — a name with
// unknown profitability is not a quality name, it is an unknown one.

/* ------------------------------------------------------------------ thesis --- */

export const THESIS = {
  id: 'qarp-m',
  name: 'Quality at a Reasonable Price, with momentum confirmation',
  short: 'QARP-M',
  claim:
    'Two things are persistently rewarded in US large caps and are only weakly ' +
    'correlated with each other: paying below your sector for above-average ' +
    'profitability, and not standing in front of a downtrend. Value on its own ' +
    'buys falling knives; momentum on its own buys crowded trades. The ' +
    'intersection is a smaller list and a better-behaved one.',
  why: [
    'Quality is a persistence argument. High return on equity and a wide net margin ' +
      'are the observable residue of pricing power, and pricing power is the thing ' +
      'that survives a bad year. Low leverage keeps the survival from depending on ' +
      'the refinancing window.',
    'Valuation is measured against the sector, never against the market. A utility ' +
      'on 19x and a software name on 19x are not the same purchase, and a screen ' +
      'that treats them alike simply buys whichever sector is cheapest that decade.',
    'Momentum is used as a veto, not as a reason. It does not tell us what to buy; ' +
      'it tells us to wait on something the tape currently disagrees with. This is ' +
      'the cheapest available protection against the classic value failure mode.'
  ],
  // Sleeve weights in the composite. These are a judgement, not a fitted result,
  // and the documents say so — see the known-weaknesses section.
  sleeveWeights: { quality: 0.40, value: 0.35, momentum: 0.25 }
};

/**
 * The ten-name core sleeve: the concentrated expression of the thesis, one name
 * per sector so that the sleeve is a statement about businesses rather than
 * about a sector call. The portfolio proper widens this to twenty.
 */
export const CORE_UNIVERSE = [
  { symbol: 'MSFT',  sector: 'Information Technology', why: 'Software economics at scale — margin and return on equity that a downturn compresses rather than removes.' },
  { symbol: 'GOOGL', sector: 'Communication Services', why: 'The cheapest of the large platforms on trailing earnings, and the only one whose balance sheet carries almost no debt.' },
  { symbol: 'JPM',   sector: 'Financials',             why: 'A mid-teens multiple against the sector, with the deposit franchise that makes the earnings less rate-fragile than a pure lender.' },
  { symbol: 'UNH',   sector: 'Health Care',            why: 'Thin margin by design, but return on equity and cash conversion that the multiple does not reflect.' },
  { symbol: 'XOM',   sector: 'Energy',                 why: 'Lowest leverage in the sector. Held for the balance sheet, not for a view on the oil price.' },
  { symbol: 'CAT',   sector: 'Industrials',            why: 'Cyclical, and priced as if the cycle were the whole story — return on equity says otherwise.' },
  { symbol: 'PG',    sector: 'Consumer Staples',       why: 'The volatility anchor. Beta near 0.4 is what lets the rest of the book take risk.' },
  { symbol: 'LIN',   sector: 'Materials',              why: 'Industrial gas is a toll road with contracts — quality that is usually mistaken for a commodity.' },
  { symbol: 'NEE',   sector: 'Utilities',              why: 'Regulated base plus the largest renewables pipeline; the growth is contracted rather than hoped for.' },
  { symbol: 'AMT',   sector: 'Real Estate',            why: 'Long leases with escalators. Included knowing leverage is the weak point, which the gate flags.' }
];

/**
 * The candidate pool the screen runs over. With an FMP key the app screens the
 * real constituent list instead; this is the offline pool, and it is a pool of
 * candidates, not a portfolio — membership here confers nothing.
 */
export const CANDIDATE_POOL = [
  { symbol: 'AAPL',  sector: 'Information Technology' },
  { symbol: 'MSFT',  sector: 'Information Technology' },
  { symbol: 'NVDA',  sector: 'Information Technology' },
  { symbol: 'AVGO',  sector: 'Information Technology' },
  { symbol: 'ORCL',  sector: 'Information Technology' },
  { symbol: 'CSCO',  sector: 'Information Technology' },
  { symbol: 'TXN',   sector: 'Information Technology' },
  { symbol: 'ACN',   sector: 'Information Technology' },
  { symbol: 'GOOGL', sector: 'Communication Services' },
  { symbol: 'META',  sector: 'Communication Services' },
  { symbol: 'JPM',   sector: 'Financials' },
  { symbol: 'V',     sector: 'Financials' },
  { symbol: 'MA',    sector: 'Financials' },
  { symbol: 'BAC',   sector: 'Financials' },
  { symbol: 'WFC',   sector: 'Financials' },
  { symbol: 'GS',    sector: 'Financials' },
  { symbol: 'LLY',   sector: 'Health Care' },
  { symbol: 'JNJ',   sector: 'Health Care' },
  { symbol: 'UNH',   sector: 'Health Care' },
  { symbol: 'ABBV',  sector: 'Health Care' },
  { symbol: 'MRK',   sector: 'Health Care' },
  { symbol: 'ABT',   sector: 'Health Care' },
  { symbol: 'AMZN',  sector: 'Consumer Discretionary' },
  { symbol: 'HD',    sector: 'Consumer Discretionary' },
  { symbol: 'MCD',   sector: 'Consumer Discretionary' },
  { symbol: 'TJX',   sector: 'Consumer Discretionary' },
  { symbol: 'XOM',   sector: 'Energy' },
  { symbol: 'CVX',   sector: 'Energy' },
  { symbol: 'COP',   sector: 'Energy' },
  { symbol: 'CAT',   sector: 'Industrials' },
  { symbol: 'HON',   sector: 'Industrials' },
  { symbol: 'GE',    sector: 'Industrials' },
  { symbol: 'RTX',   sector: 'Industrials' },
  { symbol: 'UNP',   sector: 'Industrials' },
  { symbol: 'DE',    sector: 'Industrials' },
  { symbol: 'PG',    sector: 'Consumer Staples' },
  { symbol: 'KO',    sector: 'Consumer Staples' },
  { symbol: 'WMT',   sector: 'Consumer Staples' },
  { symbol: 'COST',  sector: 'Consumer Staples' },
  { symbol: 'PEP',   sector: 'Consumer Staples' },
  { symbol: 'NEE',   sector: 'Utilities' },
  { symbol: 'SO',    sector: 'Utilities' },
  { symbol: 'AMT',   sector: 'Real Estate' },
  { symbol: 'PLD',   sector: 'Real Estate' },
  { symbol: 'LIN',   sector: 'Materials' },
  { symbol: 'APD',   sector: 'Materials' },
  { symbol: 'SHW',   sector: 'Materials' }
];

/* ------------------------------------------------------------------- gates --- */

/**
 * The construction parameters. Every threshold that decides an outcome lives
 * here rather than in the middle of a function, so the FRD can quote the source
 * of truth and the numbers cannot disagree with the document.
 */
export const PARAMS = {
  minRoe: 0.12,          // return on equity floor
  minMargin: 0.08,       // net margin floor
  maxDebtEquity: 2.5,    // leverage ceiling
  maxSectorPremium: 1.25, // trailing P/E as a multiple of the sector median
  minMom3m: -0.02,       // a shallow pullback is tolerated, a downtrend is not
  maxVol: 0.45,          // annualised volatility ceiling
  maxBeta: 1.5,
  targetNames: 20,       // the book we want
  minNames: 15,          // the floor the assignment sets
  maxPerSector: 3,       // diversification cap on selection
  maxWeight: 0.12,       // position cap handed to the optimiser
  minWeight: 0.02,       // position floor — see applyFloor for why this exists
  tiltLambda: 0.6,       // how far conviction may move the risk model's answer
  riskFree: 0.04,
  capital: 1_000_000     // the mandate being pitched
};

/**
 * Push a weight vector inside [floor, cap] without changing what the optimiser
 * was trying to say.
 *
 * This exists because an unconstrained optimiser answers a different question
 * from the one being asked. Run min-variance or max-Sharpe over eighteen names
 * and it will happily hand back a corner solution — a handful of names pinned at
 * the cap and the rest at exactly zero. Mathematically that is the optimum of
 * the stated objective. As a portfolio it is a claim that the covariance matrix
 * is known precisely enough to justify dropping seven names the thesis selected,
 * which it is not: these are sample estimates from one window.
 *
 * So selection and sizing are kept as separate decisions. The screen decides
 * *what* is held and the optimiser decides *how much*, within a band. Water-fill
 * iteratively: lift anything under the floor, cap anything over, and rescale the
 * unpinned remainder — repeating because rescaling can push a new name out of
 * the band.
 */
export function applyFloor(weights, floor = PARAMS.minWeight, cap = PARAMS.maxWeight) {
  const n = weights.length;
  if (!n) return [];
  // An infeasible band is a caller error worth surfacing rather than silently
  // returning something that satisfies neither bound.
  if (floor * n > 1 + 1e-9) throw new Error(`floor ${floor} × ${n} names exceeds 100%`);
  if (cap * n < 1 - 1e-9) throw new Error(`cap ${cap} × ${n} names cannot reach 100%`);

  let w = weights.map((x) => (Number.isFinite(x) ? Math.max(x, 0) : 0));
  const total = w.reduce((a, b) => a + b, 0);
  w = total > 0 ? w.map((x) => x / total) : new Array(n).fill(1 / n);

  for (let pass = 0; pass < 100; pass++) {
    const pinned = w.map((x) => x <= floor + 1e-12 || x >= cap - 1e-12);
    const pinnedMass = w.reduce((a, x, i) => a + (pinned[i] ? Math.min(Math.max(x, floor), cap) : 0), 0);
    const freeMass = 1 - pinnedMass;
    const freeSum = w.reduce((a, x, i) => a + (pinned[i] ? 0 : x), 0);

    const next = w.map((x, i) => {
      if (pinned[i]) return Math.min(Math.max(x, floor), cap);
      return freeSum > 0 ? (x / freeSum) * freeMass : freeMass / Math.max(1, pinned.filter((p) => !p).length);
    });
    const clamped = next.map((x) => Math.min(Math.max(x, floor), cap));
    const drift = clamped.reduce((a, x, i) => a + Math.abs(x - w[i]), 0);
    w = clamped;
    if (drift < 1e-10) break;
  }

  // Final renormalisation: the clamping above can leave the sum a hair off 1.
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

/**
 * A gate is a named predicate over one candidate row. `test` returns:
 *   true  — the rule is satisfied
 *   false — the rule is violated
 *   null  — the rule cannot be evaluated, because an input is missing
 *
 * The three-valued return is the whole reason this is a table of functions and
 * not a chain of `&&`. A missing P/E must be distinguishable from a bad one.
 */
export const GATES = [
  {
    id: 'roe',
    group: 'Quality',
    label: 'Return on equity',
    rule: () => `ROE ≥ ${(PARAMS.minRoe * 100).toFixed(0)}%`,
    read: (r) => r.roe,
    format: (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—'),
    test: (r) => (Number.isFinite(r.roe) ? r.roe >= PARAMS.minRoe : null)
  },
  {
    id: 'margin',
    group: 'Quality',
    label: 'Net margin',
    rule: () => `margin ≥ ${(PARAMS.minMargin * 100).toFixed(0)}%`,
    read: (r) => r.margin,
    format: (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—'),
    test: (r) => (Number.isFinite(r.margin) ? r.margin >= PARAMS.minMargin : null)
  },
  {
    id: 'leverage',
    group: 'Quality',
    label: 'Debt / equity',
    rule: () => `D/E ≤ ${PARAMS.maxDebtEquity.toFixed(1)}`,
    read: (r) => r.debtEquity,
    format: (v) => (Number.isFinite(v) ? v.toFixed(2) : '—'),
    test: (r) => (Number.isFinite(r.debtEquity) ? r.debtEquity <= PARAMS.maxDebtEquity : null)
  },
  {
    id: 'valuation',
    group: 'Price',
    label: 'P/E vs sector',
    rule: () => `P/E ≤ ${PARAMS.maxSectorPremium.toFixed(2)}× sector median`,
    read: (r) => relativePe(r),
    format: (v) => (Number.isFinite(v) ? `${v.toFixed(2)}×` : '—'),
    test: (r) => {
      const rel = relativePe(r);
      if (!Number.isFinite(rel)) return null;
      // A negative or absent P/E is a loss-maker or a missing figure; neither is
      // "a reasonable price", so it fails rather than passing on a technicality.
      if (!Number.isFinite(r.pe) || r.pe <= 0) return false;
      return rel <= PARAMS.maxSectorPremium;
    }
  },
  {
    id: 'trend',
    group: 'Momentum',
    label: 'Close vs SMA-50',
    rule: () => 'last close ≥ 50-day average',
    read: (r) => (Number.isFinite(r.price) && Number.isFinite(r.sma50) ? r.price / r.sma50 - 1 : NaN),
    format: (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%` : '—'),
    test: (r) =>
      Number.isFinite(r.price) && Number.isFinite(r.sma50) ? r.price >= r.sma50 : null
  },
  {
    id: 'momentum',
    group: 'Momentum',
    label: '3-month return',
    rule: () => `3-month return ≥ ${(PARAMS.minMom3m * 100).toFixed(0)}%`,
    read: (r) => r.mom3m,
    format: (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%` : '—'),
    test: (r) => (Number.isFinite(r.mom3m) ? r.mom3m >= PARAMS.minMom3m : null)
  },
  {
    id: 'vol',
    group: 'Risk',
    label: 'Annualised volatility',
    rule: () => `vol ≤ ${(PARAMS.maxVol * 100).toFixed(0)}%`,
    read: (r) => r.vol,
    format: (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—'),
    test: (r) => (Number.isFinite(r.vol) ? r.vol <= PARAMS.maxVol : null)
  },
  {
    id: 'beta',
    group: 'Risk',
    label: 'Beta to SPY',
    rule: () => `beta ≤ ${PARAMS.maxBeta.toFixed(1)}`,
    read: (r) => r.beta,
    format: (v) => (Number.isFinite(v) ? v.toFixed(2) : '—'),
    test: (r) => (Number.isFinite(r.beta) ? r.beta <= PARAMS.maxBeta : null)
  }
];

/** Trailing P/E as a multiple of the sector median — the valuation gate's input. */
function relativePe(r) {
  if (!Number.isFinite(r.pe) || !Number.isFinite(r.sectorPe) || r.sectorPe <= 0) return NaN;
  return r.pe / r.sectorPe;
}

/* ------------------------------------------------------------------ scoring --- */

/** z-scores across a pool, with a zero vector when the pool has no spread. */
function zScores(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return values.map(() => 0);
  const mu = finite.reduce((a, b) => a + b, 0) / finite.length;
  const variance = finite.reduce((a, b) => a + (b - mu) ** 2, 0) / (finite.length - 1);
  const sd = Math.sqrt(variance);
  if (!(sd > 0)) return values.map(() => 0);
  return values.map((v) => (Number.isFinite(v) ? (v - mu) / sd : 0));
}

/**
 * Run the screen over a candidate pool.
 *
 * Each row is expected to carry whatever the app managed to load:
 *   { symbol, sector, pe, sectorPe, eps, roe, margin, debtEquity, dividendYield,
 *     price, sma50, mom3m, vol, beta }
 *
 * Returns one result per candidate — never a filtered list, because the reason a
 * name is absent from the book is as interesting as the book.
 */
export function screenPool(rows) {
  const evaluated = rows.map((row) => {
    const checks = GATES.map((gate) => {
      const outcome = gate.test(row);
      return {
        id: gate.id,
        group: gate.group,
        label: gate.label,
        rule: gate.rule(),
        value: gate.format(gate.read(row)),
        outcome // true | false | null
      };
    });

    const failed = checks.filter((c) => c.outcome === false);
    const unknown = checks.filter((c) => c.outcome === null);

    return {
      ...row,
      checks,
      failed: failed.map((c) => c.label),
      unknown: unknown.map((c) => c.label),
      // A name only qualifies if every gate was evaluated and every gate passed.
      verdict: failed.length ? 'fail' : unknown.length ? 'incomplete' : 'pass'
    };
  });

  // Composite score over the qualifying names only. Scoring the whole pool would
  // let excluded names shift the z-scores of the ones we actually rank.
  const passing = evaluated.filter((r) => r.verdict === 'pass');
  const zRoe = zScores(passing.map((r) => r.roe));
  const zMargin = zScores(passing.map((r) => r.margin));
  const zDebt = zScores(passing.map((r) => r.debtEquity));
  const zValue = zScores(passing.map((r) => relativePe(r)));
  const zMom = zScores(passing.map((r) => r.mom3m));
  const zTrend = zScores(passing.map((r) => r.price / r.sma50 - 1));

  const { quality, value, momentum } = THESIS.sleeveWeights;
  passing.forEach((row, i) => {
    // Cheap relative to sector is good, so the valuation z-score enters negated.
    row.sleeves = {
      quality: (zRoe[i] + zMargin[i] - zDebt[i]) / 3,
      value: -zValue[i],
      momentum: (zMom[i] + zTrend[i]) / 2
    };
    row.score =
      quality * row.sleeves.quality + value * row.sleeves.value + momentum * row.sleeves.momentum;
  });

  passing.sort((a, b) => b.score - a.score);
  passing.forEach((row, i) => (row.rank = i + 1));

  return {
    all: evaluated,
    passing,
    counts: {
      pool: evaluated.length,
      pass: passing.length,
      fail: evaluated.filter((r) => r.verdict === 'fail').length,
      incomplete: evaluated.filter((r) => r.verdict === 'incomplete').length
    }
  };
}

/**
 * Pick the book from the ranked survivors, applying the per-sector cap.
 *
 * If the cap leaves us short of the target, it is released before the thesis is
 * — a slightly more concentrated book still expresses the thesis, whereas
 * admitting a name that failed a gate does not. Both relaxations are reported so
 * the dashboard and the documents can say which one was needed.
 */
export function selectBook(passing, params = PARAMS) {
  const chosen = [];
  const perSector = new Map();
  const relaxations = [];

  for (const row of passing) {
    if (chosen.length >= params.targetNames) break;
    const used = perSector.get(row.sector) ?? 0;
    if (used >= params.maxPerSector) continue;
    perSector.set(row.sector, used + 1);
    chosen.push(row);
  }

  if (chosen.length < params.targetNames && chosen.length < passing.length) {
    relaxations.push(
      `The ${params.maxPerSector}-per-sector cap was released to reach ${Math.min(
        params.targetNames,
        passing.length
      )} names; the pool does not hold enough sectors to fill the book otherwise.`
    );
    for (const row of passing) {
      if (chosen.length >= params.targetNames) break;
      if (!chosen.includes(row)) chosen.push(row);
    }
  }

  const short = chosen.length < params.minNames;
  if (short) {
    relaxations.push(
      `Only ${chosen.length} names clear the gates, below the ${params.minNames}-name floor. ` +
        'The book is held as-is rather than padded with names that failed the thesis — ' +
        'the shortfall is reported, not filled.'
    );
  }

  return { holdings: chosen, relaxations, short };
}

/**
 * Turn target weights into a whole-share book against a cash mandate.
 *
 * Whole shares, so the weights never quite land and the residual is cash. Naming
 * the cash is the point: a book that claims to be 100% invested on fractional
 * shares is describing an account nobody has.
 */
export function allocate({ symbols, weights, prices, capital = PARAMS.capital }) {
  const lines = symbols.map((symbol, i) => {
    const price = prices.get(symbol);
    const target = weights[i];
    if (!Number.isFinite(price) || price <= 0) {
      return { symbol, targetWeight: target, price: null, shares: null, value: null, actualWeight: null };
    }
    const shares = Math.floor((target * capital) / price);
    const value = shares * price;
    return { symbol, targetWeight: target, price, shares, value, actualWeight: null };
  });

  const invested = lines.reduce((a, l) => a + (l.value ?? 0), 0);
  lines.forEach((l) => {
    l.actualWeight = l.value === null || invested === 0 ? null : l.value / invested;
  });

  return {
    lines,
    invested,
    cash: capital - invested,
    capital,
    priced: lines.filter((l) => l.value !== null).length
  };
}

/**
 * Per-name trading signals — the state of each holding against its own trend,
 * not a buy/sell verdict. Distance to the 50- and 200-day averages, where the
 * name sits in its 52-week range, and an ATR-based stop.
 */
export function signalSummary(row) {
  const signals = [];

  if (Number.isFinite(row.price) && Number.isFinite(row.sma50)) {
    const d = row.price / row.sma50 - 1;
    signals.push({
      label: 'vs SMA-50',
      value: `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`,
      tone: d >= 0 ? 'up' : 'down',
      note: d >= 0 ? 'above its 50-day average' : 'below its 50-day average'
    });
  }
  if (Number.isFinite(row.price) && Number.isFinite(row.sma200)) {
    const d = row.price / row.sma200 - 1;
    signals.push({
      label: 'vs SMA-200',
      value: `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`,
      tone: d >= 0 ? 'up' : 'down',
      note: d >= 0 ? 'above its 200-day average' : 'below its 200-day average'
    });
  }
  if (Number.isFinite(row.high52) && Number.isFinite(row.low52) && Number.isFinite(row.price) && row.high52 > row.low52) {
    const pos = (row.price - row.low52) / (row.high52 - row.low52);
    signals.push({
      label: '52-week range',
      value: `${(pos * 100).toFixed(0)}%`,
      tone: 'flat',
      note: pos > 0.9 ? 'at the top of its range' : pos < 0.1 ? 'at the bottom of its range' : 'mid-range'
    });
  }
  if (Number.isFinite(row.atr) && Number.isFinite(row.price) && row.price > 0) {
    const stop = row.price - 2 * row.atr;
    signals.push({
      label: '2×ATR stop',
      value: `$${stop.toFixed(2)}`,
      tone: 'flat',
      note: `${((1 - stop / row.price) * 100).toFixed(1)}% below the last close`
    });
  }
  return signals;
}

/**
 * The three sizing methods, run over the selected book.
 *
 * Two of them are the methods taught; equal weight is the naive benchmark they
 * have to beat to have earned their complexity. `minimum variance` is the
 * headline because it is the only one of the three that does not require an
 * estimate of expected returns — the noisiest input in the whole exercise — and
 * because max-Sharpe's answer on this data is a corner solution the band has to
 * rescue. Both facts are reported rather than hidden.
 */
export function sizeBook({ symbols, cov, meanDaily, scores, optimisers, params = PARAMS }) {
  const { minVariance, maxSharpe } = optimisers;
  const n = symbols.length;
  const minVar = minVariance(cov, params.maxWeight).weights;
  const raw = {
    'equal weight': symbols.map(() => 1 / n),
    'minimum variance': minVar,
    'maximum Sharpe': maxSharpe(cov, meanDaily, params.riskFree, params.maxWeight).weights,
    'minimum variance + thesis tilt': tiltByScore(minVar, scores, params.tiltLambda)
  };

  const out = {};
  for (const [label, weights] of Object.entries(raw)) {
    const banded = applyFloor(weights, params.minWeight, params.maxWeight);
    out[label] = {
      raw: weights,
      weights: banded,
      // How far the band had to move the optimiser's answer. A large number
      // means the objective wanted a concentration the band refused, which is
      // itself worth reporting.
      bandShift: banded.reduce((a, w, i) => a + Math.abs(w - weights[i]), 0) / 2,
      zeroed: weights.filter((w) => w < 1e-6).length
    };
  }
  return out;
}

export const HEADLINE_METHOD = 'minimum variance + thesis tilt';

/**
 * Tilt risk-based weights toward the names the thesis ranks highest.
 *
 * Without this the two halves of the exercise contradict each other. Minimum
 * variance is told only about covariance, so it sizes purely by how quietly a
 * name trades: run it over this book and the staples and utilities go to the cap
 * while the three names the screen ranked first sit on the floor. That is a
 * defensible risk portfolio and an indefensible *thesis* portfolio — the pitch
 * would be a ranking nobody acted on.
 *
 * So the risk model sets the shape and the score tilts it:
 *
 *     w_i  ∝  w_riskᵢ · exp(λ · scoreᵢ)
 *
 * λ = 0 leaves the optimiser untouched; larger λ lets conviction override the
 * risk model. The multiplicative form matters — it scales the optimiser's answer
 * rather than replacing it, so a name min-variance wanted small stays smaller
 * than a name it wanted large at equal conviction. Exponentiating keeps every
 * weight positive, which a linear tilt on a negative score would not.
 */
export function tiltByScore(weights, scores, lambda = PARAMS.tiltLambda) {
  if (!scores || !lambda) return weights;
  const tilted = weights.map((w, i) => {
    const s = Number.isFinite(scores[i]) ? scores[i] : 0;
    return w * Math.exp(lambda * s);
  });
  const sum = tilted.reduce((a, b) => a + b, 0);
  return sum > 0 ? tilted.map((x) => x / sum) : weights;
}

/**
 * A one-line description of what the book currently looks like, assembled from
 * counts rather than adjectives, for the header and the LLM prompt alike.
 */
export function bookShape(book, screen) {
  const sectors = new Set(book.holdings.map((h) => h.sector));
  return {
    names: book.holdings.length,
    sectors: sectors.size,
    poolSize: screen.counts.pool,
    passRate: screen.counts.pool ? screen.counts.pass / screen.counts.pool : null
  };
}
