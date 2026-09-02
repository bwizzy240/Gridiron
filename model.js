export const MODEL_VERSION = 'season-form-v2-history';
// Selected on historical development seasons; see MODEL-VALIDATION.md.
export const DEFAULT_MODEL = Object.freeze({ priorRetention: 2 / 3, fadeGames: 8 });
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

export function summarizeSeason(data, teamId, season, beforeDate) {
  const stats = { season: Number(season), available: false, gamesPlayed: 0, wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0, homeRecord: { wins: 0, losses: 0, ties: 0 },
    awayRecord: { wins: 0, losses: 0, ties: 0 }, lastGameDate: null };
  // ESPN's top-level season describes the league's current season even on historical requests.
  // Validate each event's own season and date instead.
  if (!Array.isArray(data.events)) throw new Error('Schedule response has no events list');
  const cutoff = Date.parse(beforeDate);
  const seen = new Set();
  for (const ev of data.events) {
    const comp = ev.competitions?.[0];
    const playedAt = Date.parse(comp?.date);
    if (comp?.status?.type?.state !== 'post' || !Number.isFinite(playedAt) || playedAt >= cutoff) continue;
    if (playedAt < Date.parse(`${season}-08-01`) || playedAt >= Date.parse(`${Number(season) + 1}-08-01`)) continue;
    if (ev.season?.year != null && Number(ev.season.year) !== Number(season)) continue;
    if (Number(ev.seasonType?.type ?? ev.season?.type ?? 2) !== 2) continue;
    const self = comp.competitors?.find(c => String(c.id ?? c.team?.id) === String(teamId));
    const opp = comp.competitors?.find(c => c !== self);
    if (!self || !opp) continue;
    const a = self.score?.value ?? self.score; const b = opp.score?.value ?? opp.score;
    if (a === null || a === undefined || a === '' || b === null || b === undefined || b === '') continue;
    const pf = Number(a); const pa = Number(b);
    if (!Number.isFinite(pf) || !Number.isFinite(pa) || pf < 0 || pa < 0) continue;
    const key = ev.id || `${comp.date}:${opp.id ?? opp.team?.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const outcome = pf > pa ? 'wins' : pf < pa ? 'losses' : 'ties';
    stats.gamesPlayed++; stats[outcome]++; stats.pointsFor += pf; stats.pointsAgainst += pa;
    if (self.homeAway === 'home') stats.homeRecord[outcome]++;
    if (self.homeAway === 'away') stats.awayRecord[outcome]++;
    if (!stats.lastGameDate || playedAt > Date.parse(stats.lastGameDate)) stats.lastGameDate = comp.date;
  }
  stats.available = stats.gamesPlayed > 0;
  return stats;
}
export function seasonStrength(stats, isHome) {
  if (!stats?.gamesPlayed) return null;
  const overall = (stats.wins + 0.5 * stats.ties) / stats.gamesPlayed;
  const pf = Math.pow(stats.pointsFor, 2.37); const pa = Math.pow(stats.pointsAgainst, 2.37);
  const pyth = pf + pa > 0 ? pf / (pf + pa) : null;
  const rec = isHome ? stats.homeRecord : stats.awayRecord;
  const count = rec.wins + rec.losses + rec.ties;
  const split = count > 0 ? (rec.wins + 0.5 * rec.ties) / count : null;
  const parts = [[overall, .30], [pyth, .55], [split, .15]].filter(([v]) => v !== null);
  return parts.reduce((n, [v, w]) => n + v * w, 0) / parts.reduce((n, [, w]) => n + w, 0);
}
export function teamStrength(stats, isHome, config = DEFAULT_MODEL) {
  const current = seasonStrength(stats, isHome);
  const previous = seasonStrength(stats.previousSeason, isHome);
  const currentGames = stats.gamesPlayed || 0;
  const priorGames = stats.previousSeason?.gamesPlayed || 0;
  const retention = config.priorRetention * Math.min(1, priorGames / 8);
  const baseline = previous === null ? .5 : .5 + (previous - .5) * retention;
  const currentWeight = currentGames / (currentGames + config.fadeGames);
  return { strength: currentWeight * (current ?? .5) + (1 - currentWeight) * baseline,
    currentWeight, baseline, priorGames, currentGames, evidenceGames: currentGames + priorGames * .5,
    hasHistory: previous !== null, neutralFallback: current === null && previous === null,
    priorSeason: stats.previousSeason?.season ?? Number(stats.season) - 1,
    dataWarning: stats.historyStatus === 'unavailable' ? 'Previous-season data could not be loaded' : null };
}
const DIVISIONS = [ ['BUF','MIA','NE','NYJ'], ['BAL','CIN','CLE','PIT'], ['HOU','IND','JAX','TEN'], ['DEN','KC','LV','LAC'],
  ['DAL','NYG','PHI','WAS','WSH'], ['CHI','DET','GB','MIN'], ['ATL','CAR','NO','TB'], ['ARI','LAR','LA','SF','SEA'] ];
export function matchupProbability(homeStats, awayStats, homeTeam, awayTeam, config = DEFAULT_MODEL) {
  const home = teamStrength(homeStats, true, config); const away = teamStrength(awayStats, false, config);
  const denominator = home.strength + away.strength - 2 * home.strength * away.strength;
  let homeWinProb = denominator === 0 ? .5 : (home.strength - home.strength * away.strength) / denominator;
  const shortRest = stats => Number.isFinite(stats.daysRest) && stats.daysRest <= 4 ? .03 : 0;
  homeWinProb = clamp(homeWinProb - shortRest(homeStats) + shortRest(awayStats), .03, .97);
  const divisional = DIVISIONS.some(group => group.includes(homeTeam) && group.includes(awayTeam));
  if (divisional) homeWinProb = homeWinProb * .85 + .5 * .15;
  return { homeWinProb, awayWinProb: 1 - homeWinProb, home, away, divisional };
}

// ---- Points projection (for spread/total probabilities) ----
//
// Same current+previous-season blending approach as teamStrength above, applied to points-for
// and points-against per game instead of win percentage, regressed toward a league-average
// baseline of ~22.5 points/team/game (roughly matches modern-era NFL scoring).
//
// Margin-of-victory relative to the closing line has a well-documented standard deviation of
// 13.86 points (Stern 1991, derived from the 1981/83/84 seasons; holds up on modern data — see
// Pro-Football-Reference's win-probability writeup). Game totals and margins are both
// sums/differences of two independent team-score distributions with similar variance, so the
// same figure is used here as an approximation for totals too. This is a known simplification —
// real total variance tends to run a bit lower, since weather and pace correlate both teams'
// scoring in the same direction — not a separately, precisely fitted number.
const LEAGUE_AVG_PPG = 22.5;
export const SCORE_STD_DEV = 13.86;

export function projectPoints(homeStats, awayStats, config = DEFAULT_MODEL) {
  function blend(stats) {
    const gp = stats.gamesPlayed || 0;
    const pf = gp > 0 ? stats.pointsFor / gp : null;
    const pa = gp > 0 ? stats.pointsAgainst / gp : null;
    const prevGp = stats.previousSeason?.gamesPlayed || 0;
    const prevPf = prevGp > 0 ? stats.previousSeason.pointsFor / prevGp : null;
    const prevPa = prevGp > 0 ? stats.previousSeason.pointsAgainst / prevGp : null;
    const retention = config.priorRetention * Math.min(1, prevGp / 8);
    const baselinePf = prevPf === null ? LEAGUE_AVG_PPG : LEAGUE_AVG_PPG + (prevPf - LEAGUE_AVG_PPG) * retention;
    const baselinePa = prevPa === null ? LEAGUE_AVG_PPG : LEAGUE_AVG_PPG + (prevPa - LEAGUE_AVG_PPG) * retention;
    const currentWeight = gp / (gp + config.fadeGames);
    return {
      pf: currentWeight * (pf ?? LEAGUE_AVG_PPG) + (1 - currentWeight) * baselinePf,
      pa: currentWeight * (pa ?? LEAGUE_AVG_PPG) + (1 - currentWeight) * baselinePa
    };
  }
  const home = blend(homeStats);
  const away = blend(awayStats);
  const expectedHomePoints = (home.pf + away.pa) / 2;
  const expectedAwayPoints = (away.pf + home.pa) / 2;
  return {
    expectedHomePoints, expectedAwayPoints,
    expectedMargin: expectedHomePoints - expectedAwayPoints,
    expectedTotal: expectedHomePoints + expectedAwayPoints
  };
}

// Standard normal CDF via Abramowitz-Stegun approximation.
export function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

// homeLine is the number the HOME team must cover by (e.g. -3.5 means home must win by 4+).
export function spreadProbs(projection, homeLine) {
  if (!projection) return null;
  const z = (homeLine - projection.expectedMargin) / SCORE_STD_DEV;
  const homeCoversProb = 1 - normalCDF(z);
  return { home: homeCoversProb, away: 1 - homeCoversProb };
}

export function totalProbs(projection, total) {
  if (!projection) return null;
  const z = (total - projection.expectedTotal) / SCORE_STD_DEV;
  const overProb = 1 - normalCDF(z);
  return { over: overProb, under: 1 - overProb };
}
