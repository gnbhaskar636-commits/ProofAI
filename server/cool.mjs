import { CooL, formatVerdict, verifyEvidence } from "cool-nwc";

const APPLICATION_ID = process.env.COOL_APPLICATION_ID || "proofai";
const DSTACK_ENDPOINT = process.env.COOL_DSTACK_ENDPOINT || "";

let instance = null;

export function getCoolOptions() {
  const options = { applicationId: APPLICATION_ID };
  if (DSTACK_ENDPOINT) {
    options.attestation = { provider: "dstack", endpoint: DSTACK_ENDPOINT };
  } else {
    options.attestation = { provider: "local" };
  }
  return options;
}

export function getCool() {
  if (!instance) {
    instance = new CooL(getCoolOptions());
  }
  return instance;
}

export function coolModeLabel() {
  return DSTACK_ENDPOINT ? "dstack" : "simulated";
}

export async function recordConfigChange({
  aiSystem,
  aiSystemId,
  changeType,
  before,
  after,
  actor,
}) {
  const cool = getCool();
  const metadata = {
    eventType: "config.change",
    application: APPLICATION_ID,
    aiSystem,
    aiSystemId,
    changeType,
    before,
    after,
    actor,
  };

  const result = await cool.record({
    type: "config.change",
    metadata,
    software: { name: "proofai", version: "1.0.0", digest: null },
  });

  return result;
}

export function summarizeVerdict(verdict) {
  const checks = [];
  const raw = verdict?.checks ?? {};
  for (const [domain, check] of Object.entries(raw)) {
    checks.push({
      domain,
      status: String(check?.status ?? "absent"),
      detail: String(check?.detail ?? ""),
    });
  }

  const subject = verdict?.subject ?? null;

  return {
    ok: Boolean(verdict?.ok),
    reasons: Array.isArray(verdict?.reasons) ? verdict.reasons.map(String) : [],
    checks,
    formatted: formatVerdict(verdict),
    subjectType: subject?.kind ?? null,
    recordId: subject?.record_id ?? null,
    runtime: subject?.tee
      ? `${subject.tee.vendor ?? "unknown"} · ${subject.tee.mode ?? "unknown"}`
      : null,
  };
}

export async function verifyReceipt(evidence) {
  try {
    const verdict = await verifyEvidence(evidence);
    return summarizeVerdict(verdict);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed.";
    return {
      ok: false,
      reasons: [message],
      checks: [],
      formatted: `Verification error: ${message}`,
      subjectType: null,
      recordId: null,
      runtime: null,
    };
  }
}

export function previewFromEvidence(evidence) {
  const record = evidence?.record;
  const inclusion = evidence?.inclusion;
  return {
    schema: typeof evidence?.schema === "string" ? evidence.schema : null,
    bindingHash: typeof evidence?.binding_hash === "string" ? evidence.binding_hash : null,
    signatureAlg: record?.signature?.alg ?? null,
    runtimeMode: record?.runtime?.mode ?? null,
    runtimeVendor: record?.runtime?.tee_vendor ?? null,
    metadataHash: record?.event?.metadata_hash ?? null,
    eventType: record?.event?.type ?? null,
    applicationId: record?.event?.application_id ?? null,
    leafIndex: inclusion?.leaf_index ?? null,
    treeSize: inclusion?.tree_size ?? null,
  };
}
