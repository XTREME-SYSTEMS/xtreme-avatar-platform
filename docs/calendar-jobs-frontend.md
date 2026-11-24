# Calendar & jobs frontend — phase one

Implemented in the existing Xtreme Avatar frontend. The approved home renderer, navigation destinations/labels, HOME_HTML and global styles remain unchanged. Tasks adds one Calendar & jobs entry. Connected apps adds Open Calendar and an explicit, optional Calendar editing permission upgrade. Desktop widening applies only while #calendar is active and is removed on exit.

## User experience
- Phone-first month grid, week/day timeline, date navigation, Today and selected-day agenda. Appointments use restrained color chips; the selected Google account and provider timezone are visible.
- Week scrolling has a visible phone hint. Narrow event titles are clamped, while the full appointment remains in its accessible label and agenda.
- Appointment drawer separates private app job metadata/photos/files from Google Drive links. Existing WorkHub job folders are reused. A missing folder remains visibly unavailable until the user explicitly chooses another folder or Unlinked.
- Create/edit requires server capability and optional Calendar manage consent. External, recurring, guest or otherwise unsupported appointments remain read-only with Open in Google.
- Every Google change uses the existing prepare/review/commit protocol. The concrete review shows Google account, dates, private visibility, no guests/notifications and reminders off. Merely receiving an assistant review never commits it.
- Ask AI Assist opens the current chat draft with date/timezone intent. The server-backed assistant can hand off an already-prepared receipt using XtremeJobCalendar.showPreparedReview({connectionRevision,review}); the same normal review and confirmed commit flow is used.
- Persistent voice remains operable inside the native drawer. Inactive cleanup is labelled microphone off; only an active session offers Mute. Ordinary call, actual call preparation and call confirmation stop voice before the call handler runs.

## Privacy and recovery
All Google and private-file requests use current account and connection revision headers, same-origin credentials and no-store. Generation checks and AbortControllers reject stale results; dialog close, route exit, logout and account change clear private data and previews. No event/job/file content or review tokens enter localStorage, sessionStorage, service-worker caches or logs.

Only {ownerId,requestId,connectionRevision} is saved in sessionStorage immediately before commit. This is same-tab session recovery, not a cross-device store. The runtime's durable existing-operation guard supplies recoveryRequestId after tab loss. Uncertain writes block another save and offer Check save status. Reconciliation first verifies the current connection revision; not-found/wrong-Google-account results preserve the ID and request reconnection to the original account. A terminal commit error only clears pending when it names the exact current request.

Private file flow uses reserve, one explicit upload, content validation and reviewed removal. Unknown uploads are reconciled by checking files status rather than resending. The server attachments capability gates every action. Files remain capped at 4,000,000 bytes. JPEG/PNG/WebP preview headers and dimensions are checked before decoding, rendered only to canvas, resized to at most800px and limited to one retained bitmap. PDFs download only with the canonical job-file.pdf name; Blob URLs are revoked.

## Validation
- Existing Google client suites:48/48 passed after changing one expectation to the accurate Calendar manage-permission copy. Existing account isolation, late callback and Call Desk assertions remain.
- Actual fresh headless Chrome, loopback-only synthetic fixture:21/21 passed before the final terminal-error-ID regression was added. Final independent rerun covers22 checks; its result is docs/job-calendar-qa/results.json. Do not treat that pending rerun as passed until its report says so.
- Browser checks use real app.js, job-calendar.js, google-workspace.js and calling.js. They cover month/week/day, actual mobile/desktop rendering, keyboard dates, overlapping events, all-day exclusive end, ambiguous DST input, no implicit consent, canvas preview, explicit synthetic upload/removal, private-storage gating, unavailable folder unlink, review-before-write, unknown recovery after reload/reconsent/notfound, server recovery ID, assistant review handoff, call microphone handoff, delayed response/close/logout and home/nav return parity.
- Ten screenshots in docs/job-calendar-qa/ use synthetic construction jobs. No real customer, Google data, provider writes, calls or uploads were used.
- Syntax checks passed. docs/job-calendar-final-source.json records hashes and exact home/nav/global-style parity.
- Browser execution uses an isolated Playwright1.65.0 installation outside the repository and a fresh headless Chrome context. All nonloopback network requests are blocked. No browser profile or project dependency changes were made.

Run browser tests with node tests/job-calendar-browser.cjs. Set XTREME_PLAYWRIGHT_MODULE to an external playwright-core installation, or use the local docs/job-calendar-playwright.json configuration. The runner exits nonzero on failure and writes a bounded report/screenshots. The machine-specific probe/install/config scripts and generated debug failure image are local QA support, not required production assets.

## Owned source
- public/job-calendar.js: 5c4370cd9fb11c157ce272d63552a536f77c4143b6b8c642ff944676e606527f
- public/job-calendar.css: c90fd24b01c0f53039f4978905f8b758773cba7b8c44c895ba33009aaed679c1
- public/app.js: 3e94a349304c438f31b4d60617f3bc74fad3f4e6fae131bb3f1288e88340f1e9
- public/accounts.js: 10a9425a6c73a726931fe3edd6fcced3a7ae98e4fb8ba58ac4298f9bacdceeb0
- public/google-workspace.js: 378622bf63261bb7983a7954b83b6d331b91b02878aee9ec3fc735b0e52eb0b5
- tests/job-calendar-browser.cjs: dd15f033632b7d2adf114ec9d8ef7524b1e511d0c2e5dc1b7ca0401b8d7d4d34
- tests/job-calendar-fixture.cjs: 1615575c60c45d59ad762d82e2ce3c0bf5a15083aa0f81f5ee2226c2544438c0
- tests/google-workspace-oauth-client.test.mjs: 267cb197cf34eb5f599be9c68d37a2ee7aa4a10e58d6724ac7d9ab384935d097

No commit, push, deployment or live Google write was performed by this frontend workstream. Live provider editing/consent, actual private storage and physical-phone behavior remain release/integration gates owned by the parent and independent Guardian.
