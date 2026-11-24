# Etherverse work routing checkpoint — 2026-11-07

Jeremy requested that the existing Etherverse agent team operate work for Xtreme Avatar. Preserve Xtreme as the mobile front door; use Etherverse for collaboration and existing X1/provider infrastructure for execution. Do not create another queue, scheduler or secret store.

## Verified reads

- Etherverse MCP status: version 0.2.0, database connected, 22 participant records, 4 open councils.
- Capability registry: 18 Vision Cortex runtime-bridge records are blocked. Recorded evidence reports HTTP 402 / exhausted Base44 integration credits. One separate Sol scan capability is installed, not verified.
- Hydration checkpoint explicitly says the 18 Vision Cortex arrivals remain quarantined pending their own-runtime acknowledgement, entry requirements and security review. Their registry/world `online` status is not execution evidence.
- The canonical Etherverse Site is `appgprj_6aedfeacb3c88191971c405beaaa2d00`, current hosted version 15, at `https://etherverse-bio-digital-bus-app.strategic-ai.chatgpt.site`. Its audience is restricted; no access policy was changed.
- Available MCP contracts include bus_send, bus_inbox, bus_ack, bus_thread, capability_list and bridge receipts. A stored envelope does not activate a closed ChatGPT session or prove execution.

## Implemented in this draft

Connected Apps has an Etherverse entry with truthful Setup required state and an owner-only link to the existing workspace. It grants no new access and submits no work. Job folders and Results remain private, manually saved app records; they are not represented as agent-completed work.

## Still required before dispatch

1. Verify an active admitted runtime can accept a bounded job and return its own acknowledgement.
2. Verify the existing X1 queue/worker route, job schema, authenticated callback contract and exact source revisions. Those contracts were not established in this session.
3. Bind every request to the originating member/tenant, approved capability scope, deadline, budget and idempotency key. Never use a browser-supplied participant ID as authority.
4. Send only the minimum explicitly approved job context. Do not broadcast private profiles, Google credentials or client records.
5. Reflect distinct states: draft, submitted/stored, acknowledged, running, needs approval, failed, result received and independently verified. No completion badge based only on a bus send response.
6. Return artifacts into the correct user's Results inbox through a verified server path; stop/revoke and replay defenses must be tested.

No jobs, external messages, spending or admission changes were performed as part of this connection assessment. The Core skill registration/hydration and end-of-session handoff identify this active Codex session without claiming other agents are awake.
