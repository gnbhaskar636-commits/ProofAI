# ProofAI Intelligence MVP — build status

## Status
COMPLETE upgrade of the existing MVP. CooL seal / verify / tamper path preserved.

## Implemented
- Existing CooL record + verifyEvidence + tamper-copy flow
- Analyze Change (OpenRouter — any hosted model — when keyed; heuristic fallback otherwise)
- Executive Evidence Brief (store-wide posture summary; OpenRouter or heuristic)
- 3D AI System Twin (Three.js, live store data)
- Evidence Copilot (local retrieval first, optional OpenRouter wording)
- Console sections: Overview, Twin, Evidence, Risk Intelligence, Audit History, Copilot

## CooL
Unchanged: `cool-nwc` `CooL.record()` and `verifyEvidence()`. No fake verification.

## Tests
`npm test` covers CooL flow, HTTP demo, heuristic/no-key AI behavior, copilot non-fabrication, twin payload.

## Run
```
npm install
npm start
```
http://localhost:8787

## Production
No frontend compile required (`public/` is the UI).
`npm start`

## Changelog — 3D twin material fix + Evidence Confidence Timeline
- `public/twin.js`: removed the transmissive "glass containment shell" (it
  rendered hazy without a real environment map). Added a procedural studio
  environment via `THREE.PMREMGenerator` + `RoomEnvironment` so the
  clearcoat/metal node materials get real reflections. Restored a punchy
  solid "plastic" look on the nodes (clearcoat 1, low roughness, envMapIntensity
  1.35) instead of the hazy transmission look. ACES tone mapping added for
  contrast. No change to node data, layout, raycasting, or the panel UI.
- `public/index.html`: added a `three/addons/` importmap entry (same
  three@0.170.0 CDN version, `examples/jsm/`) so `RoomEnvironment` resolves.
- `public/app.js` + `public/styles.css`: added the **Evidence Confidence
  Timeline** on the receipt page — a step-by-step provenance chain (sealed →
  analyzed → verified → tamper copy created → tamper copy checked → original
  still verified). Every step is derived from persisted record fields or a
  real API response already returned this session; nothing is simulated.
- Re-ran `npm test` after each change: still 7/7 passing.

## Changelog — OpenRouter migration + Executive Brief + video/design polish
- `server/intelligence.mjs`: replaced the OpenAI-only Responses API call with
  a plain `fetch` to OpenRouter's Chat Completions endpoint
  (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, default `openai/gpt-4o-mini`).
  No SDK dependency needed — works with any model OpenRouter hosts. The
  `openai` npm dependency was removed since nothing imports it anymore.
- New feature — **Executive Evidence Brief** (`summarizePosture()` +
  `GET /api/intelligence/brief`, shown on Overview): summarizes trust
  posture across the *whole* evidence store (counts, verification state,
  highest current risk), distinct from Analyze Change which reasons about
  one change at a time. Heuristic fallback when no key is set; the model
  is only ever given aggregate counts and short summaries already computed
  locally, never raw receipt bytes, and is explicitly told not to make
  compliance/safety claims.
- `public/assets/twin-cinematic.mp4`: re-encoded (same 640×360, same 20s,
  `faststart` for immediate playback, muted audio track dropped since it
  was never audible). 18.6MB → ~0.9MB — makes the background autoplay
  reliably instead of waiting on a large download.
- Renamed `OPENAI_API_KEY`/`openaiConfigured` to `OPENROUTER_API_KEY`/
  `aiConfigured` consistently across `server/store.mjs`, `server/index.mjs`,
  `public/app.js`, `.env.example`, `README.md`, `ARCHITECTURE.md`, and the
  test suite (`tests/intelligence.test.mjs`, `tests/http.test.mjs`), with
  2 new tests covering the brief's heuristic fallback.
- Re-ran `npm test` after each change: 9/9 passing (7 previous + 2 new).

## Limitations
- OpenRouter features require `OPENROUTER_API_KEY`. Without it, analysis/copilot/brief use labeled local fallbacks.
- Three.js is loaded from a CDN.
- Simulator mode unless dstack is configured.
- Does not claim EU AI Act compliance or model safety.
