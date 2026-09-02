// The handles: seven objectives, one solver.
//
// Each handle is a real optimisation over the imported holdings, subject to
// long-only weights that sum to 1 and an optional per-name cap. Solved from
// scratch with projected gradient descent onto the capped simplex — no solver
// dependency — and every result is checked before it is returned, so a handle
// that fails to converge says so instead of returning plausible noise.

import { portfolioVol, riskContributions, portfolioReturnSeries } from './portfolio.js';
import { annualisedReturn, mean } from './analysis.js';

const TRADING_DAYS = 252;

/* --------------------------------------------------------------- geometry --- */

/**
 * Euclidean projection onto { w : sum(w) = 1, 0 <= w <= cap }.
 * Bisection on the dual variable; exact to 1e-12 and always feasible when
 * cap * n >= 1.
 */
export function projectToSimplex(v, cap = 1) {
  const n = v.length;
  if (cap * n < 1 - 1e-12) return null; // infeasible: cap too tight

  const clampSum = (theta) => v.reduce((a, x) => a + Math.min(cap, Math.max(0, x - theta)), 0);

  let lo = Math.min(...v) - 1;
  let hi = Math.max(...v);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (clampSum(mid) > 1) lo = mid;
    else hi = mid;
  }
  const theta = (lo + hi) / 2;
  const w = v.map((x) => Math.min(cap, Math.max(0, x - theta)));
  const s = w.reduce((a, x) => a + x, 0);
  return s > 0 ? w.map((x) => x / s) : new Array(n).fill(1 / n);
}

/**
 * Generic projected-gradient minimiser with backtracking step size.
 * `grad` returns the gradient of the objective at w; `obj` its value.
 */
function minimise(obj, grad, w0, cap, { iterations = 3000, tol = 1e-11 } = {}) {
  let w = projectToSimplex(w0, cap);
  if (!w) return null;
  let f = obj(w);
  let step = 0.5;

  for (let iter = 0; iter < iterations; iter++) {
    const g = grad(w);
    let moved = false;
    // Backtrack until the step actually improves the objective.
    for (let trial = 0; trial < 30; trial++) {
      const candidate = projectToSimplex(w.map((x, i) => x - step * g[i]), cap);
      if (!candidate) break;
      const fc = obj(candidate);
      if (fc <= f - 1e-14) {
        const delta = Math.abs(f - fc);
        w = candidate;
        f = fc;
        moved = true;
        if (delta < tol) return { weights: w, objective: f, iterations: iter, converged: true };
        break;
      }
      step *= 0.5;
    }
    if (!moved) return { weights: w, objective: f, iterations: iter, converged: true };
    step = Math.min(step * 1.6, 5);
  }
  return { weights: w, objective: f, iterations, converged: false };
}

/** A covariance matrix from a short window is often only semi-definite. */
function ridge(cov, epsilon = 1e-9) {
  return cov.map((row, i) => row.map((v, j) => (i === j ? v + epsilon : v)));
}

function variance(w, cov) {
  let s = 0;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) s += w[i] * w[j] * cov[i][j];
  return s;
}

function covTimes(w, cov) {
  return cov.map((row) => row.reduce((a, v, j) => a + v * w[j], 0));
}

/* ---------------------------------------------------------------- handles --- */

/** Lowest achievable portfolio variance. */
export function minVariance(cov, cap = 1) {
  const C = ridge(cov);
  const n = C.length;
  return minimise(
    (w) => variance(w, C),
    (w) => covTimes(w, C).map((x) => 2 * x),
    new Array(n).fill(1 / n),
    cap
  );
}

/**
 * Highest Sharpe ratio. The ratio is not quadratic, so this maximises it by
 * gradient ascent from several starts and keeps the best — with a small ridge
 * on the denominator so a near-zero-variance corner cannot blow the objective up.
 */
