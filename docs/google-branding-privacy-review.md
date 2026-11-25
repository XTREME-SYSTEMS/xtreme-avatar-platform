# Public information and privacy publication review

Status: **review draft; publication blocked**. Prepared 25 November 2026 in existing PR #21, `fix/google-workspace-production-origin-20261124`, from `451739d2d1779c5f7a3f2f07374a6b95eb9478d4`.

This package adds `/about` and an explicitly draft `/privacy`, and corrects the existing Google Workspace permission descriptions. It preserves the production-origin allowlist fix, the root redirect and the approved V3 application. It changes no Google scopes, grants, runtime configuration, credentials or deployment. It adds no binding terms or agreement acceptance.

## Review surfaces

- `/about`: public product description, Google identity sign-in versus optional Workspace permission, existing product mark and wordmark, app and privacy links.
- `/privacy`: public **review copy**, no effective date, conspicuous draft status and `noindex, nofollow, nocache` metadata. It neither collects consent nor constitutes an adopted notice. Noindex is a search preference, not access control or a substitute for the publication gate.
- `public/google-workspace.js`: existing layout and event handling; descriptions now disclose the actual read/write scopes, including deletion. Grant breadth is distinguished from the smaller set of actions exposed in the UI.
- Existing artwork: `/assets/mark.svg` plus the current Xtreme Avatar / XPS Intelligence wordmark and V3 palette. No new logo. The Google Cloud logo is not changed by this source package.

No production URL is claimed repaired by this PR. The source must pass CI and independent review; provider branding must subsequently point to reviewed, deployed public content. `/terms` is not implemented. Do not add a terms URL to the Google configuration unless an actual adopted document exists.

The public description qualifies the availability of Workspace connection controls. The legacy `public/google-workspace.js` dialog exists in source, but the approved V3 frontend does not necessarily expose it. Copy changes in that file do not wire the dialog into V3 or prove a functioning user consent flow.

## Proposed disclosure answers grounded in source

These are implementation findings, not attestations about current provider settings or contractual practices. Paths are relative to this repository; review the final PR commit when evaluating them.

| Question | Proposed answer supported by source | Evidence and limit |
| --- | --- | --- |
| What is the product? | An assistant workspace with interfaces for chat, voice, video, preferences and optional connected services; availability depends on account and service configuration. | `public/xtreme-v3/index.html`, `public/xtreme-v3/main.js`, `public/google-workspace.js`, `server/assistant.mjs`, `server/assistant-voice.mjs`. A UI entry point does not prove live provider readiness. |
| Is Google sign-in the Workspace grant? | No. Identity sign-in and optional Workspace connection have different routes and purposes. | `app/auth/login/route.ts` uses Supabase `signInWithOAuth({provider: 'google', ...})`; `server/google-workspace-proxy.mjs` separately handles Workspace start/callback/status/disconnect and validates selected-service scopes. No Workspace scopes are added by the sign-in route itself. Verify the deployed Google/Supabase clients before final public assertions. |
| Which identity information is stored? | User ID, verified email, membership role/status and invitation/audit metadata appear in account storage. | `server/accounts.mjs`, `server/postgres-d1.mjs`, `db/schema.ts`, Supabase migrations. Exact live schema and all provider identity fields remain subject to deployment inventory. |
| Are conversations stored? | The chat path writes prompts, context, replies, request IDs and timestamps. It reads up to 50 completed turns for history. The read limit does not expire older rows. | `server/assistant.mjs`: `schema`, `history`, `handleAssistant`. No retention period follows from that limit. |
| What other account data appears? | Profile name, preferences/controls, drafts, contacts, plans and transcripts; private file features and action receipts are also implemented. | `server/accounts.mjs` `KEYS`/`validateValue`; `server/job-files.mjs`; `server/job-storage.mjs`; `server/assistant-action-receipts.mjs`. Feature enablement and backup/log copies require verification. |
| Is linked memory automatically all shared with the assistant? | A separately linked Call Desk profile supplies a bounded selection of approved context to new supported chat/voice requests. | `server/call-desk-link.mjs`, `server/assistant-personalization.mjs`, `server/assistant.mjs`, `server/assistant-voice.mjs`. This is not a claim of a completed Eden Core memory cutover, universal memory, or a provider retention policy. |
| Which session mechanism appears? | Supabase authentication uses server-managed sign-in cookies; app requests verify the signed-in user. | `server/supabase-auth.ts`: `authClient`, `verifiedUser`, `proxyApi`. Hosting access logs and analytics inventory are separate. |
| Which providers are visible? | Google, Supabase authentication/Edge/PostgreSQL/storage, Railway services, and separately linked Call Desk appear in service code. The UI references GPT voice, Tavus and Twilio. | `supabase/functions/xtreme-avatar-api/index.ts`, `server/job-storage.mjs`, `server/google-workspace-proxy.mjs`, `server/communications.mjs`, `public/google-workspace.js`. This does not verify downstream model/media providers, Neon use by the external runtime, legal processor entities, regions or contracts. Vercel deployment is a separate provider readback. |
| Does disconnect delete all data? | No such conclusion is supported. Connection controls and individual file-removal paths exist; they are not a whole-account deletion workflow. | Workspace proxy `disconnect`, `server/call-desk-link.mjs`, `server/job-storage.mjs`. External token revocation, retained copies, backups, logs and full account deletion must be demonstrated. |

