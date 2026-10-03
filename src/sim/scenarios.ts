import { mulberry32, randInt } from "./prng";
import {
  MINUTES_PER_DAY as DAY,
  WINDOW_DAYS,
  WINDOW_MINUTES,
  type ApiLogEntry,
  type Check,
  type CheckRun,
  type Result,
  type Scenario,
} from "./types";

/** Seeds found with `npm run find-seeds`; see scripts/find-seeds.ts for the criteria. */
export const SCENARIO_SEEDS = { s1: 1, s2: 2, s3: 3 } as const;

/** Tunable knobs for scenario 1. Defaults are what the committed fixture uses. */
export const S1_PARAMS = {
  /** Chance A's completion lands in the same minute as G's on the same day. */
  tieProbability: 0.5,
  /** Transient provider errors (throttling, timeouts). Disclosed in the blurb. */
  gErrorRate: 0.05,
  aErrorRate: 0.12,
};

/** Scenario 3: share of runs that return an id but are never saved. */
export const S3_DROP_RATE = 0.06;

interface RunDraft extends Omit<CheckRun, "id"> {}

/** Sort by completion time (stable, so generation order breaks ties), then name runs. */
function finalize(drafts: RunDraft[], prefixes: Record<string, string>): CheckRun[] {
  const sorted = drafts
    .map((d, i) => ({ d, i }))
    .sort((x, y) => x.d.completedAt - y.d.completedAt || x.i - y.i)
    .map((x) => x.d);
  const counters: Record<string, number> = {};
  return sorted.map((d) => {
    counters[d.checkId] = (counters[d.checkId] ?? 0) + 1;
    const n = String(counters[d.checkId]).padStart(3, "0");
    return { id: `${prefixes[d.checkId]}-${n}`, ...d };
  });
}

function logOf(runs: CheckRun[]): ApiLogEntry[] {
  return runs.map((r) => ({ checkRunId: r.id, completedAt: r.completedAt, result: r.result }));
}

