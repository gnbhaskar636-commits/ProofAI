const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// ProofAI's AI Change Intelligence layer runs on OpenRouter (any model
// available there, chosen via OPENROUTER_MODEL). OpenRouter speaks the
// standard OpenAI-compatible Chat Completions endpoint, so no SDK
// dependency is needed — a plain fetch() call is simpler and works with
// every model OpenRouter hosts, not just OpenAI's.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export function aiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim());
}

// Kept as an alias — some older tooling/tests reference the previous name.
export const openaiConfigured = aiConfigured;

function changedFields(before = {}, after = {}) {
  const keys = ["model", "promptVersion", "policy", "tools", "deployment"];
  return keys.filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
}

export function heuristicAnalysis(record) {
  const fields = changedFields(record.before, record.after);
  let riskLevel = "LOW";
  if (fields.includes("promptVersion")) riskLevel = "MEDIUM";
  if (fields.includes("model")) riskLevel = "MEDIUM";
  if (fields.includes("deployment")) riskLevel = "MEDIUM";
  if (fields.includes("tools")) riskLevel = "HIGH";
  const policyAfter = String(record.after?.policy || "").toLowerCase();
  const policyBefore = String(record.before?.policy || "").toLowerCase();
  if (fields.includes("policy") && /off|none|disabled|permissive|open/.test(policyAfter)) {
    riskLevel = "CRITICAL";
  } else if (fields.includes("policy") && policyAfter !== policyBefore && fields.includes("model")) {
    riskLevel = "HIGH";
  }

  const summaryParts = fields.map((field) => {
    if (field === "tools") {
      return `tools ${JSON.stringify(record.before.tools || [])} → ${JSON.stringify(record.after.tools || [])}`;
    }
    return `${field} ${record.before?.[field] ?? "—"} → ${record.after?.[field] ?? "—"}`;
  });

  return {
    riskLevel,
    summary: summaryParts.length
      ? `${record.aiSystemName} changed ${summaryParts.join("; ")}.`
      : `${record.aiSystemName} recorded a configuration event.`,
    potentialImpact:
      riskLevel === "CRITICAL"
        ? "Safety policy appears weakened. Customer-facing behavior could change without the previous guardrails."
        : riskLevel === "HIGH"
          ? "Multiple control planes moved together. Reviewers should confirm evaluation coverage before promotion."
          : riskLevel === "MEDIUM"
            ? "A model or prompt shift can change answer quality, tool use, and escalation behavior."
            : "The recorded delta is limited. Confirm the change matches the intended ticket.",
    recommendedAction:
      riskLevel === "LOW"
        ? "Log the receipt and continue with standard review."
        : "Have an owner review evals, policy text, and rollback steps before the next production rollout.",
    auditQuestions: [
      `Which ticket authorized ${record.displayId}?`,
      "Was a golden-set or regression eval run against the after configuration?",
      "If verification later fails, who owns rollback?",
    ],
    source: "heuristic",
    disclaimer:
      "This is local heuristic analysis, not cryptographic proof and not a claim that the AI system is safe or compliant.",
  };
}

function parseJsonPayload(text) {
  if (!text) return null;
  const fenced = text.match(/\{[\s\S]*\}/);
  if (!fenced) return null;
  try {
    return JSON.parse(fenced[0]);
  } catch {
    return null;
  }
}

// Single entry point for every OpenRouter call in ProofAI. Uses the plain
// Chat Completions REST shape (system + user message) that OpenRouter
// implements for every model it hosts.
async function chatComplete(instructions, input) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENROUTER_API_KEY is not configured.");
    error.code = "NO_OPENROUTER_KEY";
    throw error;
  }
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      // OpenRouter uses these (optional but recommended) to attribute usage
      // on openrouter.ai/rankings — not required for the call to work.
      "http-referer": process.env.OPENROUTER_SITE_URL || "https://proofai.app",
      "x-title": "ProofAI",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input },
      ],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`OpenRouter request failed (${res.status}): ${bodyText.slice(0, 300)}`);
  }
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("OpenRouter returned an empty response.");
  }
  return { text, model };
}

