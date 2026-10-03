import { describe, expect, it } from "vitest";
import { findOrderCounterexample, shuffleTies, tieGroups } from "../src/metrics";
import { lastWins } from "../src/policies/lastWins";
import { latestPerCheck } from "../src/policies/latestPerCheck";
import { windowView } from "../src/policies/windowView";
import { mulberry32 } from "../src/sim/prng";
import type { CheckRun, Result, Scenario, Task } from "../src/sim/types";
import s1 from "../fixtures/scenario-1.json";
import s2 from "../fixtures/scenario-2.json";
import s3 from "../fixtures/scenario-3.json";

const scenarios = [s1, s2, s3] as unknown as Scenario[];
const scenario1 = scenarios[0];

function run(checkId: string, completedAt: number, result: Result, extra: Partial<CheckRun> = {}): CheckRun {
  return {
    id: extra.id ?? `${checkId}-${completedAt}`,
    checkId,
    provider: "test",
    startedAt: completedAt - 1,
    completedAt,
    result,
    snapshotAsOf: completedAt - 1,
    persisted: true,
    ...extra,
  };
}

const task = (ids: string[], exceptions: Task["exceptions"] = []): Task => ({
  id: "t",
  requiredCheckIds: ids,
  exceptions,
});

describe("rule B: latestPerCheck", () => {
  it("gives identical output across 200 seeded permutations of simultaneous runs", () => {
    const groups = tieGroups(scenario1.runs);
    expect(groups.length).toBeGreaterThan(0);
    const times = scenario1.runs.map((r) => r.completedAt);
    const sampleTimes = [...new Set(times)].slice(0, 400);
    const baseline = sampleTimes.map((t) => latestPerCheck(scenario1.runs, scenario1.task, t));

    const rand = mulberry32(7);
    for (let k = 0; k < 200; k++) {
      const permuted = shuffleTies(scenario1.runs, groups, rand);
      const out = sampleTimes.map((t) => latestPerCheck(permuted, scenario1.task, t));
      expect(out).toEqual(baseline);
    }
  });

  it("is order-independent even for same-minute runs of one check", () => {
    const a = [run("X", 10, "pass", { id: "x1" }), run("X", 10, "fail", { id: "x2" })];
    const b = [a[1], a[0]];
    expect(latestPerCheck(a, task(["X"]), 10)).toBe(latestPerCheck(b, task(["X"]), 10));
  });

  it("any failed required check implies failed; all passing implies done; missing implies pending", () => {
    const rand = mulberry32(11);
    for (const s of scenarios) {
      const required = s.task.requiredCheckIds;
      const noExceptions = { ...s.task, exceptions: [] };
      for (let i = 0; i < 300; i++) {
        const t = Math.floor(rand() * s.windowEnd);
        const latest = required.map((id) => {
          const own = s.runs.filter((r) => r.persisted && r.checkId === id && r.completedAt <= t);
          return own.length ? own[own.length - 1] : undefined; // fixtures are time-ordered
        });
        const status = latestPerCheck(s.runs, noExceptions, t);
        if (latest.some((r) => r === undefined)) expect(status).toBe("pending");
        else if (latest.some((r) => r!.result !== "pass")) expect(status).toBe("failed");
        else expect(status).toBe("done");
      }
    }
  });

  it("handles the basic cases directly", () => {
    const t2 = task(["A", "B"]);
    expect(latestPerCheck([run("A", 5, "pass")], t2, 10)).toBe("pending");
    expect(latestPerCheck([run("A", 5, "pass"), run("B", 6, "pass")], t2, 10)).toBe("done");
    expect(latestPerCheck([run("A", 5, "pass"), run("B", 6, "fail")], t2, 10)).toBe("failed");
    expect(latestPerCheck([run("A", 5, "error"), run("B", 6, "pass")], t2, 10)).toBe("failed");
    expect(latestPerCheck([run("A", 5, "fail"), run("B", 6, "pass")], t2, 5)).toBe("pending");
  });

  it("ignores unpersisted runs", () => {
    const runs = [run("A", 5, "pass"), run("A", 8, "fail", { persisted: false })];
    expect(latestPerCheck(runs, task(["A"]), 10)).toBe("done");
  });

  it("an exception window turns a failure into excepted, but only inside the window", () => {
    const t = task(["A", "B"], [{ checkId: "A", from: 10, to: 20, reason: "test" }]);
    const runs = [run("A", 5, "fail"), run("B", 6, "pass")];
    expect(latestPerCheck(runs, t, 9)).toBe("failed");
    expect(latestPerCheck(runs, t, 10)).toBe("excepted");
    expect(latestPerCheck(runs, t, 19)).toBe("excepted");
    expect(latestPerCheck(runs, t, 20)).toBe("failed");
  });

  it("an exception does not hide a different check's failure", () => {
    const t = task(["A", "B"], [{ checkId: "A", from: 0, to: 100, reason: "test" }]);
    const runs = [run("A", 5, "fail"), run("B", 6, "fail")];
    expect(latestPerCheck(runs, t, 10)).toBe("failed");
  });
});

