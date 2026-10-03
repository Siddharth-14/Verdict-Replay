import type { Analysis } from "../metrics";
import { windowView } from "../policies/windowView";
import { MINUTES_PER_DAY as DAY, type Scenario } from "../sim/types";
import { fmtClock } from "./format";

/** Smallest freshness limit (hours, 6..72) at which a check has no stale days. */
function clearsAtHours(scenario: Scenario, checkId: string): number | null {
  for (let h = 6; h <= 72; h++) {
    const c = windowView(scenario, h * 60).find((x) => x.checkId === checkId);
    if (c && c.staleDays === 0) return h;
  }
  return null;
}

/** Short, data-driven "what to notice" lines for each scenario. All numbers are computed. */
export function insights(scenario: Scenario, a: Analysis): string[] {
  const out: string[] = [];

  if (scenario.id === "scenario-1") {
    const inStretch = a.timelineA.filter((s, i) => i > 0 && s.from >= 26 * DAY && s.from < 35 * DAY).length;
    const inStretchB = a.timelineB.filter((s, i) => i > 0 && s.from >= 26 * DAY && s.from < 35 * DAY).length;
    out.push(
      `Days 26 to 35: check A is failing, yet rule A changes status ${inStretch} times as G reports in. Rule B changes ${inStretchB} times.`,
    );
    out.push(
      `${a.orderA.tiedRuns} runs finish in the same minute as another. Reordering them gives rule A ${a.orderA.distinctOutcomes} different histories; rule B always gives ${a.orderB.distinctOutcomes}.`,
    );
    out.push("The amber stretch is a synthetic exception window: rule B counts the failure as accepted but still shows it.");
  } else if (scenario.id === "scenario-2") {
    const h = clearsAtHours(scenario, "V");
    out.push("The scan reads a 36-hour-old snapshot. The day-40 fix shows up on day 42; the day-60 break reads as pass until day 62.");
    out.push(
      h
        ? `Rule C marks every pass from V as stale at the default 24 h limit. Stale days reach 0 at ${h} h; drag the slider to watch it clear.`
        : "Rule C marks every pass from V as stale at the default 24 h limit.",
    );
    out.push("A fresh check (K) passes every day, so rule A keeps reading done while V is failing.");
  } else {
    const failed = a.orphans.filter((o) => o.flagged);
    out.push(
      `${a.orphans.length} run ids were handed back but never saved. ${failed.length} of them told the caller "fail".`,
    );
    if (failed.length > 0) {
      out.push(
        `The first unsaved failure is at ${fmtClock(failed[0].completedAt)}. Every rule reads the previous saved run instead, so it is invisible.`,
      );
    }
    out.push("Rules A, B and C see only saved runs. The API log is the only place these results exist.");
  }
  return out;
}
