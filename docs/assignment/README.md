# Pre-module assignment — where each item lives

Generative AI in Finance, Executive Academy WU.

| # | Deliverable | Where |
|---|---|---|
| 1 | Functional Requirements Document | submitted separately (not in this repository) |
| 2 | Portfolio construction — 18 names from a 47-name screen | [`src/thesis.js`](../../src/thesis.js), and the Thesis tab |
| 3 | Portfolio dashboard, published via GitHub Pages | **[the Thesis tab](https://hexafluorantimon.github.io/Day-3-AppfromScratch/#thesis)** |
| 4 | Executive Summary | submitted separately (not in this repository) |
| 5 | Investment Committee presentation | submitted separately (not in this repository) |

The written documents are handed in through the course's own submission
template, so they are deliberately not committed here. What *is* here is the
thing they describe, plus the means to reproduce every figure they quote.

## The thesis in one line

Quality at a Reasonable Price, with momentum confirmation: pay below your sector
for above-average profitability, and don't stand in front of a downtrend.

## Reproducing every figure

```bash
npm install
node scripts/run-thesis.mjs          # human-readable
node scripts/run-thesis.mjs --json   # machine-readable
```

`thesis-run-output.txt` is a captured run. Every number quoted in the written
deliverables comes from it, so changing a threshold in `PARAMS` moves the
documents' figures rather than leaving them to disagree with the application.

With no API keys the inputs come from the labelled synthetic archive in
`src/demo.js`; the arithmetic is identical either way, and the deployed app
recomputes everything from live data once keys are entered.
