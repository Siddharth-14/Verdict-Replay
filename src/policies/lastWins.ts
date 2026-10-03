import type { CheckRun, Status, Task } from "../sim/types";

/**
 * Rule A, lastWins: the status is the result of whichever persisted run of any
 * required check completed most recently. Ties on completedAt go to the run that
 * appears later in the input, which is exactly what makes this rule order-dependent.
 */
export function lastWins(runs: readonly CheckRun[], task: Task, t: number): Status {
  const required = new Set(task.requiredCheckIds);
  let winner: CheckRun | undefined;
  for (const run of runs) {
    if (!run.persisted || !required.has(run.checkId) || run.completedAt > t) continue;
    if (!winner || run.completedAt >= winner.completedAt) winner = run;
  }
  if (!winner) return "pending";
  return winner.result === "pass" ? "done" : "failed";
}
