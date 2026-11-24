import { privateResponse } from '../../../server/supabase-auth';
export const dynamic = 'force-dynamic';
export function GET() {
  return privateResponse(new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Xtreme Avatar</title><link rel="stylesheet" href="/style.css"></head><body><main class="app-shell" style="padding:24px"><section class="surface"><h1>Sign-in did not finish</h1><p>Your sign-in link may have expired or been opened in another browser. Please try again here.</p><a class="gold-button wide" href="/auth/login">Continue with Google</a><a class="silver-button wide" href="/">Back to Xtreme Avatar</a></section></main></body></html>', {status:400, headers:{'content-type':'text/html; charset=utf-8', 'referrer-policy':'no-referrer'}}));
}
