import { eventTicker, findEvent } from '../lib/kalshi.js';
export default async function handler(req, res) {
  const { away, home, gameDate } = req.query;
  try { eventTicker('KXNFLSPREAD', away, home, gameDate); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  try {
    const match = await findEvent('KXNFLSPREAD', away, home, gameDate);

    if (!match || !match.markets || !match.markets.length) {
      return res.status(200).json({ available: false });
    }

    const lines = match.markets.map(market => {
      const yesBid = parseFloat(market.yes_bid_dollars);
      const yesAsk = parseFloat(market.yes_ask_dollars);
      const yesProb = (yesBid && yesAsk) ? (yesBid + yesAsk) / 2 : (yesBid || yesAsk || null);

      const tickerSuffix = market.ticker.split('-').pop();
      const favoredTeam = (tickerSuffix.match(/^[A-Z]+/) || [null])[0];

      const text = market.yes_sub_title || market.title || '';
      const lineMatch = text.match(/(\d+\.?\d*)/);
      const line = lineMatch ? parseFloat(lineMatch[1]) : null;

      return { favoredTeam, line, yesProb };
    }).filter(l => l.yesProb && l.line !== null);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
    res.status(200).json({ available: lines.length > 0, lines, eventTicker: match.event_ticker });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
