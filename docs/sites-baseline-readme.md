# Xtreme Avatar

Mobile XPS assistant with four primary modes: Voice, Video, Chat and Tasks. The existing compact AI Assist hero, XPS logo and crest, black/platinum/gold finish, card borders and metallic bands are retained. Home and the dock prioritize the four modes. Calling, 3-way calling, phone-number dictation and construction tools remain under More tools. Account data and existing routes are retained.

## Source and deployment

Existing Sites project: `appgprj_6aec7688554c819181a5cae574c92008`.
Production address: https://xtreme-avatar-mobile.strategic-ai.chatgpt.site

Vinext with the supplied Sites integration and D1 binding `DB`. `home-html.ts` serves the existing shell. Authenticated UI assets live in `public/`; `server/accounts.mjs` enforces membership and ownership. Migrations are in `drizzle/`. Use Sites build and source workflow helpers. Do not create a second project or delete earlier Sites.

## Accounts

Use Sites sign-in and trusted request identity headers. Store private records by the stable authenticated user ID; never accept an owner ID from client data. No legacy browser-local records are imported. Account data is never cached; switching accounts clears private UI and ends the embedded session. Each save includes the expected signed-in account and an optimistic version. Reads/writes require active membership.

Set server-only runtime environment keys `XTREME_OWNER_EMAIL` and `XTREME_ADMIN_EMAIL` for first-login bootstrap. Existing membership takes precedence, including suspension. No email addresses or credentials are hardcoded into client source. Owner/admin manage membership; team endpoints expose roster metadata only, not private drafts. Approving app membership does not share the private Site or send an invitation. The Sites owner must separately approve Site visitor access.

## Existing Tavus deployment

Use only `912d9c39-bf54-4e8e-80d9-311c860fd7c9` with `https://unpkg.com/@tavus/embed@latest`. Each video entry opens the same full-screen layer. Voice is a distinct GPT live voice entry and currently reports connection pending; it does not open Tavus with the camera off. Tavus owns permissions, haircheck and media controls. Back, Escape and browser Back unmount the embed and restore the underlying screen. A neutral per-session greeting avoids greeting every visitor as Jeremy without changing the shared PAL.

The deployment's last verified allowed origin is the earlier Call Desk Site; the current Xtreme Avatar origin must be added in Tavus. No deployment/PAL/face was created or replaced. Live video/audio/permissions have not passed testing on this origin. Tavus anonymous per-browser memory is not certified as authenticated account isolation. The Site audience is public as returned by native metadata on November 6; active membership still gates private application data. This update preserves that audience. Multi-account provider memory and real-device QA remain unverified.

The existing reviewed owner-only call adapter is retained; its Site bridge token is not configured. Chat has an AI-assistant composer and private per-user draft; live replies remain awaiting connection. SMS drafts remain separately available under More tools; no message delivery is claimed. Tasks save private drafts with manual completion; assistant execution is not connected. Other avatar selections are preferences only; live sessions still use the existing Eden deployment. No service account credentials, API keys, or private provider configuration are included in client code.

## Validation

Run `node --test tests/accounts*.test.mjs` for account authorization, isolation, stale writes, CSRF, suspension, membership races and client cleanup/timeouts. Browser visual checks use a separate scratch-only fixture; it is not included in the deployed source. These checks are not evidence of real-user sign-in or live Tavus media. See `qa/` for verification notes.

Immediate rollback reference: published v3 source `b3f6ea405b76db33fa7ec80d2bc97c075a5d1faa`, also preserved locally as `backup/xps-before-fresh-start-v3`. Version3 includes the same account database contract. Restore that saved version through Sites if needed; do not delete account data. Earlier v2 source remains in history.

## Call Desk and shared assistant status — November 6, 2026

Production Call Desk is `appgprj_6aeb2008fe3081919145d5e777f8d78c`, https://eden-skye-call-desk.strategic-ai.chatgpt.site. Account includes an explicit external handoff to that existing service. It is not the Lynk design preview. No visitor data, credentials or owner identity is appended to the link. This handoff is not data synchronization.

Native Call Desk checks report implemented private profile/memory/coaching tools, but visitor X1/Infinity and provider bindings pending. No browser realtime, AI text-turn or task-execution operation is currently exposed through those tools. No Sites plugin-eligibility discovery tool is exposed in this session, so no visitor binding was invented or owner credential copied. No new backend, queue, OpenAI key or Tavus deployment was provisioned.

Tavus approved deployment rejects this Site origin with `403 origin_forbidden`. The existing deployment needs `https://xtreme-avatar-mobile.strategic-ai.chatgpt.site` in its allowed origins. The current PAL uses Tavus Gemma/TTS; camera-off Tavus is not GPT live voice. Its configured X1 MCP attachment does not by itself prove per-visitor tool authorization.

This frontend release passed 116 automated tests and independent source review. Browser fixture checks verified 320/390/430-pixel layouts, four-mode navigation, retained More tools, full-height video layer and return behavior. Fixtures used a synthetic account. Live GPT audio, video rendering, microphone/camera permissions, cross-app memory, and real-user shared data remain unverified.

## Assistant chat screen

The primary Chat control retains the existing `#messages` route; `#chat` is an alias. The former SMS composer remains at `#sms` under More tools. No SMS draft, task, transcript or private profile data is migrated or overwritten.

The new `assistant_chat_draft` value uses the existing authenticated private-state API and a bounded 4,000-character string. It is keyed by the trusted Site user ID, protected by active membership, same-origin writes and optimistic revision checks. Quick prompts only edit that private draft. Sending is disabled while the AI connection is unavailable; no fabricated reply, typing indicator, delivered state or automatic later send is displayed. The Call Desk handoff remains separate from unconfigured shared context.
