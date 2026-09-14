import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aiConfigured,
  analyzeChange,
  answerCopilot,
  heuristicAnalysis,
  heuristicPosture,
  selectRecordsForCopilot,
  summarizePosture,
} from "../server/intelligence.mjs";

test("heuristic analysis labels model+prompt change as MEDIUM", () => {
  const analysis = heuristicAnalysis({
    displayId: "EVD-002",
    aiSystemName: "Customer Support AI",
    before: { model: "Model-B", promptVersion: "v13", policy: "Strict+" },
    after: { model: "Model-C", promptVersion: "v14", policy: "Strict+" },
  });
  assert.equal(analysis.riskLevel, "MEDIUM");
  assert.match(analysis.summary, /Model-C/);
  assert.equal(analysis.source, "heuristic");
});

test("analyzeChange falls back when OPENROUTER_API_KEY is missing", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  assert.equal(aiConfigured(), false);
  const result = await analyzeChange({
    displayId: "EVD-001",
    aiSystemName: "Customer Support AI",
    before: { model: "Model-A", promptVersion: "v12", policy: "Strict" },
    after: { model: "Model-B", promptVersion: "v13", policy: "Strict+" },
  });
  assert.equal(result.available, false);
  assert.equal(result.source, "heuristic");
  assert.ok(result.disclaimer.includes("not cryptographic proof"));
  if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous;
});

test("copilot does not invent missing evidence IDs", async () => {
  delete process.env.OPENROUTER_API_KEY;
  const records = [
    {
      displayId: "EVD-001",
      aiSystemName: "Customer Support AI",
      changeSummary: "Model-A / v12 / Strict → Model-B / v13 / Strict+",
      before: { model: "Model-A" },
      after: { model: "Model-B" },
      lastVerifyOk: true,
      analysis: { riskLevel: "MEDIUM", summary: "model changed" },
    },
  ];
  const missing = await answerCopilot("Why was EVD-999 medium risk?", records);
  assert.match(missing.answer, /not in the local store/i);
  assert.deepEqual(missing.evidenceIds, []);

  const latest = await answerCopilot("What changed in the latest deployment?", records);
  assert.ok(latest.evidenceIds.includes("EVD-001"));
  assert.match(latest.answer, /EVD-001/);

  const selected = selectRecordsForCopilot(records, "Show all unverified evidence");
  assert.equal(selected.length, 0);
});

test("heuristicPosture summarizes overall evidence posture without fabrication", () => {
  const records = [
    { displayId: "EVD-001", changeSummary: "model changed", lastVerifyOk: true, analysis: { riskLevel: "LOW" } },
    { displayId: "EVD-002", changeSummary: "policy weakened", lastVerifyOk: null, analysis: { riskLevel: "CRITICAL" } },
  ];
  const posture = heuristicPosture(records);
  assert.equal(posture.status, "Attention needed");
  assert.equal(posture.source, "heuristic");
  assert.match(posture.summary, /EVD-002/);
  assert.equal(posture.riskCounts.CRITICAL, 1);

  assert.equal(heuristicPosture([]).status, "No evidence yet");
});

test("summarizePosture falls back to heuristic when OPENROUTER_API_KEY is missing", async () => {
  delete process.env.OPENROUTER_API_KEY;
  const records = [
    { displayId: "EVD-001", changeSummary: "model changed", lastVerifyOk: true, analysis: { riskLevel: "LOW" } },
  ];
  const result = await summarizePosture(records);
  assert.equal(result.available, false);
  assert.equal(result.source, "heuristic");
});
