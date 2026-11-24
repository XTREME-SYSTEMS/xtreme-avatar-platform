/* Xtreme Avatar PWA: public artwork only. Private HTML/data never enter CacheStorage. */
'use strict';
const CACHE_PREFIX = `xtreme-avatar-pwa:${new URL(self.registration.scope).pathname}:public:`;
const CACHE_NAME = `${CACHE_PREFIX}20261105-1`;
const OFFLINE_PATH = '/offline.html';
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090a0b"><title>You're offline · Xtreme Avatar</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a0b;color:#f6f6f8;font:16px/1.6 Arial,sans-serif}main{max-width:390px;padding:32px}h1{font-size:30px;line-height:1.15}p{color:#d5d5dc}a{display:inline-block;padding:12px 20px;border-radius:12px;background:#f2cf6b;color:#19160c;font-weight:bold;text-decoration:none}a:focus-visible{outline:3px solid white;outline-offset:4px}</style></head><body><main><p>XPS INTELLIGENCE</p><h1>You're offline.</h1><p>Reconnect to open Xtreme Avatar and sign in. Conversations, calls, messages, and account changes need an internet connection.</p><p>Your private account pages are not stored for offline use.</p><a href="/">Try again</a></main></body></html>`;
const PUBLIC_ASSETS = new Map([
  ['/assets/app-icon-180.png', 'image/png'],
  ['/assets/app-icon-192.png', 'image/png'],
  ['/assets/app-icon-512.png', 'image/png'],
  ['/assets/xps-approved-reference.webp', 'image/webp'],
  ['/assets/platinum-gold-hero.webp', 'image/webp'],
  ['/assets/xps-shield.webp', 'image/webp'],
  ['/assets/archivo-black.woff2', 'font/woff2'],
]);
function offlineResponse() {
  return new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function canStore(response, url, type) {
  if (!response.ok || response.status !== 200 || response.redirected || !['basic', 'default'].includes(response.type)) return false;
  if (response.url && response.url !== url.href) return false;
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== type) return false;
  if (/private|no-store/i.test(response.headers.get('cache-control') || '')) return false;
  if (/\*|cookie|authorization/i.test(response.headers.get('vary') || '')) return false;
  return true;
}
self.addEventListener('install', event => {
  // This document is generated here, never downloaded from a possibly signed-in route.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(OFFLINE_PATH, offlineResponse())));
  // Let a previous worker finish naturally; never replace a running call or form.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)))));
  // No clients.claim(): existing tabs keep their current lifecycle until navigation.
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    // Even a previously visited signed-in page must come from the network.
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => offlineResponse()));
    return;
  }
  const type = !url.search && PUBLIC_ASSETS.get(url.pathname);
  if (!type || request.headers.has('authorization') || request.headers.has('range')) {
    // API, auth, HTML, scripts, media, and unknown paths have no offline replay.
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  event.respondWith((async () => {
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (canStore(response, url, type)) {
        try { const cache = await caches.open(CACHE_NAME); await cache.put(request, response.clone()); } catch { /* Quota/storage failure must not break the online app. */ }
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});
