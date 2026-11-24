import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleCallDeskLink, readLinkedCallDeskContext, verifyLinkedCallDeskContext } from '../server/call-desk-link.mjs';
import { handleAccounts } from '../server/accounts.mjs';
const ORIGIN = 'https://www.xtremeavatar.com', SECRET = 'synthetic-profile-link-secret-'.repeat(3), OTHER = 'https://xtreme-avatar-mobile.strategic-ai.chatgpt.site';
const profile = { linked: true, status: 'linked', linkRevision: 1, accountGeneration: 'ed5565b4-b928-4c05-a0c5-dc5af4cd6bb6', profileRevision: 1, coachingRevision: 0, context: { preferences: { display_name: 'Alice', custom_instructions: 'Be brief.', style: {} }, memories: { personal_facts: [], preferences: [], shared_backstory: [] }, coaching: { active_guidance: null }, omitted_count: 0 } };
function fixture() { const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('../drizzle/0000_unknown_blazing_skull.sql', import.meta.url), 'utf8')); for (const id of ['alice', 'bob'])
    sqlite.prepare("INSERT INTO members(user_id,email,role,status,created_at) VALUES(?,?,'member','active','now')").run(id, id + '@example.test'); function prepare(sql, args = []) { return { bind(...a) { return prepare(sql, a); }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; } const env = { DB: { prepare }, XTREME_ASSISTANT_SECRET: SECRET, ASSISTANT_SITES_TOKEN: 'synthetic-only-service-token' }, calls = []; let remote = { status: 'unlinked', linked: false, revision: 0 }, init = null, fail = null; const fetcher = async (url, options) => { calls.push({ url, options }); if (fail)
    throw Error('synthetic transport diagnostic must not leak'); assert.equal(options.redirect, 'manual'); assert.ok(!options.headers['X-Xtreme-User-Id'].includes('alice')); assert.match(options.headers['X-Xtreme-Signature'], /^[a-f0-9]{64}$/); const body = JSON.parse(options.body), action = new URL(url).pathname.split('/').at(-1); let data; if (action === 'initiate') {
    init = body;
    remote = { linked: false, status: 'pending', revision: 0 };
    data = { ...remote, connectUrl: 'https://eden-skye-call-desk.strategic-ai.chatgpt.site/connect/xtreme#ticket=' + body.requestId + '.' + 'b'.repeat(64), expiresAt: new Date(Date.now() + 600000).toISOString() };
}
else if (action === 'complete') {
    remote = { status: 'linked', linked: true, revision: 1, displayName: 'Alice' };
    data = remote;
}
else if (action === 'disconnect') {
    remote = { status: 'revoked', linked: false, revision: 2 };
    data = remote;
}
else if (action === 'context')
    data = remote.linked ? profile : remote;
else
    data = remote; return Response.json(data); }; async function request(action, body, user = 'alice', headers = {}, origin = ORIGIN) { return handleCallDeskLink(new Request(origin + '/api/call-desk-link/' + action, { method: body === undefined ? 'GET' : 'POST', headers: { 'oai-authenticated-user-id': user, 'oai-authenticated-user-email': user + '@example.test', 'x-xtreme-account': user, ...(body === undefined ? {} : { origin, 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, fetcher); } async function connect() { assert.equal((await request('start', {})).status, 200); return request('complete', { state: init.state, code: 'c'.repeat(64) }); } return { sqlite, env, calls, fetcher, request, connect, close: () => sqlite.close(), get init() { return init; }, get remote() { return remote; }, set remote(v) { remote = v; }, set failed(v) { fail = v; } }; }
test('new accounts remain unlinked without network or extra credentials; link metadata is private', async () => { const f = fixture(); try {
    delete f.env.ASSISTANT_SITES_TOKEN;
    assert.deepEqual(await readLinkedCallDeskContext(f.env, 'alice', f.fetcher), { linked: false, status: 'unlinked' });
    assert.equal((await f.request('status')).status, 200);
    assert.equal(f.calls.length, 0);
    f.env.ASSISTANT_SITES_TOKEN = 'synthetic-only-service-token';
    await f.request('start', {});
    const data = await handleAccounts(new Request(ORIGIN + '/api/account', { headers: { 'oai-authenticated-user-id': 'alice', 'oai-authenticated-user-email': 'alice@example.test' } }), f.env);
    assert.ok(!JSON.stringify(await data.json()).includes('call_desk_profile_link'));
    assert.equal((await f.request('status', undefined, 'bob')).status, 200);
    assert.equal(f.calls.length, 1);
}
finally {
    f.close();
} });
test('pending ticket resumes without replacing state, and callback is fenced to original account and origin', async () => { const f = fixture(); try {
    await f.request('start', {});
    const first = { ...f.init };
    await f.request('start', {});
    assert.deepEqual(f.init, first);
    assert.equal((await f.request('complete', { state: first.state, code: 'c'.repeat(64) }, 'bob')).status, 403);
    assert.equal((await f.request('complete', { state: first.state, code: 'c'.repeat(64) }, 'alice', {}, OTHER)).status, 403);
    assert.equal((await f.request('complete', { state: first.state, code: 'c'.repeat(64) }, 'alice', { 'x-xtreme-account': 'bob' })).status, 409);
    assert.equal((await f.request('complete', { state: first.state, code: 'c'.repeat(64) })).status, 200);
    assert.equal((await f.request('start', {})).status, 409);
    assert.equal((await f.request('status')).status, 200);
}
finally {
    f.close();
} });
test('linked context reads exact remote link, blocks reset/revoke/outage and verifies frozen generation', async () => { const f = fixture(); try {
    await f.connect();
    assert.deepEqual(await readLinkedCallDeskContext(f.env, 'alice', f.fetcher), profile);
    assert.equal(await verifyLinkedCallDeskContext(f.env, 'alice', { linkRevision: 1, accountGeneration: profile.accountGeneration }, f.fetcher), true);
    await assert.rejects(() => verifyLinkedCallDeskContext(f.env, 'alice', { linkRevision: 2, accountGeneration: profile.accountGeneration }, f.fetcher), { code: 'link_changed' });
    f.failed = true;
    await assert.rejects(() => readLinkedCallDeskContext(f.env, 'alice', f.fetcher), { code: 'outcome_unknown' });
    f.failed = false;
    f.remote = { linked: false, status: 'revoked', revision: 2 };
    await assert.rejects(() => readLinkedCallDeskContext(f.env, 'alice', f.fetcher), { code: 'link_changed' });
    const status = await f.request('status');
    assert.equal((await status.json()).status, 'revoked');
    assert.deepEqual(await readLinkedCallDeskContext(f.env, 'alice', f.fetcher), { linked: false, status: 'revoked' });
}
finally {
    f.close();
} });
test('disconnect changes only current account and permits future fresh linking; suspended accounts cannot read', async () => { const f = fixture(); try {
    await f.connect();
    assert.equal((await f.request('disconnect', { confirm: true, revision: 1 }, 'bob')).status, 409);
    assert.equal((await f.request('disconnect', { confirm: true, revision: 5 })).status, 409);
    assert.equal((await f.request('disconnect', { confirm: true, revision: 1 })).status, 200);
    assert.equal((await f.request('start', {})).status, 200);
    f.sqlite.prepare("UPDATE members SET status='suspended' WHERE user_id='alice'").run();
    assert.equal((await f.request('status')).status, 403);
    await assert.rejects(() => readLinkedCallDeskContext(f.env, 'alice', f.fetcher), { code: 'account_changed' });
}
finally {
    f.close();
} });
test('strict same-origin routes reject forged scope, unknown redirects, unexpected fields and service errors safely', async () => { const f = fixture(); try {
    assert.equal((await f.request('start', {}, 'alice', { origin: 'https://evil.example' })).status, 403);
    assert.equal((await f.request('start', { origin: 'https://evil.example' })).status, 400);
    assert.equal((await f.request('start', {}, 'alice', {}, 'https://evil.example')).status, 403);
    await f.request('start', {});
    f.failed = true;
    const r = await f.request('start', {}), data = await r.json();
    assert.equal(r.status, 503);
    assert.equal(data.code, 'outcome_unknown');
    assert.ok(!data.error.includes('diagnostic'));
    assert.equal((await f.request('complete', { state: 'wrong', code: 'c'.repeat(64) })).status, 400);
}
finally {
    f.close();
} });
