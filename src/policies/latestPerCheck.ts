import type { CheckRun, Status, Task } from "../sim/types";

/** Latest persisted run of one check at time t. Ties break on (completedAt, id). */
export function latestRun(
  runs: readonly CheckRun[],
  checkId: string,
  t: number,
): CheckRun | undefined {
  let best: CheckRun | undefined;
  for (const run of runs) {
    if (!run.persisted || run.checkId !== checkId || run.completedAt > t) continue;
    if (
      !best ||
      run.completedAt > best.completedAt ||
      (run.completedAt === best.completedAt && run.id > best.id)
    ) {
      best = run;
    }
  }
  return best;
}

/**
 * Rule B, latestPerCheck: look at each required check's latest persisted run.
 * Any check without a run -> pending. Any unexcused fail/error -> failed.
 * A failure inside an exception window counts as passing but is reported as
 * "excepted" (only when nothing else failed). Otherwise done.
 * The output never depends on input order.
 */
export function latestPerCheck(runs: readonly CheckRun[], task: Task, t: number): Status {
  let anyExcepted = false;
  let anyFailed = false;
  for (const checkId of task.requiredCheckIds) {
    const run = latestRun(runs, checkId, t);
    if (!run) return "pending";
    if (run.result === "pass") continue;
    const excused = task.exceptions.some(
      (e) => e.checkId === checkId && e.from <= t && t < e.to,
    );
    if (excused) anyExcepted = true;
    else anyFailed = true;
  }
  if (anyFailed) return "failed";
  return anyExcepted ? "excepted" : "done";
}
