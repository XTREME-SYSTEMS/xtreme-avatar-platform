# Xtreme Avatar account recovery

Account server, client, schema, route adapters, and failure-path tests were reconstructed from the earlier reviewed source outputs after the original checkout became unavailable. No UI, provider configuration, or remote release was changed by this recovery.

## Recovered contract

`window.XtremeAccount.read(key, fallback)` returns a cloned account value; `save(key, value)` queues a versioned server save and resolves to a boolean; `panel()` returns account controls. The read-only `user` and `locked` getters expose current account state. Cleanup dispatches `xtreme:account-ended`; save failures dispatch `xtreme:save-error`. The account loader uses `/app.js?accounts=3` and `/tavus-layer.js?accounts=3` so the old static app cannot import browser-local records into authenticated account state.

The server trusts Sites dispatch authentication headers, binds records to the verified site-specific subject, and reads bootstrap role emails only from `XTREME_OWNER_EMAIL` and `XTREME_ADMIN_EMAIL`. Unknown users require a current invitation. Administrator role cannot grant another administrator or modify the owner. Team rosters never expose private state.

## Evidence

`node --test tests/accounts.test.mjs tests/accounts-client.test.mjs` passed all 18 tests in the reconstructed main checkout: 13 server tests using real in-memory SQLite, and five browser-client failure-path tests using a minimal Node VM DOM. This verifies local account authorization/isolation, compare-and-swap writes, body/origin validation, invitation and role races, account-switch cleanup, stale response suppression, and request/signout time limits, and frozen edits during pending signout with cancellation recovery. It is not a hosted authentication or provider-media test.

Migration `0000_unknown_blazing_skull.sql` was recovered from the prior source output. Drizzle regenerated SQL was byte-identical. The metadata snapshot/journal were regenerated from the same recovered schema, with the journal tag aligned to the recovered filename. These are replacement metadata, not claimed to be byte-identical to unavailable original metadata.

## Remaining release boundaries

The Site must remain owner-private while hosted D1/authentication checks and provider gates are unresolved. Tavus origin approval, actual live media, and cross-account provider memory isolation remain unverified. No boss invitation or multi-user rollout is supported by this local test evidence. The UI accurately labels call/message sending as awaiting connection.

A further source review found and the parent fixed a signout/edit race: controls could enqueue another save after signout captured its initial queue snapshot. Pending signout now freezes the page and rejects new saves/duplicate signout requests, while existing queued tasks drain. A new independent regression verifies cancellation restores interactivity and permits subsequent saves. The final 18-test result includes this correction.
