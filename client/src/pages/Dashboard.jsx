import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

function StatusBadge({ value }) {
  if (value === true) return <span className="badge ok">Verified</span>;
  if (value === false) return <span className="badge fail">Failed</span>;
  return <span className="badge">Sealed</span>;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .dashboard()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const system = data?.systems?.[0];

  return (
    <div>
      <div className="page-title">
        <div className="kicker">Evidence layer for AI configuration</div>
        <h2>Don’t just log your AI changes. Prove them.</h2>
        <p>
          ProofAI is a cryptographically verifiable evidence layer for important AI
          configuration changes. It helps organizations build stronger traceability
          and audit evidence for regulated or high-risk AI systems.
        </p>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {!data && !error ? <p className="empty">Loading dashboard…</p> : null}

      {data ? (
        <>
          <div className="grid grid-2">
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div className="field-label">Current AI system</div>
                  <h3 style={{ margin: "4px 0 16px", fontSize: 22 }}>{system?.name}</h3>
                </div>
                <span className="badge accent">Live config</span>
              </div>
              <div className="grid grid-3">
                <div>
                  <div className="field-label">Model</div>
                  <div className="field-value">{system?.config.model}</div>
                </div>
                <div>
                  <div className="field-label">Prompt</div>
                  <div className="field-value">{system?.config.promptVersion}</div>
                </div>
                <div>
                  <div className="field-label">Policy</div>
                  <div className="field-value">{system?.config.policy}</div>
                </div>
              </div>
              <div className="actions">
                <Link className="btn btn-primary" to="/change">
                  Create change
                </Link>
                <Link className="btn btn-secondary" to="/history">
                  View audit history
                </Link>
              </div>
            </section>

            <section className="card">
              <div className="field-label">Demo sequence</div>
              <ol style={{ margin: "14px 0 0", paddingLeft: 18, color: "var(--muted)" }}>
                <li>Seal Model-A → Model-B with CooL</li>
                <li>Verify the original receipt</li>
                <li>Tamper with a copy only</li>
                <li>Verify the copy — should fail</li>
                <li>Confirm the original still verifies</li>
              </ol>
              <p className="footnote">
                {data.evidenceCount} sealed record{data.evidenceCount === 1 ? "" : "s"} in
                the local evidence store. CooL is running in{" "}
                <strong>{data.coolMode}</strong> mode.
              </p>
            </section>
          </div>

          <section style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: 16, marginBottom: 10 }}>Recent evidence</h3>
            {data.recent.length === 0 ? (
              <div className="card empty">
                No sealed changes yet. Create the first configuration change to generate a
                CooL receipt.
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>AI system</th>
                      <th>Change</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((row) => (
                      <tr key={row.displayId}>
                        <td className="mono">{row.displayId}</td>
                        <td>{row.aiSystemName}</td>
                        <td>{row.changeSummary}</td>
                        <td>
                          <StatusBadge value={row.lastVerifyOk} />
                        </td>
                        <td>
                          <Link to={`/evidence/${row.displayId}`}>Open</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
