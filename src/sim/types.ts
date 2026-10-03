export const MINUTES_PER_DAY = 1440;
export const WINDOW_DAYS = 90;
export const WINDOW_MINUTES = WINDOW_DAYS * MINUTES_PER_DAY; // 129,600

export type Result = "pass" | "fail" | "error";
export type Status = "pending" | "done" | "failed" | "excepted";

/** All timestamps are integer minutes from windowStart. */
export interface CheckRun {
  id: string;
  checkId: string;
  provider: string;
  startedAt: number;
  completedAt: number;
  result: Result;
  /** Timestamp of the provider data the check evaluated. */
  snapshotAsOf: number;
  /** False when the caller was told a run id but the run was never saved. */
  persisted: boolean;
}

export interface Check {
  id: string;
  name: string;
  provider: string;
  cadence: string;
}

export interface Exception {
  checkId: string;
  from: number;
  to: number;
  reason: string;
}

export interface Task {
  id: string;
  requiredCheckIds: string[];
  exceptions: Exception[];
}

/** What a caller was told. Used only for orphan reconciliation. */
export interface ApiLogEntry {
  checkRunId: string;
  completedAt: number;
  result: Result;
}

export interface Scenario {
  id: string;
  title: string;
  blurb: string;
  windowStart: number;
  windowEnd: number;
  /** Display metadata for the checks (names, providers). */
  checks: Check[];
  task: Task;
  /** Includes runs with persisted=false; policies filter them out. */
  runs: CheckRun[];
  apiLog: ApiLogEntry[];
}
