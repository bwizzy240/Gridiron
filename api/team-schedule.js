import { summarizeSeason } from '../model.js';
export default async function handler(req, res) {
  const { teamId, season, beforeDate } = req.query;
  if (!/^\d+$/.test(teamId || '') || !/^\d{4}$/.test(season || '') || !beforeDate || !Number.isFinite(Date.parse(beforeDate))) return res.status(400).json({ error: 'Valid teamId, season and beforeDate required' });
  const year = Number(season);
  if (year < 1921 || year > new Date().getUTCFullYear() + 1) return res.status(400).json({ error: 'Season is out of range' });
  async function fetchSeason(seasonYear) {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?season=${seasonYear}&seasontype=2`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`ESPN API returned ${r.status}`);
    const summary = summarizeSeason(await r.json(), teamId, seasonYear, beforeDate);
    return { ...summary, fetchedAt: new Date().toISOString() };
  }
  try {
    const [current, previous] = await Promise.allSettled([fetchSeason(year), fetchSeason(year - 1)]);
    if (current.status !== 'fulfilled') throw current.reason;
    const stats = current.value;
    const previousSeason = previous.status === 'fulfilled' ? previous.value : null;
    const lastGameDate = stats.lastGameDate || previousSeason?.lastGameDate;
    const daysRest = lastGameDate ? Math.round((Date.parse(beforeDate) - Date.parse(lastGameDate)) / 86400000) : null;
    // Versioned client request avoids serving the old single-season response from a CDN cache.
    res.setHeader('Cache-Control', 's-maxage=900');
    res.status(200).json({ ...stats, previousSeason, historyStatus: previousSeason ? 'available' : 'unavailable',
      daysRest, beforeDate, dataVersion: 2 });
  } catch (error) { res.status(502).json({ error: error.message }); }
}
