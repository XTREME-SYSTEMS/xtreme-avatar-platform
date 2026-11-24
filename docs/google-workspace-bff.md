# Per-user Google Workspace BFF

Status: implemented locally for review. No commit, push, deployment, Google
credential configuration, consent flow, or Google API call was performed by this
builder. Existing login, visual layout, and application membership are unchanged.

Files:
- server/google-workspace-proxy.mjs
- app/api/connections/google/[...path]/route.ts
- app/api/connections/google/callback/route.ts
- tests/google-workspace-bff.test.mjs

## Contract
- GET /api/connections/google/status -> runtime POST /xtreme/v2/google/status {}
- POST /api/connections/google/start {services:[selected service IDs]}
- POST /api/connections/google/disconnect {confirm:true,revision}
- GET /api/connections/google/callback is the only application completion route.
  It sends runtime POST /complete with {state,code} or
  {state,error:"access_denied"}. Public POST /complete is not exposed.

The fixed upstream is the existing Railway service:
https://eden-outbound-call-sandbox-code.up.railway.app

Every request verifies Supabase getUser before getSession and requires a matching
session user UUID. API requests also require X-Xtreme-Account matching that UUID.
Mutation Origin must exactly match the current allowlisted app origin. Only
server-built Authorization, Origin, X-Xtreme-Account and JSON headers are sent
upstream. Runtime independently verifies identity/membership and binds OAuth
state to the verified session_id, user, origin, and connection revision.

The three configured preview origins are:
- https://xtreme-avatar-git-migration-vercel-supabase-xtreme-ai-systems.vercel.app
- https://xtreme-avatar-2t5t65mxr-xtreme-ai-systems.vercel.app
- https://xtreme-avatar-git-migration-ver-dd2679-strategic-minds-advisory.vercel.app

Production/custom-domain additions require an explicit matching app/runtime/
Google callback configuration update. Wildcards are not accepted.

Google authorization must use https://accounts.google.com/o/oauth2/v2/auth,
the exact current-origin callback, offline access, PKCE S256, single state,
include_granted_scopes=false, and a bounded unexpired authorization link.
Google client secrets, access/refresh tokens, grant encryption and refresh remain
inside Railway. This BFF does not use Supabase OAuth for Workspace authorization
and cannot switch or create the app identity during connection.

Status returns only allowlisted connection state, display account metadata,
revision, services' authorized/enabled flags, an optional validated hasSavedConnection boolean, and fixed safe messages. Revision zero is valid for an initial account with no grant. Saved grants and connected state require a positive revision; saved metadata remains available when Google configuration/decryption is unavailable so the user can still forget local access. Google
errors, runtime response details, tokens, authorization codes and state are never
logged or echoed by this code. Request bodies are limited to 8192 bytes and
responses to 65536 bytes with fatal UTF-8 decoding. All output is private/no-store
with no-referrer. Runtime redirects are refused.

Disconnect performs local secure forgetting of this user's app grant using a
revision check. It does not revoke the shared Google project's authorization.
providerRevoked:false is preserved for an accurate UI. Any user-controlled Google
permissions management link is separate.

## Callback/recovery
Callback only uses the current verified app cookie; it does not exchange a
Supabase authentication code or map accounts by email. It redirects to fixed
same-origin /?google=connected|cancelled|reconnect|error#connections outcomes.
Missing authentication uses the reconnect outcome. Provider-supplied return URLs
are ignored. Cancellation is passed with the original state for safe consumption.
A timeout does not imply consent/exchange failed: UI must refresh status and must
not automatically restart consent or retry an authorization code.

Runtime bounded network work may require up to 55 seconds for fresh membership
verification plus token exchange/refresh and userinfo. BFF timeout is 70 seconds
for status/completion, 40 seconds for start/disconnect; Next maximum is 90 seconds.
The frontend uses a longer timeout and reconciles status after ambiguous results.

## Verification
Run: node --test tests/google-workspace-bff.test.mjs
20/20 isolated tests pass. Coverage includes:
- verified auth ordering and required account fences;
- missing/anonymous/unconfirmed users, changed account/session;
- exact three origins, same-origin mutations and blocked public completion;
- selected service validation, content type, byte bounds and malformed UTF-8;
- fixed Google redirect/callback/PKCE authorization validation;
- provider response/credential/error redaction;
- local-only disconnect semantics;
- server callback completion/cancellation, safe return routes, malformed/duplicate
  state, unknown origins, and safe reconnect when the app session is missing.

Native Next production build and TypeScript compilation passed with both new
routes. Guardian independently reviews/tests the final artifact before release.

Not tested: real Google consent, refresh/reconnect, two actual users' grants,
runtime configuration, live browser callback, or Google data tools. Authorized
scope grants do not mean assistant data/action tools are enabled.
