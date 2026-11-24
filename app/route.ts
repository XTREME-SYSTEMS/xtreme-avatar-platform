/**
 * Xtreme Avatar homepage must use the OWNER-APPROVED Figma V4/V5 interface.
 *
 * The original HOME_HTML is retained for backward-compatible legacy routes
 * and backend integrations, but it is NOT the default frontend anymore.
 * Reuse the single already-tested implementation at /xtreme-v3/index.html.
 *
 * Figma source: https://www.figma.com/design/16F1Pcf7WN23HfBlBBx2Mf?node-id=42-10
 * Do not mistake a working design preview for verified live voice/video/auth.
 */
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const target = new URL('/xtreme-v3/index.html', request.url);
  const response = Response.redirect(target, 307);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
