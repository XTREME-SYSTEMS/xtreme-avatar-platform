# Assistant profiles and Google Workspace

The existing Xtreme Avatar home design, voice engine, Tavus deployment, and bottom navigation are preserved. `#models` is the avatar, skills, and autonomy screen; `#connections` is the Google Workspace setup directory.

## What is implemented

- 24 named chat personas, descriptions, search, and specialist focus.
- 12 selectable skill focuses and 4 connection-dependent skills shown as pending.
- Advisor, Drafting copilot, and Supervised operator control conversation style and planning initiative. Bounded autopilot is unavailable and rejected by the server.
- Persona and preferences use the authenticated member's existing private-state records. New chat turns receive a bounded, server-built catalogue context. Displayed chat history remains the user's actual messages; pending retries retain their original context.
- These preferences do not grant account access, tools, background execution, sending, calling, or scheduling. Live voice and video retain the existing company assistant.

## Google Workspace connection blocker

Native discovery confirmed installed Gmail, Google Calendar, Google Drive, and Google Contacts plugins. Docs, Sheets, and Slides are provided through Drive. Calendar supports creating Meet links with events. No dedicated Google Chat or Google Tasks connector was discovered.

The current tool environment does not expose Sites `list_plugin_eligibility` / `sites_list_plugin_eligibility`. Consequently the allowed Site-specific plugin/connector pairs cannot be obtained. This is unknown Site eligibility, not proof of an administrator denial. Native plugin availability alone does not grant visitors access.

The Site manifest remains unchanged, without Google declarations. The connection directory does not invoke providers or collect credentials. Its Open Google links are clearly marked external app links, not authorization or connection actions. No Google data is copied from the owner into visitor accounts.

## Resume actual linking

1. Retrieve Sites eligibility for `appgprj_6aec7688554c819181a5cae574c92008` and use only returned allowed canonical plugin and connector IDs.
2. Declare the supported connectors with the narrowest necessary access in `.openai/hosting.json`.
3. Implement fixed server-owned actions using the existing request-scoped connector binding, same-origin validation, authenticated membership, bounded inputs, private/no-store responses, and account-switch fences.
4. Offer top-level connection flow only on a real `reauthentication_required` result. Preserve separate status for each app.
5. Test each visitor's own account, return from consent, refresh, authorization failures, isolation, and any explicitly authorized write. Never infer a live connection from deployment success.

## Validation scope

Automated account, preference, conversation-contract, route, UI lifecycle, and Google-directory tests are used. The managed preview starts, but the browser cannot reach its issued URL (`ERR_CONNECTION_REFUSED`), so rendered browser and physical-handset QA are unverified. No live calls, email sends, calendar writes, or paid media sessions are initiated by these checks.
