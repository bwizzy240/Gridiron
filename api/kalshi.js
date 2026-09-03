// Vercel serverless function — proxies Kalshi's public market-data API server-side so the
// browser never has to talk to external-api.kalshi.com directly (which avoids the CORS block
// and the 403 Kalshi returns to some direct browser-origin requests).
//
// Deployed automatically by Vercel from /api/kalshi.js — no extra config needed.
// Gridiron calls this as: /api/kalshi?path=events&series_ticker=KXNFLGAME&status=open&with_nested_markets=true&limit=200

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { path, ...rest } = req.query || {};
  if (!path || Array.isArray(path)) {
    res.status(400).json({ error: 'missing or invalid "path" query param, e.g. path=events' });
    return;
  }

  const qs = new URLSearchParams(rest).toString();
  const kalshiUrl = `https://external-api.kalshi.com/trade-api/v2/${path}${qs ? '?' + qs : ''}`;

  try {
    const kalshiRes = await fetch(kalshiUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'gridiron-app/1.0' }
    });
    const text = await kalshiRes.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(kalshiRes.status).send(text);
  } catch (err) {
    res.status(502).json({ error: 'kalshi proxy fetch failed', detail: String((err && err.message) || err) });
  }
}
