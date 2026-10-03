import type { Analysis } from "../metrics";
import type { CheckWindow } from "../policies/windowView";

interface CardProps {
  title: string;
  value: string;
  detail: string;
}

function Card({ title, value, detail }: CardProps) {
  return (
    <div className="metric">
      <dt>{title}</dt>
      <dd className="metric-value">{value}</dd>
      <dd className="metric-detail">{detail}</dd>
    </div>
  );
}

export function MetricCards({ analysis, view, freshnessHours }: { analysis: Analysis; view: CheckWindow[]; freshnessHours: number }) {
  const { orderA, orderB } = analysis;
  const stale = view.reduce((n, c) => n + c.staleDays, 0);
  const failOrphans = analysis.orphans.filter((o) => o.flagged).length;
  const noTies = orderA.tiedMinutes === 0;

  return (
    <section aria-labelledby="metrics-h">
      <h2 id="metrics-h" className="sr-only">Metrics</h2>
      <dl className="metrics">
        <Card
          title="Status flips (A vs B)"
          value={`${analysis.flipsA} vs ${analysis.flipsB}`}
          detail="Changes of status over 90 days. The first verdict after pending is not counted."
        />
        <Card
          title="False-green hours"
          value={analysis.falseGreenHours.toFixed(0)}
          detail="Hours where rule A said done while rule B said failed."
        />
        <Card
          title="Order dependence (A vs B)"
          value={noTies ? "none" : `${orderA.distinctOutcomes} vs ${orderB.distinctOutcomes}`}
          detail={
            noTies
              ? "No runs complete in the same minute in this scenario."
              : `Distinct outcomes across ${orderA.shuffles} shuffles of ${orderA.tiedRuns} same-minute runs (${orderA.tiedMinutes} minutes).`
          }
        />
        <Card
          title={`Stale days at ${freshnessHours} h`}
          value={String(stale)}
          detail={view.map((c) => `${c.checkId}: ${c.staleDays}`).join(" · ")}
        />
        <Card
          title="Orphan runs"
          value={String(analysis.orphans.length)}
          detail={
            analysis.orphans.length === 0
              ? "Every logged run id has a saved run."
              : `${failOrphans} logged as fail, never saved.`
          }
        />
      </dl>
    </section>
  );
}
