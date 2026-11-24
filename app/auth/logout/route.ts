import { NextResponse } from 'next/server';
import { authClient, privateResponse, apiError } from '../../../server/supabase-auth';
import { sameOriginRequest } from '../../../server/supabase-auth-policy.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return apiError(403, 'invalid_origin', 'Sign out from Xtreme Avatar.');
  try {
    const supabase = await authClient();
    const {error} = await supabase.auth.signOut({scope: 'local'});
    if (error && error.status !== 401 && error.status !== 403) return apiError(503, 'sign_out_failed', 'Sign out could not finish. Please try again.');
    if (request.headers.get('accept')?.includes('text/html')) return privateResponse(NextResponse.redirect(new URL('/', request.url), 303));
    return privateResponse(NextResponse.json({ok: true}));
  } catch {
    return apiError(503, 'sign_out_failed', 'Sign out could not finish. Please try again.');
  }
}
