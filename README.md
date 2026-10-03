# Verdict Replay

**Live demo:** https://verdict-replay.vercel.app/

A static browser demo that compares three ways to derive the status of one compliance evidence task from several checks, replayed over a simulated 90-day SOC 2 observation window. Everything is synthetic. There is no backend, account, paid API, analytics or runtime network call.

> Independent demo. Models behavior described in a public GitHub issue. Synthetic data.

## Context

The open-source Comp AI repo has an issue, [trycompai/comp#3541](https://github.com/trycompai/comp/issues/3541), describing three behaviors:

1. When several checks attach to one task, the status follows whichever check ran last.
2. Scheduled runs can read cached provider snapshots.
3. A check can return a run id without that run being persisted.

This demo models those behaviors with generated data. **It does not reproduce production, and it makes no claim about how any real system behaves.** It uses no Comp AI code, logos or branding.

## What is modeled

| Rule | Name | Behavior |
| --- | --- | --- |
| A | `lastWins` | Status = result of the persisted run with the greatest `completedAt <= t`, from any required check. Ties go to input order, which makes it order-dependent. |
| B | `latestPerCheck` | Take each required check's latest persisted run (ties by `completedAt`, then `id`). Missing check: pending. Any fail/error: failed. A failure inside an exception window becomes `excepted`. Otherwise done. |
| C | `windowView` | No verdict. Per check: coverage (fraction of minutes where the latest result is pass **and** fresh), fail intervals, stale days, and a descriptive label (Clean / Exceptions (n) / Evidence gaps). **Not an audit opinion.** |

Scenarios (fixed seeds, committed as `fixtures/*.json`):

1. **Two providers, one task.** G (daily, passes) and A (every 3 days, fails for 9 days around day 30). Some completions land in the same minute. Both checks also have a small rate of transient `error` results; I added those so rule A reaches 20+ flips (see below). One exception window (days 33 to 36) shows rule B's `excepted` state.
2. **Stale snapshot.** A scan runs daily on a 36-hour-old snapshot. A fix on day 40 is reported on day 42; a break on day 60 reads as pass until day 62. A second, fresh check (K) is in the task so rule A has something to flip against.
3. **Run id returned, run not saved.** About 6% of runs have `persisted=false` but still appear in the API log. All rules see only persisted runs.

Metrics: flips, false-green hours (A done while B failed), order dependence (200 seeded shuffles of same-minute runs; "distinct outcomes" counts distinct status vectors held right after each tied minute), stale days, and orphans (API log entries with no persisted run; logged `fail` orphans are flagged).

## Reading the page

- The big number is **false-green time**: hours where rule A said done while rule B said failed.
- Hover, tap, or use the arrow keys on the timelines to read the same moment in all three rules. Shift+arrow jumps 10 days.
- Red diamonds under rule A mark same-minute completions, the moments where input order decides the answer.
- Colors follow a validated palette. "Done" is aqua rather than green so it stays distinct from "failed" for red-green color blindness. Every state also has a text label, and each timeline has a text version.

## Choices worth knowing about

- **Flips** do not count the first verdict after `pending`.
- **Seeds** were chosen with `npm run find-seeds` (criteria are in `scripts/find-seeds.ts`). Scenario 1 needs A flips >= 20, B flips below A, and a same-minute tie inside the failure stretch that changes A's answer. With only the 3 A failures a 9-day stretch allows, plain interleaving gave about 6 flips, so transient errors (G 5%, A 12%) were added. They also flip rule B, so the A/B gap in scenario 1 is modest (20 vs 12); scenario 2 shows the large gap.
- **Stale days** counts a day if any minute of it had a passing latest result older than the limit. With daily runs and jitter, a 24-hour limit marks some days stale even for a healthy daily check. Raise the slider to see that change.
- The scenario JSON has one extra field, `checks`, with display names and cadence.

## What this does not do

No real data. No production claim. No AI. No audit opinion.

## Develop

Node 20+ and npm.

```
npm install
npm run dev        # local dev server
npm test           # vitest
npm run gen        # regenerate fixtures/*.json from seeds
npm run build      # typecheck + static build into dist/
```

Tests cover: rule B identical across 200 seeded permutations; a rule A counterexample in scenario 1; rule B's fail/done/pending/excepted logic; rule C coverage bounds and staleDays monotonicity; fixtures matching regenerated output byte for byte; scenario 1 having 20+ flips for A and zero order-caused flips for B.

## Deploy (Vercel Hobby, free)

Static build, no API keys, no cold start (unlike a sleeping Streamlit app, scenario 1 is meaningful on first click).

1. Push to a public GitHub repo.
2. Import it in Vercel. Framework preset: Vite. Build command `npm run build`, output `dist`.
3. Deploy, then open the URL in a private window and confirm scenario 1 renders with no interaction and the network tab shows only the page's own HTML, JS and CSS. (Done for the URL above.)