### Workspace scope contract retained unchanged

`server/google-workspace-proxy.mjs`, `startResult`, validates `openid`, `email` and precisely the service scopes selected below. Every listed service scope allows writes. The permission text must not imply read-only access or file-specific Drive access.

| Service | Validated scope |
| --- | --- |
| Gmail | `https://mail.google.com/` |
| Calendar | `https://www.googleapis.com/auth/calendar` |
| Drive | `https://www.googleapis.com/auth/drive` |
| Docs | `https://www.googleapis.com/auth/documents` |
| Sheets | `https://www.googleapis.com/auth/spreadsheets` |
| Slides | `https://www.googleapis.com/auth/presentations` |
| Contacts | `https://www.googleapis.com/auth/contacts` |
| Tasks | `https://www.googleapis.com/auth/tasks` |

Google's [scope reference](https://developers.google.com/identity/protocols/oauth2/scopes) documents the breadth of these grants. Gmail includes permanent deletion, and Calendar and Drive are broader than the specific operations currently exposed by the app. This package preserves the grants. Any later reduction or expansion is a separate reviewed change with runtime and consent verification.

## Owner decisions that actually prevent adoption

Only the operator can adopt policy commitments and identify the accountable legal entity. Engineering should supply factual evidence first; the owner should not be asked to guess infrastructure facts.

1. **Operator and request channel:** confirm the exact legal entity, business address, monitored privacy contact and responsible person. Product names do not establish a contracting entity. No legal suffix or email address has been invented.
2. **Audience and processing purposes:** confirm the intended users/regions and approved data-use policy, including whether advertising, sale/sharing, secondary analytics, or generalized model training is permitted. A proposed “no sale” or “training off by default” statement is not adopted without supporting settings and contracts.
3. **Retention and rights:** approve category-specific retention and deletion rules after receiving the inventory below, including exceptions and backup treatment. Choose an operational request channel and service process; do not promise deadlines the system cannot meet.
4. **Final adoption:** approve the text after the factual checks, name its effective date/version and authorize publication. The privacy draft and any future terms require separate review; no signature or acceptance is collected here.

## Engineering evidence required before that decision

