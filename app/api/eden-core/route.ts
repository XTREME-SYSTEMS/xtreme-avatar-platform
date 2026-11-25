import {NextResponse} from 'next/server';
import {verifiedUser, privateResponse, apiError} from '../../../server/supabase-auth';
import {sameOriginRequest} from '../../../server/supabase-auth-policy.mjs';
import {callEdenCore} from '../../../server/eden-core-bridge.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 75;

async function readBoundedBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error(), {status:415, code:'invalid_content_type'});
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error(), {status:400, code:'invalid_body'});
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw Object.assign(new Error(), {status:413, code:'body_too_large'});
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const item of chunks) { bytes.set(item, at); at += item.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
  catch { throw Object.assign(new Error(), {status:400, code:'invalid_body'}); }
}

async function handle(request: Request) {
  if (new URL(request.url).search) return apiError(400, 'query_not_allowed', 'Unexpected query parameters.');
  if (request.method === 'POST' && !sameOriginRequest(request)) return apiError(403, 'invalid_origin', 'Use Xtreme Avatar directly.');
  try {
    const initial = await verifiedUser();
    const user = initial.user;
    if (!user || !user.email_confirmed_at) return apiError(401, 'sign_in_required', 'Sign in to Xtreme Avatar.');
    const suppliedAccount = request.headers.get('x-xtreme-account');
    if (suppliedAccount && suppliedAccount !== user.id) return apiError(409, 'account_changed', 'Account changed. Reload.');
    const input = request.method === 'POST' ? await readBoundedBody(request) : undefined;
    const data = await callEdenCore({action:request.method === 'POST' ? 'chat' : 'status', userId:user.id, input});
    // A session revoked mid-request may not receive private Core content.
    const refreshed = await verifiedUser();
    if (!refreshed.user || refreshed.user.id !== user.id || !refreshed.user.email_confirmed_at) return apiError(401, 'sign_in_required', 'Sign in again.');
    return privateResponse(NextResponse.json(data));
  } catch (error) {
    const failure = error as {status?:number; code?:string};
    const code = typeof failure.code === 'string' ? failure.code : 'core_unavailable';
    const status = Number.isInteger(failure.status) && failure.status! >= 400 && failure.status! <= 503 ? failure.status! : 503;
    return apiError(status, code, 'Eden Core could not verify this request. The existing assistant remains unchanged.');
  }
}
export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
