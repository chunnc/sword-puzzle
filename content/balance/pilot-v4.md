# Pilot v4 balance validation

Validated 58,000 first-attempt simulations on disjoint validation seeds, plus 100 retry sequences per map.
All 10 maps meet the normal-bot win and three-star target bands. Every earned star tier was observed, and strategic bots outperform basic bots.

Rates below are unconditional percentages of all first attempts at expected progression strength; failures are excluded from earned star tiers.

| Map | Difficulty | Moves | Win | 1 star | 2 stars | 3 stars | Basic win | Strategic win | Stronger normal win |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | easy | 14 | 88.5% | 22.1% | 31.1% | 35.3% | 18.0% | 91.8% | 88.5% |
| 2 | easy | 14 | 90.5% | 16.8% | 30.2% | 43.5% | 22.6% | 91.8% | 90.5% |
| 3 | medium | 16 | 64.8% | 19.8% | 20.5% | 24.5% | 5.7% | 70.0% | 64.8% |
| 4 | easy | 14 | 89.4% | 11.5% | 27.9% | 50.0% | 16.9% | 91.8% | 89.4% |
| 5 | hard | 18 | 20.5% | 12.2% | 5.2% | 3.1% | 0.0% | 25.1% | 63.7% |
| 6 | easy | 6 | 91.1% | 14.0% | 23.7% | 53.4% | 37.9% | 91.1% | 91.1% |
| 7 | medium | 16 | 65.1% | 18.3% | 17.6% | 29.2% | 3.1% | 71.6% | 91.2% |
| 8 | hard | 8 | 29.1% | 12.5% | 9.9% | 6.7% | 3.9% | 32.8% | 29.1% |
| 9 | easy | 14 | 87.5% | 7.8% | 26.7% | 53.0% | 15.4% | 91.2% | 98.6% |
| 10 | very-hard | 20 | 9.7% | 6.7% | 1.8% | 1.2% | 0.0% | 12.3% | 57.0% |

Retry means are calculated among completed sequences; unfinished sequences are censored after 30 attempts.

| Map | Average attempts to win | Unfinished / 100 |
|---|---:|---:|
| 1 | 1.15 | 0 |
| 2 | 1.06 | 0 |
| 3 | 1.38 | 0 |
| 4 | 1.13 | 0 |
| 5 | 4.30 | 0 |
| 6 | 1.05 | 0 |
| 7 | 1.50 | 0 |
| 8 | 3.16 | 0 |
| 9 | 1.08 | 0 |
| 10 | 7.42 | 1 |

This is simulation evidence, not a human playtest. Basic bots intentionally select weaker moves; normal bots optimize visible objectives. Stronger profiles use higher realm EXP with the same default sword/skill, so collection/obstacle rates can remain identical.

Full move histograms, cascade/reshuffle metrics, seed suite, per-map hashes and target bands are in [pilot-v4.json](pilot-v4.json). Re-run `npm run maps:release` after changing gameplay or authoring data. Maps 11–40 retain legacy generation rules and are covered by compatibility tests.
