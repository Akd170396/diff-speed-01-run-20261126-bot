# diff-speed-01-run-20261126-bot

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/Akd170396/diff-speed-01-run-20261126-bot/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/Akd170396/diff-speed-01-run-20261126-bot/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in replacement for makefun-diff 1.0.0: `run(input)` in solve.js returns exactly the patch makefun-diff 1.0.0 returns for `{ old, new }` — the same greedy Myers edit script with make.fun's deletion-wins tie-break, the same hunks and context — computed with a leaner engine: lines interned to integer ids in one pass, one Int32Array frontier per search depth instead of a linked list of path objects per diagonal, and the winning path walked back with the forward pass's own decision rule. Identical output, several times less CPU.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` and writes `/output/answers.json`; outside the grading container, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=s3svssng&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
