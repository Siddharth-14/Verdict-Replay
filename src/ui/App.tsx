import { useMemo, useState } from "react";
import { analyze, type Analysis } from "../metrics";
import { windowView } from "../policies/windowView";
import { serializeScenario } from "../sim/scenarios";
import type { Scenario } from "../sim/types";
import s1 from "../../fixtures/scenario-1.json";
import s2 from "../../fixtures/scenario-2.json";
import s3 from "../../fixtures/scenario-3.json";
import { Controls } from "./Controls";
import { insights } from "./insights";
import { MetricCards } from "./MetricCards";
import { OrphanTable } from "./OrphanTable";
import { Timeline } from "./Timeline";

const SCENARIOS = [s1, s2, s3] as unknown as Scenario[];
const cache = new Map<string, Analysis>();

function analysisFor(s: Scenario): Analysis {
  let a = cache.get(s.id);
  if (!a) {
    a = analyze(s);
    cache.set(s.id, a);
  }
  return a;
}

function download(scenario: Scenario) {
  const blob = new Blob([serializeScenario(scenario)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${scenario.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function App() {
  const [selectedId, setSelectedId] = useState(SCENARIOS[0].id);
  const [freshnessHours, setFreshnessHours] = useState(24);
  const scenario = SCENARIOS.find((s) => s.id === selectedId) ?? SCENARIOS[0];

  const analysis = useMemo(() => analysisFor(scenario), [scenario]);
  const view = useMemo(() => windowView(scenario, freshnessHours * 60), [scenario, freshnessHours]);
  const notes = useMemo(() => insights(scenario, analysis), [scenario, analysis]);

  return (
    <div className="page">
      <header className="masthead">
        <p className="eyebrow">SOC 2 observation window · 90 synthetic days</p>
        <h1>Verdict Replay</h1>
        <p className="lede">
          One compliance task, several checks. Watch three ways of deriving the task status disagree about the
          same evidence.
        </p>
        <ul className="chips">
          <li>Synthetic data</li>
          <li>No network calls</li>
          <li>No AI</li>
          <li>
            Models{" "}
            <a href="https://github.com/trycompai/comp/issues/3541" target="_blank" rel="noreferrer">
              a public GitHub issue
            </a>
          </li>
        </ul>
      </header>

      <Controls
        scenarios={SCENARIOS}
        selectedId={scenario.id}
        onSelect={setSelectedId}
        freshnessHours={freshnessHours}
        onFreshness={setFreshnessHours}
        onExport={() => download(scenario)}
      />

      <main id="scenario-panel" role="tabpanel" aria-labelledby={`tab-${scenario.id}`}>
        <section className="scenario" aria-labelledby="scenario-h">
          <h2 id="scenario-h">{scenario.title}</h2>
          <p className="blurb">{scenario.blurb}</p>
          <ul className="check-list" aria-label="Required checks">
            {scenario.task.requiredCheckIds.map((id) => {
              const c = scenario.checks.find((x) => x.id === id);
              return (
                <li key={id}>
                  <span className="check-id">{id}</span>
                  <span>
                    {c?.name ?? id}
                    <span className="muted"> · {c?.cadence}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <MetricCards analysis={analysis} view={view} freshnessHours={freshnessHours} notes={notes} />
        <Timeline
          scenario={scenario}
          timelineA={analysis.timelineA}
          timelineB={analysis.timelineB}
          view={view}
          tieMinutes={analysis.tieMinutes}
          orphans={analysis.orphans}
        />
        <OrphanTable orphans={analysis.orphans} />

        <div className="two-col">
          <section className="card" aria-labelledby="how-h">
            <h2 id="how-h">How to read this</h2>
            <ul>
              <li><strong>A, lastWins:</strong> the status is the result of the run that finished last, from any check. If two finish in the same minute, input order decides.</li>
              <li><strong>B, latestPerCheck:</strong> each required check contributes its latest saved run. Any failure means failed; an accepted exception shows as excepted.</li>
              <li><strong>C, windowView:</strong> no verdict. Per check: how much of the window had a fresh passing result, how many failing intervals, how many stale days.</li>
              <li><strong>False green</strong> is time when A says done and B says failed.</li>
              <li>Move the slider to change what &ldquo;fresh&rdquo; means for rule C only.</li>
            </ul>
          </section>
          <section className="card" aria-labelledby="not-h">
            <h2 id="not-h">What this does not do</h2>
            <ul>
              <li>It uses no real data. Every run, result and date is generated from a fixed seed.</li>
              <li>It makes no claim about how any production system behaves.</li>
              <li>It uses no AI and makes no network calls once the page has loaded.</li>
              <li>It gives no audit opinion. Rule C labels only describe the synthetic evidence.</li>
            </ul>
          </section>
        </div>
      </main>

      <footer>
        <p>Independent demo. Models behavior described in a public GitHub issue. Synthetic data.</p>
        <p>
          <a href="https://github.com/Siddharth-14/Verdict-Replay" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
