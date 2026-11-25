# Live workspace recovery — 25 November 2026

## Scope and baseline

- Mission: Xtreme Avatar integration issue [#22](https://github.com/XTREME-SYSTEMS/xtreme-avatar-platform/issues/22).
- Repository: `XTREME-SYSTEMS/xtreme-avatar-platform`.
- Baseline: `c936a2b136ddc7525107dd89bf57506742fe0125`, the merge of PR #23.
- Candidate changes: the existing approved `public/xtreme-v3/app-live.js` and its behavioral tests. No new homepage, backend, memory store, runtime or provider connection.

## Defects repaired

The live app adapter discarded a chat request's idempotency key when a request timed out, could not retry a server-reported pending request, and reset pending state unconditionally. It also rendered the Send button while the enclosing form remained busy, then cleared the busy flag without rendering again. That could leave the button disabled after a completed operation.

The adapter now retains the original request ID and prompt until an acknowledged stored reply or an explicit terminal rejection. It recovers the server's existing pending request after a reload. A retry sends that same request. A newer edited draft is preserved. A response is accepted only when its request ID and assistant message match the returned stored history. The Send control is refreshed after form completion.

Account reads no longer send a stale account pin. Account changes or revocation clear private UI state, returning focus or restoring a cached page rechecks the session, and late responses cannot populate a different account's conversation. This is client protection in addition to the existing server checks, not a replacement for server authorization.

### Follow-up: voice recovery controls and saved results

The uncertain voice view previously offered only a status check. A recovered request could therefore remain open without an accessible End control. The view now exposes **End previous call**, using the existing handler and original request ID; the server already accepts this request without a session ID. An accepted-but-unfinished close or lost response keeps the recovery view and End action. No new voice session, microphone permission, provider call or timer-based assumption of closure is introduced by this change.

Ideas were saved into the existing results store, but the live navigation did not open the results renderer. **Saved ideas and results** now opens that screen from the Idea Notebook and More menu, using the existing navigation and approved row styling. The Work Hub link accurately describes saved work. No result is synthesized and no storage API is changed.

## Reproducible verification

```sh
node --check public/xtreme-v3/app-live.js
node --test tests/xtreme-live-app.test.mjs tests/xtreme-v4-home-source.test.mjs tests/xtreme-v3-loop-contract.test.mjs
git diff --check
```

The original chat candidate passed 19 contract tests, including regressions for uncertain dispatch, reload recovery, explicit terminal rejection, malformed success, late prior-account response and revoked account clearing. The follow-up passes **21/21** with two additional behavioral checks: a recovered voice request keeps the original ID and End action through unresolved status, HTTP 202 and lost response until confirmed closure; a newly saved idea is readable through both navigation entries. These are isolated tests with labeled synthetic API fixtures, not real OAuth/provider proof.

The existing browser acceptance suite also checks both saved-results navigation paths at its four viewport sizes and records a saved-results screenshot. This suite uses mocked private API responses. The local browser binary was unavailable and its installation was blocked by HTTP 403; local browser execution is not counted as a pass. GitHub CI passed for the earlier `b2bd7ab12e532ae599ef26f0e1413b665d1f2709` candidate in [run 45570768173](https://github.com/XTREME-SYSTEMS/xtreme-avatar-platform/actions/runs/45570768173). A new exact-source CI receipt is required for this follow-up.

## Observed deployment blocker

- Production deployment `dpl_GiuMyqtYtDZb3bMhT8jw12W2mXR7`, source `c936a2b136ddc7525107dd89bf57506742fe0125`: `ERROR`, `BUILD_FAILED`, `Resource provisioning timed out`, with no build events returned.
- One bounded isolated Preview recovery attempt on the same source, `dpl_HSsrS3GYvx4kUPuCvwnDcpAEAkZL`: `ERROR`, `Resource provisioning failed` before build. The Vercel API labels the Preview target `staging`.
- The earlier approved-source preview `dpl_Hbdv5N7KX8nRbNGye6SECvCQvrMj` at `f162c51a745117d09ae2708d57aac471dae0881e` is `READY`; its live app HTML is available and guest account requests return 401. This is not an authenticated provider canary.
- `www.xtremeavatar.com` still served the prior demo HTML when inspected at 2026-11-25 07:38 UTC. This candidate has not been promoted.
- Native Vercel storage readbacks show required per-deploy Neon actions on both the customer `xtreme-avatar` (`PLATFORM` prefix) and `eden-shared-memory` (`STORAGE` prefix) resources. Both databases themselves report available. A provisioning error does not establish a data failure or permission to delete branches.

### Bounded preview recovery observed after the initial failure

The Avatar association on shared memory was updated through the supported Vercel connection UI to remove its Preview and Production branch-creation actions while retaining its environments, variable prefix and active-resource requirement. The Core association was preserved. Root then redeployed the existing PR #25 deployment once, with no new Git branch.

Deployment `dpl_AUAhbLqfJNQusGcunSWCN4qXoSyC` reached **READY** at `2026-11-25T08:22:42.932Z` on source `b2bd7ab12e532ae599ef26f0e1413b665d1f2709`. Both Neon projects remained at ten branches, and the existing PR branch was reused. Authorized Vercel access returned the real app shell; an app request without a signed-in app session returned HTTP 401 with `sign_in_required`. The preview remains deployment-protected. These checks do not prove a completed app login, chat inference or voice call. The initial browser sign-in returned to the old production origin, so preview authenticated acceptance remained open. See the [recovery receipt](https://github.com/XTREME-SYSTEMS/xtreme-avatar-platform/pull/25#issuecomment-7157040922).

That hosted receipt belongs to the earlier source and does not certify this follow-up revision. No production promotion is included.

## Release boundary and rollback

This candidate does not activate Eden Core, shared-memory migration, Tavus, Twilio, Google grants, or factory execution. It does not claim the site is out of demo mode. Independent review, exact-source CI, Preview deployment and real authenticated acceptance must pass before promotion. Roll back the source changes by reverting this PR's candidate commits; the source changes do not alter provider bindings or stored account data.
