import { MODEL_VERSION } from './model.js';
const KEY = 'gridiron-forecasts-v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records = [], root, readError = '', writeError = '';
export function canSaveForecast(context, now = Date.now()) {
  return context.gameState === 'pre' && Number.isFinite(Date.parse(context.gameDate)) && Date.parse(context.gameDate) > now &&
    typeof context.gameId === 'string' && context.gameId.length > 0 &&
    Number.isFinite(context.homeWinProb) && context.homeWinProb > 0 && context.homeWinProb < 1;
}
export function forecastScores(entries, version = MODEL_VERSION) {
  // Score the earliest saved forecast once per game/version, only if recorded before kickoff.
  const unique = new Map();
  [...entries].sort((a,b)=>Date.parse(a.savedAt)-Date.parse(b.savedAt)).forEach(entry=>{
    if(entry.modelVersion===version && Date.parse(entry.savedAt)<Date.parse(entry.gameDate) && !unique.has(entry.gameId)) unique.set(entry.gameId,entry);
  });
  const completed = [...unique.values()].filter(e=>['home','away'].includes(e.outcome));
  const bins = Array.from({length:5},(_,i)=>({lower:i/5,upper:(i+1)/5,count:0,predicted:0,observed:0}));
  let brier=0,logLoss=0,correct=0;
  for(const entry of completed){
    const p=entry.homeProbability,y=entry.outcome==='home'?1:0;
    brier+=(p-y)**2;const bounded=Math.min(1-1e-15,Math.max(1e-15,p));
    logLoss-=y*Math.log(bounded)+(1-y)*Math.log(1-bounded);correct+=Number((p>=.5)===(y===1));
    const bin=bins[Math.min(4,Math.floor(p*5))];bin.count++;bin.predicted+=p;bin.observed+=y;
  }
  return {count:completed.length,brier:completed.length?brier/completed.length:null,logLoss:completed.length?logLoss/completed.length:null,
    accuracy:completed.length?correct/completed.length:null,
    excluded:[...unique.values()].filter(e=>['tie','void'].includes(e.outcome)).length,
    bins:bins.map(b=>({...b,predicted:b.count?b.predicted/b.count:null,observed:b.count?b.observed/b.count:null}))};
}
export function initForecastLog(element) {
  root=element;
  try {
    const parsed=JSON.parse(localStorage.getItem(KEY)||'[]');
    if(!Array.isArray(parsed) || parsed.some(e=>!e || typeof e.gameId!=='string' || typeof e.modelVersion!=='string' || !Number.isFinite(Date.parse(e.savedAt)) || !Number.isFinite(Date.parse(e.gameDate)) || !Number.isFinite(e.homeProbability) || e.homeProbability<0 || e.homeProbability>1 || !['pending','home','away','tie','void'].includes(e.outcome))) throw new Error();
    records=parsed;
  } catch {readError='Saved forecasts could not be read. Existing data has not been overwritten.';}
  render();
}
function persist(next) {
  if(readError)return false;
  try{localStorage.setItem(KEY,JSON.stringify(next));records=next;writeError='';return true;}
  catch {writeError='Could not save in this browser. Export a backup before closing.';render();return false;}
}
function render() {
  if(!root)return;
  const open=root.querySelector('details')?.open??false;
  const scores=forecastScores(records);
  const percent=n=>n===null?'—':`${(n*100).toFixed(1)}%`;
  root.innerHTML=`<details ${open?'open':''}><summary>Forecast journal · ${records.length} saved</summary>
    <p>Record a probability before kickoff, then enter the winner after the game finishes. Forecasts are saved in this browser and can be exported. No market prices are needed.</p>
    <p>Current model: ${esc(MODEL_VERSION)}. ${scores.count} decisive games scored; ${scores.excluded} ties/voids excluded. Metrics cover your saved selection, not every NFL game. Outcomes are entered manually.</p>
    <p><strong>Brier score ${scores.brier===null?'—':scores.brier.toFixed(4)}</strong> · Log loss ${scores.logLoss===null?'—':scores.logLoss.toFixed(4)} · Winner accuracy ${percent(scores.accuracy)}</p>
    <p>Lower Brier score and log loss are better. Calibration asks whether outcomes match the forecast percentages; a 60% forecast should win about 60% of the time across many comparable games.</p>
    <div class="paper-table"><table><caption>Calibration of saved forecasts · home-team probability</caption><thead><tr><th>Forecast range</th><th>Games</th><th>Average forecast</th><th>Actual win rate</th></tr></thead><tbody>
    ${scores.bins.map(b=>`<tr><td>${Math.round(b.lower*100)}–${Math.round(b.upper*100)}%</td><td>${b.count}</td><td>${percent(b.predicted)}</td><td>${percent(b.observed)}</td></tr>`).join('')}
    </tbody></table></div><p>Small groups fluctuate substantially. These figures do not provide an uncertainty interval for an individual game.</p>
    <p role="status">${esc(readError||writeError)}</p><button data-export ${records.length?'':'disabled'}>Export forecasts</button>
    <div class="paper-table"><table><thead><tr><th>Matchup / saved</th><th>Probability</th><th>Final result</th></tr></thead><tbody>
    ${records.map((e,i)=>`<tr><td>${esc(e.away)} at ${esc(e.home)}<small>${esc(new Date(e.savedAt).toLocaleString())}</small><small>${esc(e.modelVersion)}</small></td>
    <td>${esc(e.home)} ${(e.homeProbability*100).toFixed(1)}%<small>${esc(e.away)} ${((1-e.homeProbability)*100).toFixed(1)}%</small></td>
    <td><select aria-label="Final result for ${esc(e.away)} at ${esc(e.home)}" data-outcome="${i}" ${Date.parse(e.gameDate)>Date.now()?'disabled':''}>
    ${[['pending','Pending'],['home',`${e.home} wins`],['away',`${e.away} wins`],['tie','Tie'],['void','Void / cancelled']].map(([value,label])=>`<option value="${value}" ${value===e.outcome?'selected':''}>${esc(label)}</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="3">Open a future matchup and choose Save forecast.</td></tr>'}
    </tbody></table></div></details>`;
  root.querySelector('[data-export]').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='gridiron-forecasts.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  root.querySelectorAll('[data-outcome]').forEach(select=>select.addEventListener('change',()=>{
    const i=Number(select.dataset.outcome);if(Date.parse(records[i].gameDate)>Date.now())return;
    const next=records.map((e,j)=>j===i?{...e,outcome:select.value,resultEnteredAt:new Date().toISOString()}:e);
    if(persist(next))render();
  }));
}
export function mountForecastSave(element, context) {
  element.addEventListener('click',event=>event.stopPropagation());
  const alreadySaved=()=>records.some(e=>e.gameId===context.gameId && e.modelVersion===MODEL_VERSION);
  const enabled=()=>!readError && canSaveForecast(context) && !alreadySaved();
  element.innerHTML=`<button data-save ${enabled()?'':'disabled'}>${alreadySaved()?'Forecast saved':'Save forecast'}</button><p role="status">${canSaveForecast(context)?'Freeze this estimate before kickoff; score it later without market prices.':'Pregame estimate only. New forecasts can be saved before kickoff.'}</p>`;
  const button=element.querySelector('button');
  button.addEventListener('click',()=>{
    if(!enabled()){button.disabled=true;element.querySelector('p').textContent='Forecast already saved, kickoff has passed, or storage is unavailable.';return;}
    const entry={gameId:context.gameId,gameDate:context.gameDate,home:context.home,away:context.away,homeProbability:context.homeWinProb,
      modelVersion:MODEL_VERSION,savedAt:new Date().toISOString(),outcome:'pending',target:'home win conditional on no tie',
      inputs:{home:context.homeStats,away:context.awayStats},forecast:context.forecast};
    if(persist([...records,entry])){button.disabled=true;button.textContent='Forecast saved';element.querySelector('p').textContent='Saved in this browser. Enter the final result in Forecast journal after the game.';render();}
    else element.querySelector('p').textContent='Could not save forecast in this browser.';
  });
}
