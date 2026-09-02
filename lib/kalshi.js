const BASE = 'https://api.elections.kalshi.com/trade-api/v2';
export const teamCode = code => ({ WSH: 'WAS', LA: 'LAR' }[code] || code);
export async function kalshiJSON(path) {
  const response = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Kalshi API returned ${response.status}`);
  return response.json();
}
export function eventTicker(series, away, home, gameDate) {
  if (!/^[A-Z]{2,3}$/.test(away || '') || !/^[A-Z]{2,3}$/.test(home || '') ||
      !gameDate || !Number.isFinite(Date.parse(gameDate))) throw new Error('Valid teams and gameDate required');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: '2-digit', month: 'short', day: '2-digit'
  }).formatToParts(new Date(gameDate)).map(p => [p.type, p.value]));
  return `${series}-${parts.year}${parts.month.toUpperCase()}${parts.day}${teamCode(away)}${teamCode(home)}`;
}
export async function findEvent(series, away, home, gameDate) {
  const ticker = eventTicker(series, away, home, gameDate);
  const response = await fetch(`${BASE}/events/${ticker}?with_nested_markets=true`, { signal: AbortSignal.timeout(12000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Kalshi API returned ${response.status}`);
  const data = await response.json();
  return data.event ? { ...data.event, markets: data.event.markets?.length ? data.event.markets : (data.markets || []) } : null;
}
export function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function teamQuote(event, team) {
  const market = event.markets.find(m => m.ticker === `${event.event_ticker}-${teamCode(team)}`);
  if (!market) return null;
  const ask = numberOrNull(market.yes_ask_dollars);
  const bid = numberOrNull(market.yes_bid_dollars);
  return {
    ticker: market.ticker, team, status: market.status,
    ask: ask !== null && ask > 0 && ask < 1 ? ask : null,
    bid: bid !== null && bid >= 0 && bid <= 1 ? bid : null,
    askSize: numberOrNull(market.yes_ask_size_fp),
    rules: [market.rules_primary, market.rules_secondary].filter(Boolean).join('\n\n')
  };
}
