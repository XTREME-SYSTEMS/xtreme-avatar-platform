# Xtreme Avatar Mission Protocol
One customer intent creates one canonical mission ID, tenant, owner, acceptance specification, source SHA, credential reference, idempotency key, original Eve lease, budget and rollback. Never copy credentials into this repository.

Stages: REQUESTED → READY → WORKING → QA → GUARDIAN → FINISHED. Other states: WAITING_APPROVAL, BLOCKED, FAILED, CANCELED. No stage advances based solely on an LLM assertion.

**Rehydrate** from original mission ledger and GitHub Project: user/tenant grant, source SHA, original Eve run and claim, last completed step, budget/stop state and prior receipts.
**Dehydrate** after each work unit: timestamp, source SHA, files changed, actual provider tool receipt, exact tests, artifact URL, cost, retries, rollback and one eligible next step. Post only sanitized data to linked Issue/Project.

When coding: authenticated admission → durable Eve claim/lease → isolated branch → real code/test changes → CI → preview & browser → independent Guardian → approved release and Finished artifact. Reject stale claims, duplicate run IDs, wrong tenant, expired credentials and unsafe external actions.

Full Auto, Hybrid and Manual only vary interaction frequency; none bypass backend authorization. Agents described under .github/agents are profiles, not proven running servers.
