const app = document.getElementById("app");

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const api = {
  dashboard: () => request("/api/dashboard"),
  history: () => request("/api/evidence"),
  evidence: (id) => request(`/api/evidence/${encodeURIComponent(id)}`),
  twin: () => request("/api/twin"),
  seal: (payload) => request("/api/changes", { method: "POST", body: JSON.stringify(payload) }),
  verify: (id, which) => request(`/api/evidence/${encodeURIComponent(id)}/verify`, { method: "POST", body: JSON.stringify({ which }) }),
  tamper: (id) => request(`/api/evidence/${encodeURIComponent(id)}/tamper`, { method: "POST" }),
  analyze: (id) => request(`/api/evidence/${encodeURIComponent(id)}/analyze`, { method: "POST" }),
  copilot: (question) => request("/api/copilot", { method: "POST", body: JSON.stringify({ question }) }),
  brief: () => request("/api/intelligence/brief"),
};

function route() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "change") return { name: "change" };
  if (parts[0] === "twin") return { name: "twin" };
  if (parts[0] === "risk") return { name: "risk" };
  if (parts[0] === "history") return { name: "history" };
  if (parts[0] === "copilot") return { name: "copilot" };
  if (parts[0] === "evidence" && parts[1]) return { name: "receipt", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "evidence") return { name: "evidence" };
  return { name: "overview" };
}

