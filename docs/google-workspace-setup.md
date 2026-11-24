# Google Workspace connection setup

Xtreme Avatar keeps app sign-in separate from each person's Google Workspace authorization. Every user must first be an active invited app member.

## Existing resources

- Frontend: xps-admin/xtreme-avatar, migration/vercel-supabase.
- Runtime: existing eden-outbound-call service in Strategic Sandbox System / sandbox-code.
- Workspace OAuth: a dedicated web client named Xtreme Avatar Workspace in the XPS Operations Google Cloud project. Use its matching ID and secret already saved in Railway.
- Do not reuse or modify the existing Supabase Google sign-in client. Its Google Cloud project was not identified during this work.
- App members: Account -> Manage members -> Approve member. This does not send an email. Testers also need Vercel preview access.

## Google Cloud configuration

Use the dedicated Workspace web client with this exact Authorized redirect URI:

https://xtreme-avatar-git-migration-ver-dd2679-strategic-minds-advisory.vercel.app/api/connections/google/callback

Keep the working Supabase sign-in callback separate. This server OAuth flow does not require a browser JavaScript origin.

For the current private test, Google Auth Platform -> Audience is External / Testing with explicit test users. Audience applies to the whole Google Cloud project, not a single client. The owner reported saving this correction after org_internal. Further public rollout requires the appropriate Google review and publishing settings.

Enable the Google Calendar API in that same project before testing event reads:
https://console.cloud.google.com/apis/library/calendar-json.googleapis.com

## Runtime configuration

Server-only variables on the existing runtime:

- GOOGLE_WORKSPACE_CLIENT_ID: the dedicated Workspace web client ID.
- GOOGLE_WORKSPACE_CLIENT_SECRET: its matching secret, entered directly in Railway.
- GOOGLE_WORKSPACE_TOKEN_KEY: the existing persistent 32-byte base64url AES-GCM key. Preserve it; rotating it without migration makes existing grants unreadable.
- GOOGLE_WORKSPACE_ENABLED: enables per-user authorization.
- GOOGLE_CALENDAR_READ_ENABLED: defaults false; enables the separately reviewed read-only Calendar adapter when deployed and approved.

Never put secrets in chat, frontend code, GitHub, NEXT_PUBLIC variables or user-visible logs.

## User flow

1. Sign in to Xtreme Avatar as an approved member.
2. Open Connected apps -> Google Workspace.
3. Select the services to authorize; use Calendar only for the first test.
4. Continue with Google, then Continue to Google.
5. Choose your own Google account and approve the requested read access.
6. Return to Connected apps and verify the displayed account and approved services.
7. When Calendar reading is enabled, choose View upcoming appointments to test the primary calendar.

The current Calendar reader is limited to the next seven days and at most 25 appointments per request. It includes title, start/end, all-day status and location, without attendees or descriptions. It does not create or change appointments, create Meet links, run background sync, or supply events to AI chat automatically.

Gmail, Drive metadata, Docs, Sheets, Slides, Contacts and Tasks can have separate read-only permissions approved. Their data/action adapters are not implemented by the Calendar change. Permission approval must never be labelled as working data access.

## Privacy and disconnect

Selecting a work Google account does not change the app login. The saved grant is isolated by verified app user, and service access requires both the requested and actually granted scope. Tokens remain encrypted in the existing Railway private durable database; none are sent to the browser or assistant context.

OAuth attempts are short-lived, single-use and bound to the initiating app session and exact callback origin. Calendar data is fetched only on an explicit user action, held in the open dialog and cleared when the account/connection changes or the dialog closes. Responses are private and no-store.

Disconnect forgets only this user's app grant. It does not revoke Google permissions across clients in the same Google project.

## Evidence and remaining checks

On 2026-11-07 the owner reported Calendar connected. Runtime logs corroborate start 200 at 19:28:51Z, complete 200 at 19:29:37Z and status 200 at 19:29:39Z. Exact returned account/scopes were not independently inspected. At that checkpoint no private Calendar events had been read.

Before wider rollout, verify a real Calendar read, token refresh and revoked access, local disconnect/reconnect, two actual app members and account switching, plus mobile QA. Keep the original Site and production domain unchanged until the broader migration release gates pass.

Calendar rollback: set GOOGLE_CALENDAR_READ_ENABLED=false and deploy; retain the Google consent grant, encryption key and existing volume. Authorization rollback is separately controlled by GOOGLE_WORKSPACE_ENABLED.
