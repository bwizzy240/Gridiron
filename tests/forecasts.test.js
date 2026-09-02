import test from 'node:test';
import assert from 'node:assert/strict';
import { canSaveForecast, forecastScores } from '../forecasts.js';
import { MODEL_VERSION } from '../model.js';
const now=Date.parse('2026-09-02T12:00:00Z');
const context={gameId:'123',gameDate:'2026-09-10T00:20:00Z',gameState:'pre',homeWinProb:.6};
const entry=(id,outcome,p=.6)=>({gameId:id,gameDate:context.gameDate,savedAt:new Date(now).toISOString(),modelVersion:MODEL_VERSION,homeProbability:p,outcome});
test('forecasts can be recorded without any Kalshi data, only before kickoff',()=>{
 assert.equal(canSaveForecast(context,now),true);
 for(const change of [{gameState:'in'},{gameState:'post'},{gameDate:new Date(now).toISOString()},{gameDate:'bad'},{gameId:''},{homeWinProb:NaN},{homeWinProb:1}])assert.equal(canSaveForecast({...context,...change},now),false);
});
test('forecast scoring measures probabilities independently of trading prices',()=>{
 const result=forecastScores([entry('1','home'),entry('2','home'),entry('3','home'),entry('4','away'),entry('5','away')]);
 assert.equal(result.count,5);assert.ok(Math.abs(result.brier-.24)<1e-12);
 assert.ok(Math.abs(result.logLoss-(-.6*Math.log(.6)-.4*Math.log(.4)))<1e-12);
 assert.equal(result.accuracy,.6);assert.equal(result.bins[3].count,5);
 assert.equal(result.bins[3].predicted,.6);assert.equal(result.bins[3].observed,.6);
});
test('pending, tied, void, post-kickoff and different-model records do not distort scores',()=>{
 const result=forecastScores([entry('1','home'),entry('2','pending'),entry('3','tie'),entry('4','void'),{...entry('5','away'),savedAt:context.gameDate},{...entry('6','away'),modelVersion:'other-version'}]);
 assert.equal(result.count,1);assert.equal(result.excluded,2);assert.ok(Math.abs(result.brier-.16)<1e-12);
});
test('only the earliest forecast per game and model version is scored',()=>{
 const result=forecastScores([{...entry('1','away',.9),savedAt:new Date(now+1000).toISOString()},entry('1','home',.6)]);
 assert.equal(result.count,1);assert.ok(Math.abs(result.brier-.16)<1e-12);
});
test('empty cohorts display unavailable metrics rather than apparent perfect accuracy',()=>{
 const result=forecastScores([]);assert.equal(result.count,0);assert.equal(result.brier,null);assert.equal(result.logLoss,null);assert.equal(result.accuracy,null);
 assert.ok(result.bins.every(b=>b.count===0 && b.observed===null));
});
