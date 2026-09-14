import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

function StatusBadge({ value }) {
  if (value === true) return <span className="badge ok">Verified</span>;
  if (value === false) return <span className="badge fail">Failed</span>;
  return <span className="badge">Sealed</span>;
}

export default function History() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .history()
      .then(setRows)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="page-title">
        <div className="kicker">Audit history</div>
        <h2>Sealed configuration changes</h2>
        <p>
          Local history is a convenience index. Cryptographic validity comes only from
          CooL verification of the stored receipt bytes.
        </p>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {!rows && !error ? <p className="empty">Loading history…</p> : null}

      {rows && rows.length === 0 ? (
        <div className="card empty">No evidence yet. Seal a configuration change first.</div>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>AI system</th>
                <th>Change</th>
                <th>Evidence ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.displayId}>
                  <td className="mono">{new Date(row.issuedAt).toLocaleString()}</td>
                  <td>{row.aiSystemName}</td>
                  <td>{row.changeSummary}</td>
                  <td className="mono">
                    <Link to={`/evidence/${row.displayId}`}>{row.displayId}</Link>
                  </td>
                  <td>
                    <StatusBadge value={row.lastVerifyOk} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