function base(
  id: string,
  title: string,
  blurb: string,
  checks: Check[],
  requiredCheckIds: string[],
): Omit<Scenario, "runs" | "apiLog"> {
  return {
    id,
    title,
    blurb,
    windowStart: 0,
    windowEnd: WINDOW_MINUTES,
    checks,
    task: { id: `task-${id}`, requiredCheckIds, exceptions: [] },
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: two providers, one task
// ---------------------------------------------------------------------------

export function buildScenario1(seed: number = SCENARIO_SEEDS.s1, params = S1_PARAMS): Scenario {
  const rand = mulberry32(seed);
  const drafts: RunDraft[] = [];
  const failFrom = 26 * DAY;
  const failTo = 35 * DAY; // nine days around day 30

  for (let d = 0; d < WINDOW_DAYS; d++) {
    const gDur = randInt(rand, 2, 6);
    const gDone = d * DAY + 360 + randInt(rand, 0, 40) + gDur;
    const gErr = rand() < params.gErrorRate;
    drafts.push({
      checkId: "G",
      provider: "github",
      startedAt: gDone - gDur,
      completedAt: gDone,
      result: gErr ? "error" : "pass",
      snapshotAsOf: gDone - 1,
      persisted: true,
    });

    const aDur = randInt(rand, 3, 9);
    const aOwnDone = d * DAY + 360 + randInt(rand, 0, 40) + aDur;
    const ties = rand() < params.tieProbability;
    const aErr = rand() < params.aErrorRate;
    if (d % 3 !== 0) continue; // A runs every 3 days
    const aDone = ties ? gDone : aOwnDone;
    const inStretch = aDone >= failFrom && aDone < failTo;
    const result: Result = inStretch ? "fail" : aErr ? "error" : "pass";
    drafts.push({
      checkId: "A",
      provider: "cloud",
      startedAt: aDone - aDur,
      completedAt: aDone,
      result,
      snapshotAsOf: aDone - 2,
      persisted: true,
    });
  }

  const runs = finalize(drafts, { G: "run-g", A: "run-a" });
  const checks: Check[] = [
    { id: "G", name: "Branch protection (GitHub-style)", provider: "github", cadence: "daily" },
    { id: "A", name: "Cloud config (cloud-style)", provider: "cloud", cadence: "every 3 days" },
  ];
  const s = base(
    "scenario-1",
    "Two providers, one task",
    "Check G runs daily and passes. Check A runs every 3 days and fails for 9 days around day 30. " +
      "Both occasionally hit transient provider errors. Some completions land in the same minute, " +
      "so rule A depends on which run the system happened to read last.",
    checks,
    ["G", "A"],
  );
  s.task.exceptions.push({
    checkId: "A",
    from: 33 * DAY,
    to: 36 * DAY,
    reason: "Synthetic risk acceptance while the cloud config is remediated",
  });
  return { ...s, runs, apiLog: logOf(runs) };
}

// ---------------------------------------------------------------------------
// Scenario 2: stale snapshot
// ---------------------------------------------------------------------------

/** Ground truth for the vulnerability-style check: fail while a finding is open. */
function s2Truth(t: number): Result {
  const day = t / DAY;
  if (day >= 25 && day < 40) return "fail"; // fix lands on day 40
  if (day >= 60 && day < 75) return "fail"; // regression on day 60
  return "pass";
}

export function buildScenario2(seed: number = SCENARIO_SEEDS.s2): Scenario {
  const rand = mulberry32(seed);
  const drafts: RunDraft[] = [];
  const lag = 36 * 60;

  for (let d = 0; d < WINDOW_DAYS; d++) {
    const vDur = randInt(rand, 4, 12);
    const vDone = d * DAY + randInt(rand, 10, 40) + vDur;
    const snap = vDone - lag;
    drafts.push({
      checkId: "V",
      provider: "scanner",
      startedAt: vDone - vDur,
      completedAt: vDone,
      result: s2Truth(snap),
      snapshotAsOf: snap,
      persisted: true,
    });

    const kDur = randInt(rand, 2, 5);
    const kDone = d * DAY + 480 + randInt(rand, 0, 30) + kDur;
    drafts.push({
      checkId: "K",
      provider: "github",
      startedAt: kDone - kDur,
      completedAt: kDone,
      result: "pass",
      snapshotAsOf: kDone - 1,
      persisted: true,
    });
  }

  const runs = finalize(drafts, { V: "run-v", K: "run-k" });
  const checks: Check[] = [
    { id: "V", name: "Vulnerability scan (scanner-style)", provider: "scanner", cadence: "daily, 36h-old snapshot" },
    { id: "K", name: "Branch protection (GitHub-style)", provider: "github", cadence: "daily" },
  ];
  const s = base(
    "scenario-2",
    "Stale snapshot",
    "The scan runs daily against a provider snapshot that is 36 hours old. A real fix lands on day 40, " +
      "but the check keeps reporting fail until day 42. A break on day 60 reads as pass until day 62. " +
      "Slide the freshness limit to see how much of the evidence is old.",
    checks,
    ["V", "K"],
  );
  return { ...s, runs, apiLog: logOf(runs) };
}

// ---------------------------------------------------------------------------
// Scenario 3: run id returned, run not saved
// ---------------------------------------------------------------------------

export function buildScenario3(seed: number = SCENARIO_SEEDS.s3, dropRate: number = S3_DROP_RATE): Scenario {
  const rand = mulberry32(seed);
  const drafts: RunDraft[] = [];

  for (let d = 0; d < WINDOW_DAYS; d++) {
    const eDur = randInt(rand, 3, 8);
    const eDone = d * DAY + 240 + randInt(rand, 0, 60) + eDur;
    const eFails = (d >= 50 && d < 54) || (d >= 70 && d < 72);
    drafts.push({
      checkId: "E",
      provider: "mdm",
      startedAt: eDone - eDur,
      completedAt: eDone,
      result: eFails ? "fail" : "pass",
      snapshotAsOf: eDone - 5,
      persisted: rand() >= dropRate,
    });

    const pDur = randInt(rand, 2, 6);
    const pDone = d * DAY + 600 + randInt(rand, 0, 60) + pDur;
    drafts.push({
      checkId: "P",
      provider: "idp",
      startedAt: pDone - pDur,
      completedAt: pDone,
      result: "pass",
      snapshotAsOf: pDone - 1,
      persisted: rand() >= dropRate,
    });
  }

  const runs = finalize(drafts, { E: "run-e", P: "run-p" });
  const checks: Check[] = [
    { id: "E", name: "Device encryption (MDM-style)", provider: "mdm", cadence: "daily" },
    { id: "P", name: "Policy acknowledgement (IdP-style)", provider: "idp", cadence: "daily" },
  ];
  const s = base(
    "scenario-3",
    "Run id returned, run not saved",
    "About 6% of runs hand the caller a run id but are never persisted. The API log still shows them, " +
      "so a failing result can exist in the log while every rule reads the last saved run instead.",
    checks,
    ["E", "P"],
  );
  return { ...s, runs, apiLog: logOf(runs) };
}

export function buildScenarios(): Scenario[] {
  return [buildScenario1(), buildScenario2(), buildScenario3()];
}

/** Canonical serialization used for the committed fixtures (LF, trailing newline). */
export function serializeScenario(s: Scenario): string {
  return JSON.stringify(s, null, 2) + "\n";
}

export const FIXTURE_FILES = ["scenario-1.json", "scenario-2.json", "scenario-3.json"] as const;
