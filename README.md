# ProofAI

**AI systems change. Proof should not.**

ProofAI combines AI-powered change intelligence with cryptographically verifiable evidence for important AI configuration changes.

ProofAI is a cryptographically verifiable evidence layer for important AI configuration changes. It uses the real CooL SDK (`cool-nwc`) to seal before/after configuration states into an offline-verifiable receipt.

ProofAI helps organizations build stronger traceability and audit evidence for regulated or high-risk AI systems. It does **not** prove that an AI system is correct, fair, safe, or unbiased, and it does **not** make an organization EU AI Act compliant by itself.

## Problem

AI systems change constantly: models, prompts, policies, and deployment settings. Ordinary application logs can record that a change happened. Logs can also be edited. After an incident, teams often cannot show an independent party that a specific configuration change occurred and was not altered later.

## Solution

When an operator seals a change, ProofAI:

1. Captures the live before state and the proposed after state
2. Calls `cool.record()` from the CooL SDK
3. Stores the returned `cool.receipt.v2` next to a human-readable change summary
4. Lets anyone verify that receipt with `verifyEvidence()`
5. Demonstrates tamper detection by verifying a *copy* that has been modified

## Why CooL

CooL (Cryptographic Observability & On-chain Ledger) is the hackathon SDK this product is built on. A receipt proves:

- which event type was recorded
- that the record is unforged (hybrid ML-DSA-65 + Ed25519 signatures)
- that the record sits in an append-only transparency log
- and, when hardware attestation is configured, where it was produced

Sensitive metadata is committed as a salted hash. The receipt does not carry raw prompt text.

## Architecture

```
AI Configuration
        ↓
     ProofAI UI
        ↓
   Node.js API
        ↓
   CooL SDK (cool-nwc)
        ↓
Cryptographic Evidence / Receipt
        ↓
 Local evidence store (JSON)
        ↓
ProofAI Dashboard → Verification
        ↓
 VERIFIED / VERIFICATION FAILED
```

## Features

- Create an AI configuration change with a before/after comparison
- Seal the change with the real CooL SDK
- View receipt fields (record ID, timestamp, binding hash, signature algorithm, runtime mode)
- Verify original evidence
- Tamper Test that copies the receipt and flips one hex digit of `metadata_hash`
- Show that the tampered copy fails while the original still verifies
- Audit history of sealed changes

## Prerequisites

- Node.js 20 or newer
- npm 10+

## Installation

```sh
cd ProofAI
npm install
```

## Environment Variables

Copy `.env.example` if you want to override defaults. Nothing is required for the local demo.

| Variable | Purpose |
|---|---|
| `COOL_APPLICATION_ID` | Application id stamped on receipts (default `proofai`) |
| `COOL_DSTACK_ENDPOINT` | Optional Phala dstack endpoint. Unset = simulator |
| `PORT` | API / production server port (default `8787`) |
| `PROOFAI_STORE` | Path to the local JSON store |
| `OPENROUTER_API_KEY` | Server-only key for AI change intelligence, copilot, and the executive brief |
| `OPENROUTER_MODEL` | Any OpenRouter model slug (default `openai/gpt-4o-mini`) |

Do not put secrets in frontend code. CooL calls run on the server.

## Running Locally

```sh
npm install
npm start
```

Open `http://localhost:8787`.

The Node server serves the UI from `public/` and the API from `/api`. CooL runs on the server.

`npm run dev` is the same server with file watching. An optional React + Vite client lives in `client/` if you want to rebuild the UI (`npm run build`).

## Running Tests

```sh
npm test
```

The critical test seals a change with CooL, stores the receipt, verifies it, tampers with a copy, confirms verification failure, and checks that the original remains valid.

## Production Build

```sh
npm start
```

No frontend compile step is required. The default UI is static files in `public/`. If you build the optional React client, `client/dist` is served instead.

## Demo Flow

See [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

1. Open the dashboard. Customer Support AI is on Model-A / v12 / Strict.
2. Create a change to Model-B / v13 / Strict+.
3. Click **Seal Change with CooL**.
4. Click **Verify Evidence** → VERIFIED.
5. Click **Tamper Test**, then verify the copy → VERIFICATION FAILED.
6. Verify the original again → still VERIFIED.
7. Open audit history.

## CooL Integration

```js
import { CooL, verifyEvidence } from "cool-nwc";

const cool = new CooL({
  applicationId: "proofai",
  attestation: { provider: "local" },
});

const { evidence, recordId, digest } = await cool.record({
  type: "config.change",
  metadata: { aiSystem, before, after, actor },
  software: { name: "proofai", version: "1.0.0", digest: null },
});

const verdict = await verifyEvidence(evidence);
```

Without `COOL_DSTACK_ENDPOINT`, CooL uses its built-in **simulator**. Receipts are labelled `simulated`. Binding and signature checks are still real cryptography. Attestation / enclave domains will not read `pass` in simulator mode.

## Limitations

- Simulator mode unless hardware attestation (Phala dstack) is configured
- Local JSON store is an index, not a public transparency log
- No user accounts, RBAC, or multi-tenant isolation
- Does not grade model outputs or claim regulatory certification
- Does not claim that ProofAI alone makes an organization EU AI Act compliant

## Future Roadmap

- Hardware-attested issuance inside a dstack CVM
- Exportable audit packs for external reviewers
- Multiple AI systems and environment promotion workflows
- Signed operator identity on each change
- Optional anchoring to an external witness / timestamp service
