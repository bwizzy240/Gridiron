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
- Value flags require an active ask, enough quoted size, a fetch less than 60 seconds old, a future kickoff, and enough historical/current data for each team: current games + half the previous-season games must total at least four. Eight previous-season games can satisfy the check before Week 1. This is a minimum data guard, not proof of model reliability. Quotes are snapshots and no fill is guaranteed.
- The API retrieves the requested regular season and the previous regular season, and keeps their records separate. Regular-season statistics exclude the target game and all later games. Ties receive half credit in records and splits. Preseason results are excluded.
- Each paper entry freezes model version, estimate, quote, fee assumptions, data inputs, and contract rules. Entries can be saved below the signal threshold and with limited form for research, but never with stale/unavailable prices or insufficient quoted size.
- Enter the verified final contract payout manually, including partial payouts for ties or special settlements. Estimated P/L and return include saved fees and buffer. Export the JSON log for backup.

## Limits and next validation step

The underlying record/point-differential/home-away model and rest/divisional heuristics remain simple estimates. Historical retention and fade parameters were compared on 2015–2023 games, then evaluated once on 2024–2025 games; see MODEL-VALIDATION.md. This does not establish calibration or a trading edge. There is no separate tie-probability model; the net-value estimate assumes a decisive outcome. Displayed probabilities are estimates, not established true probabilities.

Week 1 starts from previous-season team strength, retaining two-thirds of its deviation from 50/50 for samples of at least eight games. Smaller historical samples are softened further. Current-season weight is gamesPlayed / (gamesPlayed + 8): 0% before the first game, 33% after four, 50% after eight, and 67% after sixteen. The balance goes to the softened historical baseline. If history is missing, the baseline is league average and the interface labels the missing data. Value flags use historical as well as current evidence; a neutral no-data fallback cannot pass the data check. Injuries, quarterback availability, opponent strength, and weather adjustments are not incorporated into the probability calculation.

Statistics are reconstructed from the current ESPN response. Fixing the date filter prevents the known target/future-game leak, but does not supply historically archived inputs or prices. The included chronological forecast evaluation uses reconstructed score history, not archived live forecasts or executable Kalshi prices. It is not a trading backtest and does not establish calibrated probabilities or proven profitability. The next research step is to collect timestamped pregame forecasts/quotes, evaluate calibration on unseen games, and compare net paper performance with market baselines.

The journal uses localStorage on the browser and site origin. It does not sync across devices, has no account backend, and can be lost if browser data is cleared. Export records before clearing data or changing devices. Settlement entries are manual and are not independently verified. P/L uses hypothetical entries; it does not model order-book fills, queue priority, or execution beyond the chosen buffer. No real orders are placed.

References: [Kalshi fees](https://kalshi.com/docs/kalshi-fee-schedule.pdf), [series metadata](https://docs.kalshi.com/api-reference/market/get-series).

## Historical model implementation

`model.js` owns the shared season aggregation and probability functions; `api/team-schedule.js` fetches both seasons. ESPN may label its top-level response with the current league season even for historical requests, so the parser checks event-level seasons and game dates. Duplicate game IDs, malformed scores, preseason/postseason records, the target game, and later games are excluded. A current-season fetch failure is an API error; a historical fetch failure is explicitly marked and never presented as real history. No head-to-head, injury or quarterback feed has been added in this update.

Paper entries retain their original model versions and forecasts. Existing records remain readable.
