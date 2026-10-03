import { latestPerCheck } from "./policies/latestPerCheck";
import { lastWins } from "./policies/lastWins";
import { windowView, type CheckWindow } from "./policies/windowView";
import { mulberry32, shuffle } from "./sim/prng";
import type { CheckRun, Result, Scenario, Status, Task } from "./sim/types";

export type Policy = (runs: readonly CheckRun[], task: Task, t: number) => Status;

export interface StatusSegment {
  from: number;
  to: number;
  status: Status;
}

type TimelineInput = Pick<Scenario, "runs" | "task" | "windowStart" | "windowEnd">;

/** Piecewise-constant status over the window, with adjacent equal statuses merged. */
export function buildTimeline(
  policy: Policy,
  input: TimelineInput,
  runs: readonly CheckRun[] = input.runs,
): StatusSegment[] {
  const { task, windowStart, windowEnd } = input;
  const required = new Set(task.requiredCheckIds);
  const points = new Set<number>([windowStart]);
  for (const r of runs) if (r.persisted && required.has(r.checkId)) points.add(r.completedAt);
  for (const e of task.exceptions) {
    points.add(e.from);
    points.add(e.to);
  }
  const starts = [...points].filter((p) => p >= windowStart && p < windowEnd).sort((a, b) => a - b);

  const out: StatusSegment[] = [];
  starts.forEach((from, i) => {
    const to = i + 1 < starts.length ? starts[i + 1] : windowEnd;
    const status = policy(runs, task, from);
    const prev = out[out.length - 1];
    if (prev && prev.status === status) prev.to = to;
    else out.push({ from, to, status });
  });
  return out;
}

/**
 * Count of status changes. The first verdict after "pending" is not a flip
 * (nothing was being overturned), so transitions out of pending are skipped.
 */
export function flips(segments: readonly StatusSegment[]): number {
  let n = 0;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i - 1].status !== "pending" && segments[i].status !== segments[i - 1].status) n++;
  }
  return n;
}

/** Minutes where predicate(a, b) holds, given two timelines over the same window. */
function overlapMinutes(
  a: readonly StatusSegment[],
  b: readonly StatusSegment[],
  predicate: (sa: Status, sb: Status) => boolean,
): number {
  let i = 0;
  let j = 0;
  let total = 0;
  while (i < a.length && j < b.length) {
    const from = Math.max(a[i].from, b[j].from);
    const to = Math.min(a[i].to, b[j].to);
    if (to > from && predicate(a[i].status, b[j].status)) total += to - from;
    if (a[i].to <= b[j].to) i++;
    else j++;
  }
  return total;
}

/** Hours where rule A says "done" while rule B says "failed". */
export function falseGreenHours(a: readonly StatusSegment[], b: readonly StatusSegment[]): number {
  return overlapMinutes(a, b, (sa, sb) => sa === "done" && sb === "failed") / 60;
}

// ---------------------------------------------------------------------------
// Order dependence
// ---------------------------------------------------------------------------

/** Groups of runs (by index) that complete in the same minute as another run. */
export function tieGroups(runs: readonly CheckRun[]): number[][] {
  const byMinute = new Map<number, number[]>();
  runs.forEach((r, i) => {
    if (!r.persisted) return;
    const list = byMinute.get(r.completedAt);
    if (list) list.push(i);
    else byMinute.set(r.completedAt, [i]);
  });
  return [...byMinute.values()].filter((g) => g.length > 1);
}

/** Shuffle the input order of simultaneous runs only; everything else stays put. */
export function shuffleTies(
  runs: readonly CheckRun[],
  groups: number[][],
  rand: () => number,
): CheckRun[] {
  const out = runs.slice();
  for (const g of groups) {
    const shuffled = shuffle(g.map((i) => runs[i]), rand);
    g.forEach((slot, k) => {
      out[slot] = shuffled[k];
    });
  }
  return out;
}

export interface OrderDependence {
  tiedMinutes: number;
  tiedRuns: number;
  shuffles: number;
  /** Distinct final-status vectors (status held right after each tied minute). */
  distinctOutcomes: number;
  /** Largest difference in flip count between any two orderings. */
  orderCausedFlips: number;
}

export const SHUFFLES = 200;
export const SHUFFLE_SEED = 20240601;

