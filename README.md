# Gridiron

NFL season-form estimates alongside Kalshi's available YES buy prices, with a browser-local paper-trade journal. This is an unvalidated research tool; a positive model difference does not demonstrate profitable trading.

## Run and deploy

Keep the existing Vercel project and framework configuration. This project uses static HTML/ES modules plus Vercel serverless functions in `api/`; it has no build dependencies or compile step. Use Node.js 22 or later for the functions and tests.

Run `npm test` for the calculation and API regression suite. For local development with API routes, use Vercel's development environment; opening `index.html` as a file does not run server routes.

To update the existing site, upload the extracted project files to the root of the GitHub repository (preserving `api/`, `lib/`, and `tests/` as folders), then commit through GitHub. If Vercel is configured to deploy that branch automatically, that commit will trigger deployment. Otherwise deploy through the existing Vercel project. No Kalshi credentials are required; the application only reads public market data.

## What changed

- Each team's own YES ask replaces the bid/ask midpoint for entry comparisons. The opposite team's price is not inferred by subtraction.
- Matchup lookups use the exact Eastern game date and teams, including WSH/WAS and LA/LAR aliases. Missing or rescheduled event matches fail closed rather than falling back to a different game.
- Estimated taker fees use the current series fee type and multiplier. Unsupported or unavailable fee metadata suppresses net-edge calculations. Rounding up to a whole cent per order is a conservative estimate; Kalshi's current schedule describes finer rounding. Broker-specific charges are not included.
- The user can set contract count, an additional cost buffer, and a minimum net-edge threshold. Defaults of 100 contracts, 1 cent, and 5 percentage points are research settings, not calibrated recommendations.
- Value flags require an active ask, enough quoted size, a fetch less than 60 seconds old, a future kickoff, and at least four regular-season games for each team. Four games is a minimum data guard, not proof of model reliability. Quotes are snapshots and no fill is guaranteed.
- Regular-season statistics exclude the target game and all later games. Ties receive half credit in records and splits. Preseason results are excluded.
- Each paper entry freezes model version, estimate, quote, fee assumptions, data inputs, and contract rules. Entries can be saved below the signal threshold and with limited form for research, but never with stale/unavailable prices or insufficient quoted size.
- Enter the verified final contract payout manually, including partial payouts for ties or special settlements. Estimated P/L and return include saved fees and buffer. Export the JSON log for backup.

## Limits and next validation step

The existing weighted record/point-differential/home-away model and rest/divisional heuristics remain uncalibrated. There is no separate tie-probability model; the net-value estimate assumes a decisive outcome. Displayed probabilities are estimates, not established true probabilities.

Week 1 has no current regular-season results, so a neutral starting estimate must not be treated as evidence of mispricing. The interface suppresses value flags until both teams have at least four games. Injuries, quarterback availability, opponent strength, and weather adjustments are not incorporated into the probability calculation.

Statistics are reconstructed from the current ESPN response. Fixing the date filter prevents the known target/future-game leak, but does not supply historically archived inputs or prices. This release does not claim a valid historical backtest, calibrated probabilities, or proven profitability. The next research step is to collect timestamped pregame forecasts/quotes, evaluate calibration on unseen games, and compare net paper performance with market baselines.

The journal uses localStorage on the browser and site origin. It does not sync across devices, has no account backend, and can be lost if browser data is cleared. Export records before clearing data or changing devices. Settlement entries are manual and are not independently verified. P/L uses hypothetical entries; it does not model order-book fills, queue priority, or execution beyond the chosen buffer. No real orders are placed.

References: [Kalshi fees](https://kalshi.com/docs/kalshi-fee-schedule.pdf), [series metadata](https://docs.kalshi.com/api-reference/market/get-series).
