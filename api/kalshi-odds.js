import { eventTicker, findEvent, kalshiJSON, teamQuote, numberOrNull } from '../lib/kalshi.js';
export default async function handler(req, res) {
  const { away, home, gameDate } = req.query;
  try { eventTicker('KXNFLGAME', away, home, gameDate); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [event, feeResult] = await Promise.all([
      findEvent('KXNFLGAME', away, home, gameDate),
      kalshiJSON('series/KXNFLGAME').catch(() => null)
    ]);
    const fetchedAt = new Date().toISOString();
    if (!event) return res.status(200).json({ available: false, reason: 'No market matched this game date.', fetchedAt });
    const series = feeResult?.series;
    const multiplier = numberOrNull(series?.fee_multiplier);
    const supported = ['quadratic', 'quadratic_with_maker_fees'].includes(series?.fee_type) && multiplier !== null && multiplier >= 0;
    res.status(200).json({ available: true, eventTicker: event.event_ticker, fetchedAt,
      away: teamQuote(event, away), home: teamQuote(event, home),
      fee: supported ? { type: series.fee_type, multiplier } : null });
  } catch (error) { res.status(502).json({ error: error.message }); }
}
