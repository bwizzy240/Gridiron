# Historical baseline evaluation — September 2, 2026

The update replaces the automatic early-season 50/50 fallback with a prior-season strength estimate and gradually incorporates current-season results. It keeps the existing record/point-differential/home-away blend, short-rest adjustment, and divisional adjustment.

## Selected weights

- Retain two-thirds of the prior-season strength's deviation from 50/50, pulling the rest toward league average. If fewer than eight prior games exist, multiply that retention by priorGames / 8.
- Current-season weight = currentGames / (currentGames + 8). The remaining weight goes to the softened prior-season baseline, or league average when prior history is absent.
- Evidence for the value-flag data check = currentGames + 0.5 × priorGames. Both teams need at least four. This evidence rule is a data-availability heuristic, not a calibrated confidence threshold; it was not selected by optimizing returns.

## Method

Source: [nflverse game data](https://github.com/nflverse/nfldata/blob/master/data/games.csv), retrieved September 2, 2026. Source CSV SHA-256: `087ba29e33306df9307d95665aba75cab1af854ac88eb93b7ff6c3e94c4fec8e`.

Only completed regular-season games were used. For each forecast, inputs exclude the target game and all games on or after its calendar date. This same-day exclusion is more conservative than the production kickoff cutoff. Franchise relocation aliases are normalized. Rest is reconstructed from eligible game dates. Each prediction uses only that season's prior games and the immediately preceding regular season. No sportsbook or Kalshi prices enter the model.

Nine configurations were compared on 2,351 development games in 2015–2023: prior retention of 0.5, 2/3, or 0.8, combined with fade denominators of 4, 8, or 12 games. The lowest mean squared probability error selected 2/3 and 8. The chosen configuration was then evaluated on 544 games from 2024–2025, without selecting parameters from those holdout results. Other existing model parameters were retained, not retuned.

The scoring target is home win = 1, home loss = 0, tie = 0.5. The reported Brier-style score is mean squared error against that target. Log loss likewise uses fractional labels for ties. Lower is better for both.

| Model | 2024–2025 games | Mean squared error | Log loss |
| --- | ---: | ---: | ---: |
| Historical baseline + current form | 544 | 0.21812 | 0.62781 |
| Original current-season-only calculation | 544 | 0.23361 | 0.67800 |
| Always 50/50 | 544 | 0.24954 | 0.69315 |

For the 32 Week 1 games in the holdout, squared error was 0.19440 for the historical version and 0.25000 for the old 50/50 fallback. That subset is small and does not establish robust Week 1 performance.

Calibration inspection showed sparse extreme-probability groups (nine games below 20%, eleven above 80%). Their observed frequencies are too unstable to establish confidence at the extremes. The model is not claimed to be calibrated.

## Limits

These are reconstructed forecasts from the current historical dataset, not forecasts archived before each game. Corrections to historical results, source differences from ESPN, same-day time handling, and the lack of archived inputs limit the evaluation. No uncertainty intervals or statistical-significance claims are made. There is no explicit injury, quarterback, roster-change, opponent-strength, weather, or tie-probability model. Head-to-head results are already present among season results and have not been given an additional weight.

The evaluation does not use execution prices, fees, liquidity, or trade timing, and cannot establish profitability or superiority to Kalshi. Continue recording timestamped paper forecasts and evaluate their calibration and net results prospectively.

## Reproduce

With Node.js 22+ and the source CSV downloaded:

```sh
node scripts/evaluate-model.mjs /path/to/games.csv
node --test
```

The script prints all development candidates, the selected parameters, holdout results, Week 1 results, and calibration bins. Reproducing the exact figures requires the CSV hash above; later upstream updates may change them.
