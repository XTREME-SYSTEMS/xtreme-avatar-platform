import { NextResponse } from 'next/server';
import { authClient, privateResponse } from '../../../server/supabase-auth';
import { safeReturnPath } from '../../../server/supabase-auth-policy.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code && !url.searchParams.has('error')) {
    try {
      const supabase = await authClient();
      const {error} = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const {data, error: verificationError} = await supabase.auth.getUser();
        if (!verificationError && data.user && !data.user.is_anonymous)
          return privateResponse(NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get('return_to') || '/'), url.origin), 303));
        await supabase.auth.signOut({scope:'local'});
      }
    } catch { /* Show a safe retry screen without disclosing provider error details. */ }
  }
  return privateResponse(NextResponse.redirect(new URL('/auth/error', url.origin), 303));
}
