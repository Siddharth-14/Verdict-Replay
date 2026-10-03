import { latestRun } from "./latestPerCheck";
import { MINUTES_PER_DAY, type CheckRun, type Scenario } from "../sim/types";

export const DEFAULT_FRESHNESS_MIN = 24 * 60;

/** What a check's latest persisted evidence looks like at a given minute. */
export type EvidenceState = "pending" | "fresh" | "stale" | "fail";

export interface EvidenceSegment {
  from: number;
  to: number;
  state: EvidenceState;
}

export type CheckLabel = "Clean" | `Exceptions (${number})` | "Evidence gaps";

export interface CheckWindow {
  checkId: string;
  segments: EvidenceSegment[];
  /** Fraction of window minutes where the latest result is pass AND fresh. */
  coverage: number;
  /** Number of distinct intervals where the latest result is fail/error. */
  exceptionEpisodes: number;
  /** Days with at least one minute where the latest result is pass but stale. */
  staleDays: number;
  label: CheckLabel;
}

type WindowInput = Pick<Scenario, "runs" | "task" | "windowStart" | "windowEnd">;

function stateAt(runs: readonly CheckRun[], checkId: string, t: number, limit: number): EvidenceState {
  const run = latestRun(runs, checkId, t);
  if (!run) return "pending";
  if (run.result !== "pass") return "fail";
  return t - run.snapshotAsOf <= limit ? "fresh" : "stale";
}

/**
 * Rule C, windowView: a descriptive per-check summary of the whole window.
 * It never produces a single verdict, and it is not an audit opinion.
 */
export function windowView(input: WindowInput, freshnessLimitMin = DEFAULT_FRESHNESS_MIN): CheckWindow[] {
  const { runs, task, windowStart, windowEnd } = input;
  const totalMinutes = windowEnd - windowStart;

  return task.requiredCheckIds.map((checkId) => {
    const own = runs.filter((r) => r.persisted && r.checkId === checkId);

    // The state can only change when a run completes or when the latest run's
    // snapshot ages past the limit (first stale minute is snapshotAsOf + limit + 1).
    const points = new Set<number>([windowStart]);
    for (const r of own) {
      points.add(r.completedAt);
      points.add(r.snapshotAsOf + freshnessLimitMin + 1);
    }
    const starts = [...points].filter((p) => p >= windowStart && p < windowEnd).sort((a, b) => a - b);

    const segments: EvidenceSegment[] = [];
    starts.forEach((from, i) => {
      const to = i + 1 < starts.length ? starts[i + 1] : windowEnd;
      const state = stateAt(own, checkId, from, freshnessLimitMin);
      const prev = segments[segments.length - 1];
      if (prev && prev.state === state) prev.to = to;
      else segments.push({ from, to, state });
    });

    let freshMinutes = 0;
    let episodes = 0;
    const staleDaySet = new Set<number>();
    for (const s of segments) {
      if (s.state === "fresh") freshMinutes += s.to - s.from;
      if (s.state === "fail") episodes += 1;
      if (s.state === "stale") {
        const first = Math.floor((s.from - windowStart) / MINUTES_PER_DAY);
        const last = Math.floor((s.to - 1 - windowStart) / MINUTES_PER_DAY);
        for (let d = first; d <= last; d++) staleDaySet.add(d);
      }
    }

    const staleDays = staleDaySet.size;
    const label: CheckLabel =
      episodes > 0 ? `Exceptions (${episodes})` : staleDays === 0 ? "Clean" : "Evidence gaps";

    return {
      checkId,
      segments,
      coverage: totalMinutes > 0 ? freshMinutes / totalMinutes : 0,
      exceptionEpisodes: episodes,
      staleDays,
      label,
    };
  });
}
