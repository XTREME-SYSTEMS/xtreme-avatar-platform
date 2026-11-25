# Eve V3 | Xtreme Avatar First Canary
Target source: `XTREME-SYSTEMS/xtreme-avatar-platform` (new private frontend). Linked issue: #2.
This is a **planning/permission-canary PR**. It is not evidence of running a Codex/Eve coding agent.

## Authorization sequence
1. Inspect existing `XTREME-SYSTEMS/visual-x-eve-pilot` current source SHA, single original Workflow authority, recent run and private Blob claim receipts.
2. Verify the existing installed GitHub App installation has **this** repository explicitly granted, not only the original Eve repo. Obtain a scoped read receipt then a branch-only canary write.
3. Update Eve's existing deterministic repository allowlist on a feature branch and run wrong-repo, wrong-tenant, revoked-token and duplicate-claim negative tests. Do not widen scope to unrelated GitHub organizations.
4. Admit exactly one low-cost or no-cost test mission, record executionId/lease/idempotency and full trace, then produce an Eve-authored draft PR containing a harmless test change and exact acceptance tests.
5. Re-run full CI, browser QA and Independent Guardian against the precise commit SHA; preserve rollback and owner review.
6. Only then use the platform mission contract to dispatch a customer-requested build. The first finished deliverable must be a real working, verified preview, not a model statement.

## Fail-closed
No new Eve runtime, scheduler or all-access API key. No customer data copies, production changes, paid OpenAI run without budget/gate, or self-certified Guardian. Preserve `xps-admin/xtreme-avatar` as original rollback source.
## Handoff
Record in #2: identity/installation ID (not token), source SHA, allowlist diff, lease, run IDs, exact test receipts, blocked gates, cost, next safe action.