| Evidence to obtain | Concrete acceptance requirement |
| --- | --- |
| Active providers and data map | Read back actual deployed web, authentication, database, runtime, AI, storage, voice/video, communications and analytics providers; map each data category and region to the correct app/account. Do not merge Avatar customer data with Eden Core shared memory. |
| Stored records and retention | Inventory account/profile, chat/context, job files, OAuth credentials, memory, action/audit receipts, logs, recordings and backups. Identify current expiry/deletion jobs and provider retention. A missing expiry is recorded as unknown, not a chosen period. |
| Rights and deletion | Verify identity checking, access/export/correction routes, whole-account deletion, integration revocation and propagation to providers/backups using an authorized test account and approved procedures. File removal and disconnect alone do not pass this requirement. |
| Vendor commitments | Check current processor contracts and controls for training, advertising, sharing, transfers, incident handling and support access. Do not infer these from frontend wording. |
| Scope and consent alignment | Confirm selected scopes in an actual reviewed Workspace consent flow, active tools and server grants. This PR repairs misleading read-only wording; it does not certify Google verification or enable tools. |
| Public accessibility and branding | Verify deployed `/about` and the adopted `/privacy` without a session; verify app-name/logo consistency and domain ownership from the provider. Change the OAuth homepage URL only after the page is approved and deployed. Never present the current draft as a final policy to complete verification. |

## Validation and rollback

Run the existing CI steps: `npx tsc --noEmit`, `npm run build`, and `node --test tests/xtreme-v3-loop-contract.test.mjs tests/xtreme-v4-home-source.test.mjs`; CI also runs `tests/test_xtreme_v3_fidelity.py`. Run the existing Google Workspace/Calendar client and BFF suites because their permission copy was touched. No new prose-only test suite is required.

Confirm the built `/about` and `/privacy` return content without a cookie, provider configuration or an authentication redirect. `/privacy` must retain its conspicuous draft banner and robots metadata. Record final commit/check URLs in PR #21. Build/check success means the candidate is reviewable, not that the privacy notice is adopted or production is repaired.

### Baseline comparison recorded during this package

The six existing Workspace/Calendar suites below produce **108 passes / 114 tests, with the same six failures**, both on untouched base `451739d2d1779c5f7a3f2f07374a6b95eb9478d4` and on this candidate. No test or authorization behavior was changed to hide the failures. They remain a separate OAuth readiness gate; successful required CI is not a claim that all OAuth tests pass.

Command: `node --test tests/google-workspace-bff.test.mjs tests/google-workspace-client.test.mjs tests/google-workspace-oauth-client.test.mjs tests/google-calendar-bff.test.mjs tests/google-calendar-client.test.mjs tests/calendar-workspace-bff.test.mjs`.

Failing cases:

- `read and manage consent accept only exactly selected scoped permissions`
- `Connection snapshot enables only authorized explicitly enabled Calendar; no other tool is activated`
- `Google Workspace details expose honest setup and no inoperable authorization controls`
- `selected services use one consent flow, fixed account headers and no auth-account change`
- `partial permission grants stay distinct from enabled assistant actions`
- `direct OAuth callback load refreshes actual server status before claiming connected`

These include old read-only scope/status expectations and client fixture mismatches that predate this package. Resolve them against the actual runtime contract before treating Workspace as release-ready; do not restore inaccurate read-only wording just to satisfy the old assertions.

Rollback: revert the public-information package commit on the existing PR branch, retaining the earlier production-origin fix. No provider or database rollback is needed because this package performs no provider configuration or data mutation.

## Primary guidance consulted

- [Google: Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) — app identity, public information and branding review.
- [Google: How user authorization works](https://developers.google.com/identity/oauth2/web/guides/how-user-authz-works) — authentication scopes versus authorization for API access.
- [Google: OAuth API scope reference](https://developers.google.com/identity/protocols/oauth2/scopes) — actual permission breadth.

The broader [privacy and electronic-records draft](xtreme-v3/PRIVACY_NOTICE_AND_ESIGN_DRAFT.md) remains a historical design/legal review document. Its proposed promises and future features are not confirmed production disclosures.