function setChrome(title, kicker) {
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageKicker").textContent = kicker;
  const r = route();
  document.querySelectorAll("[data-nav]").forEach((el) => {
    const nav = el.getAttribute("data-nav");
    const active =
      (nav === "overview" && r.name === "overview") ||
      (nav === "evidence" && (r.name === "evidence" || r.name === "receipt")) ||
      nav === r.name;
    el.classList.toggle("active", active);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusBadge(value) {
  if (value === true) return `<span class="badge ok">Verified</span>`;
  if (value === false) return `<span class="badge fail">Failed</span>`;
  return `<span class="badge">Sealed</span>`;
}

function riskBadge(level) {
  if (!level) return `<span class="badge">Unanalyzed</span>`;
  const tone = level === "LOW" ? "low" : level === "MEDIUM" ? "medium" : "high";
  return `<span class="badge ${tone}">${escapeHtml(level)}</span>`;
}

function field(label, value) {
  return `<div><div class="field-label">${escapeHtml(label)}</div><div class="field-value">${escapeHtml(value ?? "—")}</div></div>`;
}

async function refreshMeta() {
  try {
    const data = await api.dashboard();
    document.getElementById("topMeta").innerHTML = `
      <span class="badge accent">CooL ${escapeHtml(data.coolMode)}</span>
      <span class="badge">${data.aiConfigured ? "OpenRouter connected" : "OpenRouter offline"}</span>
      <span class="badge">${data.evidenceCount} receipts</span>`;
    return data;
  } catch {
    return null;
  }
}

function evidenceTable(rows) {
  if (!rows.length) return `<div class="card empty">No sealed evidence yet.</div>`;
  return `<div class="card" style="padding:0;overflow:auto"><table>
    <thead><tr><th>ID</th><th>System</th><th>Change</th><th>Risk</th><th>Proof</th></tr></thead>
    <tbody>${rows
      .map(
        (row) => `<tr>
        <td class="mono"><a href="#/evidence/${encodeURIComponent(row.displayId)}">${escapeHtml(row.displayId)}</a></td>
        <td>${escapeHtml(row.aiSystemName)}</td>
        <td>${escapeHtml(row.changeSummary)}</td>
        <td>${riskBadge(row.analysis?.riskLevel)}</td>
        <td>${statusBadge(row.lastVerifyOk)}</td>
      </tr>`,
      )
      .join("")}</tbody></table></div>`;
}

async function renderOverview() {
  setChrome("Overview", "Security console");
  const [data, brief] = await Promise.all([api.dashboard(), api.brief().catch(() => null)]);
  const system = data.systems[0];
  app.innerHTML = `
    <div class="grid grid-3">
      <div class="card"><div class="field-label">Sealed receipts</div><p class="stat">${data.evidenceCount}</p></div>
      <div class="card"><div class="field-label">High / critical analyses</div><p class="stat">${(data.riskCounts.HIGH || 0) + (data.riskCounts.CRITICAL || 0)}</p></div>
      <div class="card"><div class="field-label">Unanalyzed</div><p class="stat">${data.riskCounts.unanalyzed || 0}</p></div>
    </div>
    <div class="card" style="margin-top:16px" id="briefCard">${briefBody(brief)}</div>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card">
        <div class="field-label">Current AI system</div>
        <h3 style="margin:6px 0 14px">${escapeHtml(system.name)}</h3>
        <div class="grid grid-3">
          ${field("Model", system.config.model)}
          ${field("Prompt", system.config.promptVersion)}
          ${field("Policy", system.config.policy)}
        </div>
        <div class="grid grid-eq" style="margin-top:14px">
          ${field("Tools", (system.config.tools || []).join(", "))}
          ${field("Deployment", system.config.deployment)}
        </div>
        <div class="actions">
          <a class="btn btn-primary" href="#/change">Create change</a>
          <a class="btn btn-secondary" href="#/twin">Open system twin</a>
        </div>
      </section>
      <section class="card">
        <div class="field-label">Demo workflow</div>
        <ol style="color:var(--muted);padding-left:18px">
          <li>Seal a configuration change with CooL</li>
          <li>Analyze the change (AI recommendation)</li>
          <li>Inspect the 3D twin</li>
          <li>Verify the original receipt</li>
          <li>Tamper a copy and watch verification fail</li>
        </ol>
        <p class="footnote">CooL verification is cryptographic evidence. Risk analysis is not proof of safety or compliance.</p>
      </section>
    </div>
    <h3 style="margin:22px 0 10px">Recent evidence</h3>
    ${evidenceTable(data.recent)}`;

  wireBriefRefresh();
}

function wireBriefRefresh() {
  const btn = document.getElementById("refreshBrief");
  if (!btn) return;
  btn.onclick = async () => {
    const card = document.getElementById("briefCard");
    card.innerHTML = briefBody(null, true);
    const fresh = await api.brief().catch(() => null);
    card.innerHTML = briefBody(fresh);
    wireBriefRefresh();
  };
}

// Executive Evidence Brief — reads across the WHOLE evidence store (not one
// change at a time like Analyze Change). AI-phrased when OpenRouter is
// configured, otherwise a local heuristic summary; either way it only
// describes counts/records already in the store — see summarizePosture().
function briefBody(brief, loading = false) {
  if (loading) {
    return `<div class="field-label">Executive evidence brief</div><p class="footnote" style="margin-top:8px">Refreshing…</p>`;
  }
  if (!brief) {
    return `<div class="field-label">Executive evidence brief</div><p class="footnote" style="margin-top:8px">Unavailable right now.</p>`;
  }
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <div>
        <div class="field-label">Executive evidence brief</div>
        <p style="margin:6px 0 0">${escapeHtml(brief.summary)}</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="badge ${brief.status === "Stable" ? "ok" : brief.status === "No evidence yet" ? "" : brief.status === "Verification failure on record" || brief.status === "Attention needed" ? "fail" : "warn"}">${escapeHtml(brief.status)}</span>
        <button class="btn btn-secondary" id="refreshBrief" style="min-height:32px;padding:0 12px;font-size:12px">Refresh</button>
      </div>
    </div>
    <p class="footnote" style="margin-top:10px">${escapeHtml(brief.disclaimer)}${brief.model ? ` · ${escapeHtml(brief.model)}` : ""}</p>`;
}



async function renderChange() {
  setChrome("Create change", "Seal with CooL");
  const data = await api.dashboard();
  const system = data.systems[0];
  let after = { model: "Model-B", promptVersion: "v13", policy: "Strict+" };
  if (system.config.model === "Model-B" || system.config.promptVersion === "v13") {
    after = { model: "Model-C", promptVersion: "v14", policy: system.config.policy || "Strict+" };
  }
  app.innerHTML = `
    <p class="footnote" style="margin-top:0">ProofAI records the before/after state, then calls the real CooL SDK. Analysis happens after sealing and is labeled separately from verification.</p>
    <div class="card" style="margin:16px 0">
      <div class="grid grid-eq">
        <label><div class="field-label">AI system</div><input value="${escapeHtml(system.name)}" readonly /></label>
        <label><div class="field-label">Change type</div>
          <select id="changeType">
            <option value="model-and-policy">Model and policy update</option>
            <option value="model">Model update</option>
            <option value="prompt">Prompt version update</option>
            <option value="policy">Policy update</option>
          </select>
        </label>
      </div>
    </div>
    <div class="compare">
      <section class="card">
        <div class="field-label">Before</div>
        <div style="margin-top:12px">${field("Model", system.config.model)}</div>
        <div style="margin-top:12px">${field("Prompt", system.config.promptVersion)}</div>
        <div style="margin-top:12px">${field("Policy", system.config.policy)}</div>
        <div style="margin-top:12px">${field("Deployment", system.config.deployment)}</div>
      </section>
      <div class="arrow">→</div>
      <section class="card">
        <div class="field-label">After</div>
        <label><div class="field-label">After model</div><input id="afterModel" value="${escapeHtml(after.model)}" /></label>
        <label><div class="field-label">After prompt version</div><input id="afterPrompt" value="${escapeHtml(after.promptVersion)}" /></label>
        <label><div class="field-label">After policy</div><input id="afterPolicy" value="${escapeHtml(after.policy)}" /></label>
      </section>
    </div>
    <div id="changeError"></div>
    <div class="actions">
      <button class="btn btn-primary" id="sealBtn">Seal Change with CooL</button>
    </div>`;
  document.getElementById("sealBtn").onclick = async () => {
    const button = document.getElementById("sealBtn");
    button.disabled = true;
    button.textContent = "Sealing with CooL…";
    try {
      const record = await api.seal({
        systemId: system.id,
        changeType: document.getElementById("changeType").value,
        after: {
          model: document.getElementById("afterModel").value,
          promptVersion: document.getElementById("afterPrompt").value,
          policy: document.getElementById("afterPolicy").value,
          tools: system.config.tools,
          deployment: system.config.deployment,
        },
        actor: "demo-user",
      });
      location.hash = `#/evidence/${encodeURIComponent(record.displayId)}`;
    } catch (error) {
      document.getElementById("changeError").innerHTML = `<div class="error" style="margin-top:16px">${escapeHtml(error.message)}</div>`;
      button.disabled = false;
      button.textContent = "Seal Change with CooL";
    }
  };
}

function analysisCard(analysis) {
  if (!analysis) return `<div class="card empty">No analysis yet. Run Analyze Change.</div>`;
  return `<div class="card">
    <div class="field-label">AI change intelligence</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px">
      ${riskBadge(analysis.riskLevel)}
      <span class="badge">${escapeHtml(analysis.source)}</span>
    </div>
    <p>${escapeHtml(analysis.summary)}</p>
    <p class="footnote"><strong>Impact:</strong> ${escapeHtml(analysis.potentialImpact)}</p>
    <p class="footnote"><strong>Recommended review:</strong> ${escapeHtml(analysis.recommendedAction)}</p>
    <ul class="footnote">${(analysis.auditQuestions || []).map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>
    <p class="footnote">${escapeHtml(analysis.disclaimer)}</p>
  </div>`;
}

// Evidence Confidence Timeline — a step-by-step provenance chain for a
// single receipt. Every step is derived strictly from persisted record
// fields (issuedAt, analysis, lastVerifyOk/lastVerifyAt, hasTamperedCopy)
// or from a real API response returned earlier in this session (extras).
// A step is only ever marked "done"/"failed" because a real call actually
// happened and returned that result — nothing here is simulated.
function confidenceTimeline(record, extras) {
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : null);

  const steps = [];

  steps.push({
    state: "done",
    title: "Change sealed",
    meta: fmt(record.issuedAt),
    desc: `${escapeHtml(record.displayId)} recorded by CooL (${escapeHtml(record.coolRecordId || "—")}).`,
  });

  steps.push({
    state: record.analysis ? "done" : "pending",
    title: "AI change intelligence",
    meta: record.analysis ? `Risk: ${record.analysis.riskLevel}` : null,
    desc: record.analysis
      ? escapeHtml(record.analysis.summary)
      : "Not yet analyzed. Run Analyze Change to attach risk context.",
  });

  const verified = record.lastVerifyOk === true;
  const verifyFailed = record.lastVerifyOk === false;
  steps.push({
    state: verified ? "done" : verifyFailed ? "failed" : "pending",
    title: "Original evidence verified",
    meta: fmt(record.lastVerifyAt),
    desc: verified
      ? "CooL confirmed the receipt bytes match what was sealed."
      : verifyFailed
        ? "CooL verification did not succeed for this receipt."
        : "Not yet verified. Run Verify Evidence.",
  });

  const tamperedVerified = extras?.which === "tampered" ? extras.verdict : null;
  steps.push({
    state: record.hasTamperedCopy ? "done" : "pending",
    title: "Tamper copy created",
    desc: record.hasTamperedCopy
      ? "A modified copy of this evidence exists locally for the tamper demonstration."
      : "Not yet created. Run Tamper Test to generate a modified copy.",
  });
  steps.push({
    state: tamperedVerified ? (tamperedVerified.ok ? "done" : "failed") : "pending",
    title: "Tampered copy checked against CooL",
    desc: tamperedVerified
      ? tamperedVerified.ok
        ? "Unexpected: the tampered copy still verified."
        : "As expected — the modified copy fails CooL verification."
      : "Not yet checked this session. Run Verify tampered copy.",
  });

  const stillVerified = window.__originalOk === true && tamperedVerified && !tamperedVerified.ok;
  steps.push({
    state: stillVerified ? "done" : "pending",
    title: "Original remains verified",
    desc: stillVerified
      ? "Tampering the copy did not affect the original sealed receipt."
      : "Shown once both the original and a tampered copy have been checked in this session.",
  });

  let confidence = { label: "Sealed — not yet verified", tone: "warn" };
  if (verifyFailed) confidence = { label: "Verification failed", tone: "fail" };
  else if (stillVerified) confidence = { label: "Fully verified — tamper-resistant", tone: "ok" };
  else if (verified) confidence = { label: "Verified", tone: "ok" };

  const icon = { done: "✓", failed: "✕", pending: "·" };
  return `
    <div class="card timeline">
      <div class="confidence-strip">
        <div>
          <div class="field-label">Evidence confidence</div>
          <p class="field-value" style="font-size:14px">${confidence.label}</p>
        </div>
        <span class="badge ${confidence.tone}">${escapeHtml(confidence.label)}</span>
      </div>
      <div class="timeline-track">
        ${steps
          .map(
            (step) => `
          <div class="timeline-step ${step.state}">
            <span class="timeline-dot">${icon[step.state]}</span>
            <div class="timeline-title">${escapeHtml(step.title)}</div>
            ${step.meta ? `<div class="timeline-meta">${escapeHtml(step.meta)}</div>` : ""}
            <div class="timeline-desc">${step.desc}</div>
          </div>`,
          )
          .join("")}
      </div>
      <p class="footnote" style="margin-top:6px">Every step above reflects a real CooL call or stored record — nothing is simulated.</p>
    </div>`;
}

