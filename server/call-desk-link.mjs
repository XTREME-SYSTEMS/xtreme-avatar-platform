import { requireMember, readBody, jsonResponse } from './accounts.mjs';
const APP = 'appgprj_6aec7688554c819181a5cae574c92008';
const SERVICE = 'https://eden-skye-call-desk.strategic-ai.chatgpt.site';
const ORIGINS = ['https://www.xtremeavatar.com', 'https://xtreme-avatar-mobile.strategic-ai.chatgpt.site'];
const KEY = 'call_desk_profile_link';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder(), hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
const digest = async (value) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
async function hmac(secret, value) { const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value))); }
function config(env) { if(env.MIGRATED_IDENTITY)fail(503,'identity_mapping_required','Your existing Call Desk profile must be securely linked to this new account before personal memory is available.'); if (typeof env.XTREME_ASSISTANT_SECRET !== 'string' || env.XTREME_ASSISTANT_SECRET.length < 48 || typeof env.ASSISTANT_SITES_TOKEN !== 'string' || env.ASSISTANT_SITES_TOKEN.length < 16 || /[\r\n]/.test(env.ASSISTANT_SITES_TOKEN))
    fail(503, 'service_unavailable', 'The secure Call Desk connection is unavailable.'); return { secret: env.XTREME_ASSISTANT_SECRET, token: env.ASSISTANT_SITES_TOKEN }; }
function shape(input, keys) { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== keys.sort().join(','))
    fail(400, 'invalid_request', 'Invalid connection request.'); }
