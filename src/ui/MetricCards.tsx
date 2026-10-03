import type { Analysis } from "../metrics";
import type { CheckWindow } from "../policies/windowView";
import { WINDOW_DAYS } from "../sim/types";

const WINDOW_HOURS = WINDOW_DAYS * 24;

function Tag({ letter }: { letter: string }) {
  return <span className="rule-tag" aria-label={`Rule ${letter}`}>{letter}</span>;
}

function Pair({ a, b, unit }: { a: string | number; b: string | number; unit?: string }) {
  return (
    <div className="pair">
      <div className="pair-cell">
        <Tag letter="A" />
        <span className="tile-value">{a}</span>
      </div>
      <div className="pair-cell">
        <Tag letter="B" />
        <span className="tile-value">{b}</span>
      </div>
      {unit && <span className="pair-unit">{unit}</span>}
    </div>
  );
}

interface Props {
  analysis: Analysis;
  view: CheckWindow[];
  freshnessHours: number;
  notes: string[];
}

export function MetricCards({ analysis, view, freshnessHours, notes }: Props) {
  const { orderA, orderB } = analysis;
  const stale = view.reduce((n, c) => n + c.staleDays, 0);
  const failOrphans = analysis.orphans.filter((o) => o.flagged).length;
  const noTies = orderA.tiedMinutes === 0;
  const hours = Math.round(analysis.falseGreenHours);
  const pct = (analysis.falseGreenHours / WINDOW_HOURS) * 100;

  return (
    <section aria-labelledby="metrics-h" className="summary">
      <h2 id="metrics-h" className="sr-only">Summary</h2>

      <div className="hero card">
        <p className="eyebrow">False-green time</p>
        <p className="hero-num" aria-label={`${hours} hours`}>
          {hours}
          <span className="hero-unit"> h</span>
        </p>
        <p className="hero-sub">
          {hours === 0
            ? "No time where rule A said done while rule B said failed."
            : `${pct.toFixed(0)}% of the window: rule A said done while rule B said failed.`}
        </p>
        <ul className="notice">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      <dl className="tiles">
        <div className="tile">
          <dt>Status flips</dt>
          <dd>
            <Pair a={analysis.flipsA} b={analysis.flipsB} />
            <p className="tile-detail">Changes of status in 90 days. The first verdict after pending is not counted.</p>
          </dd>
        </div>

        <div className="tile">
          <dt>Order dependence</dt>
          <dd>
            {noTies ? (
              <>
                <p className="tile-value">None</p>
                <p className="tile-detail">No runs finish in the same minute here.</p>
              </>
            ) : (
              <>
                <Pair a={orderA.distinctOutcomes} b={orderB.distinctOutcomes} />
                <p className="tile-detail">
                  Distinct outcomes over {orderA.shuffles} shuffles of {orderA.tiedRuns} same-minute runs.
                </p>
              </>
            )}
          </dd>
        </div>

        <div className="tile">
          <dt>Stale days at {freshnessHours} h</dt>
          <dd>
            <p className="tile-value">{stale}</p>
            <p className="tile-detail">
              {view.map((c) => `${c.checkId}: ${c.staleDays}`).join(" · ")} (rule C)
            </p>
          </dd>
        </div>

        <div className="tile">
          <dt>Orphan runs</dt>
          <dd>
            <p className="tile-value">{analysis.orphans.length}</p>
            <p className="tile-detail">
              {analysis.orphans.length === 0
                ? "Every logged run id has a saved run."
                : `${failOrphans} logged as fail, never saved.`}
            </p>
          </dd>
        </div>
      </dl>
    </section>
  );
}
