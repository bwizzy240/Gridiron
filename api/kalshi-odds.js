export default async function handler(req, res) {
  const { away, home } = req.query;
  if (!away || !home) return res.status(400).json({ error: 'missing away or home' });

  try {
    const r = await fetch(
      'https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=KXNFLGAME&status=open&with_nested_markets=true&limit=200'
    );
    if (!r.ok) throw new Error(`Kalshi API returned ${r.status}`);
    const data = await r.json();
    const events = data.events || [];

    // NFL event tickers look like KXNFLGAME-{date}{AWAY}{HOME}, e.g. KXNFLGAME-26SEP09NESEA
    const suffix = `${away}${home}`;
    const match = events.find(e =>
      e.event_ticker && e.event_ticker.startsWith('KXNFLGAME-') && e.event_ticker.endsWith(suffix)
    );

    if (!match || !match.markets || !match.markets.length) {
      return res.status(200).json({ available: false });
    }

    const market = match.markets[0];
    const yesBid = parseFloat(market.yes_bid_dollars);
    const yesAsk = parseFloat(market.yes_ask_dollars);
    if (!yesBid && !yesAsk) {
      return res.status(200).json({ available: false, reason: 'no live quotes yet' });
    }
    const yesProb = (yesBid && yesAsk) ? (yesBid + yesAsk) / 2 : (yesBid || yesAsk);
    const yesTeam = market.ticker.split('-').pop();

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
    res.status(200).json({ available: true, yesTeam, yesProb, eventTicker: match.event_ticker });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
