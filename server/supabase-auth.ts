import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { apiPathAllowed, sameOriginRequest, isPublishableSupabaseKey } from './supabase-auth-policy.mjs';

export function publicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url) || !isPublishableSupabaseKey(key)) throw new Error('auth_not_configured');
  return { url: url.replace(/\/$/, ''), key };
}
export async function authClient() {
  const config = publicSupabaseConfig();
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
    cookies: {
      getAll() { return jar.getAll(); },
      setAll(values) { for (const {name, value, options} of values) jar.set(name, value, options); }
    }
  });
}
export function privateResponse(response: Response) {
  response.headers.set('cache-control', 'private, no-store, max-age=0');
  response.headers.set('pragma', 'no-cache');
  response.headers.set('expires', '0');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('vary', 'Cookie');
  return response;
}
export function apiError(status: number, code: string, error: string) {
  return privateResponse(NextResponse.json({error, code}, {status}));
}
export async function verifiedUser() {
  const supabase = await authClient();
  const {data, error} = await supabase.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) return {supabase, user: null};
  return {supabase, user: data.user};
}
export async function proxyApi(request: Request) {
  const input = new URL(request.url);
  if (!apiPathAllowed(input.pathname)) return apiError(404, 'not_found', 'This API route was not found.');
  if (!['GET', 'POST'].includes(request.method)) return apiError(405, 'method_not_allowed', 'This method is not supported.');
  if (request.method === 'POST' && !sameOriginRequest(request)) return apiError(403, 'invalid_origin', 'Open Xtreme Avatar directly to continue.');
  try {
    const {supabase, user} = await verifiedUser();
    if (!user) return apiError(401, 'sign_in_required', 'Please sign in to Xtreme Avatar.');
    // Only retrieve the token after a fresh getUser check; the edge function verifies it again.
    const {data, error} = await supabase.auth.getSession();
    if (error || !data.session?.access_token || data.session.user.id !== user.id) return apiError(401, 'sign_in_required', 'Please sign in again.');
    const owner = request.headers.get('x-xtreme-account');
    if (owner && owner !== user.id) return apiError(409, 'account_changed', 'Your signed-in account changed. Reload to continue.');
    let body: ArrayBuffer | undefined;
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return apiError(415, 'invalid_content_type', 'Send a JSON request.');
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      if (reader) {
        for (;;) {
          const {done, value} = await reader.read(); if (done) break;
          size += value.length;
          if (size > 131072) { await reader.cancel(); return apiError(413, 'body_too_large', 'This request is too large.'); }
          chunks.push(value);
        }
      }
      const merged = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
      body = merged.buffer;
    }
    const config = publicSupabaseConfig();
    const headers = new Headers({authorization: 'Bearer ' + data.session.access_token, apikey: config.key, accept: 'application/json', origin: input.origin});
    for (const name of ['content-type', 'x-xtreme-account', 'idempotency-key']) {
      const value = request.headers.get(name);
      if (value && value.length < 1024) headers.set(name, value);
    }
    const upstream = await fetch(config.url + '/functions/v1/xtreme-avatar-api' + input.pathname + input.search, {
      method: request.method, headers, body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(input.pathname === '/api/assistant/chat' || input.pathname === '/api/assistant/voice/start' ? 90000 : 15000)
    });
    if (upstream.status >= 300 && upstream.status < 400) return apiError(502, 'service_unavailable', 'The assistant service returned an unexpected redirect.');
    const output = new Headers();
    for (const name of ['content-type', 'retry-after', 'x-request-id']) {
      const value = upstream.headers.get(name); if (value) output.set(name, value);
    }
    return privateResponse(new Response(upstream.body, {status: upstream.status, headers: output}));
  } catch (error) {
    if (error instanceof Error && error.message === 'auth_not_configured') return apiError(503, 'setup_required', 'Account sign-in is being configured. Please try again shortly.');
    return apiError(503, 'service_unavailable', 'The assistant service is temporarily unavailable. Please try again.');
  }
}
