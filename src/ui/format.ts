import { MINUTES_PER_DAY } from "../sim/types";

export const dayOf = (minute: number): number => minute / MINUTES_PER_DAY;

/** "day 30.25" style label for a minute offset. */
export function fmtDay(minute: number): string {
  return `day ${dayOf(minute).toFixed(2)}`;
}

/** "day 30 06:12" style label (whole day plus clock time). */
export function fmtClock(minute: number): string {
  const day = Math.floor(minute / MINUTES_PER_DAY);
  const rem = minute - day * MINUTES_PER_DAY;
  const hh = String(Math.floor(rem / 60)).padStart(2, "0");
  const mm = String(rem % 60).padStart(2, "0");
  return `day ${day} ${hh}:${mm}`;
}
