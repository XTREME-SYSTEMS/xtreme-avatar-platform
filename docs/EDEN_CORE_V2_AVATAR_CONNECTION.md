# Eden Core V2 ↔ Xtreme Avatar | staged communications bridge

Owner instruction: Connect Eden Core V2 to the **new** \`XTREME-SYSTEMS/xtreme-avatar-platform\` without merging the independent Eve builder or Visual X code system into Core.

## Source evidence (2026-11-24)
- Avatar base: \`XTREME-SYSTEMS/xtreme-avatar-platform@1df3b711fc407271375b9aba5deee01274fa0bd9\`. This is a canonical **candidate**, not current production. Do not change the live Xtreme Avatar domain or the original owner source without release approval.
- Core source: \`Strategic-Minds-AI/eden-universal-core-v2\` branch \`eden/comm-contract-v1-20261121\` and its drafted communications v1 contract. Its \`main\` branch was observed to contain only a README. A Core feature branch and past Railway staging receipts are not evidence of current deployed availability.
- Core staged endpoint recorded in Core: \`https://core-api-staging-dec8a723.up.railway.app\`. Current authenticated provider health and owner delegation are **not verified in this change**.
- \`Edens Universal MCP 4\` reported Neon memory read/write capability but its private GitHub App route was configured for \`XTREME-SYSTEMS/visual-x-next\` and provider authentication was not proven. The directly connected GitHub account \`xps-admin\` independently has push access to both identified repositories. Host plugin identity is not passed to the new runtime.
- Avatar already has its own Supabase account session, legacy assistant, voice/calling consent gates and a private Call Desk context. This change does not bypass, replace or migrate those sources.

## Adapter
- \`GET /api/eden-core\`: reads the server-pinned Core \`GET /v1/profile\` solely as a limited owner identity/permission check. Responds with a boolean and profile revision, **never profile content**.
- \`POST /api/eden-core\`: opt-in **owner-only** text communication to existing Core \`POST /v1/chat\`. Accepts precisely \`{ "text": "...", "requestKey": "..." }\`. It is not wired into the current assistant UI or sent automatically.
- Fresh Supabase sign-in and confirmed email are checked before sending and after receiving. Requests from any other Supabase UUID fail. POST requires same-origin validation; browser input cannot set a Core URL, tenant, bearer token or provider tool.
- The destination is a fixed HTTPS Core staging origin, with disabled redirects, bounded responses and an explicit timeout. Core still independently verifies JWT signature, issuer, intended audience, tenant/owner, scopes, membership and RLS. No generic MCP tool proxy or unrestricted database query is added.
- The bridge never retries chat after uncertain outcomes, never dispatches calls/messages/media, and does not certify an external communication as delivered. The existing assistant and telephone service are unchanged.

## Required private runtime configuration (not committed or copied from ChatGPT)
1. \`EDEN_CORE_BRIDGE_ENABLED=true\` only in an approved private preview environment after all gates.
2. \`EDEN_CORE_XTREME_OWNER_ID=<verified current avatar Supabase owner UUID>\`. Prove the same human has an authorized, active Core owner/tenant mapping. **Do not** infer mapping by comparing email alone.
3. \`EDEN_CORE_ACCESS_TOKEN=<short-lived Core OAuth JWT>\` provisioned in the authorized server secret store, not a browser variable. Its issuer, client, audience, scopes, tenant and subject must be validated by Core; the host GitHub or MCP connector token cannot be borrowed. The token expires and needs an existing authorized rotation/revocation route; a static forever credential is prohibited.
4. The existing Core server must have a reviewed and permitted owner chat grant with \`knowledge:read\`, \`tool:execute\`, \`profile:read\` and current membership. Live chat additionally requires a verified model/provider entitlement and budget.
5. Keep the bridge **disabled** whenever the grant expires, consent is withdrawn, issuer changes or the bridge identity cannot be reconciled.

## Acceptance and independent release gates
- Source tests: \`node --test tests/eden-core-bridge.test.mjs\`, plus complete repository CI.
- Negative: wrong Supabase owner; invalid credential; forged claims; changed account; foreign Core tenant; revoked/expired Core grant; denied origin; wrong audience; oversized receipts.
- Hosted: actual \`GET /api/eden-core\` from the approved owner session receives a narrowly scoped Core 200 readback, while a different owner and revoked grant receive 403/503.
- Communication: one explicitly approved owner chat request receives a Core \`completed\` response that can be independently read back with the identical \`requestKey\`. Confirm no duplicate model invocation and no memory, voice, Tavus or Twilio action.
- Guardian exact-SHA independent audit, production deployment consent and rollback readiness remain required before changing the live UI or enabling production.

## Rollback
Set \`EDEN_CORE_BRIDGE_ENABLED=false\`, revoke only the dedicated Core grant, and revert this isolated feature branch/PR. No migration, new service, scheduler, phone webhook or external worker is created.

**Current classification:** source bridge candidate. **Not** a verified live integration, Neon synchronization, external send, Dot ACK, media session or production release.
