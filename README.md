# XTREME AVATAR | Canonical Frontend

**The production website and the primary frontend source are this repository.** Do not restore the original imported `HOME_HTML` homepage.

## One source of truth

| Responsibility | Canonical system |
| --- | --- |
| Website | https://www.xtremeavatar.com |
| GitHub | `XTREME-SYSTEMS/xtreme-avatar-platform` (`main`) |
| Vercel | Team `xtreme-ai-systems`, project `xtreme-avatar-platform` |
| Visual design | [Owner-approved Figma V4/V5](https://www.figma.com/design/16F1Pcf7WN23HfBlBBx2Mf?node-id=42-10) |
| Active homepage | `app/route.ts` routes `/` to `/xtreme-v3/index.html` |
| Approved interactive UI | `public/xtreme-v3/index.html`, `main.js`, `styles.css`, `fidelity.css`, and `assets/` |
| Identity / existing account APIs | Existing tenant-scoped Supabase Auth and unchanged authenticated routes |
| Shared Eden intelligence | `Strategic-Minds-AI/eden-universal-core-v2` through an authenticated server-side bridge |
| Shared memory candidate | Existing `eden-shared-memory` Neon project (migration is **not** certified) |
| Video / voice / phone | Existing Tavus PAL, OpenAI supported realtime voice, and Twilio services, subject to live grants and tests |
| Software building | Existing separately governed Eve V3 factory |

The formerly imported first frontend in `home-html.ts` was removed from the **active source tree**. `main` uses only the owner-approved Figma-derived home. Historical Git commits remain available for auditing; do not force-push/rewrite protected history.

## Presentation policy

- Brushed aluminum / graphite / gold is the approved default, with five selectable skin previews.
- All new UI changes extend the approved current screen and assets. Never create a second competing homepage.
- The current `/xtreme-v3/` implementation contains clearly labeled design-preview/demo states. Its presence on the live domain **does not prove** actual Tavus, Twilio, Eden Core or paid marketplace actions are connected.
- Older support scripts under `public/` remain temporarily because they contain authentication, consent, communications, and media-client behavior that must be extracted/revalidated before removal. They are **not** the active homepage. Do not delete functional dependencies merely to hide historical styling.

## Integration and release requirements

1. Preserve existing account/tenant checks and consent boundaries.
2. Use Eden Core V2 as the single shared intelligence interface, not Visual X code or an X1 runtime. The existing Neon memory migration is gated by [Core PR #46](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/pull/46) and [identity reconciliation #47](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/issues/47). Do not simply swap `DATABASE_URL` or duplicate memory stores.
3. The [Core frontend connection kit PR #44](https://github.com/Strategic-Minds-AI/eden-universal-core-v2/pull/44) is a candidate for the authenticated BFF. Never pass provider secrets or direct unrestricted Bearer tokens into client JS.
4. Tavus avatar, OpenAI live voice and Twilio phone/SMS/WhatsApp must be tested individually with the existing provider adapters. The ChatGPT Sol voice is not a transferable API endpoint.
5. CI, real browser/mobile QA, authenticated provider receipts, independent Guardian and rollback evidence are required before claiming production-ready capabilities.

## Build and governance

```sh
npm ci
npm run build
node --test tests/xtreme-v3-loop-contract.test.mjs tests/xtreme-v4-home-source.test.mjs
```

Source instructions: `AGENTS.md`, `docs/PLATFORM_MISSION_CONTRACT.md`, `docs/PROVIDERS_AND_CREDENTIALS.md`, and `docs/RELEASE_GATES.md`. GitHub [Project V2](https://github.com/orgs/XTREME-SYSTEMS/projects/3) tracks work. No agent definition implies an authorized live worker.

The legacy imported-source documentation remains under `docs/` for provenance only. It does not override this canonical frontend map.