export function orderDependence(policy: Policy, scenario: Scenario): OrderDependence {
  const groups = tieGroups(scenario.runs);
  const tieMinutes = groups.map((g) => scenario.runs[g[0]].completedAt);
  const rand = mulberry32(SHUFFLE_SEED);
  const outcomes = new Set<string>();
  const baseFlips = flips(buildTimeline(policy, scenario));
  let minFlips = baseFlips;
  let maxFlips = baseFlips;

  const record = (runs: readonly CheckRun[]) => {
    outcomes.add(tieMinutes.map((t) => policy(runs, scenario.task, t)).join(","));
  };
  record(scenario.runs);
  for (let k = 0; k < SHUFFLES; k++) {
    const permuted = shuffleTies(scenario.runs, groups, rand);
    record(permuted);
    const f = flips(buildTimeline(policy, scenario, permuted));
    minFlips = Math.min(minFlips, f);
    maxFlips = Math.max(maxFlips, f);
  }

  return {
    tiedMinutes: groups.length,
    tiedRuns: groups.reduce((n, g) => n + g.length, 0),
    shuffles: SHUFFLES,
    distinctOutcomes: outcomes.size,
    orderCausedFlips: maxFlips - minFlips,
  };
}

export interface OrderCounterexample {
  minute: number;
  statusIfListedFirst: Status;
  statusIfListedLast: Status;
  order1: CheckRun[];
  order2: CheckRun[];
}

/**
 * Search for a tied minute where reordering the inputs changes the policy's answer.
 * Tries each tied run as the last-listed one, which is enough for rule A.
 */
export function findOrderCounterexample(policy: Policy, scenario: Scenario): OrderCounterexample | null {
  for (const g of tieGroups(scenario.runs)) {
    const statuses = new Map<Status, CheckRun[]>();
    for (const last of g) {
      const order = scenario.runs.slice();
      const others = g.filter((i) => i !== last);
      const arranged = [...others, last].map((i) => scenario.runs[i]);
      g.forEach((slot, k) => {
        order[slot] = arranged[k];
      });
      const minute = scenario.runs[g[0]].completedAt;
      const status = policy(order, scenario.task, minute);
      if (!statuses.has(status)) statuses.set(status, order);
      if (statuses.size > 1) {
        const [[s1, o1], [s2, o2]] = [...statuses.entries()];
        return { minute, statusIfListedFirst: s1, statusIfListedLast: s2, order1: o1, order2: o2 };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Orphans
// ---------------------------------------------------------------------------

export interface Orphan {
  checkRunId: string;
  completedAt: number;
  result: Result;
  /** True when the caller was told "fail" and nothing was saved. */
  flagged: boolean;
}

export function orphans(scenario: Pick<Scenario, "runs" | "apiLog">): Orphan[] {
  const saved = new Set(scenario.runs.filter((r) => r.persisted).map((r) => r.id));
  return scenario.apiLog
    .filter((e) => !saved.has(e.checkRunId))
    .map((e) => ({
      checkRunId: e.checkRunId,
      completedAt: e.completedAt,
      result: e.result,
      flagged: e.result === "fail",
    }));
}

// ---------------------------------------------------------------------------
// Everything the UI needs for one scenario
// ---------------------------------------------------------------------------

export interface Analysis {
  timelineA: StatusSegment[];
  timelineB: StatusSegment[];
  flipsA: number;
  flipsB: number;
  falseGreenHours: number;
  orderA: OrderDependence;
  orderB: OrderDependence;
  orphans: Orphan[];
}

/** Everything that doesn't depend on the freshness slider. */
export function analyze(scenario: Scenario): Analysis {
  const timelineA = buildTimeline(lastWins, scenario);
  const timelineB = buildTimeline(latestPerCheck, scenario);
  return {
    timelineA,
    timelineB,
    flipsA: flips(timelineA),
    flipsB: flips(timelineB),
    falseGreenHours: falseGreenHours(timelineA, timelineB),
    orderA: orderDependence(lastWins, scenario),
    orderB: orderDependence(latestPerCheck, scenario),
    orphans: orphans(scenario),
  };
}

export function totalStaleDays(view: readonly CheckWindow[]): number {
  return view.reduce((n, c) => n + c.staleDays, 0);
}

export { windowView };
