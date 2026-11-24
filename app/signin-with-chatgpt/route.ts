import { NextResponse } from 'next/server';
import { safeReturnPath } from '../../server/supabase-auth-policy.mjs';
import { privateResponse } from '../../server/supabase-auth';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL('/auth/login', url.origin);
  target.searchParams.set('return_to', safeReturnPath(url.searchParams.get('return_to') || '/'));
  return privateResponse(NextResponse.redirect(target, 303));
}
