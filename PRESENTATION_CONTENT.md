# ProofAI — 5 slides

## SLIDE 1 — Problem
AI systems change: models, prompts, policies, tools, deployments.
Logs can be edited. Screenshots prove nothing.
Teams need both *insight* into a change and *proof* that the record was not altered.

## SLIDE 2 — Why now
Regulated and high-risk AI programs are being asked for traceability.
They also need help prioritizing which changes to review.
Those are different jobs. Mixing them is how vendors overclaim.

## SLIDE 3 — Solution
ProofAI = AI-powered security intelligence + cryptographically verifiable evidence.
Core message: **AI systems change. Proof should not.**
- Seal before/after config with CooL
- Analyze the delta (labeled analysis)
- Inspect the system twin
- Verify or detect tampering
- Ask the copilot using stored evidence IDs only

## SLIDE 4 — How it works / demo
Seal Model-B → Model-C, v13 → v14
CooL receipt → Analyze → MEDIUM risk
3D twin highlights changed nodes
Verify → VERIFIED
Tamper a copy → VERIFICATION FAILED
Copilot: “What changed in the latest deployment?” → cites EVD-00N

## SLIDE 5 — Impact + future
Move from “we logged it” to “we can prove it,” with review context attached.
Not a claim of fairness, safety, or EU AI Act certification.
Next: hardware-attested issuance, operator identity, exportable audit packs.