export async function analyzeChange(record) {
  const fallback = heuristicAnalysis(record);
  if (!aiConfigured()) {
    return { ...fallback, available: false };
  }

  try {
    const { text, model } = await chatComplete(
      `You analyze AI system configuration changes for a security/audit product.
Return ONLY JSON with keys:
riskLevel (LOW|MEDIUM|HIGH|CRITICAL),
summary,
potentialImpact,
recommendedAction,
auditQuestions (array of 3 short questions).
This is analysis, not proof of safety, fairness, correctness, or legal compliance.
Do not invent facts that are not in the input.`,
      JSON.stringify(
        {
          displayId: record.displayId,
          aiSystem: record.aiSystemName,
          changeType: record.changeType,
          before: record.before,
          after: record.after,
          issuedAt: record.issuedAt,
          verification: record.lastVerifyOk,
        },
        null,
        2,
      ),
    );
    const parsed = parseJsonPayload(text) || {};
    const riskLevel = RISK_LEVELS.includes(parsed.riskLevel) ? parsed.riskLevel : fallback.riskLevel;
    return {
      riskLevel,
      summary: String(parsed.summary || fallback.summary),
      potentialImpact: String(parsed.potentialImpact || fallback.potentialImpact),
      recommendedAction: String(parsed.recommendedAction || fallback.recommendedAction),
      auditQuestions: Array.isArray(parsed.auditQuestions)
        ? parsed.auditQuestions.map(String).slice(0, 6)
        : fallback.auditQuestions,
      source: "openrouter",
      model,
      available: true,
      disclaimer:
        "AI-generated analysis and recommendation only. It is not cryptographic proof and does not claim the system is safe or compliant.",
    };
  } catch (error) {
    return {
      ...fallback,
      available: false,
      error: error instanceof Error ? error.message : "OpenRouter analysis failed.",
    };
  }
}

function matchesQuery(record, q) {
  const hay = [
    record.displayId,
    record.aiSystemName,
    record.changeSummary,
    record.changeType,
    record.analysis?.riskLevel,
    record.analysis?.summary,
    JSON.stringify(record.before),
    JSON.stringify(record.after),
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((token) => hay.includes(token));
}

export function selectRecordsForCopilot(records, question) {
  const q = String(question || "").toLowerCase();
  let selected = records.slice();

  if (/evd-\d+/i.test(question || "")) {
    const id = (question.match(/EVD-\d+/i) || [])[0];
    selected = records.filter((row) => row.displayId.toLowerCase() === id.toLowerCase());
  } else if (/high-risk|high risk|critical/.test(q)) {
    selected = records.filter((row) => ["HIGH", "CRITICAL"].includes(row.analysis?.riskLevel));
  } else if (/\bmedium\b/.test(q)) {
    selected = records.filter((row) => row.analysis?.riskLevel === "MEDIUM");
  } else if (/unverified|not verified|pending/.test(q)) {
    selected = records.filter((row) => row.lastVerifyOk !== true);
  } else if (/verified/.test(q)) {
    selected = records.filter((row) => row.lastVerifyOk === true);
  } else if (/latest|recent|deployment|customer support/.test(q)) {
    selected = records.slice(0, 5);
  } else if (q.trim()) {
    const hits = records.filter((row) => matchesQuery(row, q));
    selected = hits.length ? hits : records.slice(0, 5);
  }

  return selected.slice(0, 12);
}

function deterministicCopilotAnswer(question, selected, allCount) {
  const ids = selected.map((row) => row.displayId);
  const q = String(question || "").toLowerCase();

  if (!allCount) {
    return {
      answer: "No sealed evidence exists yet. Seal a configuration change first.",
      evidenceIds: [],
      source: "store",
    };
  }

  if (/high-risk|high risk|critical/.test(q) && selected.length === 0) {
    return {
      answer: "No HIGH or CRITICAL risk analyses are stored. Analyze a change first, or no sealed change met that bar.",
      evidenceIds: [],
      source: "store",
    };
  }

  if (/unverified|not verified/.test(q) && selected.length === 0) {
    return {
      answer: "Every stored original receipt has a successful verification on file.",
      evidenceIds: [],
      source: "store",
    };
  }

  if (/evd-\d+/i.test(question || "") && selected.length === 0) {
    return {
      answer: "That evidence ID is not in the local store. ProofAI will not invent a receipt.",
      evidenceIds: [],
      source: "store",
    };
  }

  const lines = selected.map((row) => {
    const risk = row.analysis?.riskLevel || "unanalyzed";
    const verify =
      row.lastVerifyOk === true ? "VERIFIED" : row.lastVerifyOk === false ? "FAILED" : "not verified yet";
    return `${row.displayId}: ${row.changeSummary} · risk ${risk} · ${verify}`;
  });

  return {
    answer: `Based only on stored evidence (${ids.join(", ") || "none"}):\n${lines.join("\n")}`,
    evidenceIds: ids,
    source: "store",
  };
}

export async function answerCopilot(question, records) {
  const selected = selectRecordsForCopilot(records, question);
  const local = deterministicCopilotAnswer(question, selected, records.length);
  if (!aiConfigured()) {
    return {
      ...local,
      available: false,
      disclaimer: "Answered from local evidence only. OpenRouter is not configured.",
    };
  }

  try {
    const { text, model } = await chatComplete(
      `You are ProofAI Evidence Copilot. Answer using ONLY the provided records.
Cite evidence IDs. If the records do not contain the answer, say so.
Never invent receipts, timestamps, or verification results.
Keep the answer under 120 words.`,
      JSON.stringify(
        {
          question,
          records: selected.map((row) => ({
            displayId: row.displayId,
            aiSystemName: row.aiSystemName,
            changeSummary: row.changeSummary,
            before: row.before,
            after: row.after,
            issuedAt: row.issuedAt,
            lastVerifyOk: row.lastVerifyOk,
            analysis: row.analysis
              ? {
                  riskLevel: row.analysis.riskLevel,
                  summary: row.analysis.summary,
                }
              : null,
          })),
        },
        null,
        2,
      ),
    );
    const evidenceIds = Array.from(
      new Set((text.match(/EVD-\d+/g) || []).concat(local.evidenceIds)),
    );
    return {
      answer: text || local.answer,
      evidenceIds,
      source: "openrouter",
      model,
      available: true,
      disclaimer: "AI wording over stored evidence. Not cryptographic proof.",
    };
  } catch (error) {
    return {
      ...local,
      available: false,
      error: error instanceof Error ? error.message : "OpenRouter copilot failed.",
      disclaimer: "Fell back to local evidence after the model call failed.",
    };
  }
}

// ============================================================
// Executive Evidence Brief — a new AI feature (not a rename of an
// existing one). analyzeChange() reasons about ONE change; this reasons
// across the WHOLE evidence store to answer "what is our overall trust
// posture right now?" Same honesty rules apply: heuristic fallback when
// OpenRouter isn't configured, and the AI is only ever allowed to phrase
// facts that are already in the counted/aggregated data — it is never
// given raw receipt bytes and never asked to judge compliance or safety.
// ============================================================

function riskCounts(records) {
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, unanalyzed: 0 };
  for (const row of records) {
    const level = row.analysis?.riskLevel;
    if (counts[level] !== undefined) counts[level] += 1;
    else counts.unanalyzed += 1;
  }
  return counts;
}

