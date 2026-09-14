import { createServer } from "node:http";
import { readFile, stat as fsStat } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recordConfigChange, verifyReceipt, previewFromEvidence, coolModeLabel } from "./cool.mjs";
import { tamperEvidenceCopy } from "./tamper.mjs";
import {
  findSystem,
  getDashboard,
  getEvidence,
  getRawEvidence,
  getTwin,
  listEvidence,
  normalizeConfig,
  saveAnalysis,
  saveSealedChange,
  saveTamperedCopy,
  saveVerifyResult,
  upsertSystem,
} from "./store.mjs";
import { analyzeChange, answerCopilot, summarizePosture, aiConfigured } from "./intelligence.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const DIST_DIR = join(ROOT, "client", "dist");
const PORT = Number(process.env.PORT || 8787);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body)
    ? body
    : typeof body === "string"
      ? body
      : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": headers["content-type"] || "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function notFound(res) {
  send(res, 404, { error: "Not found." });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleApi(req, res, url) {
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/health") {
    return send(res, 200, {
      ok: true,
      product: "ProofAI",
      cool: "cool-nwc",
      mode: coolModeLabel(),
      aiProvider: "openrouter",
      ai: aiConfigured(),
    });
  }

  if (req.method === "GET" && path === "/api/dashboard") {
    return send(res, 200, await getDashboard());
  }

  if (req.method === "GET" && path === "/api/evidence") {
    return send(res, 200, await listEvidence());
  }

  if (req.method === "GET" && path === "/api/twin") {
    return send(res, 200, await getTwin());
  }

  if (req.method === "POST" && path === "/api/copilot") {
    const body = await readJson(req);
    const question = String(body.question || "").trim();
    if (!question) return send(res, 400, { error: "Question is required." });
    const records = await listEvidence();
    const result = await answerCopilot(question, records);
    return send(res, 200, result);
  }

  if (req.method === "GET" && path === "/api/intelligence/brief") {
    const records = await listEvidence();
    const result = await summarizePosture(records);
    return send(res, 200, result);
  }

  if (req.method === "GET" && path.startsWith("/api/evidence/")) {
    const displayId = decodeURIComponent(path.slice("/api/evidence/".length));
    const record = await getEvidence(displayId);
    if (!record) return send(res, 404, { error: "Evidence record not found." });
    return send(res, 200, record);
  }

  if (req.method === "POST" && path === "/api/systems") {
    const body = await readJson(req);
    if (!body.id || !body.name) {
      return send(res, 400, { error: "System id and name are required." });
    }
    const system = await upsertSystem({
      id: String(body.id).trim(),
      name: String(body.name).trim(),
      config: body.config,
    });
    return send(res, 200, system);
  }

  if (req.method === "POST" && path === "/api/changes") {
    const body = await readJson(req);
    const systemId = String(body.systemId || "customer-support");
    const system = await findSystem(systemId);
    if (!system) return send(res, 404, { error: "AI system not found." });

    const after = normalizeConfig({
      ...system.config,
      ...body.after,
      model: String(body.after?.model || "").trim(),
      promptVersion: String(body.after?.promptVersion || "").trim(),
      policy: String(body.after?.policy || "").trim(),
    });
    if (!after.model || !after.promptVersion || !after.policy) {
      return send(res, 400, { error: "After configuration cannot have empty fields." });
    }

    const before = normalizeConfig(system.config);
    if (
      before.model === after.model &&
      before.promptVersion === after.promptVersion &&
      before.policy === after.policy &&
      before.deployment === after.deployment &&
      JSON.stringify(before.tools) === JSON.stringify(after.tools)
    ) {
      return send(res, 400, { error: "No configuration change detected." });
    }

    const changeType = String(body.changeType || "configuration-update").trim();
    const actor = String(body.actor || "demo-user").trim() || "demo-user";

    const sealed = await recordConfigChange({
      aiSystem: system.name,
      aiSystemId: system.id,
      changeType,
      before,
      after,
      actor,
    });

    const record = await saveSealedChange({
      system,
      before,
      after,
      changeType,
      actor,
      sealed,
      receiptPreview: previewFromEvidence(sealed.evidence),
    });

    return send(res, 201, record);
  }

  if (req.method === "POST" && path.endsWith("/verify")) {
    const displayId = decodeURIComponent(path.replace("/api/evidence/", "").replace("/verify", ""));
    const body = await readJson(req);
    const which = body.which === "tampered" ? "tampered" : "original";
    const payload = await getRawEvidence(displayId, which);
    if (payload == null) {
      const message =
        which === "tampered"
          ? "No tampered copy exists yet. Run Tamper Test first."
          : "Evidence record not found.";
      return send(res, 404, { error: message });
    }
    const verdict = await verifyReceipt(payload);
    const record = await saveVerifyResult(displayId, which, verdict.ok);
    return send(res, 200, { record, verdict, which });
  }

  if (req.method === "POST" && path.endsWith("/analyze")) {
    const displayId = decodeURIComponent(path.replace("/api/evidence/", "").replace("/analyze", ""));
    const record = await getEvidence(displayId);
    if (!record) return send(res, 404, { error: "Evidence record not found." });
    const analysis = await analyzeChange(record);
    const saved = await saveAnalysis(displayId, analysis);
    return send(res, 200, { record: saved, analysis });
  }

  if (req.method === "POST" && path.endsWith("/tamper")) {
    const displayId = decodeURIComponent(path.replace("/api/evidence/", "").replace("/tamper", ""));
    const original = await getRawEvidence(displayId, "original");
    if (!original) return send(res, 404, { error: "Evidence record not found." });
    const tampered = tamperEvidenceCopy(original);
    const record = await saveTamperedCopy(displayId, tampered);
    return send(res, 200, {
      record,
      note: "Created a modified copy of the CooL receipt (metadata_hash last character flipped). The original sealed evidence is unchanged.",
    });
  }

  return notFound(res);
}

function staticRoot() {
  if (existsSync(join(DIST_DIR, "index.html"))) return DIST_DIR;
  return PUBLIC_DIR;
}

async function serveStatic(req, res, url) {
  const root = staticRoot();
  let filePath = join(root, url.pathname === "/" ? "index.html" : url.pathname);
  if (!existsSync(filePath) || extname(filePath) === "") {
    filePath = join(root, "index.html");
  }
  const contentType = MIME[extname(filePath)] || "application/octet-stream";
  const cacheControl = extname(filePath) === ".html" ? "no-store" : "no-cache";

  try {
    const stat = await fsStat(filePath);
    const range = req.headers.range;

    // Stream with HTTP range support for large media (the cinematic video),
    // so the browser can start playback without downloading the full file
    // and can seek. Plain files fall through to a normal full response.
    if (range && stat.size) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : stat.size - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "accept-ranges": "bytes",
        "content-length": chunkSize,
        "content-type": contentType,
        "cache-control": cacheControl,
      });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    const data = await readFile(filePath);
    send(res, 200, data, {
      "content-type": contentType,
      "cache-control": cacheControl,
      "accept-ranges": "bytes",
    });
  } catch {
    notFound(res);
  }
}

export function createProofAiServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }
      await serveStatic(req, res, url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal error.";
      send(res, 500, { error: message });
    }
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const server = createProofAiServer();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`ProofAI listening on http://localhost:${PORT}`);
    console.log(`CooL mode: ${coolModeLabel()}`);
  });
}
