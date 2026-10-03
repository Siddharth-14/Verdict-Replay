/**
 * How the scenario seeds were chosen. Run with `npm run find-seeds`.
 * It prints the first few seeds that meet each scenario's criteria; the committed
 * SCENARIO_SEEDS in src/sim/scenarios.ts are the smallest ones listed here.
 */
import { analyze, findOrderCounterexample } from "../src/metrics";
import { lastWins } from "../src/policies/lastWins";
import { buildScenario1, buildScenario2, buildScenario3 } from "../src/sim/scenarios";

const MAX = 400;
const WANT = 3;

function scan(name: string, test: (seed: number) => string | null) {
  const hits: string[] = [];
  for (let seed = 1; seed <= MAX && hits.length < WANT; seed++) {
    const note = test(seed);
    if (note) hits.push(`seed ${seed}: ${note}`);
  }
  console.log(`${name}\n  ${hits.length ? hits.join("\n  ") : "no seed found"}`);
}

scan("scenario 1: A flips >= 20, B flips below A, and a same-minute tie inside the failure stretch changes A's answer", (seed) => {
  const s = buildScenario1(seed);
  const a = analyze(s);
  const counter = findOrderCounterexample(lastWins, s);
  const inStretch = counter !== null && counter.minute >= 26 * 1440 && counter.minute < 35 * 1440;
  return a.flipsA >= 20 && a.flipsB < a.flipsA && inStretch
    ? `flipsA=${a.flipsA} flipsB=${a.flipsB} tiedMinutes=${a.orderA.tiedMinutes}`
    : null;
});

scan("scenario 2: no seed requirement (deterministic story); showing flips for reference", (seed) => {
  const a = analyze(buildScenario2(seed));
  return `flipsA=${a.flipsA} flipsB=${a.flipsB} falseGreenH=${a.falseGreenHours.toFixed(0)}`;
});

scan("scenario 3: at least 2 orphans whose logged result is fail, drop rate near 6%", (seed) => {
  const s = buildScenario3(seed);
  const a = analyze(s);
  const dropRate = a.orphans.length / s.runs.length;
  const flagged = a.orphans.filter((o) => o.flagged).length;
  return flagged >= 2 && dropRate > 0.04 && dropRate < 0.08
    ? `orphans=${a.orphans.length} (${(dropRate * 100).toFixed(1)}%) failOrphans=${flagged}`
    : null;
});
