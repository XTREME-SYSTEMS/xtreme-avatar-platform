# Xtreme Avatar migration — 2026-11-07

Status: protected previews are staged for real-user testing. Existing Sites and www.xtremeavatar.com remain unchanged. No production cutover, legacy private-data transfer or owner phone-authority transfer.

## Build and source
- Repository: https://github.com/xps-admin/xtreme-avatar
- Review branch: migration/vercel-supabase; draft PR https://github.com/xps-admin/xtreme-avatar/pull/1.
- Original Sites v22 source: 4cb97bf41eebe5599c9b9c7c43b1b808ae52fa6e.
- Main intentionally preserves that original Sites/Vinext source at de9018e251200ba704f43fe797e0038b766ecadb. It is not the native Next.js migration. Importing main into a Next.js Vercel builder fails because Vinext does not emit .next/routes-manifest.json.
- The migration branch uses native Next.js 16.3.4 and a native production build, retaining the approved HOME_HTML, styles, artwork, navigation, manifest and service worker.
- Git author is the checkout's authenticated xps-admin identity. No history rewrite or team seat change was needed.

## Vercel previews
- Original migration project: prj_KxNggGLE84VPWaVB6kO6OA8uMEH6, team Xtreme-AI-Systems.
  https://xtreme-avatar-git-migration-vercel-supabase-xtreme-ai-systems.vercel.app
- User subsequently imported main into a second project, prj_rGZKaRmrOsMBkCsOwRXsqajctQpm, team Strategic Minds Advisory. The failed import was diagnosed and a native Next.js preview built from the reviewed migration branch.
  https://xtreme-avatar-git-migration-ver-dd2679-strategic-minds-advisory.vercel.app
- Corrected Advisory build settings: Next.js, Node22, npm ci, npm run build, standard output. Deployment dpl_7apuXUf91TtHBGGDGZaYyW67sa1E from 4c394d209f8913bfca3e1e8dd319f9859a206053 was independently verified READY with target preview, expected source and assigned alias.
- Advisory has no custom domains. Automatic custom-domain assignment is disabled and previews are protected. Only the existing public Supabase URL/publishable key were added to its preview environment. No provider secret copied.
- Use the migration branch for previews. The failed main build remains in deployment history. Do not change DNS or deploy the original Sites main as a Next app.
- Exact final preview deployment receipts are recorded in the PR after this source commit.

## Supabase
Project akezkmklygzltvnvisob; isolated xtreme_avatar and xtreme_avatar_private schemas. Existing Auto Leads/public tables are unchanged.
Six app tables enforce RLS. Private state and chat remain private even from organization admins. Invitation admission verifies confirmed auth.users identity and a live invite; authority changes audit atomically.
The existing confirmed Google user was admitted as the first owner using a guarded, audited bootstrap. No old Sites identity was inferred by email.

xtreme-avatar-api version4 ACTIVE:
fff6c131f3509c6053bce480939f676e252cb9a2c4e128ca6b3133060d6552ac
Gateway verify_jwt=false is intentional: the function independently verifies every bearer with Supabase Auth getUser and applies membership/RLS.
The reviewed config enables separate browser_voice and assistant_chat entitlements only for these exact origins:
- https://xtreme-avatar-git-migration-vercel-supabase-xtreme-ai-systems.vercel.app
- https://xtreme-avatar-2t5t65mxr-xtreme-ai-systems.vercel.app
- https://xtreme-avatar-git-migration-ver-dd2679-strategic-minds-advisory.vercel.app

Google provider is enabled. Actual Google callback/login/refresh/logout and two-user device tests are not verified.

## Existing Railway runtime
Project15f90272-e2f6-4739-8286-91447f545d71 / sandbox-code environment30d1f937-6b6a-4b64-af93-c5f20ebad857 / service7e065e48-780a-4eb5-ab4f-d3ae8c922733.
Repository Strategic-Minds-AI/eden-skye-x1-operating-systems, branch migration/xtreme-supabase-voice-v2.
Reviewed commit97ec2537c0cd919943bdf93569da8c5ca0ad1569; deployment55886332-c5f5-4a32-9ec0-0c2e69a79d9f SUCCESS.
Reuses existing provider credentials, service and durable volume. No duplicate worker or new paid service.
POST /xtreme/v2/status and /xtreme/v2/chat require a fresh verified Supabase identity, active membership, assistant_chat entitlement and exact origin. Voice remains separate. Existing Sites voice and calling routes remain unchanged.
The port preserves Call Desk v14's gpt-5.6-sol conversation-only Responses contract: low reasoning, tools[], tool_choice none, store false, bounded inputs/output, 30 requests/user/day, 200/app/day and four concurrent requests.
Durable scoped request IDs/body hashes and atomic reservations prevent duplicate paid work. Unknown outcomes never auto-resubmit; completed retries return the saved reply. Rolling startup preserves another instance's unexpired reservation.
App history/preferences are per UUID. Call Desk and ChatGPT memory are not implicitly imported.

## Verification
- Native production build PASS and 15 frontend/auth/redirect/PWA checks PASS; exact approved UI assets unchanged.
- Independent app/backend suite26/26 PASS, using real isolated PostgreSQL plus mocked providers.
- Independent runtime suite156/156 PASS, including all prior133 voice/call/auth tests and23 chat tests.
- Guardian independently verified the Advisory alias, source, preview status and absence of custom domains before approving the exact third origin.
- Live runtime health200; missing/invalid session401; unauthorized origin403. These do not prove an authenticated inference or audio session.
- All actual provider inference, real media and real OAuth tests remain NOT TESTED. No outbound call or message was sent.

## Remaining release gates
1. Verify the exact active preview OAuth callback in Supabase, then complete real Google login, refresh, logout and two-account isolation/persistence tests. Primary Advisory callback:
   https://xtreme-avatar-git-migration-ver-dd2679-strategic-minds-advisory.vercel.app/auth/callback
2. Add the active preview origin to existing Tavus deployment912d9c39-bf54-4e8e-80d9-311c860fd7c9 while preserving its PAL/face, usage limits and per-visitor memory. Then verify live video/audio/permissions/close/back on a phone.
3. Perform an authenticated chat reply and voice session through the preview; verify model entitlement, interruption, teardown and private history.
4. Legacy Call Desk memory and owner-only phone authority require explicit dual-account proof and audited mapping. Calling/three-way calls were not activated for new UUIDs.
5. Verify PWA installation and real mobile layout.
6. XPS Infinity worker delivery remains unverified; no duplicate engine was created.
7. Only after independent acceptance should the custom domain move. Old Sites remain intact.

## Access and rollback
The native Chrome extension lacks its originating browser context; cloud provider sign-in was not completed. Native Supabase tools have no Auth config setter; Tavus tools have no deployment patch operation. Secure cloud Supabase login returned declined and was not retried.
Vercel's native connector could not see the newly imported Advisory project; authorized, explicitly scoped JARVIS Vercel CLI verified and configured that exact project instead.
Local coding workspace disconnected after tests. Verified source and durable test evidence are backed up in JARVIS migration-20261107 and GitHub; no secrets are in source.
Rollback chat by disabling XTREME_SUPABASE_CHAT_ENABLED and chatEnabled, retaining data and all voice/calling paths. Prior voice-only runtime commit58cfa2f9d11a0d5d0511d8a654fd4ba37d0fe7a5 remains available. Do not drop shared Supabase schemas or remove the existing Sites.
