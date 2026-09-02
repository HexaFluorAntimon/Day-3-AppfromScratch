// Indicators, the entry-price ceiling, and position sizing.
//
// Everything here is arithmetic on inputs the caller supplies. Nothing is
// fetched, nothing is guessed: a missing input produces a missing anchor, and
// the anchor list says which ones were available. That is what makes the
// output checkable by hand.

const TRADING_DAYS = 252;

/* ------------------------------------------------------------ primitives --- */

export function mean(xs) {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

export function stdDev(xs, sample = true) {
  const v = xs.filter(Number.isFinite);
  if (v.length < 2) return NaN;
  const m = mean(v);
  const ss = v.reduce((a, b) => a + (b - m) ** 2, 0);
  return Math.sqrt(ss / (v.length - (sample ? 1 : 0)));
}

/** Simple (not log) daily returns from a close series. */
export function simpleReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (Number.isFinite(prev) && prev !== 0) out.push(closes[i] / prev - 1);
  }
  return out;
}

export function sma(values, period) {
  if (values.length < period) return NaN;
  return mean(values.slice(-period));
}

/** Annualised volatility from daily returns. */
export function annualisedVol(dailyReturns) {
  const sd = stdDev(dailyReturns);
  return Number.isFinite(sd) ? sd * Math.sqrt(TRADING_DAYS) : NaN;
}

/** Annualised return implied by a daily return series (geometric). */
export function annualisedReturn(dailyReturns) {
  if (!dailyReturns.length) return NaN;
  const growth = dailyReturns.reduce((acc, r) => acc * (1 + r), 1);
  return growth ** (TRADING_DAYS / dailyReturns.length) - 1;
}

/** Beta of an asset against a market series (aligned, equal length). */
export function beta(assetReturns, marketReturns) {
  const n = Math.min(assetReturns.length, marketReturns.length);
  if (n < 30) return NaN;
  const a = assetReturns.slice(-n);
  const m = marketReturns.slice(-n);
  const ma = mean(a);
  const mm = mean(m);
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (m[i] - mm);
    varM += (m[i] - mm) ** 2;
  }
  return varM === 0 ? NaN : cov / varM;
}

/**
 * Average True Range (Wilder). The stop distance every sizing rule below is
 * built on: it is the market's own measure of normal daily travel, so a stop
 * placed outside it is not hit by noise alone.
 */
export function atr(bars, period = 14) {
  if (bars.length < period + 1) return NaN;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  // Wilder smoothing
  let value = mean(trs.slice(0, period));
  for (let i = period; i < trs.length; i++) value = (value * (period - 1) + trs[i]) / period;
  return value;
}

