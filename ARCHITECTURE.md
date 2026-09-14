# ProofAI architecture

ProofAI is an evidence intelligence layer for AI configuration changes.

```
Operator
   ↓
ProofAI console (Overview, Twin, Evidence, Risk, History, Copilot)
   ↓
Node API
   ├── CooL SDK (cool-nwc)     → cryptographic receipt + verifyEvidence
   ├── OpenRouter (any model)  → optional change analysis + copilot + brief wording
   └── Local JSON store        → systems, receipts, analyses, tampered copies
```

## Trust boundaries

- **Cryptographic proof** comes only from CooL `record()` / `verifyEvidence()`.
- **Risk ratings and copilot answers** are analysis. They are stored beside the receipt and labeled as analysis.
- OpenRouter never receives raw CooL receipt bytes. It receives structured before/after fields, IDs, and verification flags, or (for the executive brief) aggregate counts and short change summaries.
- `OPENROUTER_API_KEY` is read on the server only.

## CooL path (unchanged)

`new CooL({ applicationId, attestation })`
`cool.record({ type: "config.change", metadata, software })`
`verifyEvidence(evidence)`

Tamper demo copies the receipt and flips `record.event.metadata_hash`. The original row is not overwritten.

## Intelligence path

`POST /api/evidence/:id/analyze` → OpenRouter (Chat Completions) when a key is present, otherwise a local heuristic labeled as such.

`POST /api/copilot` → selects stored records first, then optionally asks OpenRouter to phrase an answer. Missing IDs are not invented.

`GET /api/intelligence/brief` → summarizes overall evidence posture across every stored record (counts, verification state, highest current risk). Same trust rule as above: OpenRouter only rephrases aggregates already computed locally, never raw evidence.

## System twin

`GET /api/twin` projects the live system plus the latest sealed change into nodes: system, model, prompt, policy, tools, deployment. The browser renders that graph with Three.js.
