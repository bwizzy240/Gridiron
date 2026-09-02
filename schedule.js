export default async function handler(req, res) {
  const { week, seasontype, year } = req.query;
  const params = new URLSearchParams();
  if (week) params.set('week', week);
  if (seasontype) params.set('seasontype', seasontype);
  if (year) params.set('year', year);

  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${params.toString()}`
    );
    if (!r.ok) throw new Error(`ESPN API returned ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
