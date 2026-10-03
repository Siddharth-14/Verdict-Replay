import { describe, expect, it } from "vitest";
import {
  analyze,
  buildTimeline,
  falseGreenHours,
  flips,
  orphans,
  orderDependence,
  type StatusSegment,
} from "../src/metrics";
import { lastWins } from "../src/policies/lastWins";
import { latestPerCheck } from "../src/policies/latestPerCheck";
import type { CheckRun, Scenario } from "../src/sim/types";
import s1 from "../fixtures/scenario-1.json";
import s2 from "../fixtures/scenario-2.json";
import s3 from "../fixtures/scenario-3.json";

const [scenario1, scenario2, scenario3] = [s1, s2, s3] as unknown as Scenario[];

const seg = (from: number, to: number, status: StatusSegment["status"]): StatusSegment => ({ from, to, status });

describe("flips", () => {
  it("counts status changes and skips the first verdict after pending", () => {
    const line = [seg(0, 5, "pending"), seg(5, 10, "done"), seg(10, 20, "failed"), seg(20, 30, "done")];
    expect(flips(line)).toBe(2);
    expect(flips([])).toBe(0);
  });
});

describe("falseGreenHours", () => {
  it("sums minutes where A is done and B is failed", () => {
    const a = [seg(0, 120, "done"), seg(120, 240, "failed")];
    const b = [seg(0, 60, "done"), seg(60, 180, "failed"), seg(180, 240, "done")];
    expect(falseGreenHours(a, b)).toBe(1); // minutes 60..120
  });
});

describe("orphans", () => {
  it("lists log entries without a persisted run and flags logged failures", () => {
    const mk = (id: string, persisted: boolean): CheckRun => ({
      id, checkId: "A", provider: "p", startedAt: 0, completedAt: 1, result: "pass", snapshotAsOf: 0, persisted,
    });
    const out = orphans({
      runs: [mk("r1", true), mk("r2", false)],
      apiLog: [
        { checkRunId: "r1", completedAt: 1, result: "pass" },
        { checkRunId: "r2", completedAt: 2, result: "fail" },
        { checkRunId: "r3", completedAt: 3, result: "pass" },
      ],
    });
    expect(out.map((o) => o.checkRunId)).toEqual(["r2", "r3"]);
    expect(out.map((o) => o.flagged)).toEqual([true, false]);
  });
});

describe("scenario 1", () => {
  const a = analyze(scenario1);

  it("flips at least 20 times under rule A, more than rule B", () => {
    expect(a.flipsA).toBeGreaterThanOrEqual(20);
    expect(a.flipsB).toBeLessThan(a.flipsA);
  });

  it("has zero order-caused flips and one outcome for rule B, but order dependence for rule A", () => {
    expect(a.orderB.orderCausedFlips).toBe(0);
    expect(a.orderB.distinctOutcomes).toBe(1);
    expect(a.orderA.distinctOutcomes).toBeGreaterThan(1);
    expect(a.orderA.tiedMinutes).toBeGreaterThan(0);
  });

  it("order-dependence results are reproducible", () => {
    expect(orderDependence(lastWins, scenario1)).toEqual(a.orderA);
    expect(orderDependence(latestPerCheck, scenario1)).toEqual(a.orderB);
  });

  it("shows false-green time (A done while B failed)", () => {
    expect(a.falseGreenHours).toBeGreaterThan(0);
  });

  it("shows an excepted stretch under rule B only", () => {
    expect(a.timelineB.some((s) => s.status === "excepted")).toBe(true);
    expect(a.timelineA.some((s) => s.status === "excepted")).toBe(false);
  });

  it("timelines cover the whole window with no gaps", () => {
    for (const line of [a.timelineA, a.timelineB]) {
      expect(line[0].from).toBe(0);
      expect(line[line.length - 1].to).toBe(scenario1.windowEnd);
      for (let i = 1; i < line.length; i++) expect(line[i].from).toBe(line[i - 1].to);
    }
  });
});

describe("scenario 2", () => {
  it("rule A reports done for long stretches where rule B reports failed", () => {
    const a = analyze(scenario2);
    expect(a.falseGreenHours).toBeGreaterThan(100);
    expect(a.orphans).toHaveLength(0);
  });

  it("the delayed fix and delayed break show up on days 42 and 62 for the scanner alone", () => {
    const only = { ...scenario2, task: { ...scenario2.task, requiredCheckIds: ["V"] } };
    const line = buildTimeline(latestPerCheck, only);
    const changes = line.slice(1).map((s) => Math.floor(s.from / 1440));
    expect(changes).toContain(27); // first stale-lag fail report
    expect(changes).toContain(42); // fix landed day 40, reported day 42
    expect(changes).toContain(62); // break landed day 60, reported day 62
  });
});

describe("scenario 3", () => {
  it("has orphans, including some where the caller was told fail", () => {
    const list = analyze(scenario3).orphans;
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((o) => o.flagged)).toBe(true);
    for (const o of list) {
      expect(scenario3.runs.find((r) => r.id === o.checkRunId)?.persisted).toBe(false);
    }
  });
});
