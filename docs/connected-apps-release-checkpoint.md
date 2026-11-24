# Connected Apps release checkpoint

Status: IMPLEMENTED LOCALLY; NOT RELEASED. Independent release review stopped because the delegated reviewers exhausted the account usage allowance. Do not infer approval from builder tests.

Existing live base: Xtreme Avatar v21, source `bf9b26eab8e9e044736a6238a78a62aca1e2ded2`. Call Desk base v14, source `73e6ca72a1cef8bb1f13be99418a17d0ea2369fa`.

## Changes

- Searchable Connected Apps hub, app permissions, real per-member Call Desk approval and disconnect.
- Two-Site identity linking uses authenticated sessions on both Sites, signed server requests, expiring tickets, one-time completion codes, local account/state checks and canonical account generation/revision checks. Email is display information, never link authority.
- Approved private profile, enabled memories and coaching are bounded lower-trust user context for new GPT chat/voice sessions. Provider credentials and personal context stay server-side. Voice retries retain a fixed snapshot and reject changed SDP or revoked generations.
- Private Job folders, Results inbox and on-demand briefing derived only from saved tasks/jobs. No external autonomous execution is claimed.
- Form dictation; see `voice-input.md`.
- Terminal call receipts expose only two allowlisted end reasons. Runtime proposal adds bounded clarification and fixes false/fragmented stop handling; the 30-second confirmation deadline and 180-second maximum remain unchanged.

## Known limits / blockers

- Google visitor connectors are not activated. Sites plugin eligibility discovery is absent, so no canonical allowed connector IDs can be declared. Native ChatGPT Google connections do not grant Site visitors access.
- Etherverse execution remains unconnected; see `etherverse-work-routing.md`.
- Private memory does not yet reach Tavus or outbound calls. No automatic memory writing was added.
- Physical-phone UI, microphone permission/audio, a live approval round trip and a new real phone call are not tested.
- Guardian had independently cleared the repaired runtime stop reproductions and several focused test groups, but did not complete the final release review. Later root fixes and dictation have builder tests only.

## Resume order

1. Independently review exact final source, including callback lifecycle, cross-Site consent, snapshot/revocation handling, dictation and per-user storage. Preserve any failed/unknown gate.
2. Publish the backward-compatible runtime context support and call fix from the exact reviewed GitHub commit to the existing sandbox-code service only; verify health/readiness. Do not change other Railway environments or call limits.
3. Publish Call Desk, then Xtreme, from matching pushed source/archive versions. Preserve audiences, keys, existing deployment IDs and approved home styling.
4. Complete one user-approved account-link round trip and mobile QA, then a specifically authorized call. No automated phone/email outreach is authorized by this checkpoint.

The source edits are reversible. No existing Site was deleted, no live source or deployment was overwritten, and no new provider keys or infrastructure were created by this draft.