export function maxSharpe(cov, meanDaily, riskFree = 0.04, cap = 1) {
  const C = ridge(cov, 1e-8);
  const n = C.length;
  const rfDaily = riskFree / TRADING_DAYS;
  const excess = meanDaily.map((m) => m - rfDaily);

  const negSharpe = (w) => {
    const v = Math.sqrt(Math.max(variance(w, C), 1e-16));
    const r = w.reduce((a, x, i) => a + x * excess[i], 0);
    return -r / v;
  };
  const grad = (w) => {
    const v = Math.sqrt(Math.max(variance(w, C), 1e-16));
    const r = w.reduce((a, x, i) => a + x * excess[i], 0);
    const cw = covTimes(w, C);
    // d(-r/v)/dw = -(excess/v) + r*cw/v^3
    return excess.map((e, i) => -(e / v) + (r * cw[i]) / v ** 3);
  };

  const starts = [new Array(n).fill(1 / n)];
  // Start also from the best single name and from an excess-return tilt.
  const best = excess.indexOf(Math.max(...excess));
  const single = new Array(n).fill(0);
  single[best] = 1;
  starts.push(single);
  const positive = excess.map((e) => Math.max(e, 0));
  if (positive.some((x) => x > 0)) starts.push(positive);

  let bestResult = null;
  for (const s of starts) {
    const r = minimise(negSharpe, grad, s, cap, { iterations: 2500 });
    if (r && (!bestResult || r.objective < bestResult.objective)) bestResult = r;
  }
  return bestResult;
}

/**
 * Highest expected return — the "maximize risk" end of the dial. Deliberately
 * capped: uncapped it collapses onto whichever single name had the best trailing
 * run, which is an artefact of the window, not a portfolio.
 */
export function maxReturn(meanDaily, cap = 0.25) {
  const n = meanDaily.length;
  return minimise(
    (w) => -w.reduce((a, x, i) => a + x * meanDaily[i], 0),
    () => meanDaily.map((m) => -m),
    new Array(n).fill(1 / n),
    cap
  );
}

/**
 * Most diversified by name: minimise the Herfindahl index subject to the cap.
 * The unconstrained answer is equal weight, so this matters mainly when other
 * constraints bind — it is the honest "spread it out" handle.
 */
export function maxDiversification(n, cap = 1) {
  return minimise(
    (w) => w.reduce((a, x) => a + x * x, 0),
    (w) => w.map((x) => 2 * x),
    new Array(n).fill(1 / n),
    cap
  );
}

/**
 * Equal risk contribution: every position supplies the same share of portfolio
 * variance. Minimises the dispersion of risk contributions around 1/n.
 */
export function riskParity(cov, cap = 1) {
  const C = ridge(cov);
  const n = C.length;
  const targetShare = 1 / n;

  const obj = (w) => {
    const rc = riskContributions(w, C);
    return rc.reduce((a, x) => a + (x - targetShare) ** 2, 0);
  };
  // Numerical gradient: the analytic one is messy and this runs in milliseconds.
  const grad = (w) => {
    const h = 1e-6;
    const base = obj(w);
    return w.map((_, i) => {
      const wp = [...w];
      wp[i] += h;
      const norm = wp.reduce((a, x) => a + x, 0);
      return (obj(wp.map((x) => x / norm)) - base) / h;
    });
  };
  return minimise(obj, grad, new Array(n).fill(1 / n), cap, { iterations: 2000 });
}

/**
 * Track a target portfolio beta. Squared error against the target, so it works
 * in both directions — defensive (target < 1) or geared (target > 1).
 */
export function targetBeta(betas, targetValue = 0.8, cap = 1) {
  const n = betas.length;
  const usable = betas.map((b) => (Number.isFinite(b) ? b : 1));
  return minimise(
    (w) => (w.reduce((a, x, i) => a + x * usable[i], 0) - targetValue) ** 2,
    (w) => {
      const d = 2 * (w.reduce((a, x, i) => a + x * usable[i], 0) - targetValue);
      return usable.map((b) => d * b);
    },
    new Array(n).fill(1 / n),
    cap
  );
}

