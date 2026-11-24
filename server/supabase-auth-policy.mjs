const AUTH_PATHS = ['/auth', '/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'];
export function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return '/';
    const url = new URL(value, 'https://app.local');
    if (url.origin !== 'https://app.local' || AUTH_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
export function sameOriginRequest(request) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || origin === 'null' || new URL(origin).origin !== new URL(request.url).origin) return false;
    return request.headers.get('sec-fetch-site') !== 'cross-site';
  } catch { return false; }
}
export function apiPathAllowed(path) {
  return path === '/api/account' || path === '/api/team' ||
    path === '/api/communications' || path === '/api/work-hub' ||
    ['/api/account/', '/api/assistant/', '/api/call-desk-link/', '/api/work-hub/'].some(prefix => path.startsWith(prefix));
}

export function isPublishableSupabaseKey(key) {
  if (typeof key !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try { return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { return false; }
}
