import { estimateEdge, MODEL_VERSION, MAX_QUOTE_AGE_MS, paperProfit } from './edge.js';
const KEY = 'gridiron-paper-v1';
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const money = value => Number.isFinite(value) ? `$${value.toFixed(2)}` : '—';
const signed = value => `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
const time = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Unavailable';
let logRoot;
let trades = [];
let storageError = '';
function saveTrades(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); trades = next; storageError = ''; return true; }
  catch { storageError = 'Could not save on this browser. Export existing records before closing.'; renderLog(); return false; }
}
export function initPaperLog(root) {
  logRoot = root;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(stored) || stored.some(t => !t || typeof t.id !== 'string' || !Number.isFinite(t.cost) || !Number.isInteger(t.quantity) || t.quantity < 1 || (t.payout !== null && (!Number.isFinite(t.payout) || t.payout < 0 || t.payout > 1)))) throw new Error();
    trades = stored;
  } catch { storageError = 'Saved records could not be read. Existing storage has not been overwritten.'; }
  renderLog();
}
function renderLog() {
  if (!logRoot) return;
  const expanded = logRoot.querySelector('details')?.open || false;
  const settled = trades.filter(t => Number.isFinite(t.payout));
  const cost = settled.reduce((n, t) => n + t.cost, 0);
  const pnl = settled.reduce((n, t) => n + paperProfit(t), 0);
  logRoot.innerHTML = `<details ${expanded ? 'open' : ''}><summary>Paper trades · ${trades.length} recorded</summary>
    <p>Hypothetical entries at the quoted ask, including estimated fees and your cost buffer. Saved only in this browser; export a backup. No orders are placed.</p>
    <p>${settled.length} settled · P/L ${money(pnl)} · Return ${cost ? `${signed(pnl / cost * 100)}%` : '—'}</p>
    <p>After Kalshi settles, enter the actual payout per contract (0–1 dollars). A tie or cancellation can have a partial payout. Results are manually entered, not independently verified.</p>
    <p role="status">${escapeHTML(storageError)}</p>
    <button id="exportPaper" ${!trades.length ? 'disabled' : ''}>Export records</button>
    <div class="paper-table"><table><thead><tr><th>Contract / saved</th><th>Model / net edge</th><th>Entry / cost</th><th>Settlement payout ($)</th><th>P/L</th></tr></thead><tbody>
    ${trades.map(t => `<tr><td>${escapeHTML(t.team)} YES<small>${escapeHTML(t.ticker)}</small><small>${escapeHTML(time(t.savedAt))}</small><small>${escapeHTML(t.modelVersion || "Earlier model")}</small><small>${escapeHTML(t.signal)}</small></td>
      <td>${(t.probability * 100).toFixed(1)}%<small>${signed(t.netEdge * 100)} pp</small></td>
      <td>${t.quantity} × ${(t.ask * 100).toFixed(2)}¢<small>Cost ${money(t.cost)}</small><small>Fee ${money(t.feeTotal)} · buffer ${money(t.quantity * t.bufferCents / 100)}</small></td>
      <td><input aria-label="Settlement payout for ${escapeHTML(t.team)} ${escapeHTML(t.savedAt)}" type="number" min="0" max="1" step="0.0001" data-payout="${escapeHTML(t.id)}" value="${t.payout ?? ''}" placeholder="Pending" ${Date.parse(t.gameDate) > Date.now() ? 'disabled' : ''}></td>
      <td>${money(paperProfit(t))}</td></tr>`).join('') || '<tr><td colspan="5">Open a matchup to record a paper entry.</td></tr>'}
    </tbody></table></div></details>`;
  logRoot.querySelector('#exportPaper').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(trades, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'gridiron-paper-trades.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  logRoot.querySelectorAll('[data-payout]').forEach(input => input.addEventListener('change', () => {
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const payout = input.value === '' ? null : Number(input.value);
    const next = trades.map(t => t.id === input.dataset.payout ? { ...t, payout, settledAt: payout === null ? null : new Date().toISOString() } : t);
    if (saveTrades(next)) renderLog();
  }));
}
export function mountComparison(root, context) {
  root.addEventListener('click', event => event.stopPropagation());
  const { market, awayStats, homeStats, refresh } = context;
  if (!market?.available) {
    root.innerHTML = `<h3>Kalshi comparison</h3><p>${escapeHTML(market?.reason || 'Market data could not be loaded.')}</p><button class="refresh">Retry prices</button>`;
    root.querySelector('.refresh').addEventListener('click', refresh); return;
  }
  root.innerHTML = `<h3>Value at the available buy price</h3>
    <div class="edge-settings">
      <label>Contracts<input name="quantity" type="number" min="1" max="10000" step="1" value="100"></label>
      <label>Cost buffer (¢ each)<input name="buffer" type="number" min="0" max="100" step="0.1" value="1"></label>
      <label>Minimum edge (pp)<input name="threshold" type="number" min="0" max="100" step="0.1" value="5"></label>
    </div>
    <p>The 5-point threshold and 1¢ buffer are editable research assumptions. Net edge = model estimate − ask − estimated fee per contract − buffer. The model assumes a decisive result; ties and special settlements can change the payout.</p>
    <div class="result" aria-live="polite"></div>
    <p class="freshness"></p><button class="refresh">Refresh matchup</button>
    <p>Current-season data fetched: ${escapeHTML(time(awayStats.fetchedAt))} / ${escapeHTML(time(homeStats.fetchedAt))}. Only completed regular-season games before this matchup are included. The data check counts each current-season game as one and each previous-season game as half, requiring at least four per team. Passing this check does not establish model accuracy.</p>
    <p>Previous-season data fetched: ${escapeHTML(time(awayStats.previousSeason?.fetchedAt))} / ${escapeHTML(time(homeStats.previousSeason?.fetchedAt))}. Previous records are softened toward league average; current results gradually replace that baseline. Missing history is explicitly labeled beside the model estimate.</p>
    <p>Fees use the current series multiplier and conservative rounding up to a whole cent per order. Actual fills, sub-cent rounding, and broker fees can differ. <a href="https://kalshi.com/docs/kalshi-fee-schedule.pdf" target="_blank" rel="noopener noreferrer">Kalshi fee schedule</a></p>
    <details><summary>Contract settlement rules</summary><p>${escapeHTML(market.away?.rules || market.home?.rules || 'Unavailable — verify on Kalshi.')}</p></details>
    <p class="save-status" role="status"></p>`;
  const settings = () => ({
    quantity: root.querySelector('[name=quantity]').valueAsNumber,
    bufferCents: root.querySelector('[name=buffer]').valueAsNumber,
    minEdgePoints: root.querySelector('[name=threshold]').valueAsNumber
  });
  function evaluation(side) {
    return estimateEdge({ ...settings(), probability: context[`${side}WinProb`], quote: market[side], fee: market.fee,
      fetchedAt: market.fetchedAt, gameDate: context.gameDate, gamesPlayed: [context.forecast.away.evidenceGames, context.forecast.home.evidenceGames] });
  }
  function canRecord(result, quote) {
    return !storageError && result.cost !== null && Date.parse(context.gameDate) > Date.now() &&
      Number.isFinite(quote?.askSize) && quote.askSize >= settings().quantity &&
      !(Number.isFinite(quote?.bid) && quote.bid > quote.ask);
  }
  function draw() {
    root.querySelector('.freshness').textContent = `Quotes fetched ${time(market.fetchedAt)} · ${Date.now() - Date.parse(market.fetchedAt) > MAX_QUOTE_AGE_MS ? 'Expired — refresh to record' : 'Expire after 60 seconds'}. This is a fetch time, not an exchange quote timestamp.`;
    root.querySelector('.result').innerHTML = ['away', 'home'].map(side => {
      const quote = market[side]; const result = evaluation(side);
      return `<div class="col ${result.eligible ? 'edge-pos' : ''}">
        <div class="team-abbr">${escapeHTML(context[side])} YES</div>
        <div class="implied">${Number.isFinite(quote?.ask) ? `${(quote.ask * 100).toFixed(2)}¢` : '—'}</div>
        <p>Model ${(context[`${side}WinProb`] * 100).toFixed(1)}%<br>Quoted size ${Number.isFinite(quote?.askSize) ? quote.askSize.toLocaleString() : 'unknown'}</p>
        <div class="edge ${result.eligible ? 'pos' : ''}">${result.netEdge === null ? 'Net edge unavailable' : `${signed(result.netEdge * 100)} pp estimated net edge`}</div>
        <p>${escapeHTML(result.reason)}</p><p>Estimated cost ${money(result.cost)}<br>Included fee ${money(result.feeTotal)}</p>
        <button data-record="${side}" ${canRecord(result, quote) ? '' : 'disabled'}>Record paper entry</button></div>`;
    }).join('');
    root.querySelectorAll('[data-record]').forEach(button => button.addEventListener('click', () => {
      const side = button.dataset.record; const result = evaluation(side); const quote = market[side];
      if (!canRecord(result, quote)) { draw(); return; }
      if (trades.some(t => t.ticker === quote.ticker && t.quoteFetchedAt === market.fetchedAt)) {
        root.querySelector('.save-status').textContent = 'This quote has already been recorded.'; return;
      }
      const trade = { id: crypto.randomUUID(), modelVersion: MODEL_VERSION, savedAt: new Date().toISOString(),
        gameId: context.gameId, gameDate: context.gameDate, ticker: quote.ticker, team: context[side],
        probability: context[`${side}WinProb`], ...settings(), ask: quote.ask, bid: quote.bid, askSize: quote.askSize,
        feeSchedule: market.fee, feeTotal: result.feeTotal, cost: result.cost, netEdge: result.netEdge,
        signal: result.reason, flagged: result.eligible, quoteFetchedAt: market.fetchedAt,
        stats: { away: awayStats, home: homeStats }, forecast: context.forecast, rules: quote.rules, payout: null };
      if (saveTrades([...trades, trade])) {
        renderLog(); root.querySelector('.save-status').textContent = `${context[side]} paper entry saved on this browser.`;
      } else root.querySelector('.save-status').textContent = 'Entry could not be saved.';
    }));
  }
  root.querySelectorAll('input').forEach(input => input.addEventListener('input', draw));
  root.querySelector('.refresh').addEventListener('click', refresh);
  draw();
  const timer = setInterval(() => { if (!root.isConnected) clearInterval(timer); else draw(); }, 5000);
}
