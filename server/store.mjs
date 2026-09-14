import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = resolve(here, "../data/store.json");
const STORE_PATH = resolve(process.env.PROOFAI_STORE || DEFAULT_PATH);

export const DEFAULT_TOOLS = ["ticket-search", "knowledge-base", "escalation"];
export const DEFAULT_DEPLOYMENT = "prod-eu-1";

export function normalizeConfig(config = {}) {
  return {
    model: config.model || "Model-A",
    promptVersion: config.promptVersion || "v12",
    policy: config.policy || "Strict",
    tools: Array.isArray(config.tools) && config.tools.length ? config.tools.map(String) : [...DEFAULT_TOOLS],
    deployment: config.deployment || DEFAULT_DEPLOYMENT,
  };
}

const DEFAULT_SYSTEM = {
  id: "customer-support",
  name: "Customer Support AI",
  changeTypeDefault: "model-and-policy",
  config: normalizeConfig({
    model: "Model-A",
    promptVersion: "v12",
    policy: "Strict",
  }),
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function emptyState() {
  return {
    systems: [structuredClone(DEFAULT_SYSTEM)],
    evidence: [],
    nextEvidenceNumber: 1,
  };
}

let cache = null;

async function load() {
  if (cache) return cache;
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    cache = JSON.parse(raw);
    if (!Array.isArray(cache.systems) || cache.systems.length === 0) {
      cache.systems = [structuredClone(DEFAULT_SYSTEM)];
    }
    if (!Array.isArray(cache.evidence)) cache.evidence = [];
    if (!Number.isInteger(cache.nextEvidenceNumber)) cache.nextEvidenceNumber = 1;
  } catch {
    cache = emptyState();
    await persist();
  }
  return cache;
}

async function persist() {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(cache, null, 2));
}

export async function resetStore() {
  cache = emptyState();
  await persist();
  return cache;
}

function publicRecord(row) {
  return {
    displayId: row.displayId,
    coolRecordId: row.coolRecordId,
    executionId: row.executionId,
    digest: row.digest,
    aiSystemId: row.aiSystemId,
    aiSystemName: row.aiSystemName,
    changeType: row.changeType,
    actor: row.actor,
    changeSummary: row.changeSummary,
    before: row.before,
    after: row.after,
    issuedAt: row.issuedAt,
    hasTamperedCopy: Boolean(row.tamperedEvidence),
    lastVerifyOk: row.lastVerifyOk,
    lastVerifyAt: row.lastVerifyAt,
    lastVerifyTarget: row.lastVerifyTarget,
    receiptPreview: row.receiptPreview,
    analysis: row.analysis || null,
  };
}

export async function getDashboard() {
  const state = await load();
  return {
    systems: state.systems,
    evidenceCount: state.evidence.length,
    recent: state.evidence
      .slice()
      .reverse()
      .slice(0, 6)
      .map(publicRecord),
    coolMode: process.env.COOL_DSTACK_ENDPOINT ? "dstack" : "simulated",
    aiConfigured: Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()),
    riskCounts: riskCounts(state.evidence),
  };
}

function riskCounts(rows) {
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, unanalyzed: 0 };
  for (const row of rows) {
    const level = row.analysis?.riskLevel;
    if (counts[level] !== undefined) counts[level] += 1;
    else counts.unanalyzed += 1;
  }
  return counts;
}

export async function listEvidence() {
  const state = await load();
  return state.evidence.slice().reverse().map(publicRecord);
}

export async function getEvidence(displayId) {
  const state = await load();
  const row = state.evidence.find((item) => item.displayId === displayId);
  return row ? publicRecord(row) : null;
}

export async function getRawEvidence(displayId, which) {
  const state = await load();
  const row = state.evidence.find((item) => item.displayId === displayId);
  if (!row) return null;
  return which === "tampered" ? row.tamperedEvidence : row.evidence;
}

export async function upsertSystem({ id, name, config }) {
  const state = await load();
  const existing = state.systems.find((s) => s.id === id);
  if (existing) {
    existing.name = name || existing.name;
    if (config) existing.config = normalizeConfig(config);
    existing.updatedAt = new Date().toISOString();
  } else {
    state.systems.push({
      id,
      name: name || id,
      config: normalizeConfig(config),
      updatedAt: new Date().toISOString(),
    });
  }
  await persist();
  return state.systems.find((s) => s.id === id);
}

