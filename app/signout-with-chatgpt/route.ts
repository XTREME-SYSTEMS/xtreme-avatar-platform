import { privateResponse } from '../../server/supabase-auth';
export const dynamic = 'force-dynamic';
// A GET navigation never changes a session. Legacy links show a confirmation.
export function GET() {
  return privateResponse(new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign out · Xtreme Avatar</title><link rel="stylesheet" href="/style.css"></head><body><main class="app-shell" style="padding:24px"><section class="surface"><h1>Sign out</h1><form action="/auth/logout" method="post"><button class="dark-button wide" type="submit">Sign out of Xtreme Avatar</button></form><a class="silver-button wide" href="/">Back to Xtreme Avatar</a></section></main></body></html>', {headers:{'content-type':'text/html; charset=utf-8','referrer-policy':'no-referrer'}}));
}
