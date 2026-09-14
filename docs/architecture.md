# Architecture

```
AI Configuration
        ↓
     ProofAI
        ↓
     CooL SDK
        ↓
Cryptographic Evidence
        ↓
   Evidence Store
        ↓
 ProofAI Dashboard
        ↓
    Verification
        ↓
 Authentic / Tampered
```

The API process is the trust boundary for issuance. The browser never calls CooL directly.

Default attestation provider is `local` (simulator). Set `COOL_DSTACK_ENDPOINT` for the hardware path.
