// Live themes: what the news is actually discussing, sector by sector.
//
// Headlines are pulled per sector, the LLM names the themes from those
// headlines only, and every theme keeps the headlines it rests on so a reader
// can check it. Where a sector proxy ETF is priced, its trailing move is shown
// beside the theme — not to confirm the theme, but so a "hot sector" claim the
// tape disagrees with is visible as exactly that.

import { fetchHeadlines, fetchQuotes } from './api.js';
import { SECTOR_PROXY } from './universe.js';

/** Search phrases that surface sector news rather than single-company news. */
const SECTOR_QUERIES = {
  Energy: 'oil OR gas OR OPEC OR crude OR refinery',
  'Information Technology': 'semiconductor OR "artificial intelligence" OR cloud computing OR chipmaker',
  'Health Care': 'pharmaceutical OR FDA OR biotech OR drug trial',
  Financials: 'interest rates OR bank earnings OR Federal Reserve OR credit',
  Industrials: 'manufacturing OR aerospace OR defence spending OR freight',
  'Consumer Discretionary': 'retail sales OR consumer spending OR e-commerce',
  'Consumer Staples': 'grocery OR consumer goods OR food prices',
  'Communication Services': 'streaming OR advertising market OR telecom',
  Utilities: 'electricity demand OR power grid OR utility regulation',
  'Real Estate': 'commercial real estate OR REIT OR office vacancy',
  Materials: 'copper OR steel OR mining OR chemicals'
};

/**
 * Fetch headlines per sector. Sectors that return nothing are simply absent —
 * there is no filler.
 */
export async function fetchSectorHeadlines(newsKey, sectors = Object.keys(SECTOR_QUERIES)) {
  if (!newsKey) return {};
  const out = {};

  // Sequential: NewsAPI's developer tier is rate limited, and a burst of eleven
  // parallel requests is the fastest way to get a 429.
  for (const sector of sectors) {
    const query = SECTOR_QUERIES[sector];
    if (!query) continue;
    try {
      const items = await fetchHeadlines(query, newsKey, { pageSize: 6, days: 7 });
      if (items.length) out[sector] = items;
    } catch (err) {
      // One sector failing must not lose the other ten.
      out[sector] = [];
      console.warn(`[themes] ${sector}: ${err.message}`);
    }
  }
  return out;
}

/**
 * Trailing performance of each sector's proxy ETF, so a theme can be read
 * against what that sector is actually doing.
 */
export async function fetchSectorMoves(twelveKey, sectors) {
  const proxies = sectors.map((s) => SECTOR_PROXY[s]).filter(Boolean);
  if (!twelveKey || !proxies.length) return new Map();

  const quotes = await fetchQuotes(proxies, twelveKey);
  const bySector = new Map();
  for (const sector of sectors) {
    const proxy = SECTOR_PROXY[sector];
    const q = proxy ? quotes.get(proxy) : null;
    if (q) bySector.set(sector, { proxy, changePct: q.changePct, price: q.price });
  }
  return bySector;
}

/** Count of headlines per sector, most-covered first. */
export function coverageRanking(sectorHeadlines) {
  return Object.entries(sectorHeadlines)
    .map(([sector, items]) => ({ sector, count: items.length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}
