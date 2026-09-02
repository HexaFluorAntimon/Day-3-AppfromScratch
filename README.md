# Aura III — Screener & Portfolio

A two-tab single-page application, built from scratch.

**Screener** filters the S&P 500 by sector and by what the numbers say, reads what
the news is actually discussing, and turns a selected name into an entry ceiling
and a share count — with the arithmetic shown. **Portfolio** imports a CSV or
Excel export of your holdings, prices it live, and offers eight rebalancing
objectives that each return the exact trades and what they change.

Built for **Generative AI in Finance**, Executive Academy WU — Day 3 repository.

> Day 1 — one ticker, indicators, an LLM research note →
> [Day-1-StockTicker](https://github.com/HexaFluorAntimon/Day-1-StockTicker)
> Day 2 — S&P 500 markets view and portfolio optimisation →
> [Day-2-StockTickerPortfolioOptimization](https://github.com/HexaFluorAntimon/Day-2-StockTickerPortfolioOptimization)

**Live:** _enable GitHub Pages (Settings → Pages → Source: GitHub Actions), then the URL appears here_

---

## The rule this app is built on

**Arithmetic from the code, language from the model. Nothing is invented.**

Every figure — every indicator, ceiling, share count, covariance and weight — is
computed in JavaScript from data you supplied a key for. The LLM receives finished
numbers and explains them; it never calculates and never fills a gap.

Where an input is missing, the app says so. A missing P/E renders as `—` and the
anchor that needed it is listed as unavailable with the reason. A symbol outside
the loaded universe gets no invented company. A portfolio position without a quote
is excluded from the totals and named in the summary. There is no sample data
dressed up as live data anywhere in this repository.

## Tab 1 — Screener

- **Universe.** Without an FMP key you get a bundled 121-name subset, labelled as
  a subset. With one, the app loads the **real, complete constituent list** from
  FMP and says so. Only ticker, name and sector are bundled — three facts that do
  not go stale.
- **Filters.** Sector chips plus metric filters (max P/E, min yield, max
  volatility, min 3-month return). A filter only excludes a name whose value is
  *known* to miss the bar — names with no data loaded stay visible as `—`, so a
  filter never hides the index behind missing data.
- **Live themes.** Headlines from the last seven days, grouped by sector, with the
  LLM naming only themes at least two of those headlines support. Each sector card
  shows its story count beside its proxy ETF's move, so a "hot sector" the tape
  disagrees with is visible as exactly that.

### The maximum meaningful price

The entry ceiling is the **minimum of four independent anchors**, because the
strictest one is the real constraint. Each answers a different question:

| Anchor | Question it answers | How it is computed |
|---|---|---|
| Justified multiple | What do comparable earnings streams fetch? | sector median P/E × trailing EPS, less your margin of safety |
| Consensus, discounted | What does the street think, if the street is optimistic? | FMP consensus target, less the same margin |
| Chase guard | Am I paying up into a move that already happened? | a set percentage above the 50-day average |
| Reward:risk gate | Is the trade still worth the risk at this price? | the highest entry where `(target − entry) / (entry − stop) ≥ R`, stop at *k*×ATR |

The panel names the binding anchor, shows the others, and lists any that could not
be computed. If none can be computed, the ceiling is `—`, not a guess.

### How many shares

Three sizing rules, shown side by side because they disagree informatively:

- **Risk-based** — size so being stopped out costs exactly your risk budget.
  *This is the number that controls the loss.*
- **Volatility-targeted** — size so the position contributes a set volatility.
  *This is the number that controls the wobble.*
- **Half-Kelly** — the growth-optimal fraction from the setup's own payoff, halved,
  because full Kelly is intolerant of an overstated edge. The assumed hit rate is
  stated, not discovered.

The recommendation is the **smallest** of the three — sizing up to the largest
would defeat the purpose of computing the others. A staged three-tranche entry
ladder is offered between the ceiling and the stop.

## Tab 2 — Portfolio

- **Import.** Drag in a CSV or Excel file. Column names are auto-detected across
  common broker exports (including German headers like `Anzahl`,
  `Einstandskurs`), numbers are parsed in both `1,234.56` and `1.234,56` forms,
  and the mapping is shown for you to correct before anything is computed. A row
  that cannot be read is reported with its line number and the reason — never
  dropped silently, never defaulted.
- **Overview.** Live value, cost basis, unrealised and daily P/L, per-position
  weights, sector allocation, and concentration (Herfindahl index, effective
  number of names, top-five weight).
- **Risk model.** Covariance built only from **genuinely overlapping** sessions;
  names with too little shared history are excluded and named. Annualised
  volatility and return, Sharpe, max drawdown, beta, and each position's share of
  total portfolio variance — the last of which is where the interesting news
  usually is.

### The handles

Each is a real optimisation over your holdings, long-only, weights summing to 1,
capped at your maximum position weight. Solved from scratch by projected gradient
descent onto the capped simplex — no solver dependency.

| Handle | Objective |
|---|---|
| **Reduce risk** | minimum variance |
| **Maximise return** | highest trailing expected return, capped |
| **Best risk-adjusted** | maximum Sharpe ratio |
| **Diversify** | minimum Herfindahl index |
| **Risk parity** | equal risk contribution |
| **Lower market beta** | track a portfolio beta of 0.8 |
| **Income tilt** | maximum yield under a volatility ceiling |
| **Fewest trades** | lower variance with an L1 turnover penalty |

Every handle returns **target weights, the whole-share trades to reach them**, and
before/after volatility, return, concentration and turnover. A handle whose inputs
are missing refuses and says which key it needs — *Income tilt* does not run on
assumed yields.

## Running it

```bash
npm install
npm run dev
```

`npm run build` produces a static `dist/`. Pushing to `main` deploys to GitHub
Pages via `.github/workflows/deploy.yml`. **One-time setup:** Settings → Pages →
Source: **GitHub Actions**. Left on "Deploy from a branch", the build runs but its
output is ignored and the page comes out unstyled.

## API keys

All four are optional and entered in the app at run time. They are stored in your
browser's `localStorage` and sent only to the service they belong to — never
committed, logged or proxied.

| Service | What it unlocks | Free key |
|---|---|---|
| **Twelve Data** | prices, history, ATR, volatility, beta | [twelvedata.com](https://twelvedata.com/pricing) |
| **FMP** | the full constituent list, P/E, EPS, yields, targets, sector multiples | [financialmodelingprep.com](https://financialmodelingprep.com/developer/docs) |
| **NewsAPI** | headlines for the themes and the portfolio read | [newsapi.org](https://newsapi.org) |
| **OpenRouter** | the written notes | [openrouter.ai](https://openrouter.ai) |

Free tiers are small — Twelve Data allows 8 requests/minute — so quotes are
batched into a single multi-symbol request, responses are cached for a minute, and
history loads in explicit batches you trigger rather than on page load.

> Because this is a static app with no backend, a typed key goes straight from your
> browser to the service over HTTPS. That is fine for a classroom or portfolio
> demo. A production app would proxy the calls so keys never reach the browser.

## Troubleshooting

Failed calls surface the service's own message with its status, as
`<label>: (HTTP <code>) <hint> <message>`.

| Code | Meaning | What to do |
|---|---|---|
| 401 | key invalid or missing | recheck the pasted key, watch for a stray space |
| 402 / 403 | endpoint not on your plan, or credits exhausted | FMP consensus targets sit behind a paid tier on some accounts — the app skips that anchor and uses the rest |
| 429 | rate limited | wait a minute; the free tiers are small |
| 400 "Provider returned error" | the model provider rejected the request | read the part after `[provider: ...]` |

## Design

Bauhaus cut-paper geometry — discs, blades, quarter-circles — on a warm creme
ground, with a graduated green range and one ochre accent used sparingly. The
stylesheet is hand-written: no utility framework and **no runtime CSS or JS
dependency**, so the page renders from its own two files. Colour lives in a token
layer on `:root`, so the whole theme retunes from one place.

Direction is never signalled by colour alone — every delta carries a glyph — and
the ochre accent is reserved for the two places it means something: the binding
constraint, and a position supplying more risk than its capital share.

## Layout

```
index.html          markup for both tabs, the keys modal, the Bauhaus artwork
style.css           the design system: tokens, components, responsive rules
main.js             state, tab routing, rendering, event wiring
src/universe.js     the bundled subset, the FMP constituent loader, search
src/api.js          Twelve Data / FMP / NewsAPI clients, batching, caching, errors
src/analysis.js     indicators, the entry ceiling, position sizing
src/portfolio.js    CSV parsing, column mapping, valuation, the risk model
src/optimize.js     the simplex projection, the eight handles, trade generation
src/llm.js          OpenRouter prompts and markdown rendering
src/themes.js       sector headlines and proxy-ETF moves
```

Asset paths are relative and `vite.config.js` sets `base: './'` — this is what
makes the site work under the `/<repo-name>/` subpath GitHub Pages serves a
project site from. Do not give them a leading `/`.

## A note on what this is

Educational analysis under assumptions you set on screen — **not investment
advice**, and not a recommendation to buy or sell anything. The sizing panel exists
to make the arithmetic of risk visible, not to tell you what to own. Every number
it prints can be recomputed by hand from the inputs it names.
