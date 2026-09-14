# ProofAI — Phase 1 Inspection

## What was found

The uploaded workspace ZIP is a Grok App Builder / TanStack Start scaffold with an incomplete ProofAI overlay, plus a partial copy of the CooL SDK.

### 1. Original CooL SDK

- Location: `artifacts/cool-sdk-main/`
- Package name: **`cool-nwc`**
- Version: **`3.0.0`**
- Description: Cryptographic Observability & On-chain Ledger

The uploaded source tree is **not complete**. It includes `src/client.ts`, `src/index.ts`, CLI files, docs, and examples, but is missing modules that `client.ts` imports (`./phala/client`, `./verify`, `./sign`, `./types`). Runtime use therefore depends on the published npm package `cool-nwc@3.0.0`, which ships a built `dist/` and matches the documented API.

### 2. Actual public APIs (from SDK README, getting-started, and `src/index.ts` / `src/client.ts`)

```ts
import { CooL, verifyEvidence, formatVerdict } from "cool-nwc";

const cool = new CooL({
  applicationId: "proofai",
  attestation: { provider: "local" }, // built-in simulator
});

const { evidence, recordId, executionId, digest } = await cool.record({
  type: "config.change",
  metadata: { /* app-defined object, salted-committed */ },
  software: { name: "proofai", version: "0.1.0", digest: null },
});

const verdict = await verifyEvidence(evidence);
// verdict.ok, verdict.checks.{binding,signature,inclusion,attestation,...}, verdict.reasons
```

`new CooL()` does no I/O. First `record()` connects the evidence plane.

### 3. How `record()` works

- Requires non-empty `type`.
- Metadata and optional `payloads` are committed as salted hashes (`metadata_hash` / `mh:sha256:…`) and discarded from the receipt.
- Returns `EvidenceResult`: `{ evidence, recordId, executionId, digest }`.
- `evidence` is a `cool.receipt.v2` envelope wrapping `cool.evidence.v1`.
- Signatures: hybrid `ml-dsa-65+ed25519`.
- Includes RFC 6962 inclusion proof + signed tree head.

### 4. How `verifyEvidence()` works

- Offline. Trusts the receipt bytes + embedded key directory.
- Checks multiple domains (binding, signature, inclusion, attestation, enclave, …).
- Returns a verdict object, not a bare boolean.
- In simulator mode, attestation/enclave domains are labelled `simulated`, never `pass`.
- Binding + signature checks are real cryptography even in simulator mode.

### 5. Receipt / evidence format

`cool.receipt.v2` with fields including:

- `record.record_id` (ULID)
- `record.time.issued_at`
- `record.event.type`, `application_id`, `metadata_hash`, `metadata_salt`, `software`
- `record.runtime.mode` (`simulated` | `hardware`)
- `record.signature`
- `binding_hash`
- `inclusion`, `sth`, `attestation`, `key_directory`

Plaintext config values are **not** stored inside the receipt. ProofAI therefore stores the human-readable before/after next to the receipt for the product UI, while cryptographic validity comes only from CooL.

### 6. Environment variables

| Variable | Role |
|---|---|
| `COOL_APPLICATION_ID` | Stamped on receipts. Default `proofai`. |
| `COOL_DSTACK_ENDPOINT` | Optional Phala dstack endpoint. Unset → simulator. |
| `COOL_IMAGE_DIGEST` | Optional image digest recorded by the plane. |
| `PORT` | ProofAI HTTP port (new app). |

### 7. Examples / documentation (SDK)

- `docs/getting-started.md`, `docs/evidence-format.md`, `docs/verification.md`
- `HACKATHON.md` — official demo is record → verify → flip last hex of `metadata_hash` → verify fails
- `examples/basic`, `examples/verification`, `examples/express`

Official tamper method: flip one hex digit of `record.event.metadata_hash`. Original must never be overwritten.

### 8. Existing ProofAI source

Present under workspace `src/`:

- `src/lib/cool.server.ts` — real `CooL` + `verifyEvidence` wrapper (usable idea)
- `src/lib/evidence-impl.server.ts` — PGLite/Postgres persistence
- `src/lib/tamper.ts` — correct copy-then-flip-hash approach
- `src/lib/cool-flow.test.ts` — correct critical-path unit test
- Routes for dashboard / change / evidence / history

### 9. Frontend / backend structure (existing)

TanStack Start + React + Vite + PGLite + a large Grok platform scaffold (auth, multiplayer, PWA, preview host). Not a clean standalone product.

### 10. Database / storage (existing)

SQL migration `migrations/0002_evidence.sql` for `ai_systems` and `evidence_records`. Depends on the scaffold DB layer.

### 11. Tests (existing)

`src/lib/cool-flow.test.ts` covers the CooL record/verify/tamper path. Scaffold also has many unrelated platform tests.

### 12. Build / deploy (existing)

Grok-specific `scripts/with-app-env.mjs`, Vite 8, Nitro, Vercel output leftovers. Heavy and not portable as a hackathon handoff.

## What can be reused

- CooL API usage pattern (`record` + `verifyEvidence` + metadata_hash flip)
- Product copy, demo values (Customer Support AI / Model-A→B / v12→v13 / Strict→Strict+)
- Honest claims language from the existing README
- Tamper-copy strategy

## What is broken / incomplete / not reusable as-is

- Uploaded `cool-sdk-main` source is missing modules; cannot be built from that tree alone.
- Existing app is entangled with Grok workspace scaffolding.
- `artifacts/ProofAI-MVP/` is only a stub `package.json`.
- Persistence is tied to PGLite/Postgres platform helpers.
- UI is thin and mixed with platform chrome.

## Architecture that will be implemented

Clean standalone MVP:

```
React + Vite UI  →  Node HTTP API  →  CooL SDK (cool-nwc@3.0.0)
                                      →  local JSON evidence store
```

Pages: Dashboard, Create Change, Evidence/Receipt, Verification, Audit History.

Exact CooL APIs used:

1. `new CooL({ applicationId, attestation: { provider: "local" | "dstack" } })`
2. `cool.record({ type: "config.change", metadata, software })`
3. `verifyEvidence(evidence)` and `formatVerdict(verdict)`
4. Tamper demo: structured clone + flip last character of `record.event.metadata_hash`

No homemade hashing. No fake “Verified” badge.
