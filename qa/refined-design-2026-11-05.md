# Xtreme Avatar visual refinement — 2026-11-05

## Scope
Replaces the rejected compact four-tile home with the approved XPS material language and four native controls: Video, Voice, Call, Message. Uses original logo and crest artwork from the provided mockup via CSS crops; no screenshot-sized clickable imitation. Header artwork excludes the reference phone hardware. The hero has no duplicate video button. Account source behavior and API/database schema are unchanged; account asset loader cache key advances to 7.

## Visual checks
- 320 × 700: no horizontal overflow; controls 67/62/62/62 px; last control bottom590, bottom nav starts630.
- 390 × 844: no horizontal overflow; controls80/74/74/74 px; last control bottom732, nav starts768.
- 430 × 932: no horizontal overflow; controls clear nav.
- Desktop1363px: centered500px app shell, no horizontal overflow/sidebar.
- Independent mobile_site_review source and 390px screenshot review found no visual blockers. Final header crops separated the logo and title to exclude the source phone notch; final screenshot saved.
- Voice, Call and Message routes open. Back returns Home.
- Video opens430×932 layer; Close is44px high, returns Home with bottom navigation and focus on Video restored.

## Limits
All screenshots/navigation checks use a separate visual QA fixture with a fake account, excluded from the deployed tree. No evidence of real-user login, private-draft persistence, device mic/camera/audio or live avatar rendering is claimed. Tavus SDK loaded and displayed its origin allowlist rejection. Calls and message delivery remain unconnected; no calls/messages were sent. Multi-user/provider-memory acceptance remains incomplete. Preserve owner-private sharing and do not invite external visitors.

## Artwork provenance
- public/assets/xps-approved-reference.webp is a format conversion of the user-approved Xtreme Avatar Shield Showcase.png (941×1671), no creative modifications. The app displays its exact logo/crest regions with CSS; interactive text/buttons remain native HTML.
- public/assets/platinum-gold-hero.webp is generated background artwork, using the approved mockup as a material reference. Prompt: premium hero background only; wide3:2 black brushed titanium left55% calm dark space, soft platinum silver reflection right45%, diagonal brushed grain, realistic polished chrome/champagne-gold ribbons along bottom, no logos/text/icons/buttons/frame.
- Original generated PNG: /workspace/scratch/b177693503b6/generated_images/exec-d4243663-da38-45bf-a401-4e1405a9b41b.png. WebP optimization retains original dimensions.

## Rollback
Restore prior saved Sites version5/source ba0d7c60a0a6563a9e1d370afff2c1e67469c81c; no data migration is necessary.