async function renderReceipt(displayId) {
  setChrome(displayId, "Evidence receipt");
  let record = await api.evidence(displayId);
  let extras = {};

  function paint() {
    const preview = record.receiptPreview || {};
    app.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <span class="badge accent">${escapeHtml(preview.schema || "cool.receipt.v2")}</span>
        <span class="badge warn">${escapeHtml(preview.runtimeMode || "simulated")}</span>
        ${statusBadge(record.lastVerifyOk)}
        ${riskBadge(record.analysis?.riskLevel)}
        ${record.hasTamperedCopy ? `<span class="badge fail">Tampered copy ready</span>` : ""}
      </div>
      <div class="grid grid-eq">
        <section class="card">
          <div class="field-label">Configuration change</div>
          <h3 style="margin:6px 0 12px">${escapeHtml(record.aiSystemName)}</h3>
          <div class="grid grid-eq">
            <div><div class="field-label">Before</div>
              <p class="field-value">${escapeHtml(record.before.model)}</p>
              <p class="field-value">${escapeHtml(record.before.promptVersion)}</p>
              <p class="field-value">${escapeHtml(record.before.policy)}</p>
            </div>
            <div><div class="field-label">After</div>
              <p class="field-value">${escapeHtml(record.after.model)}</p>
              <p class="field-value">${escapeHtml(record.after.promptVersion)}</p>
              <p class="field-value">${escapeHtml(record.after.policy)}</p>
            </div>
          </div>
        </section>
        <section class="card">
          <div class="field-label">Cryptographic receipt</div>
          <div style="margin-top:12px">${field("CooL record ID", record.coolRecordId)}</div>
          <div style="margin-top:10px">${field("Timestamp", new Date(record.issuedAt).toLocaleString())}</div>
          <div style="margin-top:10px">${field("Signature", preview.signatureAlg)}</div>
          <div style="margin-top:10px">${field("Binding hash", preview.bindingHash)}</div>
        </section>
      </div>
      ${confidenceTimeline(record, extras)}
      <div class="actions">
        <button class="btn btn-secondary" id="analyzeBtn">Analyze Change</button>
        <button class="btn btn-primary" id="verifyOriginal">Verify Evidence</button>
        <button class="btn btn-secondary" id="tamperBtn">Tamper Test</button>
        <button class="btn btn-danger" id="verifyTampered" ${record.hasTamperedCopy ? "" : "disabled"}>Verify tampered copy</button>
      </div>
      <div id="note">${extras.note ? `<p class="footnote">${escapeHtml(extras.note)}</p>` : ""}</div>
      <div id="err">${extras.error ? `<div class="error" style="margin-top:12px">${escapeHtml(extras.error)}</div>` : ""}</div>
      <div style="margin-top:16px">${analysisCard(record.analysis)}</div>
      ${
        extras.verdict
          ? `<div class="verdict ${extras.verdict.ok ? "ok" : "fail"}">
              <h3>${extras.verdict.ok ? "✓ VERIFIED" : "✕ VERIFICATION FAILED"}</h3>
              <p>${
                extras.verdict.ok
                  ? "The recorded evidence matches its cryptographic proof."
                  : extras.which === "tampered"
                    ? "The evidence was modified after it was sealed, so verification no longer succeeds."
                    : "CooL verification did not succeed for this receipt."
              }</p>
              <p class="footnote" style="color:inherit">Checking ${extras.which === "original" ? "the original sealed receipt" : "the tampered copy"}.</p>
              <pre class="pre">${escapeHtml(extras.verdict.formatted)}</pre>
            </div>`
          : ""
      }
      ${
        extras.wow
          ? `<div class="grid grid-eq" style="margin-top:16px">
              <div class="verdict ok"><h3>✓ ORIGINAL</h3><p>The original sealed evidence still verifies.</p></div>
              <div class="verdict fail"><h3>✕ TAMPERED COPY</h3><p>The modified copy fails CooL verification.</p></div>
            </div>`
          : ""
      }`;

    document.getElementById("analyzeBtn").onclick = async () => {
      document.getElementById("analyzeBtn").disabled = true;
      try {
        const result = await api.analyze(displayId);
        record = result.record;
        extras = { ...extras, error: result.analysis.error };
        paint();
      } catch (error) {
        extras.error = error.message;
        paint();
      }
    };
    document.getElementById("verifyOriginal").onclick = async () => {
      try {
        const result = await api.verify(displayId, "original");
        record = result.record;
        extras.verdict = result.verdict;
        extras.which = "original";
        window.__originalOk = result.verdict.ok;
        paint();
      } catch (error) {
        extras.error = error.message;
        paint();
      }
    };
    document.getElementById("tamperBtn").onclick = async () => {
      try {
        const result = await api.tamper(displayId);
        record = result.record;
        extras.note = result.note;
        extras.verdict = null;
        paint();
      } catch (error) {
        extras.error = error.message;
        paint();
      }
    };
    document.getElementById("verifyTampered").onclick = async () => {
      try {
        const result = await api.verify(displayId, "tampered");
        record = result.record;
        extras.verdict = result.verdict;
        extras.which = "tampered";
        if (window.__originalOk !== true) {
          const orig = await api.verify(displayId, "original");
          window.__originalOk = orig.verdict.ok;
        }
        extras.wow = window.__originalOk && !result.verdict.ok;
        paint();
      } catch (error) {
        extras.error = error.message;
        paint();
      }
    };
  }
  paint();
}

async function renderEvidenceList() {
  setChrome("Evidence", "Receipt index");
  const rows = await api.history();
  app.innerHTML = `<p class="footnote" style="margin-top:0">Local index only. Cryptographic validity comes from CooL verification of receipt bytes.</p>${evidenceTable(rows)}`;
}

async function renderRisk() {
  setChrome("Risk Intelligence", "Analysis, not proof");
  const rows = await api.history();
  const analyzed = rows.filter((row) => row.analysis);
  app.innerHTML = `
    <p class="footnote" style="margin-top:0">Risk ratings are generated analysis or local heuristics. They are not CooL verification and not a compliance certification.</p>
    ${
      analyzed.length
        ? analyzed
            .map(
              (row) => `<div class="card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <a class="mono" href="#/evidence/${encodeURIComponent(row.displayId)}">${escapeHtml(row.displayId)}</a>
            ${riskBadge(row.analysis.riskLevel)}
          </div>
          <p>${escapeHtml(row.analysis.summary)}</p>
          <p class="footnote">${escapeHtml(row.changeSummary)}</p>
        </div>`,
            )
            .join("")
        : `<div class="card empty">No analyses yet. Seal a change, then click Analyze Change.</div>`
    }`;
}

async function renderHistory() {
  setChrome("Audit History", "Sealed configuration changes");
  const rows = await api.history();
  app.innerHTML = evidenceTable(rows);
}

async function renderTwin() {
  setChrome("AI System Twin", "Customer Support AI");
  app.innerHTML = `
    <div class="card" id="twin-stage" style="padding:0">
      <canvas id="twin-canvas"></canvas>
      <aside class="card twin-panel" id="twin-panel"><p class="empty">Click a node to inspect configuration, evidence, and analysis.</p></aside>
    </div>
    <p class="footnote">Changed nodes glow after a sealed update. This visualization reads the live evidence store; it does not replace verification.</p>`;
  window.dispatchEvent(new CustomEvent("proofai:twin"));
}

async function renderCopilot() {
  setChrome("AI Copilot", "Ask the evidence store");
  app.innerHTML = `
    <div class="card chat" id="chat">
      <div class="bubble">Ask about stored receipts only. Example: “What changed in the latest deployment?” or “Show all unverified evidence.”</div>
    </div>
    <div class="actions">
      <input id="q" placeholder="What changed in the latest deployment?" />
      <button class="btn btn-primary" id="ask">Ask</button>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" data-q="Show high-risk changes">Show high-risk changes</button>
      <button class="btn btn-secondary" data-q="What changed in the customer support AI?">Customer support changes</button>
      <button class="btn btn-secondary" data-q="Show all unverified evidence">Unverified evidence</button>
    </div>`;
  const chat = document.getElementById("chat");
  async function ask(question) {
    chat.insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHtml(question)}</div>`);
    try {
      const result = await api.copilot(question);
      const ids = (result.evidenceIds || []).map((id) => `<a href="#/evidence/${encodeURIComponent(id)}">${escapeHtml(id)}</a>`).join(" · ");
      chat.insertAdjacentHTML(
        "beforeend",
        `<div class="bubble">${escapeHtml(result.answer)}<div class="footnote" style="margin-top:8px">${ids || "No evidence IDs"} · ${escapeHtml(result.disclaimer || "")}</div></div>`,
      );
    } catch (error) {
      chat.insertAdjacentHTML("beforeend", `<div class="error">${escapeHtml(error.message)}</div>`);
    }
  }
  document.getElementById("ask").onclick = () => {
    const q = document.getElementById("q").value.trim();
    if (q) ask(q);
  };
  document.querySelectorAll("[data-q]").forEach((btn) => {
    btn.onclick = () => ask(btn.getAttribute("data-q"));
  });
}

