# Source-bound release gates
1. Identity: repo, owner, tenant and exact 40-character SHA.
2. Admission: original Eve V3 workflow lease, immutable claim and verified repo grant.
3. Security: least privilege, wrong-tenant denials, safe retries, secrets scan and costs.
4. Deterministic: types, build, CI and regression tests for that SHA.
5. Actual UX: browser verification of important customer journey, responsiveness, keyboard, network and console at 320/390/430/768/1024/1440/1920 widths as applicable.
6. Independent Guardian: not the author or an LLM self-declaration; receive a source-pinned gate result.
7. Release: preview readback, explicit production authority when required, rollback tested and cost bounded.
8. Delivery: real artifact URL, working output, Finished record and truthful client notification.

Gate values: PASS / FAIL / BLOCKED / NOT_RUN. A missing gate must never be reported PASS. Auto-merge being enabled in repository settings is NOT authorization to auto-merge a particular PR; require proven checks, review authority and release gate.
