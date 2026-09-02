import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateEdge, paperProfit } from '../edge.js';
import { eventTicker, teamQuote, findEvent } from '../lib/kalshi.js';
import oddsHandler from '../api/kalshi-odds.js';
import statsHandler from '../api/team-schedule.js';
const now = Date.parse('2026-09-02T12:00:00Z');
const input = { probability: 0.55, quote: { status:'active', ask:0.42, bid:0.40, askSize:100 },
  fee: {type:'quadratic_with_maker_fees',multiplier:1}, quantity:100, bufferCents:1, minEdgePoints:5,
  fetchedAt:new Date(now).toISOString(),gameDate:'2026-09-10T00:20:00Z',gamesPlayed:[4,4],now };
function response() { return { setHeader(){}, status(code){this.code=code;return this;},json(body){this.body=body;return this;} }; }

test('55% model at 42c ask includes rounded fees and cost buffer', () => {
  const value = estimateEdge(input);
  assert.equal(value.feeTotal, 1.71); assert.equal(value.cost, 44.71);
  assert.ok(Math.abs(value.netEdge - 0.1029) < 1e-10); assert.equal(value.eligible,true);
});
test('midpoint opportunity disappears at executable ask', () => {
  const value = estimateEdge({...input,quote:{...input.quote,ask:0.55,bid:0.40}});
  assert.ok(value.netEdge < 0); assert.equal(value.eligible,false);
});
test('stale, missing fees, invalid inputs and unquoted prices cannot flag', () => {
  for(const change of [ {fetchedAt:new Date(now-60001).toISOString()}, {fee:null}, {quantity:0},
    {quantity:1.5}, {bufferCents:NaN}, {minEdgePoints:-1}, {probability:NaN},
    {quote:{...input.quote,ask:null}}, {quote:{...input.quote,ask:0}}, {quote:{...input.quote,status:'settled'}} ]) {
    const value=estimateEdge({...input,...change});assert.equal(value.eligible,false);assert.equal(value.netEdge,null);
  }
});
test('thin liquidity, limited form, and started games suppress signals', () => {
  for(const change of [{quote:{...input.quote,askSize:99}}, {quote:{...input.quote,askSize:null}},
    {quote:{...input.quote,bid:0.8}}, {gamesPlayed:[0,8]}, {gamesPlayed:[4,null]}, {gameDate:new Date(now).toISOString()}]) {
    assert.equal(estimateEdge({...input,...change}).eligible,false);
  }
});
test('fees handle one contract, zero multiplier, and unknown structures', () => {
  assert.equal(estimateEdge({...input,quantity:1}).feeTotal,0.02);
  assert.equal(estimateEdge({...input,fee:{type:'quadratic',multiplier:0}}).feeTotal,0);
  assert.equal(estimateEdge({...input,fee:{type:'flat',multiplier:1}}).netEdge,null);
});
test('paper P/L uses actual partial settlement and includes all entry costs', () => {
  assert.equal(paperProfit({quantity:100,cost:44.71,payout:null}),null);
  assert.ok(Math.abs(paperProfit({quantity:100,cost:44.71,payout:0.5})-5.29)<1e-10);
  assert.equal(paperProfit({quantity:100,cost:44.71,payout:0}),-44.71);
});
test('date matching uses Eastern calendar date and team aliases', () => {
  assert.equal(eventTicker('KXNFLGAME','NE','SEA','2026-09-10T00:20:00Z'),'KXNFLGAME-26SEP09NESEA');
  assert.equal(eventTicker('KXNFLGAME','WSH','LA','2026-09-13T20:00:00Z'),'KXNFLGAME-26SEP13WASLAR');
  assert.throws(()=>eventTicker('KXNFLGAME','NE','SEA','garbage'));
});
test('team quotes are independent asks; missing asks stay unavailable', () => {
  const event={event_ticker:'GAME',markets:[{ticker:'GAME-SEA',yes_ask_dollars:'0.63',yes_bid_dollars:'0.62',yes_ask_size_fp:'100',status:'active'}, {ticker:'GAME-NE',yes_bid_dollars:'0.37',status:'active'}]};
  assert.equal(teamQuote(event,'SEA').ask,0.63);assert.equal(teamQuote(event,'NE').ask,null);
  assert.equal(teamQuote(event,'DAL'),null);
});
test('nested event markets are used when top-level markets is empty', async t => {
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({event:{event_ticker:'GAME',markets:[{ticker:'GAME-SEA'}]},markets:[]})}));
  assert.equal((await findEvent('KXNFLGAME','NE','SEA',input.gameDate)).markets.length,1);
});
test('fee outage keeps quotes visible without inventing a fee', async t => {
  t.mock.method(globalThis,'fetch',async url=>{
    if(url.includes('/series/')) throw new Error('offline');
    return {ok:true,json:async()=>({event:{event_ticker:'KXNFLGAME-26SEP09NESEA',markets:[{ticker:'KXNFLGAME-26SEP09NESEA-SEA',yes_ask_dollars:'0.63',status:'active'}]},markets:[]})};
  });
  const res=response();await oddsHandler({query:{away:'NE',home:'SEA',gameDate:input.gameDate}},res);
  assert.equal(res.code,200);assert.equal(res.body.home.ask,0.63);assert.equal(res.body.fee,null);
});
test('historical stats exclude target, future games and preseason; ties count in splits', async t => {
  const game=(date,score,opp,type=2)=>({seasonType:{type},competitions:[{date,status:{type:{state:'post'}},competitors:[{id:'26',homeAway:'home',score:{value:score}},{id:'17',score:{value:opp}}]}]});
  t.mock.method(globalThis,'fetch',async url=>{
    assert.match(url,/seasontype=2/);
    return {ok:true,json:async()=>({events:[game('2026-08-20T00:00Z',99,0,1),game('2026-09-01T00:00Z',21,14),game('2026-09-03T00:00Z',10,10),game('2026-09-10T00:20Z',0,99),game('2026-09-17T00:20Z',99,0)]})};
  });
  const res=response();await statsHandler({query:{teamId:'26',season:'2026',beforeDate:input.gameDate}},res);
  assert.equal(res.code,200);assert.equal(res.body.gamesPlayed,2);assert.equal(res.body.pointsFor,31);
  assert.equal(res.body.pointsAgainst,24);assert.equal(res.body.ties,1);assert.equal(res.body.homeRecord.ties,1);
});
