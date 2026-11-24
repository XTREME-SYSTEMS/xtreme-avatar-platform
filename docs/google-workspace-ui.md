# Google Workspace connection UI

## Change

The existing Connected apps screen now offers one Google Workspace connection dialog for Gmail, Calendar, Drive, Docs, Sheets, Slides, Contacts, and Tasks. Existing Gmail, Calendar, Drive, and Contacts cards open that same dialog. Home, bottom navigation, style sheets, Google app sign-in, and Call Desk business behavior were not changed.

The dialog lists the read-only permission for each service before approval. Drive is metadata only. Meet support means reading existing Calendar links, not creating, joining, or recording meetings. Users may choose a Google account independently of their Xtreme Avatar login.

## Trust and account lifecycle

Every Google status/start/disconnect request uses same-origin cookies, no-store, and the captured X-Xtreme-Account identity. A changed session invalidates the screen. Logout aborts pending work and clears state; late results cannot navigate or redraw the prior account. Direct OAuth callback page loads immediately refresh server status. Callback flags never set connected status. The screen reads and validates server status before displaying connected or authorized permission.

Consent navigation is restricted to https://accounts.google.com/o/oauth2/v2/auth with no credentials or fragment. Raw provider and transport errors are not displayed. Starts and disconnects are never retried automatically. Leaving or closing the dialog prevents pending approval responses from redirecting the user later. Google requests have an 85-second bound to accommodate the BFF's 70-second status refresh budget.

Status distinguishes read access approved from enabled assistant tools. Current runtime enables no assistant Google actions. A granted account therefore does not claim that email, Calendar, or file automation works.

Disconnect requires explicit review and the observed revision. A sanitized hasSavedConnection flag also permits local removal when provider configuration is unavailable and the account display cannot be decrypted. New-account status revision zero is accepted without treating it as a saved grant. It removes this user's saved Xtreme Avatar connection for all Google services in this app. It does not revoke Google-project permissions used by other apps. The user can separately open Google's account connections page.

## Validation

Production file: public/google-workspace.js
SHA256: 7ba3d816230b7044e9016aea015bc5b0b685fddb5355631e8befb72179600445

- Node syntax check passed.
- New client suite: 18/18 passed.
- Existing client suite: 14/14 passed.
- Combined: 32/32, exit 0.
- Guardian independently reran both suites: 32/32 passed with the same source hash before and after. No remaining blocking UI code finding.
- Tests execute the production script in a Node VM with a synthetic DOM/event harness and mocked same-origin API responses. They do not call Google.
- Tests cover setup-required, service choices, partial grants, authorization versus action availability, unsafe OAuth destinations, callback spoofing, sanitized failures, local disconnect review and stale revision, late responses, account changes/logout, closed dialog, focus refresh, and bounded timeout with no retry, direct callback startup, exact initial revision-zero status, and unavailable-config local disconnect.
- Existing test fixture changes only accommodate the Google status request and new catalog/setup copy. Call Desk URL validation, consent/disconnect review, and account-isolation assertions remain in place.

Evidence: docs/google-workspace-ui-test-results.json and docs/google-workspace-ui-checks.json.
Reproduction: node --test tests/google-workspace-oauth-client.test.mjs tests/google-workspace-client.test.mjs

## Outstanding gates

Administrator Google OAuth credentials and the approved callback must be configured before real consent is available. The current honest setup-required screen hides the consent button. Live consent, Google account switching, Google token refresh/revocation, real browser accessibility, and phone UI have not been tested by this workstream. Independent Guardian source/test review passed; live OAuth and browser/mobile checks remain outstanding. No commit, push, deployment, provider configuration, or outbound communication was performed.