/** Maximum drawdown of an equity curve, as a negative fraction. */
export function maxDrawdown(equity) {
  let peak = -Infinity;
  let worst = 0;
  for (const v of equity) {
    if (!Number.isFinite(v)) continue;
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

/** Lowest low over the last `lookback` bars — the structural support level. */
export function swingLow(bars, lookback = 20) {
  const slice = bars.slice(-lookback);
  const lows = slice.map((b) => b.low).filter(Number.isFinite);
  return lows.length ? Math.min(...lows) : NaN;
}

export function high52(bars) {
  const highs = bars.slice(-TRADING_DAYS).map((b) => b.high).filter(Number.isFinite);
  return highs.length ? Math.max(...highs) : NaN;
}

export function low52(bars) {
  const lows = bars.slice(-TRADING_DAYS).map((b) => b.low).filter(Number.isFinite);
  return lows.length ? Math.min(...lows) : NaN;
}

/** Everything the rest of the app reads off a price series. */
export function priceMetrics(bars, marketReturns = null) {
  const closes = bars.map((b) => b.close);
  const rets = simpleReturns(closes);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];

  return {
    last,
    dayChangePct: Number.isFinite(prev) ? (last / prev - 1) * 100 : NaN,
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    atr14: atr(bars, 14),
    vol: annualisedVol(rets.slice(-TRADING_DAYS)),
    ret1y: annualisedReturn(rets.slice(-TRADING_DAYS)),
    ret3m: closes.length > 63 ? last / closes[closes.length - 64] - 1 : NaN,
    ret1m: closes.length > 21 ? last / closes[closes.length - 22] - 1 : NaN,
    high52: high52(bars),
    low52: low52(bars),
    swingLow20: swingLow(bars, 20),
    maxDrawdown1y: maxDrawdown(closes.slice(-TRADING_DAYS)),
    beta: marketReturns ? beta(rets, marketReturns) : NaN,
    bars: bars.length
  };
}

/* ------------------------------------------------- the entry-price ceiling --- */

/**
 * The "maximum meaningful price": the highest price at which the case still
 * holds, computed as the MINIMUM of several independent ceilings. Each anchor
 * answers a different question, and the binding one is whichever is strictest.
 *
 *   1. Justified multiple — sector median P/E x trailing EPS, less a margin of
 *      safety. Answers "what do comparable earnings streams fetch?"
 *   2. Analyst consensus, discounted — consensus target less the same margin.
 *      Answers "what does the street think, if the street is optimistic?"
 *   3. Chase guard — a cap above the 50-day average. Answers "am I paying up
 *      into a move that already happened?"
 *   4. Reward:risk gate — the highest entry where (target - entry) / (entry -
 *      stop) still clears the required ratio, with the stop set an ATR multiple
 *      below. Answers "is the trade still worth the risk at this price?"
 *
 * Anchors whose inputs are missing are reported as unavailable and excluded —
 * never substituted. `ceiling` is null if nothing at all could be computed.
 */
export function entryCeiling({
  price,
  eps = null,
  sectorPe = null,
  analystTarget = null,
  sma50 = null,
  atr14 = null,
  swingLow = null,
  marginOfSafety = 0.15,
  chaseLimit = 0.10,
  minRewardRisk = 2,
  atrStopMultiple = 2
}) {
  const anchors = [];

  // 1. Justified multiple
  if (Number.isFinite(eps) && eps > 0 && Number.isFinite(sectorPe) && sectorPe > 0) {
    const fair = eps * sectorPe;
    anchors.push({
      id: 'multiple',
      label: `Justified multiple — sector P/E ${sectorPe.toFixed(1)}x on EPS ${eps.toFixed(2)}`,
      short: 'Justified multiple',
      price: fair * (1 - marginOfSafety),
      detail: `fair value ${fair.toFixed(2)}, less ${(marginOfSafety * 100).toFixed(0)}% margin of safety`,
      available: true
    });
  } else {
    anchors.push({
      id: 'multiple',
      label: 'Justified multiple',
      short: 'Justified multiple',
      price: null,
      detail: !Number.isFinite(eps) || eps <= 0
        ? 'needs positive trailing EPS (FMP key)'
        : 'needs a sector P/E median (FMP key)',
      available: false
    });
  }

  // 2. Analyst consensus, discounted
  if (Number.isFinite(analystTarget) && analystTarget > 0) {
    anchors.push({
      id: 'consensus',
      label: `Consensus target ${analystTarget.toFixed(2)}, discounted`,
      short: 'Consensus, discounted',
      price: analystTarget * (1 - marginOfSafety),
      detail: `less the same ${(marginOfSafety * 100).toFixed(0)}% margin of safety`,
      available: true
    });
  } else {
    anchors.push({
      id: 'consensus',
      label: 'Consensus target, discounted',
      short: 'Consensus, discounted',
      price: null,
      detail: 'no consensus target available on this plan',
      available: false
    });
  }

  // 3. Chase guard
  if (Number.isFinite(sma50) && sma50 > 0) {
    anchors.push({
      id: 'chase',
      label: `Chase guard — ${(chaseLimit * 100).toFixed(0)}% over the 50-day average`,
      short: 'Chase guard',
      price: sma50 * (1 + chaseLimit),
      detail: `50-day average ${sma50.toFixed(2)}`,
      available: true
    });
  } else {
    anchors.push({
      id: 'chase',
      label: 'Chase guard',
      short: 'Chase guard',
      price: null,
      detail: 'needs 50 sessions of history',
      available: false
    });
  }

  // 4. Reward:risk gate.
  //    stop = entry - k*ATR (or the swing low, whichever is nearer the entry),
  //    and we solve (T - E) / (E - S) = R for E.
  const target = Number.isFinite(analystTarget) && analystTarget > 0 ? analystTarget : null;
  if (target && Number.isFinite(atr14) && atr14 > 0) {
    const stopDistanceAtr = atrStopMultiple * atr14;
    // With S = E - d: (T - E) / d = R  =>  E = T - R*d
    const byAtr = target - minRewardRisk * stopDistanceAtr;
    // With a fixed structural stop S: (T - E)/(E - S) = R => E = (T + R*S)/(1 + R)
    const byStructure = Number.isFinite(swingLow) && swingLow > 0
      ? (target + minRewardRisk * swingLow) / (1 + minRewardRisk)
      : null;
    const gate = byStructure !== null ? Math.max(byAtr, byStructure) : byAtr;
    anchors.push({
      id: 'rewardrisk',
      label: `Reward:risk gate — ${minRewardRisk}:1 against a ${atrStopMultiple}x ATR stop`,
      short: `${minRewardRisk}:1 reward:risk`,
      price: gate > 0 ? gate : null,
      detail: `ATR ${atr14.toFixed(2)}, stop distance ${stopDistanceAtr.toFixed(2)}`,
      available: gate > 0
    });
  } else {
    anchors.push({
      id: 'rewardrisk',
      label: 'Reward:risk gate',
      short: 'Reward:risk gate',
      price: null,
      detail: target ? 'needs 15 sessions for ATR' : 'needs a price target to measure reward against',
      available: false
    });
  }

  const usable = anchors.filter((a) => a.available && Number.isFinite(a.price) && a.price > 0);
  const ceiling = usable.length ? Math.min(...usable.map((a) => a.price)) : null;
  const binding = ceiling === null ? null : usable.find((a) => a.price === ceiling)?.id ?? null;

  return {
    ceiling,
    binding,
    anchors,
    availableCount: usable.length,
    price,
    // Positive => the current price is above the disciplined ceiling.
    premiumPct: ceiling !== null && Number.isFinite(price) ? (price / ceiling - 1) * 100 : null,
    verdict:
      ceiling === null
        ? 'no-anchors'
        : !Number.isFinite(price)
          ? 'no-price'
          : price <= ceiling
            ? 'at-or-below'
            : 'above'
  };
}

/* ---------------------------------------------------------------- sizing --- */

/**
 * How many shares, given a risk budget. Three independent rules, deliberately
 * shown side by side rather than blended into one number, because they answer
 * different questions and disagree in informative ways.
 *
 *   Risk-based    — the classic fixed-fractional rule. Size so that being
 *                   stopped out costs exactly `riskPerTradePct` of the account.
 *                   This is the number that controls the loss.
 *   Vol-targeted  — size so this position contributes a set volatility to the
 *                   account. This is the number that controls the wobble.
 *   Half-Kelly    — the growth-optimal fraction from the setup's own payoff,
 *                   halved, because full Kelly is famously intolerant of an
 *                   overstated edge.
 *
 * `recommended` is the SMALLEST of the three: the binding constraint. Sizing up
 * to the largest would defeat the purpose of computing the others.
 */
export function positionSizing({
  price,
  atr14,
  portfolioValue,
  riskPerTradePct = 1,
  atrStopMultiple = 2,
  targetPositionVolPct = 12,
  assetVol = null,
  target = null,
  maxWeightPct = 20
}) {
  const rules = [];
  const stopDistance = Number.isFinite(atr14) ? atrStopMultiple * atr14 : NaN;
  const stopPrice = Number.isFinite(stopDistance) ? price - stopDistance : NaN;

  // 1. Risk-based
  if (Number.isFinite(stopDistance) && stopDistance > 0 && portfolioValue > 0) {
    const riskBudget = portfolioValue * (riskPerTradePct / 100);
    const shares = Math.floor(riskBudget / stopDistance);
    rules.push({
      id: 'risk',
      label: `Risk-based — ${riskPerTradePct}% of the account at a ${atrStopMultiple}x ATR stop`,
      short: 'Risk-based',
      shares,
      detail: `risk budget ${riskBudget.toFixed(0)} / stop distance ${stopDistance.toFixed(2)}`,
      available: shares > 0
    });
  } else {
    rules.push({ id: 'risk', label: 'Risk-based', short: 'Risk-based', shares: null, detail: 'needs ATR and an account size', available: false });
  }

  // 2. Volatility-targeted
  if (Number.isFinite(assetVol) && assetVol > 0 && portfolioValue > 0 && price > 0) {
    const weight = Math.min(targetPositionVolPct / 100 / assetVol, maxWeightPct / 100);
    const shares = Math.floor((portfolioValue * weight) / price);
    rules.push({
      id: 'vol',
      label: `Volatility-targeted — ${targetPositionVolPct}% position vol, capped at ${maxWeightPct}% weight`,
      short: 'Vol-targeted',
      shares,
      detail: `asset vol ${(assetVol * 100).toFixed(1)}% → weight ${(weight * 100).toFixed(1)}%`,
      available: shares > 0
    });
  } else {
    rules.push({ id: 'vol', label: 'Volatility-targeted', short: 'Vol-targeted', shares: null, detail: 'needs realised volatility', available: false });
  }

  // 3. Half-Kelly, from the setup's own reward:risk
  if (Number.isFinite(stopDistance) && stopDistance > 0 && Number.isFinite(target) && target > price && portfolioValue > 0) {
    const reward = target - price;
    const b = reward / stopDistance; // payoff ratio
    // Break-even hit rate for this payoff, plus a modest 5pp edge. Stated, not
    // discovered: no backtest here claims to know the true win rate.
    const breakEven = 1 / (1 + b);
    const p = Math.min(0.95, breakEven + 0.05);
    const kelly = (p * (1 + b) - 1) / b;
    const half = Math.max(0, kelly / 2);
    const weight = Math.min(half, maxWeightPct / 100);
    const shares = Math.floor((portfolioValue * weight) / price);
    rules.push({
      id: 'kelly',
      label: `Half-Kelly — payoff ${b.toFixed(2)}:1, assumed hit rate ${(p * 100).toFixed(0)}%`,
      short: 'Half-Kelly',
      shares,
      detail: `full Kelly ${(kelly * 100).toFixed(1)}% → half ${(weight * 100).toFixed(1)}% of the account`,
      available: shares > 0,
      assumedHitRate: p,
      breakEvenHitRate: breakEven
    });
  } else {
    rules.push({
      id: 'kelly',
      label: 'Half-Kelly',
      short: 'Half-Kelly',
      shares: null,
      detail: Number.isFinite(target) ? 'needs a target above the current price' : 'needs a price target',
      available: false
    });
  }

  const usable = rules.filter((r) => r.available && Number.isFinite(r.shares) && r.shares > 0);
  const recommended = usable.length ? Math.min(...usable.map((r) => r.shares)) : null;
  const binding = recommended === null ? null : usable.find((r) => r.shares === recommended)?.id ?? null;

  const capital = recommended !== null ? recommended * price : null;
  const riskAmount = recommended !== null && Number.isFinite(stopDistance) ? recommended * stopDistance : null;

  return {
    rules,
    recommended,
    binding,
    stopPrice: Number.isFinite(stopPrice) && stopPrice > 0 ? stopPrice : null,
    stopDistance: Number.isFinite(stopDistance) ? stopDistance : null,
    capital,
    weightPct: capital !== null && portfolioValue > 0 ? (capital / portfolioValue) * 100 : null,
    riskAmount,
    riskPctOfAccount: riskAmount !== null && portfolioValue > 0 ? (riskAmount / portfolioValue) * 100 : null
  };
}

/** A staged ladder: three tranches between the ceiling and the stop. */
export function entryLadder(ceiling, stopPrice, shares) {
  if (!Number.isFinite(ceiling) || !Number.isFinite(stopPrice) || !Number.isFinite(shares) || shares < 3) return [];
  const span = ceiling - stopPrice;
  if (span <= 0) return [];
  const tranches = [
    { label: 'First tranche', price: ceiling, portion: 0.4 },
    { label: 'Second tranche', price: ceiling - span * 0.25, portion: 0.35 },
    { label: 'Third tranche', price: ceiling - span * 0.5, portion: 0.25 }
  ];
  return tranches.map((t) => ({ ...t, shares: Math.floor(shares * t.portion) }));
}