describe("rule A: lastWins", () => {
  it("returns pending before any run and follows the latest completion", () => {
    const t2 = task(["A", "B"]);
    expect(lastWins([], t2, 10)).toBe("pending");
    const runs = [run("A", 5, "fail"), run("B", 6, "pass")];
    expect(lastWins(runs, t2, 5)).toBe("failed");
    expect(lastWins(runs, t2, 6)).toBe("done");
  });

  it("breaks ties by input order", () => {
    const x = run("A", 5, "fail");
    const y = run("B", 5, "pass");
    const t2 = task(["A", "B"]);
    expect(lastWins([x, y], t2, 5)).toBe("done");
    expect(lastWins([y, x], t2, 5)).toBe("failed");
  });

  it("has an order-dependence counterexample in scenario 1 (and rule B has none)", () => {
    const counter = findOrderCounterexample(lastWins, scenario1);
    expect(counter).not.toBeNull();
    expect(counter!.statusIfListedFirst).not.toBe(counter!.statusIfListedLast);
    // Re-verify independently of the helper's bookkeeping.
    expect(lastWins(counter!.order1, scenario1.task, counter!.minute)).not.toBe(
      lastWins(counter!.order2, scenario1.task, counter!.minute),
    );
    expect(findOrderCounterexample(latestPerCheck, scenario1)).toBeNull();
  });
});

describe("rule C: windowView", () => {
  const limits = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72].map((h) => h * 60);

  it("keeps coverage between 0 and 1", () => {
    for (const s of scenarios) {
      for (const limit of limits) {
        for (const c of windowView(s, limit)) {
          expect(c.coverage).toBeGreaterThanOrEqual(0);
          expect(c.coverage).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("never increases staleDays when the freshness limit rises", () => {
    for (const s of scenarios) {
      let prev = windowView(s, limits[0]).map((c) => c.staleDays);
      for (const limit of limits.slice(1)) {
        const cur = windowView(s, limit).map((c) => c.staleDays);
        cur.forEach((d, i) => expect(d).toBeLessThanOrEqual(prev[i]));
        prev = cur;
      }
    }
  });

  it("never decreases coverage when the freshness limit rises", () => {
    for (const s of scenarios) {
      let prev = windowView(s, limits[0]).map((c) => c.coverage);
      for (const limit of limits.slice(1)) {
        const cur = windowView(s, limit).map((c) => c.coverage);
        cur.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(prev[i] - 1e-12));
        prev = cur;
      }
    }
  });

  it("labels checks descriptively", () => {
    const input = (runs: CheckRun[], windowEnd = 3000) => ({ runs, task: task(["A"]), windowStart: 0, windowEnd });
    const clean = windowView(input([run("A", 10, "pass", { snapshotAsOf: 9 })], 1000), 1440)[0];
    expect(clean.label).toBe("Clean");
    const failing = windowView(
      input([run("A", 10, "pass"), run("A", 500, "fail"), run("A", 900, "pass"), run("A", 1500, "fail")]),
      1440,
    )[0];
    expect(failing.exceptionEpisodes).toBe(2);
    expect(failing.label).toBe("Exceptions (2)");
    const stale = windowView(input([run("A", 10, "pass", { snapshotAsOf: -3000 })]), 1440)[0];
    expect(stale.label).toBe("Evidence gaps");
    expect(stale.staleDays).toBeGreaterThan(0);
  });

  it("scenario 2: 36h-old snapshots are stale at 24h and fresh at 72h", () => {
    const v24 = windowView(s2 as unknown as Scenario, 24 * 60).find((c) => c.checkId === "V")!;
    const v72 = windowView(s2 as unknown as Scenario, 72 * 60).find((c) => c.checkId === "V")!;
    expect(v24.staleDays).toBeGreaterThan(40);
    expect(v72.staleDays).toBe(0);
  });
});
