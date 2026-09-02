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
