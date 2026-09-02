# Gridiron probability quality — September 2, 2026

The objective is accurate pregame probabilities. A forecast near 60% should correspond to a win roughly 60% of the time across a sufficiently large group. Winner accuracy alone does not establish this. Brier score and log loss measure probability quality; calibration tables compare average forecasts with observed frequencies. Lower Brier score does not, by itself, prove better calibration. [Calibration reference](https://scikit-learn.org/stable/modules/calibration.html).

## Decision

Retain the current `season-form-v2-history` calculation for now. The tested statistical challenger and the fixed Elo-style comparator did not improve its aggregate probability scores on the 2024–2025 retrospective check. This is evidence against an immediate replacement, not proof that the current model is optimal or reliably calibrated.

The interface update makes forecast quality the primary workflow: probabilities render before optional market requests; each forecast can be recorded before kickoff without a Kalshi quote; a separate forecast journal measures Brier score, log loss, winner accuracy, and calibration on manually recorded results. Existing market paper entries remain available separately. The probability formula and model version are unchanged.

## Definition of the target

The displayed two-way estimate is interpreted as home/away win probability conditional on a decisive result. The model has no separate tie-probability calculation. This evaluation excludes tied games from binary scores; one 2024–2025 tie is excluded, leaving 543 games. Earlier validation used 544 games and a half-credit target for the tie, so its scores differ slightly. The new journal likewise excludes ties and voids rather than treating them as wins or losses.

## Comparison

| Model | Brier score | Log loss | Winner accuracy |
| --- | ---: | ---: | ---: |
| Current historical-form model | 0.21846 | 0.62755 | 66.9% |
| Fixed Elo-style comparator | 0.22089 | 0.63129 | 65.2% |
| Selected statistical challenger | 0.22260 | 0.63510 | 63.0% |
| Expanding historical home-win frequency | 0.24885 | 0.69084 | 53.6% |
| Always 50/50 | 0.25000 | 0.69315 | 53.6% |

Scores cover the same 543 decisive regular-season games in 2024–2025. A tie in the forecast itself is assigned to the home team for the winner-accuracy metric. Small metric differences are not accompanied by a statistical-significance claim.

## How the challenger was selected

Historical features were built using only completed games before the target date, with all same-day games conservatively excluded. Inputs use current and previous regular-season results. No prices, actual game statistics from the target game, or future results enter its features.

Three regularized logistic candidates were fit on decisive games from 2015–2021, with C=1, no free intercept, and fixed feature scales:

1. An adjustment using the current model's log odds plus a home-venue indicator.
2. A model using softened scoring-margin difference, home venue, and rest difference.
3. A combination of those features.

Candidate selection used lowest log loss on 2022–2023, choosing the margin model. That candidate was refit using 2015–2023 and evaluated on 2024–2025. The current model's baseline/fade parameters had already been selected using 2015–2023. The 2024–2025 period had already been inspected in the earlier project, so this is a retrospective comparison, not a newly untouched confirmatory holdout. No alternate candidate was substituted after seeing the latest-period results.

The selected challenger was worse than the current model in both years on both probability scores. It had lower Week 1 probability error over 32 games (Brier 0.18459 versus 0.19440), but that small subgroup does not justify switching the overall model or adding a special Week 1 rule based on this result.

The Elo-style comparator uses regular-season games, K=20, a 65-point non-neutral home adjustment, two-thirds offseason rating retention, and a log-margin multiplier with a rating-gap correction. It starts teams at 1500 in 2015 and updates through the evaluation years using past results. This is a fixed comparator, not the complete FiveThirtyEight model or its quarterback-adjusted forecasts. [Related public Elo implementation](https://github.com/fivethirtyeight/nfl-elo-game).

## Calibration check of the current model

These bins use home-team probabilities, not the favored team's probabilities. Intervals are approximate 95% Wilson intervals for the observed group win frequency; they are not uncertainty intervals for individual games. Repeated teams/games are not modeled as independent clusters in those intervals, so interpret them descriptively.

| Forecast range | Games | Average forecast | Observed home wins | Observed-rate interval |
| --- | ---: | ---: | ---: | --- |
| 10–20% | 9 | 16.4% | 44.4% | 18.9–73.3% |
| 20–30% | 43 | 26.3% | 30.2% | 18.6–45.1% |
| 30–40% | 97 | 35.6% | 32.0% | 23.5–41.8% |
| 40–50% | 113 | 45.1% | 41.6% | 32.9–50.8% |
| 50–60% | 126 | 54.7% | 63.5% | 54.8–71.4% |
| 60–70% | 80 | 64.3% | 70.0% | 59.2–78.9% |
| 70–80% | 64 | 74.1% | 76.6% | 64.9–85.3% |
| 80–90% | 11 | 82.8% | 100.0% | 74.1–100.0% |

The sparse extremes and deviations in the middle prevent a claim of precise calibration. An apparently exact percentage such as 63.27% would not solve that issue. The interface rounds the primary forecast to whole percentages while preserving the underlying value for scoring.

## Next modeling priorities

1. Keep a fixed forecast version and record pregame predictions prospectively in 2026. Use a consistent lead time and record all intended matchups rather than choosing only interesting predictions. The journal supports one initial forecast per game/version; it is a local research record, not a tamper-proof audit log.
2. Test opponent-adjusted team efficiency and expected starting-quarterback information as separate additions. Only use information that was actually available at the forecast timestamp. The quarterback who ultimately played cannot automatically stand in for a historically known expected starter.
3. Separate candidate development, calibration, and later evaluation. Retain a challenger only when improvements persist across chronological checks, calibration inspection, and prospective results. Avoid repeated selection on the already-inspected 2024–2025 games.
4. Model ties explicitly if unconditional NFL win probabilities become the target. Until then, retain the conditional-on-no-tie label.

No additional matchup-history weight, injury adjustment, quarterback feed, or opponent-efficiency model has been added to production in this update. Historical head-to-head games already contribute to season statistics; an additional weight would need its own evidence.

## Reproducibility and limitations

Source: [nflverse historical game data](https://github.com/nflverse/nfldata/blob/master/data/games.csv), retrieved September 2, 2026, SHA-256 `087ba29e33306df9307d95665aba75cab1af854ac88eb93b7ff6c3e94c4fec8e`.

The comparison was run with Node.js and scikit-learn 1.8.0. The analysis source is retained with the development checkout as `scripts/evaluate-model.mjs` (with its `--examples` option) and `scripts/compare-probabilities.py`.

```sh
node scripts/evaluate-model.mjs /path/to/games.csv --examples > examples.json
python scripts/compare-probabilities.py examples.json comparison.json
```

Historical results are reconstructed from a current dataset, not archived forecasts. Source corrections, differences from ESPN, shared teams, selection choices, and small subsets limit the findings. The journal's outcomes are manually entered, selected games may be unrepresentative, and browser records can be edited or lost. Export backups. There is no claim of predictive certainty, general superiority, or profitable trading.
