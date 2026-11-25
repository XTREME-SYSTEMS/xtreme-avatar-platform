# Xtreme Avatar Google OAuth production wiring (2026-11-24)

## Verified application identity
- Canonical production origin: `https://www.xtremeavatar.com`
- Vercel project: `xtreme-ai-systems/xtreme-avatar-platform`
- GitHub: `XTREME-SYSTEMS/xtreme-avatar-platform`
- Existing Google OAuth web client ID (public ID, not secret): `129011362159-bhi52bu5ab9um2p8269jvm54kpbbtnro.apps.googleusercontent.com`
- Server-side authorized redirect URI: `https://www.xtremeavatar.com/api/connections/google/callback`
- Optional authorized JavaScript origin for browser Google JS integrations: `https://www.xtremeavatar.com` (no path or trailing slash).

## Existing application API routes
- `GET https://www.xtremeavatar.com/api/connections/google/status`
- `POST https://www.xtremeavatar.com/api/connections/google/start`
- `GET https://www.xtremeavatar.com/api/connections/google/callback` (Google redirect only, dynamically includes code and state)
- `POST https://www.xtremeavatar.com/api/connections/google/disconnect`
- `GET https://www.xtremeavatar.com/api/connections/google/calendar`

Do not navigate directly to the callback with an invented authorization code or state. Do not hardcode a full OAuth authorization URL containing any state or code.

Example of the existing BFF client contract (only from the authenticated, authorized Xtreme Avatar app view):

```js
async function connectGoogleWorkspace({ userId, services = ['calendar'] }) {
  if (typeof userId !== 'string' || !userId) throw new Error('Sign in first');
  const res = await fetch('/api/connections/google/start', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-xtreme-account': userId
    },
    body: JSON.stringify({ services })
  });
  const payload = await res.json();
  if (!res.ok || typeof payload.authorizationUrl !== 'string')
    throw new Error(payload.error || 'Could not start Google authorization');
  const authorization = new URL(payload.authorizationUrl);
  if (authorization.origin !== 'https://accounts.google.com' ||
      authorization.pathname !== '/o/oauth2/v2/auth')
    throw new Error('Unexpected OAuth provider');
  window.location.assign(authorization.href);
}
```

The verified member's user ID must come from existing Supabase session/account UI, never an untrusted query parameter.

## Agentic OAuth clients: distinct from the existing user-interactive client

Google Workspace MCP tools require agentic OAuth 2.0 clients as of November 11, 2026. Keep the existing site client for its non-agent OAuth flow. Create or use a separately authorized `Xtreme Avatar AI Agent` OAuth client with `Use this client for an AI-powered agent` selected if using Google's Workspace MCP servers. The correct redirect URI is determined by the OAuth client/MCP host, not by the Neon database. Do not invent an agent callback route that the repo does not implement, and do not paste the website callback into an unrelated host.

Official documentation:
- https://support.google.com/cloud/answer/15549257
- https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server
- https://developers.google.com/identity/protocols/oauth2/web-server

## Runtime/production caveats

- The existing BFF forwards Google authorization calls to `https://eden-outbound-call-sandbox-code.up.railway.app`, retaining encrypted OAuth grants in Railway. It is NOT a direct Google token exchange in Vercel.
- The Railway environment has variable names `GOOGLE_WORKSPACE_CLIENT_ID`, `GOOGLE_WORKSPACE_CLIENT_SECRET`, `GOOGLE_WORKSPACE_TOKEN_KEY`, `GOOGLE_WORKSPACE_ENABLED`, and `XTREME_ALLOWED_ORIGINS`. Their actual values/matching client ID were not verified.
- The existing Railway service still builds from an archived X1-era source branch. Do not silently broaden its permissions or replace it without a verified transition plan to Eden Core V2.
- Vercel presently has Neon integration variables for `eden-shared-memory`, but the current app still uses Supabase Auth. Do not swap its identity or place Eden memory credentials in browser JS.
- The approved V3 production homepage remains a fidelity/demo frontend; the older Connected apps UI has the OAuth integration. Adding the canonical origin to the BFF does not activate that UI or prove a live Google Workspace grant.
- Current callback returns `/?google=connected|cancelled|reconnect|error#connections`. The current root route redirects to `/xtreme-v3/index.html` and drops query parameters. Callback landing/result handling must be reconciled before declaring production completed.
- The existing Vercel production deployment predates the new Neon integration variables, so issue a new deployment only after review.
- No Google Cloud client configuration, secret or consent grants were changed by this PR.

## Release checks
1. Verify exact new OAuth client ID and redirect registration in Google Cloud; secrets remain server-only.
2. Confirm Railway OAuth origin, encryption key, runtime readiness and origin allowlist, with approved replacement path away from legacy X1.
3. Independently test Google login start, nonce/PKCE, callback success/denial, status, refresh, disconnect and cross-account denial.
4. Wire the approved V3 frontend to genuine sign-in and Connected apps UI, preserving its design and with no faux Connected badge.
5. Verify a real scope-bound API/MCP call and traceable receipt; gate merge/promotion through CI and independent Guardian review.
