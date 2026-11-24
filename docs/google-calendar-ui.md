# Calendar read UI — Xtreme Avatar

## Scope

Only public/google-workspace.js production code changed. The existing Google Workspace dialog offers “View upcoming appointments” only when a fresh status verifies Calendar authorized and enabled. Home HTML, public/app.js, bottom navigation, and all tracked CSS remain byte-identical to HEAD.

Appointments never load from merely opening the screen, selecting Calendar, returning from OAuth, or refreshing connection status. An intentional button click performs GET /api/connections/google/calendar using same-origin credentials, no-store, X-Xtreme-Account, and the captured X-Xtreme-Connection-Revision.

## Behavior and privacy

The view shows the next seven days from the primary calendar, up to 25 events, with title, date/time, and location. Text from the provider is inserted through textContent, never HTML. Timed appointments use the returned calendar timezone. All-day dates are kept as calendar dates, and the exclusive end date is displayed correctly. Empty/loading/error/refresh states and the provider hasMore flag are handled.

Each read captures account identity, generation, and connection revision. Close, route changes, account changes/logout, Google status refresh, reconnection, and disconnection clear rendered and in-memory events and abort pending work. Late responses cannot restore old data. Overlapping reads and automatic retries are prevented. Rechecking Google status does not automatically reload private appointments.

Only fixed allowlisted error messages are shown: missing approval/reconnect, API setup disabled, rate limiting, changed connection, timeouts, and temporary outages. An error provides an explicit Check Google status control so users can recover revision changes without unnecessary consent.

No event URLs, attendees, descriptions, writes, or outbound actions are exposed. Data is not sent to assistant context or memory. No localStorage, sessionStorage, or CacheStorage use was added. Existing public/sw.js routes all API and unknown paths directly to the network with no-store; only public artwork/fonts are cacheable.

## Validation

Source SHA256: 69b4e433ffee13ad1c6b59c80e07299d49012a9a707d2d5f9982a81273659c07
Calendar test SHA256: 89295d9051d7e273a0949414b1e74a011a45f37f7e369e81d30842dc68c4f906

Node syntax check passed. Guardian independently reran the final unchanged source: 48/48 passed with no blocking UI code finding. Builder client suites: 48/48 passed, including all 32 prior Workspace/Call Desk tests and 16 Calendar tests. Tests run the production script in a Node VM with a synthetic DOM, event dispatch, textContent nodes, and mocked same-origin responses; no live Google calls.

Coverage includes explicit-only reads, authorization/enabled gates, headers and read-only requests, plain-text injection handling, timezone and all-day dates, cap/hasMore/empty states, invalid payloads, errors, aborts, closure/navigation, account replacement/logout, revision races, failed refresh, local disconnect/reconnect, timeout, and safe recovery.

Reproduce:
node --test tests/google-calendar-client.test.mjs tests/google-workspace-oauth-client.test.mjs tests/google-workspace-client.test.mjs

Evidence: docs/google-calendar-ui-test-results.json
Runner: docs/run-google-calendar-ui-tests.cjs
The runner also verified all 16 tracked home/app/CSS files against HEAD.

## Outstanding

The actual Python adapter fixture passed through the real client renderer, including whole-second ranges, millisecond timed events, exclusive all-day ends, and maximum-length Unicode fields. Independent Guardian review passed; browser/mobile Calendar rendering remains a live user test. No real browser/mobile rendering or live Calendar-data request was performed by this workstream. No commit, push, deployment, or provider configuration change was made.