export function heuristicPosture(records) {
  const counts = riskCounts(records);
  const verified = records.filter((r) => r.lastVerifyOk === true).length;
  const failed = records.filter((r) => r.lastVerifyOk === false).length;
  const unverified = records.length - verified - failed;
  const worstRisk = counts.CRITICAL > 0 ? "CRITICAL" : counts.HIGH > 0 ? "HIGH" : counts.MEDIUM > 0 ? "MEDIUM" : counts.LOW > 0 ? "LOW" : null;
  const worst = worstRisk ? records.find((r) => r.analysis?.riskLevel === worstRisk) : null;

  let status = "Stable";
  if (failed > 0) status = "Verification failure on record";
  else if (counts.CRITICAL > 0) status = "Attention needed";
  else if (counts.HIGH > 0) status = "Review recommended";
  else if (!records.length) status = "No evidence yet";

  const parts = [];
  parts.push(
    records.length
      ? `${records.length} sealed change${records.length === 1 ? "" : "s"} on record (${verified} verified, ${failed} failed, ${unverified} not yet checked).`
      : "No configuration changes have been sealed yet.",
  );
  if (worst) {
    parts.push(`Highest current risk: ${worst.displayId} at ${worstRisk} — ${worst.changeSummary}.`);
  }
  if (counts.unanalyzed > 0) {
    parts.push(`${counts.unanalyzed} change${counts.unanalyzed === 1 ? "" : "s"} still unanalyzed.`);
  }

  return {
    status,
    summary: parts.join(" "),
    riskCounts: counts,
    source: "heuristic",
    disclaimer: "Local heuristic summary of stored evidence. Not cryptographic proof and not a compliance judgment.",
  };
}

export async function summarizePosture(records) {
  const fallback = heuristicPosture(records);
  if (!aiConfigured()) {
    return { ...fallback, available: false };
  }
  if (!records.length) {
    return { ...fallback, available: false };
  }

  try {
    const { text, model } = await chatComplete(
      `You are ProofAI's Evidence Copilot writing a short executive brief for a
security/audit console. You are given ONLY aggregate counts and short
per-change summaries already stored locally — never raw receipt bytes.
Write 2-3 sentences, plain prose, no markdown, under 70 words, describing
overall change/evidence posture. Do not claim compliance, safety, or
fairness. Do not invent any evidence ID, number, or fact not given to you.`,
      JSON.stringify(
        {
          totalEvidence: records.length,
          riskCounts: fallback.riskCounts,
          verifiedCount: records.filter((r) => r.lastVerifyOk === true).length,
          failedCount: records.filter((r) => r.lastVerifyOk === false).length,
          recentChanges: records.slice(0, 8).map((r) => ({
            displayId: r.displayId,
            changeSummary: r.changeSummary,
            risk: r.analysis?.riskLevel || "unanalyzed",
            verified: r.lastVerifyOk,
          })),
        },
        null,
        2,
      ),
    );
    return {
      status: fallback.status,
      summary: text.trim(),
      riskCounts: fallback.riskCounts,
      source: "openrouter",
      model,
      available: true,
      disclaimer: "AI-phrased summary of stored evidence only. Not cryptographic proof and not a compliance judgment.",
    };
  } catch (error) {
    return {
      ...fallback,
      available: false,
      error: error instanceof Error ? error.message : "OpenRouter brief failed.",
    };
  }
}
