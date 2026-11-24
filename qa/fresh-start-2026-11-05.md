# Fresh start — private interface, 2026-11-05

User chose: keep XPS appearance; main issue is wrong app experience; restart as simple home with four tools. Front-end styles and home experience rebuilt. No new Site, provider deployment, credentials or database was created; same address and private audience remain. Version3 preserved for rollback.

Verified: four equal home buttons (Video, Voice, Call, Message), Home/Account bottom navigation, explicit Back control on focused pages, collapsed avatar preference, safe account cleanup. Calls and messages disclose pending connection and do not perform outbound actions.

Browser visual fixture:390px width, four168.5×149px buttons, no horizontal overflow;320px width, four controls at least135px high, no horizontal overflow. Message and voice pages open; Back returns to home. Video opens existing deployment inside390×844 full-screen dialog; Close restores home. Tavus reports origin not allowed in local QA. Capture: fresh-home-390.jpg (visual fixture, no real account data). Clipped screenshot API timed out; documented full screenshot fallback succeeded.

Independent source/VM review found no concrete blocker for owner-private UI publication. Existing18 account tests pass. Account server and migration unchanged. Live hosted user sign-in, Tavus origin approval/media/memory isolation, calling and message delivery remain separate unverified integration gates. No boss invitation sent. The fresh UI is not a claim that live services work.
