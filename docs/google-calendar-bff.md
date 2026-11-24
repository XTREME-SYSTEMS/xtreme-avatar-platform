# Google Calendar BFF evidence

Prepared 2026-11-07 against app branch `migration/vercel-supabase`, base `cd6aec1df1ddbd90c31651d9d138c118eacd4245`. This change adds a bounded read path; it does not enable Google writes, meetings, automatic scheduling, or other Workspace tools.

## Route and authentication

- `GET /api/connections/google/calendar` accepts no query or body.
- Fresh Supabase `getUser()` must confirm a nonanonymous identity before `getSession()`; the returned session user must match. The caller's `X-Xtreme-Account` must match that verified UUID.
- Only the three existing preview origins are accepted. Cross-site reads, conflicting Origin, inbound bearer/API/identity headers and unknown X-Xtreme identity channels fail closed.
- A canonical positive safe-integer `X-Xtreme-Connection-Revision` is required. The BFF forwards it with rebuilt identity headers to the fixed Railway `POST /xtreme/v2/google/calendar` endpoint and an empty JSON body.
- The existing runtime independently verifies bearer, active membership, Workspace entitlement and stable session. It owns encrypted Google grants, refresh, selected/granted scope and revision fences. There are no Google credentials in this BFF.
- The existing OAuth login/callback behavior is unchanged. Provider redirects are never followed; no provider URLs are selected by callers.

## Read-only response contract

The runtime returns the next seven days of primary Calendar events, capped at 25. The BFF bounds response bytes to 65,536, decodes fatal UTF-8, validates the ready state and valid IANA time zone, enforces a fresh exactly-seven-day UTC range, valid event dates/order/overlap, unique ASCII identifiers and a boolean hasMore.

Only state, timeZone, rangeStart, rangeEnd, events and hasMore are returned. Each event is projected to id, title, start, end, allDay and location. Identifier/time-zone caps are 256/100 ASCII characters; title/location caps are 200/300 UTF-16 code units. All-day end dates are exclusive. Timed values use UTC timestamps with up to three fractional digits; the Python producer emits milliseconds. Text remains plain text with markup, URL fragments and control characters removed. Descriptions, attendees, provider links, next-page tokens and unknown fields are dropped.

The actual final Python adapter's synthetic response is preserved at `tests/fixtures/google-calendar-runtime.json`. It contains no Google account data. Both the backend and frontend regression suites consume this shared fixture to catch Unicode and timestamp drift.

## Errors, cancellation and availability

Known status/code pairs map to fixed messages for disabled setup, missing connection/scope, revoked authorization, changed revision, API disabled, throttling and timeouts. Raw provider error fields are never returned. Unknown codes receive a generic failure. Responses use private/no-store headers and no-referrer.

The runtime has an overall 60-second deadline; the BFF deadline is 70 seconds, the UI waits up to 85 seconds, and the Next route retains its 90-second limit. Browser cancellation is forwarded and results are discarded after cancellation. Reads are only retried by an explicit user action.

Calendar availability is advertised only when the runtime explicitly returns Calendar authorized=true and enabled=true. All other Workspace services remain disabled in the BFF snapshot. The runtime feature flag `GOOGLE_CALENDAR_READ_ENABLED` defaults to false; deploying source does not by itself prove live Calendar operation.

## Builder verification and limits

The original Google BFF suite and new Calendar BFF suite pass together: 37 tests, zero failures. Coverage includes missing/changed identity, account fence, exact origin, spoofed headers, malformed/revision/query/method requests, known and unknown provider errors, redirects, cancellation, payload/UTF-8 bounds, schema/date/Unicode boundaries, text projection, feature advertisement and the actual Python synthetic fixture.

The source checkout was clean before these edits; no repository/ancestor AGENTS.md files were present. No live Google API, consent, credential, deploy, commit or push operations were performed by this backend workstream. Independent Guardian validation and parent-controlled deployment/live verification remain separate gates.

## Files

- `server/google-workspace-proxy.mjs`
- `app/api/connections/google/calendar/route.ts`
- `tests/google-calendar-bff.test.mjs`
- `tests/fixtures/google-calendar-runtime.json`
- `docs/google-calendar-bff.md`

Rollback is a parent-controlled source revert with the Calendar runtime flag disabled. Existing OAuth grants and previously working login/connection routes need not be removed.
