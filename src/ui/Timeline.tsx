import { useLayoutEffect, useRef, useState } from "react";
import type { StatusSegment } from "../metrics";
import type { CheckWindow, EvidenceState } from "../policies/windowView";
import { MINUTES_PER_DAY, WINDOW_DAYS, type Scenario, type Status } from "../sim/types";
import { fmtDay } from "./format";

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
const EVIDENCE_FILL: Record<EvidenceState, string> = {
  fresh: "var(--done)",
  stale: "url(#hatch)",
  fail: "var(--failed)",
  pending: "var(--pending)",
};

const STRIP_H = 28;
const AXIS_H = 26;
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

interface StripSeg {
  from: number;
  to: number;
  fill: string;
  label: string;
  text: string;
}

function Strip({ segs, width, labelId, windowEnd }: { segs: StripSeg[]; width: number; labelId: string; windowEnd: number }) {
  const inner = width - PAD_X * 2;
  const x = (m: number) => PAD_X + (m / windowEnd) * inner;
  return (
    <svg width={width} height={STRIP_H} role="img" aria-labelledby={labelId} className="strip">
      <HatchDefs />
      {segs.map((s) => {
        const w = Math.max(0.5, x(s.to) - x(s.from));
        return (
          <g key={s.from}>
            <rect x={x(s.from)} y={0} width={w} height={STRIP_H} fill={s.fill}>
              <title>{`${s.label}: ${fmtDay(s.from)} to ${fmtDay(s.to)}`}</title>
            </rect>
            {w >= s.text.length * 7.5 + 10 && (
              <text x={x(s.from) + w / 2} y={STRIP_H / 2 + 4} textAnchor="middle" className="strip-text">
                {s.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function HatchDefs() {
  return (
    <defs>
      <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--done-soft)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--done)" strokeWidth="2.5" />
      </pattern>
    </defs>
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

function statusSegs(segments: StatusSegment[]): StripSeg[] {
  return segments.map((s) => ({
    from: s.from,
    to: s.to,
    fill: `var(--${s.status})`,
    label: STATUS_LABEL[s.status],
    text: STATUS_LABEL[s.status],
  }));
}

interface Props {
  scenario: Scenario;
  timelineA: StatusSegment[];
  timelineB: StatusSegment[];
  view: CheckWindow[];
}

export function Timeline({ scenario, timelineA, timelineB, view }: Props) {
  const [ref, width] = useWidth();
  const end = scenario.windowEnd;
  const checkName = (id: string) => scenario.checks.find((c) => c.id === id)?.name ?? id;
  const statusLines = (segs: StatusSegment[]) =>
    segs.map((s) => `${fmtDay(s.from)} to ${fmtDay(s.to)}: ${STATUS_LABEL[s.status]}`);

  return (
    <section aria-labelledby="timelines-h" className="card">
      <h2 id="timelines-h">Status over 90 days</h2>
      <div ref={ref} className="timelines">
        <div className="tl-block">
          <h3 id="tl-a">
            <span className="rule-tag">A</span> lastWins
          </h3>
          <p className="tl-desc">Status is whatever finished last. Ties go to input order.</p>
          <Strip segs={statusSegs(timelineA)} width={width} labelId="tl-a" windowEnd={end} />
          <TextVersion title="rule A" lines={statusLines(timelineA)} />
        </div>

        <div className="tl-block">
          <h3 id="tl-b">
            <span className="rule-tag">B</span> latestPerCheck
          </h3>
          <p className="tl-desc">Every required check must have a passing latest run. Order never matters.</p>
          <Strip segs={statusSegs(timelineB)} width={width} labelId="tl-b" windowEnd={end} />
          <TextVersion title="rule B" lines={statusLines(timelineB)} />
        </div>

        <div className="tl-block">
          <h3 id="tl-c">
            <span className="rule-tag">C</span> windowView
          </h3>
          <p className="tl-desc">
            One row per check. No single verdict. Hatched means the last pass is older than the freshness limit.
          </p>
          {view.map((c) => {
            const id = `tl-c-${c.checkId}`;
            const segs: StripSeg[] = c.segments.map((s) => ({
              from: s.from,
              to: s.to,
              fill: EVIDENCE_FILL[s.state],
              label: EVIDENCE_LABEL[s.state],
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
                <Strip segs={segs} width={width} labelId={id} windowEnd={end} />
                <TextVersion
                  title={`check ${c.checkId}`}
                  lines={c.segments.map((s) => `${fmtDay(s.from)} to ${fmtDay(s.to)}: ${EVIDENCE_LABEL[s.state]}`)}
                />
              </div>
            );
          })}
          <p className="note">
            Labels are descriptive summaries of the synthetic evidence. They are not an audit opinion.
          </p>
        </div>

        <Axis width={width} windowEnd={end} />
        <p className="axis-caption">Days from start of the observation window (shared by all timelines)</p>
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
