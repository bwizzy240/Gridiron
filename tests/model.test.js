import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODEL, summarizeSeason, seasonStrength, teamStrength, matchupProbability } from '../model.js';
import { estimateEdge } from '../edge.js';
import handler from '../api/team-schedule.js';
const cutoff = '2026-09-10T00:20:00Z';
const empty = season => summarizeSeason({events:[]},'26',season,cutoff);
function summary(season, wins, losses, pointsFor, pointsAgainst) {
  return {...empty(season),available:wins+losses>0,gamesPlayed:wins+losses,wins,losses,pointsFor,pointsAgainst,
    homeRecord:{wins:Math.ceil(wins/2),losses:Math.floor(losses/2),ties:0},
    awayRecord:{wins:Math.floor(wins/2),losses:Math.ceil(losses/2),ties:0}};
}
const strong = {...empty(2026),previousSeason:summary(2025,12,5,450,300),historyStatus:'available'};
const weak = {...empty(2026),previousSeason:summary(2025,5,12,280,420),historyStatus:'available'};
const game = (id,date,pf,pa,type=2) => ({id,seasonType:{type},competitions:[{date,status:{type:{state:'post'}},competitors:[{id:'26',homeAway:'home',score:{value:pf}},{id:'17',score:{value:pa}}]}]});
const response = () => ({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('Week 1 uses past-season strength with regression toward average', () => {
  const raw = seasonStrength(strong.previousSeason,true);
  const value = teamStrength(strong,true);
  assert.equal(value.currentWeight,0);
  assert.ok(value.strength>.5 && value.strength<raw);
  assert.ok(Math.abs(value.strength-(.5+(raw-.5)*DEFAULT_MODEL.priorRetention))<1e-12);
  assert.ok(matchupProbability(strong,weak,'SEA','NE').homeWinProb>.5);
  assert.equal(value.neutralFallback,false);
});
test('current form gains influence as games accumulate without a hard switchover', () => {
  const weights = [0,1,4,8,16].map(n=>teamStrength({...summary(2026,n,0,n*30,n*10),previousSeason:strong.previousSeason},true).currentWeight);
  assert.deepEqual(weights,[0,1/9,1/3,1/2,2/3]);
  for(let i=1;i<weights.length;i++)assert.ok(weights[i]>weights[i-1]);
});
test('eight prior games satisfy the data check with no current-season games', () => {
  const now=Date.parse('2026-09-02T12:00:00Z');
  const evidence=teamStrength({...strong,previousSeason:summary(2025,6,2,240,100)},true).evidenceGames;
  assert.equal(evidence,4);
  const result=estimateEdge({probability:.7,quote:{status:'active',ask:.4,bid:.39,askSize:100},fee:{type:'quadratic',multiplier:1},quantity:100,bufferCents:1,minEdgePoints:5,fetchedAt:new Date(now).toISOString(),gameDate:cutoff,gamesPlayed:[evidence,evidence],now});
  assert.equal(result.eligible,true);
  const insufficient=teamStrength({...strong,previousSeason:summary(2025,6,1,240,100)},true).evidenceGames;
  assert.equal(insufficient,3.5);
  assert.equal(estimateEdge({probability:.7,quote:{status:'active',ask:.4,bid:.39,askSize:100},fee:{type:'quadratic',multiplier:1},quantity:100,bufferCents:1,minEdgePoints:5,fetchedAt:new Date(now).toISOString(),gameDate:cutoff,gamesPlayed:[evidence,insufficient],now}).eligible,false);
});
test('no usable history is explicitly neutral and small prior samples are softened further', () => {
  const noData=teamStrength({...empty(2026),previousSeason:null,historyStatus:'unavailable'},true);
  assert.equal(noData.strength,.5);assert.equal(noData.neutralFallback,true);assert.equal(noData.evidenceGames,0);assert.ok(noData.dataWarning);
  const one=teamStrength({...empty(2026),previousSeason:summary(2025,1,0,30,10)},true);
  assert.ok(one.strength>.5 && one.strength<.55);
});
test('cutoffs apply to all seasons; repeated, malformed, preseason and future records are excluded', () => {
  const prior=game('p','2025-10-01T00:00Z',21,14);
  const data={events:[prior,prior,game('q','2026-01-02T00:00Z',10,10),game('pre','2025-08-20T00:00Z',70,0,1),game('bad','2025-10-02T00:00Z',null,3),game('target',cutoff,50,0),game('future','2026-09-18T00:00Z',50,0)]};
  const stats=summarizeSeason(data,'26',2025,cutoff);
  assert.equal(stats.gamesPlayed,2);assert.equal(stats.ties,1);assert.equal(stats.pointsFor,31);
  assert.equal(summarizeSeason(data,'26',2025,'2025-10-01T00:00Z').gamesPlayed,0);
  assert.equal(summarizeSeason({season:{year:2026,type:1},events:[prior]},'26',2025,cutoff).gamesPlayed,1);
  assert.equal(summarizeSeason({events:[{...prior,season:{year:2024}}]},'26',2025,cutoff).gamesPlayed,0);
});
test('API returns separate season records and applies the cutoff to both', async t => {
  t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>url.includes('season=2025&')?{season:{year:2025},events:[game('past','2025-12-01T00:00Z',30,10)]}:{season:{year:2026},events:[game('target',cutoff,99,0)]}}));
  const res=response();await handler({query:{teamId:'26',season:'2026',beforeDate:cutoff}},res);
  assert.equal(res.code,200);assert.equal(res.body.dataVersion,2);assert.equal(res.body.gamesPlayed,0);
  assert.equal(res.body.previousSeason.gamesPlayed,1);assert.equal(res.body.previousSeason.season,2025);assert.equal(res.body.historyStatus,'available');
});
test('history outage is labeled, but current-season source failure is a request error', async t => {
  t.mock.method(globalThis,'fetch',async url=>{if(url.includes('season=2025&'))throw new Error('offline');return {ok:true,json:async()=>({events:[]})};});
  const res=response();await handler({query:{teamId:'26',season:'2026',beforeDate:cutoff}},res);
  assert.equal(res.code,200);assert.equal(res.body.previousSeason,null);assert.equal(res.body.historyStatus,'unavailable');
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('offline');});
  const failed=response();await handler({query:{teamId:'26',season:'2026',beforeDate:cutoff}},failed);
  assert.equal(failed.code,502);
});
test('historical changes cannot affect a prediction before those games', () => {
  const past=game('past','2025-09-01T00:00Z',21,14);
  const later=game('later','2025-10-01T00:00Z',99,0);
  const at='2025-09-10T00:00Z';
  assert.deepEqual(summarizeSeason({events:[past,later]},'26',2025,at),summarizeSeason({events:[past]},'26',2025,at));
});
