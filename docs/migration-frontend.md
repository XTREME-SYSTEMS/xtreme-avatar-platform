# Xtreme Avatar native frontend migration

Date: 2026-11-07. Source: saved Site v22, commit 4cb97bf41eebe5599c9b9c7c43b1b808ae52fa6e.
This is a prepared migration. No deployment, DNS change, Site deletion, or Git push was performed by the frontend worker.

## Changed
- Native Next.js 16.3.4 build/start/dev scripts; Cloudflare Workers/vinext/Vite/Wrangler dependencies removed from the active app dependency graph.
- All direct dependencies pinned to the source lockfile versions; @supabase/ssr 0.12.7 and @supabase/supabase-js 2.119.0 added and locked. Backend test dependency @electric-sql/pglite0.3.14 pinned at backend owner request.
- Supabase Google OAuth uses server-side PKCE, HttpOnly cookies, Secure in production, SameSite=Lax; callback exchanges code and freshly verifies getUser before returning to an allowed relative destination.
- No browser Supabase client, no localStorage auth tokens, no Sites identity-header trust. Compatibility function names in app/chatgpt-auth.ts now verify Supabase.
- Server-only API proxy verifies getUser before retrieving session access token. The Edge function must independently verify the bearer token and authorization.
- Only GET/POST on existing account/team/assistant/communications/work-hub/call-desk-link paths are proxied.
- Proxy destination is fixed to the configured project /functions/v1/xtreme-avatar-api plus original API path/query.
- Headers forwarded: bearer session, public apikey, JSON Accept/Content-Type, request-origin, X-Xtreme-Account, optional Idempotency-Key. No incoming oai-* headers are forwarded.
- Every POST requires exact same-origin Origin; account-id mismatch returns409. 131072-byte body bound. Voice/chat timeouts90seconds, others15seconds; Vercel maxDuration120seconds. Mutations never automatically retry.
- Logout only mutates through POST /auth/logout; same-origin required. Legacy GET shows confirmation without clearing a session.
- Private/auth responses set private,no-store plus Pragma/Expires. Upstream redirects are rejected and arbitrary upstream headers are not forwarded.
- Minimal public /api/health reports only service availability.
- Original account-link completion HTML retained in its route without importing the old Sites runtime.
- public/accounts.js changes limited to current-origin published URL, Google sign-in wording, same-origin POST logout, and removal of Sites-specific membership copy.
- Service worker response disables stale script caching; original manifest/service-worker content retained.

## Files
package.json, package-lock.json, next.config.ts, tsconfig.json
server/supabase-auth.ts, server/supabase-auth-policy.mjs
app/chatgpt-auth.ts
app/api/[...path]/route.ts, app/api/assistant/[...path]/route.ts, app/api/communications/route.ts, app/api/health/route.ts
app/auth/login/route.ts, app/auth/callback/route.ts, app/auth/logout/route.ts, app/auth/error/route.ts
app/signin-with-chatgpt/route.ts, app/signout-with-chatgpt/route.ts
app/account-link/call-desk/complete/route.ts
public/accounts.js
docs/migration-frontend-tests.mjs, docs/migration-frontend-test-results.txt, docs/migration-frontend.md

## Verification
- npm install --no-audit --no-fund: passed; lock refreshed.
- npm run build: passed native Next.js/Turbopack build, TypeScript, route collection.
- node docs/migration-frontend-tests.mjs: 15 meaningful checks passed.
- HTTP root output equals original HOME_HTML exactly. Git diff confirms home-html.ts, public/style.css, polish.css, assist.css, assets, app.js/nav, manifest and sw.js unchanged.
- Tests cover key-type rejection (secret/service-role), bad redirect variants, origin rejection and positive same-origin mutation, forged Sites identity headers, PWA routes, no GET logout, legacy sign-in, invalid callback, Google PKCE creation, secure cookie flags and minimal profile scopes.
- Tests use a public-key-shaped local placeholder and no real Google identity; they do not claim a completed OAuth login.
- Initial local test requested127.0.0.1 but Next normalized request origin tolocalhost; test base corrected tolocalhost and positive same-origin validation passed.

## Configuration and release gates
Required public environment values:
- NEXT_PUBLIC_SUPABASE_URL=https://akezkmklygzltvnvisob.supabase.co
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<project publishable key>

Set these before the Vercel build. Never place service-role keys or private integration credentials in NEXT_PUBLIC variables.

Configure exact deployed callback URL(s) ending /auth/callback in Supabase Auth redirect allowlist.
Google sign-in is authentication only; Workspace Gmail/Calendar/Drive grants remain separate connector flows.
Allow exact frontend origins in the Edge function XTREME_ALLOWED_ORIGINS. The proxy supplies a verified app request origin even for browser GET requests with no Origin header.

NOT TESTED: real Google account callback/session refresh/logout, two-user persistence and negative authorization, identity-bound migration of old private records, memory continuity, Google data grants, Tavus rendering/media permissions, live voice/calling, deployed host-origin behavior, mobile device QA.
No old Sites user id is mapped to Supabase UUID by email here. Membership and private data conversion remain backend migration gates.
Keep existing Site serving until independent Guardian validates these gates and production cutover is authorized.

Official docs consulted:
https://supabase.com/docs/guides/auth/server-side/creating-a-client
https://supabase.com/docs/guides/auth/server-side/advanced-guide
