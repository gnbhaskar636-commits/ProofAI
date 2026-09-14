import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const DEMO_AFTER = { model: "Model-B", promptVersion: "v13", policy: "Strict+" };

export default function CreateChange() {
  const nav = useNavigate();
  const [system, setSystem] = useState(null);
  const [after, setAfter] = useState(DEMO_AFTER);
  const [changeType, setChangeType] = useState("model-and-policy");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api
      .dashboard()
      .then((data) => {
        const current = data.systems[0];
        setSystem(current);
        if (
          current &&
          current.config.model === DEMO_AFTER.model &&
          current.config.promptVersion === DEMO_AFTER.promptVersion &&
          current.config.policy === DEMO_AFTER.policy
        ) {
          setAfter({ model: "Model-C", promptVersion: "v14", policy: "Strict+" });
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  async function onSeal() {
    setPending(true);
    setError(null);
    try {
      const record = await api.seal({
        systemId: system?.id || "customer-support",
        changeType,
        after,
        actor: "demo-user",
      });
      nav(`/evidence/${record.displayId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="page-title">
        <div className="kicker">Create change</div>
        <h2>Seal a configuration change with CooL</h2>
        <p>
          Record the before and after state of an AI system, then generate a
          cryptographically verifiable receipt. ProofAI does not claim the model is
          correct, fair, or safe — only that this change can be proven later.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="grid grid-eq">
          <label>
            <div className="field-label">AI system</div>
            <input value={system?.name || "Customer Support AI"} readOnly />
          </label>
          <label>
            <div className="field-label">Change type</div>
            <select value={changeType} onChange={(e) => setChangeType(e.target.value)}>
              <option value="model-and-policy">Model and policy update</option>
              <option value="model">Model update</option>
              <option value="prompt">Prompt version update</option>
              <option value="policy">Policy update</option>
            </select>
          </label>
        </div>
      </div>

      <div className="compare">
        <section className="card">
          <div className="field-label">Before</div>
          <div style={{ marginTop: 16 }}>
            <div className="field-label">Model</div>
            <div className="field-value">{system?.config.model || "Model-A"}</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="field-label">Prompt version</div>
            <div className="field-value">{system?.config.promptVersion || "v12"}</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="field-label">Policy</div>
            <div className="field-value">{system?.config.policy || "Strict"}</div>
          </div>
        </section>
        <div className="arrow">→</div>
        <section className="card">
          <div className="field-label">After</div>
          <label style={{ marginTop: 12 }}>
            <div className="field-label">After model</div>
            <input
              value={after.model}
              onChange={(e) => setAfter({ ...after, model: e.target.value })}
            />
          </label>
          <label>
            <div className="field-label">After prompt version</div>
            <input
              value={after.promptVersion}
              onChange={(e) => setAfter({ ...after, promptVersion: e.target.value })}
            />
          </label>
          <label>
            <div className="field-label">After policy</div>
            <input
              value={after.policy}
              onChange={(e) => setAfter({ ...after, policy: e.target.value })}
            />
          </label>
        </section>
      </div>

      {error ? (
        <div className="error" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}

      <div className="actions">
        <button className="btn btn-primary" disabled={pending} onClick={onSeal}>
          {pending ? "Sealing with CooL…" : "Seal Change with CooL"}
        </button>
      </div>
      <p className="footnote">
        Calls the real CooL SDK <code>record()</code> on the server. Metadata is
        committed as a salted hash; the receipt does not store raw prompt text.
      </p>
    </div>
  );
}
