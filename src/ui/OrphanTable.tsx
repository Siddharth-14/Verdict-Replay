import type { Orphan } from "../metrics";
import { fmtClock } from "./format";

export function OrphanTable({ orphans }: { orphans: Orphan[] }) {
  return (
    <section aria-labelledby="orphans-h" className="card">
      <h2 id="orphans-h">Orphans: run ids returned, runs not saved</h2>
      {orphans.length === 0 ? (
        <p>None in this scenario. Every id in the API log has a persisted run.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">API log entries with no persisted run</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Run id</th>
                <th scope="col">Told to caller</th>
                <th scope="col">Flag</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map((o) => (
                <tr key={o.checkRunId} className={o.flagged ? "flagged" : undefined}>
                  <td>{fmtClock(o.completedAt)}</td>
                  <td><code>{o.checkRunId}</code></td>
                  <td>{o.result}</td>
                  <td>{o.flagged ? "FAIL never saved: no rule can see it" : "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
