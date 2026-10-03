import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Orphan, StatusSegment } from "../metrics";
import type { CheckWindow, EvidenceState } from "../policies/windowView";
import { MINUTES_PER_DAY, WINDOW_DAYS, type Scenario, type Status } from "../sim/types";
import { fmtClock, fmtDay } from "./format";

const STATUS_LABEL: Record<Status, string> = {
  done: "done",
  failed: "failed",
  pending: "pending",
  excepted: "excepted",
};
const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  fresh: "fresh pass",
  stale: "stale pass",
  fail: "failed",
  pending: "pending",
};
/** Maps both vocabularies onto the shared color tokens. */
const EVIDENCE_TOKEN: Record<EvidenceState, string> = {
  fresh: "done",
  stale: "stale",
  fail: "failed",
  pending: "pending",
};

const STRIP_H = 34;
const AXIS_H = 26;
const MARK_H = 16;
const PAD_X = 8;
const TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function segmentAt<T extends { from: number; to: number }>(segs: readonly T[], minute: number): T | undefined {
  return segs.find((s) => minute >= s.from && minute < s.to);
}

interface StripSeg {
  from: number;
  to: number;
  /** Token name: done | failed | pending | excepted | stale */
  token: string;
  text: string;
}

interface StripProps {
  segs: StripSeg[];
  width: number;
  labelId: string;
  windowEnd: number;
  cursorX: number | null;
}