/**
 * Maximum income, with a volatility ceiling so the answer is not simply the
 * highest-yielding name regardless of what carrying it costs in risk.
 * Names with no yield data contribute 0 rather than an assumed yield.
 */
export function maxIncome(yields, cov, volCeiling, cap = 0.25) {
  const C = ridge(cov);
  const n = yields.length;
  const y = yields.map((v) => (Number.isFinite(v) ? v : 0));
  const varCeiling = (volCeiling ** 2) / TRADING_DAYS;
  const penalty = 50;

  return minimise(
    (w) => {
      const over = Math.max(0, variance(w, C) - varCeiling);
      return -w.reduce((a, x, i) => a + x * y[i], 0) + penalty * over;
    },
    (w) => {
      const over = variance(w, C) - varCeiling;
      const cw = covTimes(w, C);
      return y.map((yi, i) => -yi + (over > 0 ? penalty * 2 * cw[i] : 0));
    },
    new Array(n).fill(1 / n),
    cap
  );
}

/**
 * Reach a target with as little trading as possible: minimise variance plus an
 * L1 penalty on distance from the current weights. Raising `turnoverPenalty`
 * buys fewer trades at the cost of a worse objective — the trade-off is the
 * point, so both numbers are reported.
 */
export function minTurnoverToward(cov, currentWeights, turnoverPenalty = 0.02, cap = 1) {
  const C = ridge(cov);
  const n = C.length;
  const smooth = 1e-4; // smooth |x| so the gradient exists at zero

  return minimise(
    (w) => variance(w, C) + turnoverPenalty * w.reduce((a, x, i) => a + Math.sqrt((x - currentWeights[i]) ** 2 + smooth), 0),
    (w) => {
      const cw = covTimes(w, C);
      return w.map((x, i) => {
        const d = x - currentWeights[i];
        return 2 * cw[i] + turnoverPenalty * (d / Math.sqrt(d * d + smooth));
      });
    },
    [...currentWeights],
    cap
  );
}

/* ----------------------------------------------------------- the registry --- */

/**
 * Every handle the UI offers. `run` returns { weights } or null, and anything
 * that cannot run reports `unavailable` with the reason — a handle is never
 * silently substituted for another.
 */
export const HANDLES = [
  {
    id: 'reduce-risk',
    label: 'Reduce risk',
    tagline: 'Lowest portfolio volatility',
    description:
      'Minimum-variance weights: the mix whose historical volatility is the lowest reachable from these names, long-only and capped.',
    tone: 'mint',
    run: ({ cov, cap }) => minVariance(cov, cap)
  },
  {
    id: 'maximise-return',
    label: 'Maximise return',
    tagline: 'Highest trailing expected return',
    description:
      'Tilts hard toward the strongest trailing returns, capped per name. This is the risk-seeking end of the dial: expect the volatility number to rise with it.',
    tone: 'clay',
    run: ({ meanDaily, cap }) => maxReturn(meanDaily, Math.min(cap, 0.25))
  },
  {
    id: 'best-sharpe',
    label: 'Best risk-adjusted',
    tagline: 'Highest Sharpe ratio',
    description:
      'Maximises return per unit of volatility rather than either one alone — usually the most defensible single answer of the set.',
    tone: 'mint',
    run: ({ cov, meanDaily, riskFree, cap }) => maxSharpe(cov, meanDaily, riskFree, cap)
  },
  {
    id: 'diversify',
    label: 'Diversify',
    tagline: 'Cut single-name concentration',
    description:
      'Minimises the Herfindahl index, spreading capital across names and lifting the effective number of positions.',
    tone: 'mint',
    run: ({ n, cap }) => maxDiversification(n, cap)
  },
  {
    id: 'risk-parity',
    label: 'Risk parity',
    tagline: 'Equal risk contribution',
    description:
      'Every position contributes the same share of portfolio variance, so no single name quietly dominates the risk budget.',
    tone: 'mint',
    run: ({ cov, cap }) => riskParity(cov, cap)
  },
  {
    id: 'lower-beta',
    label: 'Lower market beta',
    tagline: 'Defensive tilt toward beta 0.8',
    description:
      'Targets a portfolio beta of 0.8 against the S&P 500, reducing how much of the index move passes through.',
    tone: 'mint',
    requires: 'betas',
    run: ({ betas, cap }) => targetBeta(betas, 0.8, cap)
  },
  {
    id: 'income',
    label: 'Income tilt',
    tagline: 'Maximum yield under a volatility ceiling',
    description:
      'Maximises trailing dividend yield while holding volatility at or below the current portfolio. Needs an FMP key for yields.',
    tone: 'accent',
    requires: 'yields',
    run: ({ yields, cov, currentVol, cap }) => maxIncome(yields, cov, currentVol, Math.min(cap, 0.25))
  },
  {
    id: 'min-turnover',
    label: 'Fewest trades',
    tagline: 'Lower risk, minimal turnover',
    description:
      'Moves toward lower variance while penalising every unit of trading, for when fees and tax make a full rebalance not worth it.',
    tone: 'mint',
    run: ({ cov, currentWeights, cap }) => minTurnoverToward(cov, currentWeights, 0.02, cap)
  }
];

