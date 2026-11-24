# Xtreme Avatar V3 | Approved visual fidelity lock
Date: 2026-11-23
Status: APPROVED REFERENCE / PREVIEW IMPLEMENTATION / NOT RELEASE CERTIFIED

## Approved reference
Owner-supplied image: Brushed Aluminum XPS Intelligence Dashboard(1).png, 941 x 1672 px.
Use as a visual reference only. Never flatten live UI into that screenshot or bake permanent labels into raster imagery.
The owner separately approved XTREME AVATAR as main headline, XPS INTELLIGENCE as secondary, without a personal name in the header.

## Composition
1. Gold metallic device perimeter, soft white illumination, dark inset bezel and rounded screen.
2. Black graphite surface with brushed horizontal micrograin and two silver-white light arcs; avoid brown matte cards.
3. White typographic hierarchy, metallic X emblem and luminous gold separator.
4. Talk to Eden: brushed steel hero, gold perimeter, glowing mic ring, vertical separator, readiness pill and arrow.
5. Six 3x2 actions: Video, Voice, Ideas, Tasks, Calendar, Approvals. Voice highlighted. All others neutral steel with thin gold edge.
6. Priorities: Review approvals and Finished only. No Project check-in or Task queue row. Synthetic values labeled.
7. Dock: Home, Workspace, Create, More, with editable vector icons and selected gold underline.
8. Video uses the full device stage with explicit Back, Mute, Camera, Captions, Interrupt, End controls. Static media never claims live operation.
9. Skins: Aluminum Gold, Silver Slate, Electric Blue, Ivory, Copper. Theme choice does not grant provider permissions.

## Implementation
- Native HTML labels/buttons; inline SVG icons; CSS metal gradients and reusable brushed-grain.svg and silver-light.svg.
- Existing provider-gated JS and onboarding retained; no new controllers, databases, credentials, or paid engines.
- Reduced motion and CSS fallbacks provided.

## Validation before public release
- Pin exact commit; export real browser screenshots at 320, 390, 430, 768 and tablet widths; verify overflow, readability, icon rendering and safe areas.
- Test all skins, keyboard focus, reduced motion, app mode switching and Video full bleed.
- Compare screenshots to approved source at matched crop; do not invent 95% or 99% parity.
- Require separately verified Tavus / voice states, secure account and consent paths, independent Guardian, owner release approval and rollback.

## Rollback
All work is isolated under public/xtreme-v3. Existing authenticated app routes and provider services remain untouched. Revert V3-only commits or the preview branch if necessary.