function Strip({ segs, width, labelId, windowEnd, cursorX }: StripProps) {
  const uid = useId().replace(/:/g, "");
  const inner = width - PAD_X * 2;
  const x = (m: number) => PAD_X + (m / windowEnd) * inner;
  return (
    <svg width={width} height={STRIP_H} role="img" aria-labelledby={labelId} className="strip">
      <defs>
        <clipPath id={`clip-${uid}`}>
          <rect x={PAD_X} y={0} width={inner} height={STRIP_H} rx={6} />
        </clipPath>
        <pattern id={`hatch-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="var(--stale-bg)" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--stale-ink)" strokeWidth="2.5" />
        </pattern>
      </defs>
      <g clipPath={`url(#clip-${uid})`}>
        {segs.map((s) => {
          const w = Math.max(0.5, x(s.to) - x(s.from));
          const fill = s.token === "stale" ? `url(#hatch-${uid})` : `var(--${s.token})`;
          return (
            <g key={s.from}>
              <rect x={x(s.from)} y={0} width={w} height={STRIP_H} fill={fill} className="seg" />
              {w >= s.text.length * 7.5 + 12 && (
                <text
                  x={x(s.from) + w / 2}
                  y={STRIP_H / 2 + 4}
                  textAnchor="middle"
                  className={`strip-text on-${s.token}`}
                >
                  {s.text}
                </text>
              )}
            </g>
          );
        })}
      </g>
      {cursorX !== null && <line x1={cursorX} x2={cursorX} y1={0} y2={STRIP_H} className="cursor" />}
    </svg>
  );
}

function MarkRow({
  width,
  windowEnd,
  marks,
  cursorX,
}: {
  width: number;
  windowEnd: number;
  marks: { at: number; hot: boolean; label: string }[];
  cursorX: number | null;
}) {
  const inner = width - PAD_X * 2;
  const x = (m: number) => PAD_X + (m / windowEnd) * inner;
  return (
    <svg width={width} height={MARK_H} aria-hidden="true" className="markrow">
      {marks.map((m, i) => (
        <path
          key={i}
          d={`M ${x(m.at)} 2 l 5 6 l -5 6 l -5 -6 z`}
          className={m.hot ? "mark mark-hot" : "mark"}
        >
          <title>{m.label}</title>
        </path>
      ))}
      {cursorX !== null && <line x1={cursorX} x2={cursorX} y1={0} y2={MARK_H} className="cursor" />}
    </svg>
  );
}

function Axis({ width, windowEnd }: { width: number; windowEnd: number }) {
  const inner = width - PAD_X * 2;
  return (
    <svg width={width} height={AXIS_H} aria-hidden="true" className="axis">
      {TICKS.map((d) => {
        const px = PAD_X + ((d * MINUTES_PER_DAY) / windowEnd) * inner;
        const anchor = d === 0 ? "start" : d === WINDOW_DAYS ? "end" : "middle";
        return (
          <g key={d}>
            <line x1={px} x2={px} y1={0} y2={5} className="tick" />
            <text x={px} y={19} textAnchor={anchor} className="axis-text">
              {d}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TextVersion({ title, lines }: { title: string; lines: string[] }) {
  return (
    <details className="text-version">
      <summary>Text version: {title}</summary>
      <ol>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    </details>
  );
}

function RuleHead({ id, tag, name, desc }: { id: string; tag: string; name: string; desc: string }) {
  return (
    <div className="rule-head">
      <h3 id={id}>
        <span className="rule-tag">{tag}</span> {name}
      </h3>
      <p className="tl-desc">{desc}</p>
    </div>
  );
}

function statusSegs(segments: StatusSegment[]): StripSeg[] {
  return segments.map((s) => ({ from: s.from, to: s.to, token: s.status, text: STATUS_LABEL[s.status] }));
}

interface Props {
  scenario: Scenario;
  timelineA: StatusSegment[];
  timelineB: StatusSegment[];
  view: CheckWindow[];
  tieMinutes: number[];
  orphans: Orphan[];
}

export function Timeline({ scenario, timelineA, timelineB, view, tieMinutes, orphans }: Props) {
  const [ref, width] = useWidth();
  const [cursor, setCursor] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const end = scenario.windowEnd;
  const inner = width - PAD_X * 2;
  const cursorX = cursor === null ? null : PAD_X + (cursor / end) * inner;
  const checkName = (id: string) => scenario.checks.find((c) => c.id === id)?.name ?? id;
  const statusLines = (segs: StatusSegment[]) =>
    segs.map((s) => `${fmtDay(s.from)} to ${fmtDay(s.to)}: ${STATUS_LABEL[s.status]}`);

  const minuteFromX = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left - PAD_X) / (rect.width - PAD_X * 2);
    return Math.min(end - 1, Math.max(0, Math.round(frac * end)));
  };

  const readoutParts = (m: number) => {
    const a = segmentAt(timelineA, m)?.status ?? "pending";
    const b = segmentAt(timelineB, m)?.status ?? "pending";
    const cs = view.map((c) => ({
      id: c.checkId,
      state: segmentAt(c.segments, m)?.state ?? ("pending" as EvidenceState),
    }));
    return { a, b, cs };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => setCursor(minuteFromX(e.clientX, e.currentTarget));
  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") setCursor(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 * MINUTES_PER_DAY : MINUTES_PER_DAY;
    let next: number;
    const cur = cursor ?? 0;
    if (e.key === "ArrowRight") next = cur + step;
    else if (e.key === "ArrowLeft") next = cur - step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = end - 1;
    else if (e.key === "Escape") {
      setCursor(null);
      return;
    } else return;
    e.preventDefault();
    next = Math.min(end - 1, Math.max(0, next));
    setCursor(next);
    const p = readoutParts(next);
    setAnnounce(
      `${fmtClock(next)}. Rule A ${p.a}. Rule B ${p.b}. ${p.cs.map((c) => `${c.id} ${EVIDENCE_LABEL[c.state]}`).join(". ")}.`,
    );
  };

  const parts = cursor === null ? null : readoutParts(cursor);

  const tieMarks = tieMinutes.map((at) => ({ at, hot: true, label: `Same-minute completions at ${fmtClock(at)}` }));
  const orphanMarks = orphans.map((o) => ({
    at: o.completedAt,
    hot: o.flagged,
    label: `${o.checkRunId}: told "${o.result}", never saved (${fmtClock(o.completedAt)})`,
  }));

  return (
    <section aria-labelledby="timelines-h" className="card">
      <div className="card-head">
        <h2 id="timelines-h">Status over 90 days</h2>
        <p className="hint">Hover, tap or use ← → on the chart to read the same moment in every rule.</p>
      </div>

      <div className={`readout${parts ? "" : " idle"}`} aria-hidden="true">
        {parts ? (
          <>
            <span className="readout-time">{fmtClock(cursor!)}</span>
            <span className="readout-item"><span className="key" style={{ background: `var(--${parts.a})` }} /> <span className="rk">A</span> <strong>{STATUS_LABEL[parts.a]}</strong></span>
            <span className="readout-item"><span className="key" style={{ background: `var(--${parts.b})` }} /> <span className="rk">B</span> <strong>{STATUS_LABEL[parts.b]}</strong></span>
            {parts.cs.map((c) => (
              <span key={c.id} className="readout-item">
                <span className={`key ${c.state === "stale" ? "key-hatch" : ""}`} style={c.state === "stale" ? undefined : { background: `var(--${EVIDENCE_TOKEN[c.state]})` }} />{" "}
                <span className="rk">C·{c.id}</span> <strong>{EVIDENCE_LABEL[c.state]}</strong>
              </span>
            ))}
          </>
        ) : (
          <span>Nothing selected. Point at the timelines to compare A, B and C at one moment.</span>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <div
        ref={ref}
        className="timelines"
        tabIndex={0}
        role="group"
        aria-label="Timelines for rules A, B and C. Use left and right arrow keys to move through the window; hold shift for 10-day steps."
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        onBlur={() => setAnnounce("")}
      >
        <div className="tl-block">
          <RuleHead id="tl-a" tag="A" name="lastWins" desc="Status is whatever finished last. Ties go to input order." />
          <Strip segs={statusSegs(timelineA)} width={width} labelId="tl-a" windowEnd={end} cursorX={cursorX} />
          {tieMinutes.length > 0 && (
            <>
              <MarkRow width={width} windowEnd={end} marks={tieMarks} cursorX={cursorX} />
              <p className="mark-caption"><span className="glyph mark-hot-glyph" /> Same-minute completions: the order-dependent moments</p>
            </>
          )}
          <TextVersion title="rule A" lines={statusLines(timelineA)} />
        </div>

        <div className="tl-block">
          <RuleHead id="tl-b" tag="B" name="latestPerCheck" desc="Every required check needs a passing latest run. Input order never matters." />
          <Strip segs={statusSegs(timelineB)} width={width} labelId="tl-b" windowEnd={end} cursorX={cursorX} />
          <TextVersion title="rule B" lines={statusLines(timelineB)} />
        </div>

        <div className="tl-block">
          <RuleHead
            id="tl-c"
            tag="C"
            name="windowView"
            desc="One row per check, no single verdict. Hatched means the last pass is older than the freshness limit."
          />
          {view.map((c) => {
            const id = `tl-c-${c.checkId}`;
            const segs: StripSeg[] = c.segments.map((s) => ({
              from: s.from,
              to: s.to,
              token: EVIDENCE_TOKEN[s.state],
              text: EVIDENCE_LABEL[s.state],
            }));
            return (
              <div key={c.checkId} className="c-row">
                <p id={id} className="c-head">
                  <strong>
                    {c.checkId} · {checkName(c.checkId)}
                  </strong>
                  <span className="pill">{c.label}</span>
                  <span className="c-stats">
                    coverage {(c.coverage * 100).toFixed(0)}% · stale days {c.staleDays} · fail intervals{" "}
                    {c.exceptionEpisodes}
                  </span>
                </p>
                <Strip segs={segs} width={width} labelId={id} windowEnd={end} cursorX={cursorX} />
                <TextVersion
                  title={`check ${c.checkId}`}
                  lines={c.segments.map((s) => `${fmtDay(s.from)} to ${fmtDay(s.to)}: ${EVIDENCE_LABEL[s.state]}`)}
                />
              </div>
            );
          })}
          {orphans.length > 0 && (
            <div className="c-row">
              <p className="c-head"><strong>Orphan runs</strong><span className="c-stats">logged to the caller, never saved</span></p>
              <MarkRow width={width} windowEnd={end} marks={orphanMarks} cursorX={cursorX} />
              <p className="mark-caption"><span className="glyph mark-hot-glyph" /> told &ldquo;fail&rdquo; <span className="glyph mark-glyph" /> told &ldquo;pass&rdquo;</p>
            </div>
          )}
          <p className="note">Labels are descriptive summaries of the synthetic evidence. They are not an audit opinion.</p>
        </div>

        <Axis width={width} windowEnd={end} />
        <p className="axis-caption">Days from start of the observation window (shared by every timeline)</p>
      </div>

      <ul className="legend" aria-label="Legend">
        <li><span className="sw" style={{ background: "var(--done)" }} /> done / fresh pass</li>
        <li><span className="sw" style={{ background: "var(--failed)" }} /> failed</li>
        <li><span className="sw" style={{ background: "var(--pending)" }} /> pending (no run yet)</li>
        <li><span className="sw" style={{ background: "var(--excepted)" }} /> excepted (accepted failure)</li>
        <li><span className="sw hatch" /> stale pass (rule C)</li>
      </ul>
    </section>
  );
}
