export default async function handler(req, res) {
  const { teamId, season, beforeDate } = req.query;
  if (!/^\d+$/.test(teamId || '') || !/^\d{4}$/.test(season || '') || !beforeDate || !Number.isFinite(Date.parse(beforeDate))) return res.status(400).json({ error: 'Valid teamId, season and beforeDate required' });

  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?season=${season}&seasontype=2`
      , { signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) throw new Error(`ESPN API returned ${r.status}`);
    const data = await r.json();

    const events = data.events || [];
    let wins = 0, losses = 0, ties = 0;
    let homeWins = 0, homeLosses = 0, homeTies = 0, awayWins = 0, awayLosses = 0, awayTies = 0;
    let pointsFor = 0, pointsAgainst = 0, gamesPlayed = 0;
    let lastGameDate = null;

    events.forEach(ev => {
      const comp = ev.competitions && ev.competitions[0];
      if (!comp || !comp.status || comp.status.type.state !== 'post') return;
      // Exclude the target game and every later game from ALL model inputs.
      if (!Number.isFinite(Date.parse(comp.date)) || Date.parse(comp.date) >= Date.parse(beforeDate)) return;
      if (Number(ev.seasonType?.type ?? ev.season?.type ?? data.season?.type) === 1) return; // no preseason form

      const self = comp.competitors.find(c => String(c.id) === String(teamId) || String(c.team.id) === String(teamId));
      const opp = comp.competitors.find(c => c !== self);
      if (!self || !opp) return;

      const selfScore = Number(self.score?.value ?? self.score);
      const oppScore = Number(opp.score?.value ?? opp.score);
      if (isNaN(selfScore) || isNaN(oppScore)) return;

      gamesPlayed++;
      pointsFor += selfScore;
      pointsAgainst += oppScore;

      const isHome = self.homeAway === 'home';
      if (selfScore > oppScore) {
        wins++;
        if (isHome) homeWins++; else awayWins++;
      } else if (selfScore < oppScore) {
        losses++;
        if (isHome) homeLosses++; else awayLosses++;
      } else {
        ties++;
        if (isHome) homeTies++; else awayTies++;
      }

      // Track the most recent completed game strictly before the upcoming matchup
      const gameDate = new Date(comp.date);
      if (!beforeDate || gameDate < new Date(beforeDate)) {
        if (!lastGameDate || gameDate > lastGameDate) lastGameDate = gameDate;
      }
    });

    let daysRest = null;
    if (lastGameDate && beforeDate) {
      daysRest = Math.round((new Date(beforeDate) - lastGameDate) / (1000 * 60 * 60 * 24));
    }

    res.setHeader('Cache-Control', 's-maxage=1800');
    res.status(200).json({
      available: gamesPlayed > 0,
      gamesPlayed, wins, losses, ties,
      pointsFor, pointsAgainst,
      homeRecord: { wins: homeWins, losses: homeLosses, ties: homeTies },
      awayRecord: { wins: awayWins, losses: awayLosses, ties: awayTies },
      daysRest, fetchedAt: new Date().toISOString(), beforeDate
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