function replayRouteTransition() {
  // Re-triggers the #app fade/slide-in CSS animation on every navigation,
  // not just on first load. Purely cosmetic — no effect on routing/state.
  app.classList.remove("route-anim");
  // eslint-disable-next-line no-unused-expressions
  void app.offsetWidth; // force reflow so the animation restarts
  app.classList.add("route-anim");
}

async function render() {
  try {
    await refreshMeta();
    replayRouteTransition();
    const r = route();
    if (r.name === "change") return renderChange();
    if (r.name === "twin") return renderTwin();
    if (r.name === "risk") return renderRisk();
    if (r.name === "history") return renderHistory();
    if (r.name === "copilot") return renderCopilot();
    if (r.name === "receipt") return renderReceipt(r.id);
    if (r.name === "evidence") return renderEvidenceList();
    return renderOverview();
  } catch (error) {
    app.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

window.addEventListener("hashchange", render);
render();

// Cursor spotlight — cheap ambient highlight, purely visual (see .spotlight
// in styles.css). Throttled to one update per animation frame.
(function initSpotlight() {
  let raf = null;
  window.addEventListener("pointermove", (event) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--mx", `${event.clientX}px`);
      document.documentElement.style.setProperty("--my", `${event.clientY}px`);
      raf = null;
    });
  });
})();

// Autoplay safety net — some browsers defer the declarative `autoplay`
// attribute until the tab is foregrounded or the media is fully buffered.
// This nudges playback once the video can actually play, and again on the
// first user interaction (which every browser's autoplay policy allows).
(function ensureCinematicAutoplay() {
  const video = document.querySelector(".env-layer video");
  if (!video) return;
  const tryPlay = () => video.play().catch(() => {});
  video.addEventListener("canplay", tryPlay, { once: true });
  window.addEventListener("pointerdown", tryPlay, { once: true });
  window.addEventListener("keydown", tryPlay, { once: true });
  tryPlay();
})();
