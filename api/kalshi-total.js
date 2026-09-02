export default async function handler(req, res) {
  const { away, home } = req.query;
  if (!away || !home) return res.status(400).json({ error: 'missing away or home' });

  try {
    const r = await fetch(
      'https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=KXNFLTOTAL&status=open&with_nested_markets=true&limit=200'
    );
    if (!r.ok) throw new Error(`Kalshi API returned ${r.status}`);
    const data = await r.json();
    const events = data.events || [];

    const suffix = `${away}${home}`;
    const match = events.find(e =>
      e.event_ticker && e.event_ticker.startsWith('KXNFLTOTAL-') && e.event_ticker.endsWith(suffix)
    );

    if (!match || !match.markets || !match.markets.length) {
      return res.status(200).json({ available: false });
    }

    const lines = match.markets.map(market => {
      const yesBid = parseFloat(market.yes_bid_dollars);
      const yesAsk = parseFloat(market.yes_ask_dollars);
      const yesProb = (yesBid && yesAsk) ? (yesBid + yesAsk) / 2 : (yesBid || yesAsk || null);

      // "Yes" on these markets means the stated Over threshold was hit
      const text = market.yes_sub_title || market.title || '';
      const lineMatch = text.match(/(\d+\.?\d*)/);
      const line = lineMatch ? parseFloat(lineMatch[1]) : null;

      return { line, overProb: yesProb };
    }).filter(l => l.overProb && l.line !== null);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
    res.status(200).json({ available: lines.length > 0, lines, eventTicker: match.event_ticker });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