async function saved(db, userId) { const row = await db.prepare('SELECT value,version FROM private_state WHERE user_id=? AND key=?').bind(userId, KEY).first(); if (!row)
    return { version: 0, value: null }; try {
    return { ...row, value: JSON.parse(row.value) };
}
catch {
    fail(503, 'storage_unavailable', 'Your connection status could not be read.');
} }
async function store(db, userId, prior, value) { const now = new Date().toISOString(), body = JSON.stringify(value), result = prior.version === 0 ? await db.prepare("INSERT OR IGNORE INTO private_state(user_id,key,value,version,updated_at) SELECT ?,?,?,1,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(userId, KEY, body, now, userId).run() : await db.prepare("UPDATE private_state SET value=?,version=version+1,updated_at=? WHERE user_id=? AND key=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(body, now, userId, KEY, prior.version, userId).run(); if (result.meta.changes !== 1)
    fail(409, 'account_changed', 'Your account or connection changed. Refresh before continuing.'); return { value, version: prior.version + 1 }; }
async function active(db, userId) { if (!await db.prepare("SELECT user_id FROM members WHERE user_id=? AND status='active'").bind(userId).first())
    fail(403, 'account_changed', 'Account access changed. Sign in again.'); }
async function service(env, userId, action, input, fetcher) { if (!['initiate', 'status', 'complete', 'context', 'disconnect'].includes(action))
    fail(404, 'not_found', 'Not found.'); const { secret, token } = config(env), path = '/assistant/v1/profile-link/' + action, body = JSON.stringify(input), timestamp = String(Math.floor(Date.now() / 1000)), nonce = crypto.randomUUID(), subject = await hmac(secret, JSON.stringify(['xtreme-assistant-user-v1', APP, userId])); const canonical = JSON.stringify(['xtreme-assistant-v1', APP, subject, 'POST', path, timestamp, nonce, await digest(body)]); let response; try {
    response = await fetcher(SERVICE + path, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json', 'accept': 'application/json', 'OAI-Sites-Authorization': 'Bearer ' + token, 'X-Xtreme-App-Id': APP, 'X-Xtreme-User-Id': subject, 'X-Xtreme-Timestamp': timestamp, 'X-Xtreme-Nonce': nonce, 'X-Xtreme-Signature': await hmac(secret, canonical) }, body });
}
catch {
    fail(503, 'outcome_unknown', 'The connection result could not be confirmed. Check its status before retrying.');
} if (response.status >= 300 && response.status < 400)
    fail(503, 'service_unavailable', 'The secure Call Desk connection is unavailable.'); let data; try {
    const raw = await response.text();
    if (raw.length > 16000)
        throw Error();
    data = JSON.parse(raw);
}
catch {
    fail(503, 'outcome_unknown', 'The connection result could not be read. Check its status before retrying.');
} if (!response.ok) {
    const codes = ['link_conflict', 'link_changed', 'link_consumed', 'stale_revision', 'link_expired', 'invalid_completion', 'account_changed', 'context_unavailable', 'profile_required'];
    const code = codes.includes(data?.code) ? data.code : 'service_unavailable';
    const messages = { link_conflict: 'Another connection is active or pending. Refresh its status.', link_changed: 'Your linked account changed. Review the connection before continuing.', link_consumed: 'This connection confirmation has already been used.', stale_revision: 'The connection changed. Refresh its status before disconnecting.', link_expired: 'This connection link expired. Connect again.', invalid_completion: 'This confirmation does not belong to your account.', account_changed: 'Your signed-in account changed. Sign in again.', profile_required: 'Create your private profile in Call Desk before connecting.', context_unavailable: 'Your saved Call Desk preferences could not be read. Please retry.' };
    fail(code === 'link_expired' ? 410 : ['link_conflict', 'link_changed', 'link_consumed', 'stale_revision', 'account_changed'].includes(code) ? 409 : code === 'invalid_completion' ? 403 : 503, code, messages[code] || 'The secure Call Desk connection is unavailable.');
} return data; }
function validStatus(data) { if (!data || !['linked', 'pending', 'unlinked', 'revoked'].includes(data.status) || data.linked !== (data.status === 'linked') || !Number.isSafeInteger(data.revision) || data.revision < 0)
    fail(503, 'service_unavailable', 'The connection status could not be verified.'); return { status: data.status, linked: data.linked, revision: data.revision, ...(data.linked ? { displayName: typeof data.displayName === 'string' ? data.displayName.slice(0, 80) : 'Your Call Desk account' } : {}), ...(data.status === 'pending' && typeof data.expiresAt === 'string' ? { expiresAt: data.expiresAt } : {}) }; }
export async function readLinkedCallDeskContext(env, userId, fetcher = fetch) { await active(env.DB, userId); const local = await saved(env.DB, userId); if (local.value?.status !== 'linked')
    return { linked: false, status: local.value?.status === 'pending' ? 'pending' : local.value?.status === 'revoked' ? 'revoked' : 'unlinked' }; const data = await service(env, userId, 'context', {}, fetcher); await active(env.DB, userId); const current = await saved(env.DB, userId); if (current.version !== local.version || data?.linked !== true || data.status !== 'linked' || data.linkRevision !== local.value.revision || !UUID.test(data.accountGeneration || '') || !Number.isSafeInteger(data.profileRevision) || !Number.isSafeInteger(data.coachingRevision) || !data.context || JSON.stringify(data.context).length > 6000)
    fail(409, 'link_changed', 'Your linked private account changed. Review its connection before continuing.'); return data; }
export async function verifyLinkedCallDeskContext(env, userId, frozen, fetcher = fetch) { const data = await readLinkedCallDeskContext(env, userId, fetcher); if (!data.linked || data.linkRevision !== frozen.linkRevision || data.accountGeneration !== frozen.accountGeneration)
    fail(409, 'link_changed', 'Your linked private account changed. Start a new assistant session.'); return true; }
export async function handleCallDeskLink(request, env, fetcher = fetch) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/call-desk-link/'))
        return null;
    try {
        const action = url.pathname.slice('/api/call-desk-link/'.length);
        if (url.search || !['status', 'start', 'complete', 'disconnect'].includes(action))
            fail(404, 'not_found', 'Not found.');
        if ((action === 'status' && request.method !== 'GET') || (action !== 'status' && request.method !== 'POST'))
            fail(405, 'method_not_allowed', 'Use the supported connection action.');
        const input = request.method === 'POST' ? await readBody(request) : null, user = await requireMember(request, env);
        if (request.headers.get('x-xtreme-account') !== user.user_id)
            fail(409, 'account_changed', 'Your signed-in account changed. Reload before continuing.');
        if (!ORIGINS.includes(url.origin))
            fail(403, 'origin_required', 'Open Xtreme Avatar at its approved address to connect your account.');
        let local = await saved(env.DB, user.user_id);
        if (action === 'status') {
            if (!local.value)
                return jsonResponse({ status: 'unlinked', linked: false, revision: 0 });
            const data = validStatus(await service(env, user.user_id, 'status', {}, fetcher));
            await active(env.DB, user.user_id);
            if (local.value.status !== data.status || local.value.revision !== data.revision)
                local = await store(env.DB, user.user_id, local, { ...local.value, status: data.status, revision: data.revision });
            return jsonResponse(data);
        }
        if (action === 'start') {
            shape(input, []);
            if (local.value?.status === 'linked')
                fail(409, 'link_conflict', 'Disconnect the current account before connecting another.');
            if (!local.value || local.value.status !== 'pending' || Date.parse(local.value.expiresAt) <= Date.now()) {
                local = await store(env.DB, user.user_id, local, { requestId: crypto.randomUUID(), state: await digest(crypto.randomUUID() + crypto.randomUUID()), origin: url.origin, expiresAt: new Date(Date.now() + 600000).toISOString(), status: 'pending', revision: local.value?.revision || 0 });
            }
            if (local.value.origin !== url.origin)
                fail(409, 'link_conflict', 'Finish this connection at the Xtreme Avatar address where you started it.');
            const data = await service(env, user.user_id, 'initiate', { requestId: local.value.requestId, state: local.value.state, origin: local.value.origin, sourceLabel: user.email }, fetcher);
            await active(env.DB, user.user_id);
            let target;
            try {
                target = new URL(data.connectUrl);
            }
            catch {
                fail(503, 'service_unavailable', 'The connection link could not be verified.');
            }
            if (target.origin !== SERVICE || target.pathname !== '/connect/xtreme' || target.search || !/^#ticket=[0-9a-f-]{36}\.[0-9a-f]{64}$/i.test(target.hash))
                fail(503, 'service_unavailable', 'The connection link could not be verified.');
            if ((await saved(env.DB, user.user_id)).version !== local.version)
                fail(409, 'account_changed', 'Your account or connection changed. Refresh before continuing.');
            return jsonResponse({ status: 'pending', linked: false, connectUrl: target.href, expiresAt: data.expiresAt });
        }
        if (action === 'complete') {
            shape(input, ['state', 'code']);
            if (!HEX.test(input.state || '') || !HEX.test(input.code || ''))
                fail(400, 'invalid_request', 'Invalid connection confirmation.');
            if (!local.value || !['pending', 'linked'].includes(local.value.status) || local.value.state !== input.state || local.value.origin !== url.origin)
                fail(403, 'invalid_completion', 'Return using the same Xtreme Avatar account and address that started this connection.');
            const data = validStatus(await service(env, user.user_id, 'complete', { requestId: local.value.requestId, state: input.state, code: input.code }, fetcher));
            if (!data.linked)
                fail(409, 'link_changed', 'The connection could not be confirmed.');
            await active(env.DB, user.user_id);
            if (local.value.status !== 'linked' || local.value.revision !== data.revision)
                await store(env.DB, user.user_id, local, { ...local.value, status: 'linked', revision: data.revision });
            return jsonResponse(data);
        }
        if (action === 'disconnect') {
            shape(input, ['confirm', 'revision']);
            if (input.confirm !== true || !Number.isSafeInteger(input.revision) || input.revision < 1)
                fail(400, 'invalid_request', 'Confirm the current connection before disconnecting.');
            if (!local.value || !['linked', 'revoked'].includes(local.value.status) || ![input.revision, input.revision + 1].includes(local.value.revision))
                fail(409, 'stale_revision', 'Refresh your connection before disconnecting.');
            const data = validStatus(await service(env, user.user_id, 'disconnect', { revision: input.revision }, fetcher));
            await active(env.DB, user.user_id);
            if (local.value.status !== data.status || local.value.revision !== data.revision)
                await store(env.DB, user.user_id, local, { ...local.value, status: data.status, revision: data.revision });
            return jsonResponse(data);
        }
    }
    catch (e) {
        return jsonResponse({ error: e.status ? e.message : 'The account connection is temporarily unavailable.', code: e.status ? e.code : 'service_unavailable' }, e.status || 503);
    }
}
export function callDeskLinkCompletionPage() { return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Finish connecting · Xtreme Avatar</title><link rel="stylesheet" href="/call-desk-link-complete.css"><script defer src="/call-desk-link-complete.js"></script></head><body><main><p class="eyebrow">Xtreme Avatar</p><h1>Connect your private assistant profile</h1><p id="complete-status" role="status">Checking your signed-in account…</p><button id="complete-retry" type="button" hidden>Check connection again</button><a id="complete-signin" href="/signin-with-chatgpt?return_to=%2Faccount-link%2Fcall-desk%2Fcomplete" hidden>Sign in to Xtreme Avatar</a><a href="/#connections">Continue to Xtreme Avatar</a></main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" } }); }
