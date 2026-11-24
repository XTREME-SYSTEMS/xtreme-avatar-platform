# Xtreme Avatar V3 · Approved Visual → Production Implementation Contract

**Owner approval:** Brushed-aluminum, high-contrast, gold-accent mobile concept with full-height avatar stage; `XTREME AVATAR` primary wordmark and `XPS INTELLIGENCE` subtitle. No personal assistant name in the global brand. Source visual: the approved generated reference in the current conversation, `xtreme_avatar_luxury_call_interface.png`. Preserve the most recently approved image's composition and glow, not the original 10 flat Figma explorations.

**Code authority:** GitHub `xps-admin/xtreme-avatar`, branch `migration/vercel-supabase`. Vercel project `xtreme-avatar-v0-migration` in `xtreme-ai-systems`. Feature branch created: `feature/xtreme-avatar-v3-visual-onboarding-20261123` (no merge/release without PR review). Existing app route is `app/route.ts` → `home-html.ts`, and authenticated runtime client is under `public/accounts.js` and `public/app.js`. Preserve its Supabase account boundaries, existing Tavus embed, Railway voice, service permissions, working communications and PWA shell. No new competing control plane.

## Visual lock and token system
- Screen: main mobile viewport 390×844, check 320, 393×852, 430×932, 768×1024, 1024 and desktop companion. Full-height media surface must use safe areas and not clip Mute/Camera/Captions/Interrupt/End.
- Theme default: Brushed Aluminum Gold. `--accent: #F6C65D`, `--edge: #E5B454`, `--text: #FDFDFE`, `--surface: #242629`, `--background: #0A0B0E`. Background uses 1px low-opacity brushed-metal lines, smoky charcoal gradient, restrained white pearl lighting arcs and soft gold button halos.
- Additional skins: Silver Slate, Electric Blue, Ivory Minimal, Copper Industrial. Theme switching modifies CSS tokens and visual assets only. Never grants new OAuth scopes or changes personal-memory permissions.
- Iconography: crisp vector outlines; control targets ≥44×44 CSS pixels; contrast WCAG 2.2 AA checked in real browser; reduced-motion support. No giant flat raster screenshot as the actual UI.
- Full-screen avatar: synthetic approved still only in prototype; production inserts the authorized Tavus media component into the same stage with true connected/connecting/error states, participant consent, visible controls and weak-network fallback.

## Progressive onboarding, v1
Eight steps: (1) intent: business creation, rebrand, AI enhancement or experience assistant; (2) full name, primary telephone and optional second; (3) website, industry and job title; (4) Full Auto/Hybrid/Manual; (5) three wishes; (6) easy vs hands-on, revenue vs fun, approval vs delegation; (7) separately optional Cloud Browser and lawful enrichment; (8) long privacy notice, mandatory core notice acknowledgment, *unchecked* optional generalized AI training/marketing consents, typed legal name and durable e-sign receipt.

Only identity and essential service settings should be required; optional integrations must not become implied preconditions. The preview does not transmit PII or save an executed signature. Production data storage requires authenticated, private tenant-scoped records, structured validation, encryption, retention schedule, export/deletion, revocation and consent history.

## API contracts and exact gates

### Cloud Browser provider adapter (not active)
`XTREME_BROWSER_ENGINE_URL` / `XTREME_BROWSER_API_KEY` live in the provider's server-only secret vault; never in frontend, documentation, chat, public build or logs. Confirm the vendor's exact API paths, auth header, account and rate limits before implementing the adapter. Browser permission is per-user, per-domain and per-action. Enforce allowlist/denylists, DNS resolution and SSRF protections, origin and tenant isolation, timeouts, cost budgets, idempotency, screenshot privacy and audit receipts. Maintain a `requires_user_challenge` state for CAPTCHA and anti-bot verification, which must be completed by the person or a documented site-authorized method; no silent bypass.

### Skip tracing / enrichment (not active)
Opt-in by lawful purpose, written provider contract and verified business use, explicit fields/sources, minimization, subject rights and rate limits. Do not use for covert personal locating or regulated employment/tenancy/credit screening without the necessary legal basis and FCRA compliance. Store vendor, input provenance, purpose, consent and audit receipt. No cross-tenant private person lookup.

### E-signature and privacy (draft only)
Before release, fill the legal operator, address, privacy contact, effective date, actual data recipients, retention windows and localization; have counsel approve. A real e-sign flow must authenticate signer, capture immutable policy version/hash, actual checkbox values and timestamp, detect duplicate/replay, store tamper-evident signed receipt, and provide a readable export. Core service terms may be required; optional model-training, marketing, browser and data-enrichment consents stay distinct and revocable. A signature is not a substitute for legal consent to unrelated data processing.

### Full Auto/Hybrid/Manual
Mode only controls the pace of reversible approved actions; it cannot override model permissions, vendor authorization, human review for consequential actions, monetary budgets, CAPTCHA, or scope restrictions. Task engine requires durable ownership, deduplication, retry budgets, rollback, independent Guardian review and exact result evidence before marking Finished.

## QA acceptance and release gates
1. Two phone sizes and 768 tablet visually compare to the approved reference; acceptable palette, brushed grain, silver arc lighting, gold strokes, avatar crop and safe-area placement; signed aesthetic review.
2. Keyboard/touch navigation, focus states, readable labels, 44px targets, contrast, screen reader, reduced motion and no overflow on required widths.
3. Form rejects required-field omissions and mismatched signature; opt-ins default false; UI does not submit anything without authentication/authorization; positive and negative tests for consent revocation.
4. Browser engine smoke verifies exact user authorized domain and user challenge resume, rejects private IPs/malicious redirects, no arbitrary unauthorized cross-tenant actions.
5. Real Tavus/GPT-Live session start/end/reconnect/captions tests after provider approval; static image cannot certify live voice/video.
6. Server-side legal receipt verifies policy hash, timestamp, authenticated principal and revocable separate choices; download works.
7. CI checks, cost guards, rollback candidate, protected Vercel preview and independent Guardian evidence bound to the exact source SHA.
8. No release until owner explicitly approves the final implemented preview and counsel approves the policy.

## Current evidence
- Offline self-contained UI, five switchable skins, 8-step onboarding and local draft receipt were authored in `/mnt/data/xtreme_avatar_v3_preview`.
- `node --check main.js` and deterministic static content checks PASS.
- Real Chromium screenshots and browser interaction tests are **UNKNOWN**: test environment returned `ERR_BLOCKED_BY_ADMINISTRATOR` for both file and loopback URLs. Do not inflate into a pass.
- No backend integration tested, no real browser engine configured, no skip tracing performed, no signature committed, no app code merged, no independent Guardian signoff.