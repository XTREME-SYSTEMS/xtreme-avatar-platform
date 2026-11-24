# Xtreme Avatar mobile app update

Scope: retain the approved XPS black, silver, and gold styling; make four main controls half-width; expose Home, Voice, Video, Call, Messages, and Account; add PWA support and a reviewed owner call workflow.

## Verified locally

- Browser fixture at 320×700, 390×844, and 430×932: no horizontal overflow. Smallest navigation targets are 51.65px wide; main controls are at least 95px high.
- Call keypad, three-way form, Account, and install guidance open through the actual controls.
- Video overlay at 430×932 uses the full viewport; Back is 44px high and restores Home with all six navigation buttons.
- PWA uses a root manifest, real 180/192/512px icons, install prompt handling, and a service worker. Its cache is restricted to named public art/font assets and a generic offline page. Private pages, API responses, authentication, scripts, and media are never cached. Installation requires the real HTTPS app; the local iframe fixture does not prove device installation.
- 55 automated tests pass across account isolation, cross-origin rejection, reviewed calling, PWA lifecycle, and cache privacy. No real call or message was sent in QA.
- Call recovery is stored in an owner-scoped reserved server record before dialing. Reload recovery preserves the original review expiry. Delayed status responses cannot replace a pending call; single-call and conference races have regression coverage. The client shows submitting before a dial request and treats uncertain results conservatively.
- Screenshot: compact-home-390.jpg. The visual fixture uses a synthetic account; it is not published or part of the app authentication path.

## Current external dependencies

- Tavus deployment 912d9c39-bf54-4e8e-80d9-311c860fd7c9 currently permits the previous Call Desk origin. Add https://xtreme-avatar-mobile.strategic-ai.chatgpt.site to that same deployment's allowed origins. Do not create a replacement deployment, PAL, or face. The SDK loaded in preview and returned its disallowed-origin screen; live avatar video/audio and device permissions remain unverified.
- BRIDGE_URL is set as a runtime secret for this Site. The existing BRIDGE_TOKEN is still missing here because connected Railway and Sites tools hide existing secret values. Reuse the existing token through the Site's runtime secret editor. No Twilio or OpenAI secret belongs in browser code.
- Single AI calling reuses the existing bridge and existing approved phone voice. The separate web Voice button currently uses Tavus with the camera off; it is not a verified GPT Live web voice session.
- Three-way mode is currently human-only (operator plus two guests), with no AI participant or recording. Existing bridge still needs EDEN_THREE_WAY_ENABLED and EDEN_OPERATOR_NUMBER plus sufficient daily capacity. Current native readiness reported 2 remaining call units; a new three-leg conference requires 3. Do not silently raise limits.
- Messaging saves account-private drafts. Sending and image upload remain disabled in the existing messaging service.
- Calling is restricted to the active owner; shared admin/member credentials are not treated as personal calling accounts. Site access remains owner-private. Multiuser data isolation exists, but visitor-owned provider accounts are not connected.

## Operator setup

1. In the existing Tavus deployment, add the Xtreme Avatar origin above.
2. In Xtreme Avatar runtime secrets, add BRIDGE_TOKEN with the existing bridge token, then redeploy the saved version to apply the new environment revision.
3. Use Call → Call status / Check connection; review an approved recipient and purpose before starting any real call.
4. Configure the operator phone and three-way limit only with the owner's intended phone number and approved usage budget. Each participant is confirmed individually.
5. On iPhone, open the live app in Safari and use Share → Add to Home Screen. On Android, use Account → Add to Home Screen or the browser's install menu.

Live phone installation, microphone, camera, speaker output, actual AI call, three-way audio, and outbound delivery are UNKNOWN until tested on the configured production origin with the owner.
