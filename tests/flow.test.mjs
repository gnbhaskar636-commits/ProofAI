import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CooL, verifyEvidence } from "cool-nwc";
import { tamperEvidenceCopy } from "../server/tamper.mjs";

test("1-7 critical flow: create, record, store, verify, tamper copy, fail, original remains valid", async () => {
  const cool = new CooL({
    applicationId: "proofai-test",
    attestation: { provider: "local" },
  });

  const before = { model: "Model-A", promptVersion: "v12", policy: "Strict" };
  const after = { model: "Model-B", promptVersion: "v13", policy: "Strict+" };

  const sealed = await cool.record({
    type: "config.change",
    metadata: {
      eventType: "config.change",
      application: "proofai",
      aiSystem: "Customer Support AI",
      changeType: "model-and-policy",
      before,
      after,
      actor: "demo-user",
    },
    software: { name: "proofai", version: "1.0.0", digest: null },
  });

  assert.ok(sealed.recordId, "1. change produces a CooL recordId");
  assert.ok(sealed.evidence, "2. CooL returns evidence");
  assert.ok(sealed.digest, "2. CooL returns a binding digest");
  assert.equal(sealed.evidence.schema, "cool.receipt.v2");

  const store = new Map();
  store.set(sealed.recordId, structuredClone(sealed.evidence));
  const stored = store.get(sealed.recordId);
  assert.ok(stored, "3. evidence is stored");

  const good = await verifyEvidence(stored);
  assert.equal(good.ok, true, "4. valid evidence verifies");

  const tampered = tamperEvidenceCopy(stored);
  const originalHash = stored.record.event.metadata_hash;
  const tamperedHash = tampered.record.event.metadata_hash;
  assert.notEqual(tamperedHash, originalHash, "5. copy is modified");
  assert.equal(
    store.get(sealed.recordId).record.event.metadata_hash,
    originalHash,
    "5. original store entry is unchanged",
  );

  const bad = await verifyEvidence(tampered);
  assert.equal(bad.ok, false, "6. tampered copy fails verification");

  const stillGood = await verifyEvidence(store.get(sealed.recordId));
  assert.equal(stillGood.ok, true, "7. original evidence remains valid");

  await cool.close();
});

test("tamper helper never mutates the input object", () => {
  const evidence = {
    record: { event: { metadata_hash: "mh:sha256:abc0" } },
  };
  const copy = tamperEvidenceCopy(evidence);
  assert.equal(evidence.record.event.metadata_hash, "mh:sha256:abc0");
  assert.equal(copy.record.event.metadata_hash, "mh:sha256:abc1");
});

test("store persists original and tampered copy separately", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "proofai-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  process.env.PROOFAI_STORE = join(dir, "store.json");

  const store = await import(`${new URL("../server/store.mjs", import.meta.url).href}?t=${Date.now()}`);
  await store.resetStore();
  const dash = await store.getDashboard();
  assert.equal(dash.systems[0].name, "Customer Support AI");

  const sealed = {
    recordId: "01TESTRECORD",
    executionId: "01TESTEXEC",
    digest: "mh:sha256:deadbeef",
    evidence: {
      schema: "cool.receipt.v2",
      binding_hash: "mh:sha256:deadbeef",
      record: {
        time: { issued_at: "2026-09-12T00:00:00.000Z" },
        event: { metadata_hash: "mh:sha256:abc0", type: "config.change" },
        runtime: { mode: "simulated", tee_vendor: "intel-tdx" },
        signature: { alg: "ml-dsa-65+ed25519" },
      },
      inclusion: { leaf_index: 0, tree_size: 1 },
    },
  };

  const saved = await store.saveSealedChange({
    system: dash.systems[0],
    before: dash.systems[0].config,
    after: { model: "Model-B", promptVersion: "v13", policy: "Strict+" },
    changeType: "model-and-policy",
    actor: "demo-user",
    sealed,
    receiptPreview: { schema: "cool.receipt.v2" },
  });

  assert.equal(saved.displayId, "EVD-001");
  const raw = await store.getRawEvidence("EVD-001", "original");
  assert.equal(raw.schema, "cool.receipt.v2");

  const tampered = tamperEvidenceCopy(raw);
  await store.saveTamperedCopy("EVD-001", tampered);
  const copy = await store.getRawEvidence("EVD-001", "tampered");
  const original = await store.getRawEvidence("EVD-001", "original");
  assert.notEqual(copy.record.event.metadata_hash, original.record.event.metadata_hash);
});
