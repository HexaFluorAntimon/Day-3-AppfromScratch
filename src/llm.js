// OpenRouter narration.
//
// The model never calculates. Every number in every prompt below was computed in
// JavaScript first and is handed over as finished text; the model's only job is
// to say what the figures mean in plain language. That split is what makes the
// output checkable — you can recompute any number the note mentions.

const MODEL = 'anthropic/claude-sonnet-5';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM = `You are a financial analyst writing for someone who can read a balance sheet.

Absolute rules:
- Every number you cite must appear in the DATA block. Never compute, estimate,
  extrapolate or invent a figure, and never fill a gap with a plausible value.
- If the data needed for a claim is marked unavailable, say it is unavailable.
- No price predictions and no "this will go up". Describe what the computed
  figures show and what would have to be true for the case to work.
- Be concise and concrete. Markdown: short paragraphs, ## headings, - bullets,
  **bold** for the figures that matter. No preamble, no sign-off.`;

async function callOpenRouter(userPrompt, apiKey, { maxTokens = 1100 } = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      // Sonnet is a reasoning model: too small a budget for reasoning plus reply
      // is rejected as a 400 "Provider returned error", so reasoning is off and
      // the budget is comfortable for a short note.
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!res.ok) throw new Error(`OpenRouter: ${await readError(res)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned an empty response');
  return text;
}

async function readError(res) {
  let message = '';
  try {
    const body = await res.json();
    const err = body.error ?? body;
    message = err.message || '';
    const provider = err.metadata?.provider_name;
    const raw = err.metadata?.raw;
    if (provider) message += ` [provider: ${provider}]`;
    if (raw) message += ` ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`;
  } catch {
    /* body was not JSON; the status still carries information */
  }
  const hint = {
    401: 'the key looks invalid or missing',
    402: 'this model is paid and the account is out of credits',
    429: 'rate limited, wait a moment and retry'
  }[res.status];
  return [`(HTTP ${res.status})`, hint, message].filter(Boolean).join(' ');
}

const fmt = (v, digits = 2, suffix = '') =>
  Number.isFinite(v) ? `${v.toFixed(digits)}${suffix}` : 'unavailable';
const pct = (v, digits = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : 'unavailable');

/**
 * The single-name note: explains the entry ceiling and the sizing, using only
 * the numbers the app already computed and displayed.
 */
export function buildStockPrompt({ company, metrics, fundamentals, ceiling, sizing, headlines, assumptions }) {
  const anchorLines = ceiling.anchors
    .map((a) =>
      a.available && Number.isFinite(a.price)
        ? `- ${a.short}: $${a.price.toFixed(2)} (${a.detail})`
        : `- ${a.short}: UNAVAILABLE (${a.detail})`
    )
    .join('\n');

  const sizingLines = sizing.rules
    .map((r) => (r.available ? `- ${r.short}: ${r.shares} shares (${r.detail})` : `- ${r.short}: UNAVAILABLE (${r.detail})`))
    .join('\n');

  const newsLines = headlines.length
    ? headlines.slice(0, 6).map((h) => `- "${h.title}" (${h.source})`).join('\n')
    : '- no headlines available (no NewsAPI key, or nothing in the window)';

  return `DATA — ${company.symbol} (${company.name}, ${company.sector})

PRICE AND TREND
- Last price: $${fmt(metrics.last)}
- Day change: ${fmt(metrics.dayChangePct, 2, '%')}
- 50-day average: $${fmt(metrics.sma50)}; 200-day average: $${fmt(metrics.sma200)}
- 52-week range: $${fmt(metrics.low52)} to $${fmt(metrics.high52)}
- ATR(14): $${fmt(metrics.atr14)}
- Realised volatility (1y, annualised): ${pct(metrics.vol)}
- Trailing 1y return: ${pct(metrics.ret1y)}; 3-month: ${pct(metrics.ret3m)}
- Max drawdown (1y): ${pct(metrics.maxDrawdown1y)}
- Beta vs S&P 500: ${fmt(metrics.beta)}

FUNDAMENTALS ${fundamentals ? '' : '(no FMP key — all unavailable)'}
- Trailing P/E: ${fundamentals ? fmt(fundamentals.peTtm) : 'unavailable'}
- EPS (TTM): ${fundamentals ? fmt(fundamentals.epsTtm) : 'unavailable'}
- Dividend yield: ${fundamentals ? pct(fundamentals.dividendYield) : 'unavailable'}
- Net margin: ${fundamentals ? pct(fundamentals.netMargin) : 'unavailable'}
- Return on equity: ${fundamentals ? pct(fundamentals.roe) : 'unavailable'}
- Debt/equity: ${fundamentals ? fmt(fundamentals.debtToEquity) : 'unavailable'}

ENTRY CEILING (the strictest of the anchors below)
${anchorLines}
- Resulting ceiling: ${ceiling.ceiling !== null ? `$${ceiling.ceiling.toFixed(2)}` : 'could not be computed — no anchors available'}
- Binding anchor: ${ceiling.binding ?? 'none'}
- Current price vs ceiling: ${ceiling.premiumPct === null ? 'unavailable' : `${ceiling.premiumPct >= 0 ? '+' : ''}${ceiling.premiumPct.toFixed(1)}%`}

POSITION SIZING (assumptions: account $${assumptions.portfolioValue.toLocaleString()}, ${assumptions.riskPerTradePct}% risk per trade, ${assumptions.marginOfSafety}% margin of safety, ${assumptions.minRewardRisk}:1 minimum reward:risk)
${sizingLines}
- Binding rule: ${sizing.binding ?? 'none'}
- Recommended: ${sizing.recommended ?? 'unavailable'} shares
- Stop: ${sizing.stopPrice !== null ? `$${sizing.stopPrice.toFixed(2)}` : 'unavailable'}
- Capital at risk if stopped: ${sizing.riskAmount !== null ? `$${sizing.riskAmount.toFixed(0)} (${fmt(sizing.riskPctOfAccount, 2, '%')} of the account)` : 'unavailable'}

RECENT HEADLINES
${newsLines}

TASK
Write a note of at most 260 words, in this shape:

## The setup
Two or three sentences on what the trend and fundamentals figures show.

## What the ceiling means
Name the binding anchor and explain why it is the constraint. State plainly
whether the current price is above or below the ceiling and what that implies
for waiting versus acting.

## Sizing and risk
Explain the binding sizing rule, what being stopped out would cost, and the one
assumption most likely to be wrong.

## What would change the picture
Two bullets: what would raise the ceiling, and what would invalidate the setup.

Cite only figures from the DATA block. Where something is unavailable, say so.`;
}

/** The portfolio note: reads the computed analytics, not the raw holdings. */
export function buildPortfolioPrompt({ summary, stats, sectors, concentration, topPositions, headlines, handleResult, structure }) {
  const sectorLines = sectors.slice(0, 8).map((s) => `- ${s.sector}: ${pct(s.weight)}`).join('\n');
  const positionLines = topPositions
    .map((p) => `- ${p.symbol}: ${pct(p.weight)} of the book, P/L ${p.pnlPct === null ? 'unavailable' : fmt(p.pnlPct, 1, '%')}`)
    .join('\n');
  const newsLines = headlines.length
    ? headlines.slice(0, 8).map((h) => `- "${h.title}" (${h.source})`).join('\n')
    : '- no headlines available (no NewsAPI key, or nothing in the window)';

  const handleBlock = handleResult
    ? `
APPLIED HANDLE — ${handleResult.label}
- Volatility: ${pct(handleResult.beforeVol)} to ${pct(handleResult.afterVol)}
- Annualised return (trailing): ${pct(handleResult.beforeReturn)} to ${pct(handleResult.afterReturn)}
- Trades required: ${handleResult.tradeCount}, turnover ${fmt(handleResult.turnoverPct, 1, '%')} of the book
- Largest moves: ${handleResult.topTrades}`
    : '';

  return `DATA — imported portfolio

TOTALS
- Positions: ${summary.positionCount} (${summary.pricedCount} priced live)
- Market value: $${summary.totalValue.toFixed(0)}
- Cost basis: ${summary.totalCost ? `$${summary.totalCost.toFixed(0)}` : 'unavailable (no cost column in the import)'}
- Unrealised P/L: ${summary.totalPnl === null ? 'unavailable' : `$${summary.totalPnl.toFixed(0)} (${fmt(summary.totalPnlPct, 1, '%')})`}
- Today: ${summary.dayPnl ? `$${summary.dayPnl.toFixed(0)} (${fmt(summary.dayPnlPct, 2, '%')})` : 'unavailable'}

RISK (from ${stats.observations} overlapping daily observations)
- Annualised volatility: ${pct(stats.annVol)}
- Annualised return (trailing): ${pct(stats.annReturn)}
- Sharpe: ${fmt(stats.sharpe)}
- Max drawdown: ${pct(stats.maxDrawdown)}
- Beta vs S&P 500: ${fmt(stats.beta)}

CONCENTRATION
- Herfindahl index: ${fmt(concentration.hhi, 3)}
- Effective number of names: ${fmt(concentration.effectiveNames, 1)} out of ${summary.positionCount}
- Top five weight: ${pct(concentration.top5)}

TAIL RISK (from the realised distribution, not a normal assumption)
- Value at risk, 95% one-day: ${structure?.tail ? `$${Math.abs(structure.tail.varMoney).toFixed(0)} (${pct(structure.tail.varPct, 2)})` : 'unavailable'}
- Expected shortfall on those days: ${structure?.tail ? `$${Math.abs(structure.tail.esMoney).toFixed(0)} (${pct(structure.tail.esPct, 2)})` : 'unavailable'}
- Worst session on record: ${structure?.extremes?.worst ? `${pct(structure.extremes.worst.pct, 2)} on ${structure.extremes.worst.date}, $${Math.abs(structure.extremes.worst.money).toFixed(0)}` : 'unavailable'}
- Share of sessions closing up: ${structure?.hitRate !== undefined ? pct(structure.hitRate, 0) : 'unavailable'}

DIVERSIFICATION
- Diversification ratio: ${structure?.diversification ? `${fmt(structure.diversification.ratio, 2)}x` : 'unavailable'}
- Weighted average volatility of the parts: ${structure?.diversification ? pct(structure.diversification.weightedAvgVol) : 'unavailable'}
- Volatility of the whole: ${structure?.diversification ? pct(structure.diversification.portfolioVol) : 'unavailable'}
- Effective independent bets: ${structure?.diversification ? fmt(structure.diversification.independentBets, 1) : 'unavailable'} out of ${summary.positionCount} positions
- Most correlated pairs: ${structure?.pairs?.length ? structure.pairs.map((p) => `${p.a}/${p.b} ${p.rho.toFixed(2)}`).join(', ') : 'unavailable'}

SECTOR MIX
${sectorLines}

LARGEST POSITIONS
${positionLines}
${handleBlock}

RECENT HEADLINES ACROSS THE HOLDINGS
${newsLines}

TASK
Write at most 380 words, in this shape:

## Where this book stands
What the value, P/L and risk figures actually say.

## The concentration question
Read the Herfindahl and top-five figures against the effective name count AND
against the number of independent bets. If the diversification ratio says the
names overlap, name the specific pair or sector doing it, and say what that
means for a book this size.

## What a bad day costs
State the value at risk and expected shortfall in money, and anchor them to the
worst session that actually happened. Say plainly whether that is a loss this
book can absorb given its size.

## What the news bears on
Connect the headlines to the specific holdings or sectors they touch. If a
headline is not relevant to this book, leave it out. Do not forecast.

## The one thing to look at first
A single, specific observation — the position or exposure most worth attention,
and why the computed numbers point there.

Cite only figures from the DATA block. Never invent a number.`;
}

/** Name the live themes from headlines grouped by sector. */
export function buildThemePrompt(sectorHeadlines) {
  const blocks = Object.entries(sectorHeadlines)
    .filter(([, items]) => items.length)
    .map(([sector, items]) => `${sector}:\n${items.slice(0, 5).map((h) => `- "${h.title}" (${h.source})`).join('\n')}`)
    .join('\n\n');

  return `DATA — headlines from the last seven days, grouped by sector

${blocks || '(no headlines available)'}

TASK
Identify at most four themes that these headlines actually support. For each:

- **Theme name** (three to five words) — one sentence on what the headlines say,
  then the sectors it touches, then which of the headlines above it rests on.

Rules: a theme must be supported by at least two of the headlines above. Report
what the coverage is discussing — not what will happen to prices, and no
predictions. If the headlines do not support four themes, give fewer. If there
are no headlines, say so and stop.

Return markdown bullets only, no preamble.`;
}

/**
 * The investment-committee commentary.
 *
 * The committee is being asked for a million dollars, so the prompt is built to
 * make the awkward things unavoidable: the rejected names go in, the sizing
 * comparison goes in including the case where the naive benchmark wins, and the
 * model is asked for the strongest argument against its own book. A commentary
 * that recites only the flattering figures is the one an experienced committee
 * discounts immediately.
 */
export function buildThesisPrompt({
  thesis, params, method, counts, loaded, pool, holdings, rejected, stats, comparison, pairs, synthetic
}) {
  const holdingLines = holdings
    .filter((h) => h.weight !== null)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .map(
      (h) =>
        `- ${h.symbol} (${h.sector ?? 'sector unavailable'}), screen rank ${h.rank ?? 'n/a'}: ` +
        `${pct(h.weight)} of the book, $${Math.round(h.value ?? 0)}, ` +
        `risk share ${pct(h.riskShare)}, P/E ${fmt(h.pe, 1)} ` +
        `(${h.relativePe === null ? 'sector comparison unavailable' : `${fmt(h.relativePe, 2)}x sector median`}), ` +
        `ROE ${pct(h.roe, 0)}, 3-month ${pct(h.mom3m, 1)}`
    )
    .join('\n');

  // Grouped by reason, because "eight names failed on leverage" is a statement
  // about the screen while "AMT failed on leverage" is one about a single name.
  const byReason = new Map();
  for (const r of rejected) {
    for (const reason of r.reasons.length ? r.reasons : ['no data']) {
      if (!byReason.has(reason)) byReason.set(reason, []);
      byReason.get(reason).push(r.symbol);
    }
  }
  const rejectLines = [...byReason.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([reason, syms]) => `- ${reason}: ${syms.length} name(s) — ${syms.join(', ')}`)
    .join('\n');

  const comparisonLines = comparison
    .map(
      (c) =>
        `- ${c.method}: vol ${pct(c.vol)}, trailing return ${pct(c.ret)}, Sharpe ${fmt(c.sharpe)}` +
        `${c.zeroed ? `, wanted to zero ${c.zeroed} of the selected names before the floor was applied` : ''}` +
        `${c.method === method ? '  <-- the book being pitched' : ''}`
    )
    .join('\n');

  const provenance = synthetic
    ? `
PROVENANCE — IMPORTANT
Some or all of these figures were computed from a clearly-labelled SYNTHETIC
archive, not live market data. The arithmetic is real; the inputs are generated.
Say so in one short sentence at the end, and do not present any figure as a
current market fact.`
    : '';

  return `DATA — thesis portfolio

THESIS
${thesis.name} (${thesis.short}).
${thesis.claim}

CONSTRUCTION
- Candidate pool screened: ${loaded} of ${pool} names
- Gates passed by ${counts.pass}, failed by ${counts.fail}, not evaluable for ${counts.incomplete}
- Ranking: composite z-score weighted ${Object.entries(thesis.sleeveWeights).map(([k, v]) => `${(v * 100).toFixed(0)}% ${k}`).join(' / ')}
- Sizing method used: ${method}
- Position band: floor ${pct(params.minWeight, 0)}, cap ${pct(params.maxWeight, 0)}
- Mandate: $${params.capital.toLocaleString('en-US')}, of which $${Math.round(stats.invested)} invested and $${Math.round(stats.cash)} residual cash (whole shares only)

PORTFOLIO RISK (from the realised return distribution)
- Annualised volatility: ${pct(stats.vol)}
- Annualised trailing return: ${pct(stats.ret)}
- Sharpe: ${fmt(stats.sharpe)}
- Max drawdown in the window: ${pct(stats.maxDrawdown)}
- Beta to the S&P 500 proxy: ${fmt(stats.beta)}
- Effective independent bets: ${fmt(stats.independentBets, 1)} out of ${holdings.length} positions
- Value at risk, 95% one-day: ${stats.varMoney === null ? 'unavailable' : `$${Math.abs(Math.round(stats.varMoney))}`}
- Expected shortfall on those days: ${stats.esMoney === null ? 'unavailable' : `$${Math.abs(Math.round(stats.esMoney))}`}
- Most correlated pairs: ${pairs.length ? pairs.map((p) => `${p.a}/${p.b} ${p.rho.toFixed(2)}`).join(', ') : 'unavailable'}

HOLDINGS
${holdingLines || '- none priced'}

WHY THE REST WERE REJECTED
${rejectLines || '- nothing was rejected'}

SIZING METHODS COMPARED, SAME NAMES
${comparisonLines}
${provenance}

TASK
Write at most 450 words for an investment committee deciding on a $${(params.capital / 1e6).toFixed(0)}M allocation, in this shape:

## The case
What the thesis is, and what the screen actually did to the pool. Use the
pass/fail counts. One paragraph.

## The book
The shape of the portfolio: what it is concentrated in, and whether risk share
tracks capital weight or diverges from it. Name the specific positions where it
diverges.

## What a bad day costs
Value at risk and expected shortfall in money against the mandate size, and the
independent-bet count read against the position count.

## The strongest objection
The single best argument against this portfolio, drawn from the figures above —
including the sizing comparison. If a simpler method scored better on this
window, say so plainly. Do not soften it.

## What would change our mind
The specific, observable condition that would falsify the thesis.`;
}

export async function generate(prompt, apiKey, options) {
  if (!apiKey) throw new Error('No OpenRouter key — add one to generate the written note.');
  return callOpenRouter(prompt, apiKey, options);
}

/** Minimal markdown to HTML for the note blocks. Escapes first, always. */
export function markdownToHtml(md) {
  const esc = String(md)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = esc.split('\n');
  const out = [];
  let inList = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }
    const inline = (s) =>
      s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');

    if (/^#{1,6}\s/.test(t)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h4>${inline(t.replace(/^#{1,6}\s*/, ''))}</h4>`);
      continue;
    }
    if (/^[-*]\s/.test(t)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(t.replace(/^[-*]\s*/, ''))}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(`<p>${inline(t)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}
