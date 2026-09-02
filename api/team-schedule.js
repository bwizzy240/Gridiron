export default async function handler(req, res) {
  const { teamId, season } = req.query;
  if (!teamId || !season) return res.status(400).json({ error: 'missing teamId or season' });

  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?season=${season}`
    );
    if (!r.ok) throw new Error(`ESPN API returned ${r.status}`);
    const data = await r.json();

    const events = data.events || [];
    let wins = 0, losses = 0, ties = 0;
    let homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0;
    let pointsFor = 0, pointsAgainst = 0, gamesPlayed = 0;

    events.forEach(ev => {
      const comp = ev.competitions && ev.competitions[0];
      if (!comp || !comp.status || comp.status.type.state !== 'post') return; // only completed games

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
      }
    });

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.status(200).json({
      available: gamesPlayed > 0,
      gamesPlayed, wins, losses, ties,
      pointsFor, pointsAgainst,
      homeRecord: { wins: homeWins, losses: homeLosses },
      awayRecord: { wins: awayWins, losses: awayLosses }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
