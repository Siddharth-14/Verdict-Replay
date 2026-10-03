import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_FILES, buildScenarios, serializeScenario } from "../src/sim/scenarios";
import { WINDOW_MINUTES, type Scenario } from "../src/sim/types";

const read = (name: string) => readFileSync(join(__dirname, "..", "fixtures", name), "utf8");

describe("committed fixtures", () => {
  const regenerated = buildScenarios();

  it.each(FIXTURE_FILES.map((f, i) => [f, i] as const))(
    "%s matches regenerated output byte for byte",
    (file, i) => {
      expect(serializeScenario(regenerated[i])).toBe(read(file));
    },
  );

  it("generation is deterministic across calls", () => {
    expect(buildScenarios().map(serializeScenario)).toEqual(regenerated.map(serializeScenario));
  });

  describe.each(FIXTURE_FILES.map((f) => [f, JSON.parse(read(f)) as Scenario] as const))("%s", (_f, s) => {
    it("has a 90-day window and unique, time-ordered runs inside it", () => {
      expect(s.windowStart).toBe(0);
      expect(s.windowEnd).toBe(WINDOW_MINUTES);
      expect(new Set(s.runs.map((r) => r.id)).size).toBe(s.runs.length);
      for (let i = 1; i < s.runs.length; i++) {
        expect(s.runs[i].completedAt).toBeGreaterThanOrEqual(s.runs[i - 1].completedAt);
      }
      for (const r of s.runs) {
        expect(r.completedAt).toBeGreaterThanOrEqual(0);
        expect(r.completedAt).toBeLessThan(WINDOW_MINUTES);
        expect(r.startedAt).toBeLessThanOrEqual(r.completedAt);
        expect(Number.isInteger(r.completedAt)).toBe(true);
      }
    });

    it("logs every run in the API log", () => {
      expect(s.apiLog.map((e) => e.checkRunId)).toEqual(s.runs.map((r) => r.id));
    });
  });

  it("scenario 3 drops roughly 6% of runs and the rest are persisted", () => {
    const s = regenerated[2];
    const dropped = s.runs.filter((r) => !r.persisted).length / s.runs.length;
    expect(dropped).toBeGreaterThan(0.03);
    expect(dropped).toBeLessThan(0.09);
    for (const i of [0, 1]) expect(regenerated[i].runs.every((r) => r.persisted)).toBe(true);
  });

  it("scenario 2 snapshots lag completion by 36 hours", () => {
    for (const r of regenerated[1].runs.filter((x) => x.checkId === "V")) {
      expect(r.completedAt - r.snapshotAsOf).toBe(36 * 60);
    }
  });
});
