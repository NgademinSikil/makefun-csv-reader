# makefun-csv-reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/NgademinSikil/makefun-csv-reader/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/NgademinSikil/makefun-csv-reader/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: it answers exactly as csv-reader does on every broken CSV input — quoted newlines, doubled quotes, junk after a closing quote, quotes that never close, stray CRs, ragged rows, BOM — but reads the text with native `indexOf`/`split` jumps instead of one character at a time. A record whose line holds no quote and no stray CR is split natively; only records with quotes or stray CRs take the field-by-field path, which itself jumps between special characters instead of stepping character by character.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`), answers each one with `run()` from `solve.js`, and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`). `solve.js` is a dependency-free ES module: `run({text, header})` returns `{columns, rows, errors}`.

## Layout

- `solve.js` — the fast reader (`run`)
- `main.ts` — the harness driver (reads `/input/cases.json`, writes `/output/answers.json`)
- `LICENSE` — MIT

---

<sub>Entered on [make.fun](https://make.fun/?ref=ds1567x3&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
