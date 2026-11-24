# Xtreme Avatar backend migration — staged, not a production cutover

Source: approved Sites draft v22, commit 4cb97bf41eebe5599c9b9c7c43b1b808ae52fa6e.
This preserves business handlers and does not redesign the frontend.

## Prepared artifacts
- Migration: supabase/migrations/202611070001_xtreme_avatar.sql
- Edge entry: supabase/functions/xtreme-avatar-api/index.ts
- Explicit owner bootstrap: supabase/bootstrap/xtreme-avatar-owner.sql
- Public deployment fallback: supabase/functions/xtreme-avatar-api/deployment-config.mjs (empty origins; capabilities false)
- Function config: supabase/config.toml (verify_jwt=false; function itself verifies via Auth getUser)
- Edge router: server/edge-router.mjs
- Per-statement D1/Postgres compatibility adapter: server/postgres-d1.mjs
- Existing handlers: server/accounts.mjs, assistant.mjs, assistant-voice.mjs,
  communications.mjs, call-desk-link.mjs, work-hub.mjs,
  assistant-preferences.mjs, assistant-personalization.mjs
- Shared catalog dependency: public/assistant-catalog.mjs
- Tests: tests/migration-backend.test.mjs

The Edge bundle must include the entry and all imported server modules plus the
shared catalog. Imports are pinned inline: @supabase/supabase-js 2.119.0 and
postgres 3.4.7; no import map is required. No provider or database secrets belong
in source, Next public config, browser responses, or this document.

## Runtime configuration
Built-in Supabase Edge secrets: SUPABASE_URL, SUPABASE_ANON_KEY (or
SUPABASE_PUBLISHABLE_KEY), SUPABASE_DB_URL. The direct DB URL is used only inside
the Edge function, with TLS required and prepared statements disabled for
transaction-pooler compatibility.
Application settings (environment overrides the checked-in public deploymentConfig; populate exact verified preview origins before deployment):
- XTREME_ALLOWED_ORIGINS: exact comma-separated HTTPS origins, no wildcards,
  URL paths, suffix matching or implicit *.vercel.app allowance.
- XTREME_VOICE_V2_ENABLED: false/default until the existing Railway service's
  independently verified v2 route and membership bridge are deployed and tested.
- XTREME_CHAT_V2_ENABLED: false/default; proposed v2 chat path is NOT yet certified.

Next forwards only its verified Supabase access token, public apikey, validated
Origin, Content-Type, X-Xtreme-Account, and optional Idempotency-Key. Edge verifies
the token again with getUser. Native browser GET requests can have no Origin;
the trusted Next proxy validates its own request origin and supplies it. Edge
direct calls still require an exact allowed Origin.

Endpoints retain /api/... under /functions/v1/xtreme-avatar-api/api/...
GET /api/runtime-session returns only:
{ user: { id, role, status }, organizationId,
  entitlements: { browser_voice: boolean } }
This endpoint rechecks active app membership. It returns no email, profile,
messages or private memory. Railway must independently getUser, verify the same
UUID, then require this active entitlement. Do not infer PSTN call privileges.

## Identity, membership and isolation
The new xtreme_avatar schema is separate from public autoleads_* and vf_* data.
The migration creates one XPS organization but ZERO members. Initial owner
bootstrap is a separate explicit operator action against a verified Supabase
auth.users UUID; an email match never transfers Sites memory, call capabilities
or existing privileged subjects.

Each account currently belongs to one app organization. There is no organization
switcher or public multi-company onboarding claim in this release. Ordinary
admission requires an active invitation: the narrow SECURITY DEFINER function
reads auth.users for auth.uid(), requires confirmed email and a nonanonymous
identity, locks the live invitation, creates membership and consumes it atomically.
Existing suspended membership cannot be recreated through an invitation.

RLS denies cross-org membership reads and all cross-user private state/chat,
including owners reading another member's private data. Admins cannot promote
members to admin/owner. Identity and organization are immutable on members.
Database triggers commit membership/invitation authority changes and their audit
receipts in the same transaction; audit failure rolls back the authority change.
Initial privileged DB maintenance is explicitly tagged database_admin in audit.

The internal SQL adapter has no HTTP SQL endpoint. Each trusted SQL statement
opens its own transaction, SET LOCAL ROLE authenticated, sets verified request
claims, scopes search_path, and applies a statement timeout. Rollback clears
transaction-local role/claims. This preserves durable CAS reservations before
external voice/chat calls. Do not refactor a whole HTTP request into one long
transaction across provider traffic.

## Existing integrations
Voice uses the existing fixed Railway origin:
https://eden-outbound-call-sandbox-code.up.railway.app/xtreme/v2/voice/{status,start,end}
Only the verified user's bearer and validated app Origin are sent; no copied
Sites HMAC secret is required. Voice request reservations and recovery identities
remain stored per authenticated UUID. An optional verified Call Desk context
snapshot retains the original bounded context contract, but new accounts start
UNLINKED and do not claim existing memory.

Outbound/three-way calling is explicitly unavailable for migrated identities
until an audited cross-identity calling capability is designed and verified.
New app owner membership alone does not grant old owner phone authority.

Existing Call Desk profile linking is explicitly unavailable in the migrated
environment pending a verified dual-account linking flow and callback. Its sealed
Sites credentials are not exported. Old Sites functions and live runtime routes
must remain intact during staged migration.

The chat v2 adapter targets /xtreme/v2/status and /xtreme/v2/chat only if explicitly
enabled. This is a staged contract, not evidence those endpoints are live.
No calls, emails, external sends or provider sessions were executed by these tests.

## Validation
Run: npm run test:migration-backend
16 tests pass in an isolated PGlite PostgreSQL instance, including:
- quote-safe parameter translation and restricted SQL operations;
- separate per-statement commits and transaction-local role/claims;
- forged platform headers and invalid bearer/origin/route rejection;
- fixed voice endpoint and verified-bearer forwarding;
- actual migration execution, active invitation admission and no email-claim trust;
- two-org and private per-user RLS negatives, suspended-user read/write denial;
- durable private-state CAS and unique pending-chat reservation;
- owner privacy boundaries, admin escalation denial;
- audit failure rollback and post-error role reset;
- verified-owner bootstrap rejects identity mismatch, is idempotent, and refuses reactivation.

These are local integration tests, not proof of production JWT/CORS/provider health.
Original legacy tests that assume Sites oai-authenticated-* identity/owner-email
bootstrap require migration-specific fixture changes; those assumptions are
intentionally invalid now. Do not report the entire old suite as passing.

## Rollout and remaining gates
No production database write or Edge deployment was performed by the backend
builder. Independent Guardian review is required before application.
Then apply the isolated migration, verify exact schema/RLS revision, bootstrap the
explicit new owner identity, deploy Edge with exact preview origins, and validate
real sign-in + two-user isolation in preview. Enable voice only after independent
Railway membership checks pass. Keep old Sites and DNS in place until end-to-end
mobile/video/voice/account checks pass. Do not delete source data or old services.

Rollback before data migration: disable preview flags/remove preview deployment;
retain the existing Sites app. After any real data is written, export/backup the
new isolated schema before considering removal. Never DROP shared public schemas.

Official reference inspected:
https://supabase.com/docs/guides/functions/connect-to-postgres
https://supabase.com/docs/guides/functions/auth-legacy-jwt
