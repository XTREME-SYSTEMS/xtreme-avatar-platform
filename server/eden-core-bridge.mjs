// Owner-only, server-to-server Eden Core V2 communications adapter.
// Source candidate only. No Core token, issuer key, or Neon credential belongs in the client.
export const EDEN_CORE_STAGING_ORIGIN = 'https://core-api-staging-dec8a723.up.railway.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_-]{8,96}$/;
const JWT = /^[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}$/;
const fail = (status, code) => { throw Object.assign(new Error(code), {status, code}); };

export function assertCoreBinding(env, userId) {
  if (env.EDEN_CORE_BRIDGE_ENABLED !== 'true') fail(503, 'core_not_connected');
  const owner = env.EDEN_CORE_XTREME_OWNER_ID;
  if (typeof owner !== 'string' || !UUID.test(owner)) fail(503, 'core_identity_unmapped');
  if (userId !== owner) fail(403, 'core_owner_required');
  const token = env.EDEN_CORE_ACCESS_TOKEN;
  if (typeof token !== 'string' || token.length > 8192 || !JWT.test(token)) fail(503, 'core_grant_missing');
  // Core independently verifies signature, audience, tenant, owner, membership and scopes.
  return token;
}

async function readJsonBounded(response) {
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(502, 'core_invalid_receipt');
  const reader = response.body?.getReader();
  if (!reader) fail(502, 'core_invalid_receipt');
  let count = 0;
  const chunks = [];
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > 65536) fail(502, 'core_invalid_receipt');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const data = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) fail(502, 'core_invalid_receipt');
    return data;
  } catch { fail(502, 'core_invalid_receipt'); }
}

export async function callEdenCore({action, userId, input, env = process.env, fetcher = fetch}) {
  if (!['status', 'chat'].includes(action)) fail(404, 'core_route_unknown');
  const token = assertCoreBinding(env, userId);
  if (action === 'chat' &&
      (!input || Object.keys(input).sort().join(',') !== 'requestKey,text' ||
       typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000 ||
       /[\u0000-\u001f\u007f]/u.test(input.text) || !KEY.test(input.requestKey))) {
    fail(400, 'core_invalid_message');
  }

  const path = action === 'status' ? '/v1/profile' : '/v1/chat';
  const options = {
    method: action === 'status' ? 'GET' : 'POST',
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(action === 'status' ? 12000 : 65000),
    headers: {
      accept: 'application/json',
      authorization: 'Bearer ' + token,
      ...(action === 'chat' ? {'content-type': 'application/json'} : {})
    },
    ...(action === 'chat' ? {body: JSON.stringify(input)} : {})
  };
  let response;
  try { response = await fetcher(EDEN_CORE_STAGING_ORIGIN + path, options); }
  catch { fail(503, action === 'chat' ? 'core_outcome_unknown' : 'core_unreachable'); }
  if ([401, 403].includes(response.status)) {
    await response.body?.cancel().catch(() => {});
    fail(503, 'core_grant_rejected');
  }
  if (response.status === 429) {
    await response.body?.cancel().catch(() => {});
    fail(429, 'core_rate_limited');
  }
  if (!response.ok || response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    fail(503, action === 'chat' ? 'core_outcome_unknown' : 'core_unavailable');
  }
  const data = await readJsonBounded(response);
  if (action === 'status') {
    // Deliberately never expose private profile content from the readiness check.
    if (!Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.profile !== 'object' || data.profile === null) fail(502, 'core_invalid_receipt');
    return {ok:true, connected:true, brain:'eden-core-v2', scope:'owner', profileRevision:data.revision, liveChatTested:false};
  }
  if (!['completed', 'pending', 'unknown', 'failed'].includes(data.status)) fail(502, 'core_invalid_receipt');
  if (data.status === 'completed' && (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 16000)) fail(502, 'core_invalid_receipt');
  // A pending/unknown request is read back only with the SAME Core requestKey; never re-dispatch with a new key.
  return {ok:true, requestKey:input.requestKey, status:data.status,
    reply:data.status === 'completed' ? data.text : null,
    ...(data.status === 'unknown' || data.status === 'pending' ? {reconciliationRequired:true} : {})};
}
