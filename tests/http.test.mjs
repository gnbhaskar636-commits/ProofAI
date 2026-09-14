import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("HTTP demo flow: seal, verify, tamper copy, fail, original still verifies", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "proofai-http-"));
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  process.env.PROOFAI_STORE = join(dir, "store.json");
  process.env.PORT = "0";

  const { createProofAiServer } = await import(`../server/index.mjs?http=${Date.now()}`);
  const server = createProofAiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const json = async (path, options) => {
    const res = await fetch(`${base}${path}`, options);
    const body = await res.json();
    return { res, body };
  };

  const health = await json("/api/health");
  assert.equal(health.body.ok, true);
  assert.equal(health.body.cool, "cool-nwc");

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /ProofAI/);

  const created = await json("/api/changes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemId: "customer-support",
      changeType: "model-and-policy",
      after: { model: "Model-B", promptVersion: "v13", policy: "Strict+" },
      actor: "demo-user",
    }),
  });
  assert.equal(created.res.status, 201);
  assert.equal(created.body.displayId, "EVD-001");
  assert.equal(created.body.before.model, "Model-A");
  assert.equal(created.body.after.model, "Model-B");
  assert.ok(created.body.coolRecordId);

  const verified = await json(`/api/evidence/${created.body.displayId}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ which: "original" }),
  });
  assert.equal(verified.body.verdict.ok, true, "valid evidence verifies");

  const tampered = await json(`/api/evidence/${created.body.displayId}/tamper`, {
    method: "POST",
  });
  assert.equal(tampered.body.record.hasTamperedCopy, true);

  const failed = await json(`/api/evidence/${created.body.displayId}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ which: "tampered" }),
  });
  assert.equal(failed.body.verdict.ok, false, "tampered copy fails");

  const again = await json(`/api/evidence/${created.body.displayId}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ which: "original" }),
  });
  assert.equal(again.body.verdict.ok, true, "original still verifies");

  const history = await json("/api/evidence");
  assert.equal(history.body.length, 1);
  assert.equal(history.body[0].displayId, "EVD-001");

  delete process.env.OPENROUTER_API_KEY;
  const analyzed = await json(`/api/evidence/${created.body.displayId}/analyze`, { method: "POST" });
  assert.equal(analyzed.res.status, 200);
  assert.equal(analyzed.body.analysis.source, "heuristic");
  assert.equal(analyzed.body.record.analysis.riskLevel, analyzed.body.analysis.riskLevel);

  const copilot = await json("/api/copilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "What changed in the latest deployment?" }),
  });
  assert.equal(copilot.res.status, 200);
  assert.ok(copilot.body.evidenceIds.includes("EVD-001"));
  assert.match(copilot.body.answer, /EVD-001/);

  const brief = await json("/api/intelligence/brief");
  assert.equal(brief.res.status, 200);
  assert.equal(brief.body.source, "heuristic");
  assert.match(brief.body.summary, /EVD-001|sealed change/);

  const twin = await json("/api/twin");
  assert.equal(twin.body.system.name, "Customer Support AI");
  assert.ok(twin.body.nodes.some((node) => node.id === "model"));
});