export async function saveSealedChange({
  system,
  before,
  after,
  changeType,
  actor,
  sealed,
  receiptPreview,
}) {
  const state = await load();
  const displayId = `EVD-${String(state.nextEvidenceNumber).padStart(3, "0")}`;
  state.nextEvidenceNumber += 1;

  const issuedAt =
    sealed?.evidence?.record?.time?.issued_at || new Date().toISOString();

  const row = {
    displayId,
    coolRecordId: sealed.recordId,
    executionId: sealed.executionId,
    digest: String(sealed.digest),
    aiSystemId: system.id,
    aiSystemName: system.name,
    changeType,
    actor,
    changeSummary: `${before.model} / ${before.promptVersion} / ${before.policy} → ${after.model} / ${after.promptVersion} / ${after.policy}`,
    before,
    after,
    issuedAt,
    evidence: sealed.evidence,
    tamperedEvidence: null,
    lastVerifyOk: null,
    lastVerifyAt: null,
    lastVerifyTarget: null,
    receiptPreview,
    analysis: null,
    createdAt: new Date().toISOString(),
  };

  state.evidence.push(row);

  const live = state.systems.find((s) => s.id === system.id);
  if (live) {
    live.config = normalizeConfig(after);
    live.updatedAt = issuedAt;
  }

  await persist();
  return publicRecord(row);
}

export async function saveTamperedCopy(displayId, tampered) {
  const state = await load();
  const row = state.evidence.find((item) => item.displayId === displayId);
  if (!row) throw new Error("Evidence record not found.");
  row.tamperedEvidence = tampered;
  await persist();
  return publicRecord(row);
}

export async function saveVerifyResult(displayId, which, ok) {
  const state = await load();
  const row = state.evidence.find((item) => item.displayId === displayId);
  if (!row) throw new Error("Evidence record not found.");
  if (which === "original") {
    row.lastVerifyOk = ok;
    row.lastVerifyAt = new Date().toISOString();
    row.lastVerifyTarget = "original";
  } else {
    row.lastVerifyTarget = "tampered";
  }
  await persist();
  return publicRecord(row);
}

export async function findSystem(id) {
  const state = await load();
  return state.systems.find((s) => s.id === id) || null;
}

export async function saveAnalysis(displayId, analysis) {
  const state = await load();
  const row = state.evidence.find((item) => item.displayId === displayId);
  if (!row) throw new Error("Evidence record not found.");
  row.analysis = analysis;
  await persist();
  return publicRecord(row);
}

export async function getTwin() {
  const state = await load();
  const system = state.systems[0];
  const latest = state.evidence.slice().reverse()[0] || null;
  const previous = latest?.before || system.config;
  const current = system.config;
  const nodeKinds = [
    { id: "model", label: "Model", current: current.model, previous: previous.model },
    { id: "prompt", label: "Prompt", current: current.promptVersion, previous: previous.promptVersion },
    { id: "policy", label: "Policy", current: current.policy, previous: previous.policy },
    {
      id: "tools",
      label: "Tools",
      current: (current.tools || []).join(", "),
      previous: (previous.tools || []).join(", "),
    },
    { id: "deployment", label: "Deployment", current: current.deployment, previous: previous.deployment },
  ];

  return {
    system,
    latest: latest ? publicRecord(latest) : null,
    nodes: [
      {
        id: "system",
        label: system.name,
        kind: "system",
        current: system.name,
        previous: system.name,
        changed: false,
        evidenceId: latest?.displayId || null,
        timestamp: latest?.issuedAt || system.updatedAt,
        verification:
          latest?.lastVerifyOk === true ? "verified" : latest?.lastVerifyOk === false ? "failed" : "sealed",
        risk: latest?.analysis?.riskLevel || null,
        analysis: latest?.analysis || null,
      },
      ...nodeKinds.map((node) => ({
        ...node,
        kind: node.id,
        changed: String(node.current) !== String(node.previous),
        evidenceId: latest?.displayId || null,
        timestamp: latest?.issuedAt || system.updatedAt,
        verification:
          latest?.lastVerifyOk === true ? "verified" : latest?.lastVerifyOk === false ? "failed" : latest ? "sealed" : "none",
        risk: latest?.analysis?.riskLevel || null,
        analysis: latest?.analysis || null,
      })),
    ],
  };
}

export function storePath() {
  return STORE_PATH;
}
