# Xtreme Avatar V3 / Five-minute native Vercel loop

## Current scope
This is an isolated **preview-only, read-only design-health loop**, not a second AI autonomous factory. The original Eve pilot remains restricted to Visual X. The existing Xtreme Avatar V3 Next.js app and GitHub PR #40 are unchanged except for the verified feature-branch workflow additions. The approved visual is the V5 dark-background, brushed-aluminum-gold skin.

## Implementation
- Schedule name: `xtreme-v3-five-minute-preview`
- Expression: `*/5 * * * *` (UTC; Vercel may apply a bounded jitter)
- Trigger: Vercel Schedules -> queue topic `xtreme-v3-fidelity-readonly`
- Consumer: `app/api/xtreme-v3/scheduled/route.ts` using `@vercel/queue`.
- Durable workflow: `app/workflows/xtreme-v3-fidelity.ts` using `workflow`.
- One workflow per scheduled occurrence: executionId-based Workflow hook token; duplicate deliveries ignored. No calls to AI models, customers, GitHub writes, Neon writes, deployments, or production releases.
- Checks: approved preview HTML, fidelity CSS design lock, two metal/light SVGs; structured result PASS / BLOCKED_AUTH / FAILED / SKIP_NON_PREVIEW with commit, schedule execution ID, sanitized asset status codes. Secrets never appear in logs.

## Deployment and verification
1. Run `npx tsc --noEmit`, `node --test tests/xtreme-v3-loop-contract.test.mjs`, and `npm run build`.
2. Push this branch and verify Vercel Preview READY at the exact new SHA. Preserve the current production deployment unchanged.
3. Test Vercel Schedules CLI against the correct Vercel team/project and feature branch:
   `vercel schedules invoke xtreme-v3-five-minute-preview --git-branch feature/xtreme-avatar-v3-visual-onboarding-20261123`
   Then inspect queue delivery, Workflow execution ID and returned status.
4. Activate on the Preview branch only:
   `vercel schedules enable xtreme-v3-five-minute-preview --git-branch feature/xtreme-avatar-v3-visual-onboarding-20261123`
5. Read back named schedule state, target, environment, last run and durable Workflow receipt. Do not claim active until real provider readback.
6. If Vercel SSO denies the monitor's asset requests, result must be BLOCKED_AUTH, not PASS. For authorized preview verification configure the existing Vercel Automation Bypass secret as an encrypted server-side environment variable in the Preview environment, without putting the value in the chat or code.
7. Independent Guardian, integration smoke, contract/e-sign legal review, Voice/Tavus/Twilio operational tests, and release approval remain separate hard gates.

## Rollback
Disable the named Preview schedule through Vercel Schedules, revert the feature-branch commit, and confirm the Preview-only route and Workflow receipts. Never mutate a production alias, current voice pipeline or customer data.

## Cost and scope
A five-minute cadence is approximately 288 scheduled occurrences per day. The loop is intentionally small, bounded, read-only, and no-AI. Review actual Vercel Queues/Workflow usage and set verified provider cost limits before enabling a more expensive autonomous repair phase. An autonomous code repair loop must use a scoped existing engineering worker, feature branches, tests and independent validation, never self-certify its own production release.
