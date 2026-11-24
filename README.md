# Xtreme Avatar

Mobile XPS assistant with Voice, Video, Chat and Tasks. The approved home, compact AI Assist hero, artwork, metallic bands, navigation and PWA assets are preserved.

This branch migrates the existing Site to Next.js on Vercel, Supabase accounts and private storage, and the existing Railway service. The migration preview is protected. The current Site and custom domain remain in place while live acceptance tests are completed.

## Canonical locations

- Source: https://github.com/xps-admin/xtreme-avatar, branch `migration/vercel-supabase`.
- Preview: https://xtreme-avatar-git-migration-vercel-supabase-xtreme-ai-systems.vercel.app
- Supabase: `akezkmklygzltvnvisob`, isolated `xtreme_avatar` schema and `xtreme-avatar-api` function.
- Existing runtime: `Strategic-Minds-AI/eden-skye-x1-operating-systems`, `services/eden-call` on Railway. Do not create a duplicate service or copy its provider credentials into this repository.
- Existing Site: `appgprj_6aec7688554c819181a5cae574c92008`. Do not use the retained legacy Sites helpers to publish this migration branch.
- Existing Tavus embed: `912d9c39-bf54-4e8e-80d9-311c860fd7c9`. Preserve its PAL, face, visitor memory settings and usage limits.

## Local verification

Use Node 22.13 or later and the committed lockfile:

```sh
npm ci
npm run build
node docs/migration-frontend-tests.mjs
node --test tests/migration-backend.test.mjs tests/migration-chat.test.mjs
```

Backend tests use isolated PostgreSQL in PGlite and mocked providers. They do not create calls, send messages, or prove live media and OAuth.

## Account boundary

The frontend requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Only the public publishable key belongs in these variables. Google PKCE sessions use secure HttpOnly cookies. Server requests verify the session through Supabase Auth; the Edge function independently verifies it again. Sites identity headers and browser-supplied owner IDs are not authentication.

Membership, invitation admission, role changes and private state use the isolated schema with RLS. An organization owner cannot read another member's private chat or drafts. Do not bootstrap owners by an email comparison in request code. The reviewed one-time bootstrap and migrations are under `supabase/`.

## Assistant runtime

The Edge API sends verified session tokens and the exact approved app origin to fixed Railway routes. Voice and chat have separate enable flags and entitlements. The voice path retains the existing approved provider configuration. The chat port preserves the Call Desk model, `gpt-5.6-sol`, and its bounded conversation-only behavior: no external tools, calls, messages or background actions are implied by a chat reply.

Stable request IDs prevent duplicate work. Unknown provider outcomes remain recoverable and are never automatically resubmitted as paid work. Old Sites accounts, owner-only phone authority and Call Desk memory are not silently mapped to new Supabase users. New app chat history is private per authenticated UUID; this is not ChatGPT account memory.

## Release status

See [migration status](docs/migration-status-20261107.md) for exact deployed revisions, test evidence, remaining gates and rollback. Real Google callback/logout, two-account checks, Tavus preview-origin approval, microphone/camera/audio, PWA installation and a reviewed legacy-account link remain required before changing the live domain.

The [original Sites README](docs/sites-baseline-readme.md) is retained only as historical migration evidence. Its Sites identity/bootstrap/deployment instructions are not the active architecture for this branch.
