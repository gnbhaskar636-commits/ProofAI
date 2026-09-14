import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function Evidence() {
  const { displayId } = useParams();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [which, setWhich] = useState("original");
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(null);
  const [originalStillOk, setOriginalStillOk] = useState(null);

  useEffect(() => {
    api
      .evidence(displayId)
      .then(setRecord)
      .catch((err) => setError(err.message));
  }, [displayId]);

  async function verify(target) {
    setBusy(`verify-${target}`);
    setError(null);
    try {
      const result = await api.verify(displayId, target);
      setRecord(result.record);
      setVerdict(result.verdict);
      setWhich(result.which);
      if (target === "original") setOriginalStillOk(result.verdict.ok);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function tamper() {
    setBusy("tamper");
    setError(null);
    try {
      const result = await api.tamper(displayId);
      setRecord(result.record);
      setNote(result.note);
      setVerdict(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!record && !error) return <p className="empty">Loading evidence…</p>;
  if (!record) {
    return (
      <div>
        <div className="error">{error || "Evidence not found."}</div>
        <div className="actions">
          <Link className="btn btn-secondary" to="/history">
            Back to history
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title">
        <div className="kicker">Evidence / receipt</div>
        <h2>{record.displayId}</h2>
        <p>
          Original CooL receipts stay intact. Tamper Test creates a modified copy used
          only to demonstrate failed verification.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <span className="badge accent">{record.receiptPreview.schema || "cool.receipt.v2"}</span>
        <span className="badge warn">{record.receiptPreview.runtimeMode || "simulated"}</span>
        {record.hasTamperedCopy ? <span className="badge fail">Tampered copy ready</span> : null}
      </div>

      <div className="grid grid-eq">
        <section className="card">
          <div className="field-label">Configuration change</div>
          <h3 style={{ margin: "6px 0 16px" }}>{record.aiSystemName}</h3>
          <div className="grid grid-eq">
            <div>
              <div className="field-label">Before</div>
              <p className="field-value">{record.before.model}</p>
              <p className="field-value">{record.before.promptVersion}</p>
              <p className="field-value">{record.before.policy}</p>
            </div>
            <div>
              <div className="field-label">After</div>
              <p className="field-value">{record.after.model}</p>
              <p className="field-value">{record.after.promptVersion}</p>
              <p className="field-value">{record.after.policy}</p>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="field-label">Cryptographic receipt</div>
          <div style={{ marginTop: 14 }}>
            <div className="field-label">Evidence ID</div>
            <div className="field-value">{record.displayId}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="field-label">CooL record ID</div>
            <div className="field-value">{record.coolRecordId}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="field-label">Timestamp</div>
            <div className="field-value">{new Date(record.issuedAt).toLocaleString()}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="field-label">Signature</div>
            <div className="field-value">{record.receiptPreview.signatureAlg || "—"}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="field-label">Binding hash</div>
            <div className="field-value">{record.receiptPreview.bindingHash || "—"}</div>
          </div>
        </section>
      </div>

      <div className="actions">
        <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => verify("original")}>
          {busy === "verify-original" ? "Verifying…" : "Verify Evidence"}
        </button>
        <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={tamper}>
          {busy === "tamper" ? "Creating copy…" : "Tamper Test"}
        </button>
        <button
          className="btn btn-danger"
          disabled={Boolean(busy) || !record.hasTamperedCopy}
          onClick={() => verify("tampered")}
        >
          {busy === "verify-tampered" ? "Verifying copy…" : "Verify tampered copy"}
        </button>
      </div>

      {note ? <p className="footnote">{note}</p> : null}
      {error ? (
        <div className="error" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}

      {verdict ? (
        <div className={`verdict ${verdict.ok ? "ok" : "fail"}`}>
          <h3>{verdict.ok ? "✓ VERIFIED" : "✕ VERIFICATION FAILED"}</h3>
          <p>
            {verdict.ok
              ? "The recorded evidence matches its cryptographic proof. Binding and signature checks from the CooL verifier succeeded."
              : which === "tampered"
                ? "The evidence was modified after it was sealed, so verification no longer succeeds."
                : "CooL verification did not succeed for this receipt."}
          </p>
          <p className="footnote" style={{ color: "inherit" }}>
            Checking {which === "original" ? "the original sealed receipt" : "the tampered copy"}.
            Domains: {verdict.checks.map((c) => `${c.domain}=${c.status}`).join(" · ")}
          </p>
          <pre className="pre">{verdict.formatted}</pre>
        </div>
      ) : null}

      {record.hasTamperedCopy && originalStillOk !== null ? (
        <div className="wow">
          <div className="verdict ok">
            <h3>✓ ORIGINAL</h3>
            <p>
              {originalStillOk
                ? "The original sealed evidence still verifies."
                : "Unexpected: original evidence did not verify."}
            </p>
          </div>
          <div className={`verdict ${which === "tampered" && !verdict?.ok ? "fail" : "fail"}`}>
            <h3>✕ TAMPERED COPY</h3>
            <p>A modified copy of the same receipt fails CooL verification.</p>
          </div>
        </div>
      ) : null}

      <div className="actions">
        <Link className="btn btn-secondary" to="/history">
          Open audit history
        </Link>
      </div>
    </div>
  );
}