/* ------------------------------------------------------------------ trades --- */

/**
 * The trades that carry current weights to target weights.
 * Share counts are whole numbers — a plan that says "sell 12.7 shares" is not
 * a plan — and `driftPct` is what the rounding leaves behind.
 */
export function tradesFor({ holdings, targetWeights, symbols, totalValue, minTradeValue = 0 }) {
  const bySymbol = new Map(holdings.map((h) => [h.symbol, h]));
  const trades = [];

  symbols.forEach((sym, i) => {
    const h = bySymbol.get(sym);
    if (!h || h.price === null || !Number.isFinite(h.price) || h.price <= 0) return;

    const targetValue = totalValue * targetWeights[i];
    const deltaValue = targetValue - (h.value ?? 0);
    const rawShares = deltaValue / h.price;
    const shares = rawShares > 0 ? Math.floor(rawShares) : Math.ceil(rawShares);
    const value = shares * h.price;

    if (shares === 0 || Math.abs(value) < minTradeValue) {
      trades.push({
        symbol: sym,
        action: 'hold',
        shares: 0,
        value: 0,
        currentWeight: h.weight ?? 0,
        targetWeight: targetWeights[i],
        price: h.price
      });
      return;
    }

    trades.push({
      symbol: sym,
      action: shares > 0 ? 'buy' : 'sell',
      shares: Math.abs(shares),
      value: Math.abs(value),
      currentWeight: h.weight ?? 0,
      targetWeight: targetWeights[i],
      price: h.price
    });
  });

  const turnover = trades.reduce((a, t) => a + t.value, 0);
  const achieved = trades.map((t) => {
    const h = bySymbol.get(t.symbol);
    const newShares = h.quantity + (t.action === 'buy' ? t.shares : t.action === 'sell' ? -t.shares : 0);
    return totalValue > 0 ? (newShares * t.price) / totalValue : 0;
  });

  return {
    trades: trades.sort((a, b) => b.value - a.value),
    turnover,
    turnoverPct: totalValue > 0 ? (turnover / totalValue) * 100 : 0,
    tradeCount: trades.filter((t) => t.action !== 'hold').length,
    achievedWeights: achieved,
    driftPct: achieved.reduce((a, w, i) => a + Math.abs(w - targetWeights[i]), 0) * 100
  };
}

/** Mean daily return per symbol, in the given order. */
export function meanDailyReturns(returns, symbols) {
  return symbols.map((s) => mean(returns[s]));
}

/** Annualised return of a weighted mix, for the before/after comparison. */
export function annualisedFor(returns, symbols, weights) {
  return annualisedReturn(portfolioReturnSeries(returns, symbols, weights));
}

/** Volatility of a weighted mix. */
export function volFor(weights, cov) {
  return portfolioVol(weights, cov);
}
