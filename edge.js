export { MODEL_VERSION } from './model.js';
export const MAX_QUOTE_AGE_MS = 60000;
export function estimateEdge({ probability, quote, fee, quantity, bufferCents, minEdgePoints, fetchedAt, gameDate, gamesPlayed, now = Date.now() }) {
  const invalid = reason => ({ eligible: false, reason, netEdge: null, feeTotal: null, cost: null });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000 ||
      !Number.isFinite(bufferCents) || bufferCents < 0 || bufferCents > 100 ||
      !Number.isFinite(minEdgePoints) || minEdgePoints < 0 || minEdgePoints > 100) return invalid('Check the comparison settings');
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) return invalid('Model estimate unavailable');
  if (!quote || quote.status !== 'active' || !Number.isFinite(quote.ask) || quote.ask <= 0 || quote.ask >= 1) return invalid('No active buy quote');
  const age = now - Date.parse(fetchedAt);
  if (!Number.isFinite(age) || age < -5000 || age > MAX_QUOTE_AGE_MS) return invalid('Quote expired — refresh matchup');
  if (!fee || !['quadratic', 'quadratic_with_maker_fees'].includes(fee.type) || !Number.isFinite(fee.multiplier) || fee.multiplier < 0) return invalid('Fee schedule unavailable');
  // Conservative whole-cent rounding; actual sub-cent fees may be slightly lower.
  const feeTotal = Math.max(0, Math.ceil((0.07 * fee.multiplier * quantity * quote.ask * (1 - quote.ask) - 1e-10) * 100) / 100);
  const cost = quote.ask * quantity + feeTotal + quantity * bufferCents / 100;
  const netEdge = probability - cost / quantity;
  const result = { feeTotal, cost, netEdge, eligible: false };
  if (!Number.isFinite(Date.parse(gameDate)) || Date.parse(gameDate) <= now) return { ...result, reason: 'Pregame signals only' };
  if (!Array.isArray(gamesPlayed) || gamesPlayed.length !== 2 || gamesPlayed.some(n => !Number.isFinite(n) || n < 4)) return { ...result, reason: 'Limited historical and current data — paper research only' };
  if (!Number.isFinite(quote.askSize) || quote.askSize < quantity) return { ...result, reason: 'Insufficient quoted size' };
  if (Number.isFinite(quote.bid) && quote.bid > quote.ask) return { ...result, reason: 'Inconsistent quote — refresh matchup' };
  return { ...result, eligible: netEdge > 0 && netEdge * 100 >= minEdgePoints,
    reason: netEdge > 0 && netEdge * 100 >= minEdgePoints ? 'Potential value · unvalidated model' : 'Below your edge threshold' };
}
export function paperProfit(trade) {
  return Number.isFinite(trade.payout) ? trade.quantity * trade.payout - trade.cost : null;
}
