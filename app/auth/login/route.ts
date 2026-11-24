import { NextResponse } from 'next/server';
import { authClient, privateResponse, apiError } from '../../../server/supabase-auth';
import { safeReturnPath } from '../../../server/supabase-auth-policy.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get('return_to') || '/');
  try {
    const supabase = await authClient();
    const callback = new URL('/auth/callback', url.origin);
    callback.searchParams.set('return_to', returnTo);
    const {data, error} = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {redirectTo: callback.href, queryParams: {prompt: 'select_account'}, skipBrowserRedirect: true}
    });
    if (error || !data.url) return apiError(503, 'sign_in_unavailable', 'Google sign-in is not available yet. Please try again shortly.');
    return privateResponse(NextResponse.redirect(data.url, 303));
  } catch {
    return apiError(503, 'sign_in_unavailable', 'Google sign-in is not available yet. Please try again shortly.');
  }
}
