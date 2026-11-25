# Live chat recovery — 25 November 2026

## Scope and baseline

- Mission: Xtreme Avatar integration issue [#22](https://github.com/XTREME-SYSTEMS/xtreme-avatar-platform/issues/22).
- Repository: `XTREME-SYSTEMS/xtreme-avatar-platform`.
- Baseline: `c936a2b136ddc7525107dd89bf57506742fe0125`, the merge of PR #23.
- Candidate changes: the existing approved `public/xtreme-v3/app-live.js` and its behavioral tests. No new homepage, backend, memory store, runtime or provider connection.

## Defects repaired

The live app adapter discarded a chat request's idempotency key when a request timed out, could not retry a server-reported pending request, and reset pending state unconditionally. It also rendered the Send button while the enclosing form remained busy, then cleared the busy flag without rendering again. That could leave the button disabled after a completed operation.

The adapter now retains the original request ID and prompt until an acknowledged stored reply or an explicit terminal rejection. It recovers the server's existing pending request after a reload. A retry sends that same request. A newer edited draft is preserved. A response is accepted only when its request ID and assistant message match the returned stored history. The Send control is refreshed after form completion.

Account reads no longer send a stale account pin. Account changes or revocation clear private UI state, returning focus or restoring a cached page rechecks the session, and late responses cannot populate a different account's conversation. This is client protection in addition to the existing server checks, not a replacement for server authorization.

## Reproducible verification

```sh
node --check public/xtreme-v3/app-live.js
node --test tests/xtreme-live-app.test.mjs tests/xtreme-v4-home-source.test.mjs tests/xtreme-v3-loop-contract.test.mjs
git diff --check
```

At candidate preparation, all 19 contract tests passed, including six new regressions for uncertain dispatch, reload recovery, explicit terminal rejection, malformed success, late prior-account response and revoked account clearing. These are isolated tests with labeled synthetic API fixtures, not real OAuth/provider proof.

The local browser suite could not start because the Playwright browser binary was absent. The attempted normal browser installation was denied by the environment's network with HTTP 403. Exact-candidate GitHub browser CI and a real authenticated hosted journey remain required.

## Observed deployment blocker

- Production deployment `dpl_GiuMyqtYtDZb3bMhT8jw12W2mXR7`, source `c936a2b136ddc7525107dd89bf57506742fe0125`: `ERROR`, `BUILD_FAILED`, `Resource provisioning timed out`, with no build events returned.
- One bounded isolated Preview recovery attempt on the same source, `dpl_HSsrS3GYvx4kUPuCvwnDcpAEAkZL`: `ERROR`, `Resource provisioning failed` before build. The Vercel API labels the Preview target `staging`.
- The earlier approved-source preview `dpl_Hbdv5N7KX8nRbNGye6SECvCQvrMj` at `f162c51a745117d09ae2708d57aac471dae0881e` is `READY`; its live app HTML is available and guest account requests return 401. This is not an authenticated provider canary.
- `www.xtremeavatar.com` still served the prior demo HTML when inspected at 2026-11-25 07:38 UTC. This candidate has not been promoted.
- Native Vercel storage readbacks show required per-deploy Neon actions on both the customer `xtreme-avatar` (`PLATFORM` prefix) and `eden-shared-memory` (`STORAGE` prefix) resources. Both databases themselves report available. A provisioning error does not establish a data failure or permission to delete branches.

## Release boundary and rollback

This candidate does not activate Eden Core, shared-memory migration, Tavus, Twilio, Google grants, or factory execution. It does not claim the site is out of demo mode. Independent review, exact-source CI, Preview deployment and real authenticated acceptance must pass before promotion. Roll back this change by reverting this candidate commit; provider bindings and stored account data are unchanged.
