# Private construction work hub

The work hub provides Job Folders, a Results Inbox, and a Today Briefing. It stores only the current member's explicitly saved work. It does not run external jobs, fetch linked documents, send communications, or claim autonomous delivery.

## Integration

- Server: `handleWorkHub(request, env)` exported by `server/work-hub.mjs`.
- Load `/work-hub.css` and `/work-hub.js` after `XtremeAccount` is ready.
- Render `XtremeWorkHub.render(mode)` with `projects`, `results`, or `briefing`; call `activate(mode)` after inserting the markup.
- `xtreme:work-hub-ready` and `xtreme:work-hub-changed` notify the shell. `activate()` is idempotent and does not auto-retry failed reads on re-render.
- `hasUnsaved()` participates in sign-out safeguards. Drafts survive internal navigation and Refresh; explicit Cancel discards them. Account end aborts requests and clears all state.

## API and persistence

GET `/api/work-hub?day=YYYY-MM-DD` returns `{userId,version,jobs,results,briefing,limits,refreshedAt}`. The client supplies its local date for the daily view; absent dates use UTC. Every request requires trusted Sites identity, active membership, and `x-xtreme-account` matching that identity. GET with an explicit cross-origin Origin is denied. POST requires the same-origin JSON checks in `readBody()`.

POST `/api/work-hub/jobs` or `/api/work-hub/results` accepts `{action:"create"|"update",version,id,data}` or `{action:"delete",version,id}`. Only exact schemas are accepted. Version is the loaded workspace version. The server uses an atomic compare-and-set and checks active membership within every mutation. Stale or duplicate submissions do not overwrite newer data.

One existing `private_state` row per member, key `work_hub_v1`, holds the versioned document. No migration or new service is needed. Limits: 30 jobs, 50 results, 5 links per item, 220 KB total serialized data. Existing `plans` remain untouched.

Jobs contain name, client, location, stage, optional due date, notes, and HTTPS links. Results contain title, kind, saved text, and links. Results always carry server-owned `origin:"saved_by_you"`; client-supplied provenance or completion statuses are rejected. Links prohibit unsafe schemes, credentials, local hostnames, and literal IP targets; browser rendering checks them again. Linked file contents are never fetched by this module.

The briefing computes due/overdue jobs and counts open/done task envelopes from this member's `plans` row. It does not infer events from free text or read another account. Calendar and mail remain explicitly not connected. It runs when opened/refreshed, not as a background schedule.

## Validation and limits

`tests/work-hub.test.mjs` verifies authentication, cross-user isolation, optimistic updates, explicit deletes, race-time revocation, bounded input and links, and briefing provenance. `tests/work-hub-client.test.mjs` runs the browser module against the server handler with an in-memory SQLite D1 adapter, including duplicate submission, navigation draft persistence, failure/retry behavior, late account responses, and escaped content. These fixtures do not certify physical phone rendering or live hosted persistence.
