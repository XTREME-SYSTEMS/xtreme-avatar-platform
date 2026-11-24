# Verification — 2026-11-05

## Passed

- JavaScript syntax: app.js and tavus-layer.js.
- Existing app.js and style.css are byte-identical to the pre-integration snapshot. Index changes limited to isolated integration assets and PWA metadata.
- Real Tavus CDN SDK loaded and rendered its own origin rejection screen.
- The Video Studio button opens one in-app dialog with exact supplied deployment ID and layout=full-screen.
- Portrait harness at 390x844: dialog390x844, embed390x791 below53px toolbar.
- Portrait harness at 320x844: dialog320x844, embed height791.
- Desktop1363x936: dialog1363x936, embed1363x883.
- Back control, Escape and browser Back restore Home, all6nav buttons, scroll styling and opener focus. Embed/dialog counts return0.
- Independent source review: close/reopen race and misleading SDK retry copy corrected and rereviewed. No source blockers for private UI publication; no direct room creation or provider secrets.
- Manifest JSON and reused PNG asset sizes checked. No provider/media caching introduced.

## Blocked / not run

- Published-origin Tavus session: blocked by missing allowed origin.
- Eden video rendering, microphone/camera permission, speaker audio, live-room teardown: NOT RUN.
- Hosted login success: UNKNOWN; cloud browser reaches ChatGPT sign-in gate. Owner-private access verified through Sites API.
- Physical iPhone/Android PWA installation, safe areas, device microphone/camera/audio and keyboard: NOT RUN.
- Live voice parity, Twilio outbound calls, message delivery, other live models and per-user/cross-device memory: NOT RUN. Local model choice is preparatory, not a live deployment switch.
- Full mockup pixel identity is not claimed. Approved structure/branding is the design target; neutral hero text follows the earlier brief.

## Next verified steps

1. Authenticate Tavus editor, add this Site origin to the existing deployment without removing old origin or changing limits.
2. Test authenticated published Site on a real phone: haircheck permissions, Eden rendering/audio, interruption, Close ends camera/mic and conversation; reopen; native Back.
3. Verify scoped existing Infinity/Call Desk visitor bindings before connecting live calling/messages/memory. Do not expose owner credentials to visitors.
4. Complete independent full-flow acceptance before any old-Site cleanup or live-release certification.
