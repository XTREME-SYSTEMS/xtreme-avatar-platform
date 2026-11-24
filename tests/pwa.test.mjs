import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://xtreme.example';
const prefix = 'xtreme-avatar-pwa:/:public:';
function worker() {
  const handlers = new Map(), stores = new Map(), fetches = [];
  let fetcher = async () => new Response('asset', { headers: { 'content-type': 'image/png' } });
  let forcedActivation = 0;
  const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { put: async (request, response) => store.set(key(request), response.clone()), match: async request => store.get(key(request))?.clone() };
    },
  };
  const self = { registration: { scope: origin + '/' }, location: { origin }, addEventListener: (name, fn) => handlers.set(name, fn), skipWaiting: () => forcedActivation++, clients: { claim: () => forcedActivation++ } };
  vm.runInNewContext(source, { self, caches, Response, URL, Map, fetch: (request, options) => { fetches.push({ request, options }); return fetcher(request, options); } });
  const lifecycle = async name => { let pending; handlers.get(name)({ waitUntil: promise => { pending = promise; } }); await pending; };
  const request = async (path, { mode = 'cors', method = 'GET', headers = {} } = {}) => {
    let pending;
    handlers.get('fetch')({ request: { url: new URL(path, origin).href, mode, method, headers: new Headers(headers) }, respondWith: promise => { pending = promise; } });
    return pending ? await pending : undefined;
  };
  return { stores, fetches, caches, lifecycle, request, setFetch: fn => { fetcher = fn; }, get forcedActivation() { return forcedActivation; } };
}

test('installation caches only an internally generated generic page, never an auth-gated HTML download', async () => {
  const w = worker();
  w.setFetch(() => { throw new Error('Must not fetch account HTML'); });
  await w.lifecycle('install');
  assert.equal(w.fetches.length, 0);
  assert.equal(w.stores.size, 1);
  const entries = [...w.stores.values()][0];
  assert.deepEqual([...entries.keys()], [origin + '/offline.html']);
  const html = await entries.values().next().value.text();
  assert.match(html, /Your private account pages are not stored/);
  assert.ok(!/<script|localStorage|indexedDB|api\/account/i.test(html));
});

test('account, auth, scripts, unknown assets and query-bearing assets are network-only', async () => {
  const w = worker();
  for (const path of ['/api/account', '/api/account/state', '/api/team', '/signin-with-chatgpt', '/signout-with-chatgpt', '/accounts.js', '/app.js?accounts=8', '/tavus-layer.js', '/assets/private.png', '/assets/app-icon-192.png?user=alice']) {
    w.setFetch(async () => new Response('PRIVATE PAYLOAD', { headers: { 'content-type': 'application/json' } }));
    assert.equal(await (await w.request(path)).text(), 'PRIVATE PAYLOAD');
    w.setFetch(async () => { throw new Error('offline'); });
    await assert.rejects(w.request(path), /offline/);
  }
  assert.equal(w.stores.size, 0);
  assert.ok(w.fetches.every(call => call.options.cache === 'no-store'));
});

test('offline navigation never replays previously signed-in HTML or legacy cached pages', async () => {
  const w = worker();
  await (await w.caches.open('unrelated-cache')).put('/', new Response('PRIVATE LEGACY HTML'));
  w.setFetch(async () => new Response('PRIVATE LIVE HTML'));
  assert.equal(await (await w.request('/', { mode: 'navigate' })).text(), 'PRIVATE LIVE HTML');
  w.setFetch(async () => { throw new Error('offline'); });
  for (const path of ['/', '/?account=alice', '/signin-with-chatgpt', '/signout-with-chatgpt']) {
    const response = await w.request(path, { mode: 'navigate' });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    assert.match(html, /You're offline/);
    assert.ok(!html.includes('PRIVATE'));
  }
  assert.deepEqual([...w.stores.keys()], ['unrelated-cache']);
});

test('only explicitly allowed public static content can be cached and replayed', async () => {
  const w = worker();
  w.setFetch(async () => new Response('PNG PUBLIC BYTES', { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' } }));
  assert.equal(await (await w.request('/assets/app-icon-192.png')).text(), 'PNG PUBLIC BYTES');
  w.setFetch(async () => { throw new Error('offline'); });
  assert.equal(await (await w.request('/assets/app-icon-192.png')).text(), 'PNG PUBLIC BYTES');
  assert.deepEqual([...w.stores.values()][0].keys().toArray(), [origin + '/assets/app-icon-192.png']);
});

test('static paths reject login HTML, redirects, errors and private responses from caching', async () => {
  const examples = [
    new Response('LOGIN PAGE', { headers: { 'content-type': 'text/html' } }),
    Response.redirect(origin + '/signin-with-chatgpt'),
    new Response('private image', { headers: { 'content-type': 'image/png', 'cache-control': 'private' } }),
    new Response('private image', { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } }),
    new Response('private image', { headers: { 'content-type': 'image/png', vary: 'Cookie' } }),
    new Response('not found', { status: 404, headers: { 'content-type': 'image/png' } }),
  ];
  const followedRedirect = new Response('login bytes', { headers: { 'content-type': 'image/png' } });
  Object.defineProperty(followedRedirect, 'redirected', { value: true });
  examples.push(followedRedirect);
  for (const response of examples) {
    const w = worker(); w.setFetch(async () => response);
    await w.request('/assets/app-icon-192.png');
    assert.equal(w.stores.size, 0);
  }
  for (const headers of [{ authorization: 'Bearer test' }, { range: 'bytes=0-9' }]) {
    const w = worker(); await w.request('/assets/app-icon-192.png', { headers });
    assert.equal(w.stores.size, 0);
  }
});

test('cache cleanup removes only this app scope/version and never forces active tab replacement', async () => {
  const w = worker(); await w.lifecycle('install');
  await w.caches.open(prefix + 'old'); await w.caches.open('another-app-v1'); await w.caches.open('xtreme-avatar-pwa:/different/:public:old');
  await w.lifecycle('activate');
  assert.equal(w.stores.has(prefix + 'old'), false);
  assert.equal(w.stores.has('another-app-v1'), true);
  assert.equal(w.stores.has('xtreme-avatar-pwa:/different/:public:old'), true);
  assert.equal(w.forcedActivation, 0);
});

test('cross-origin providers and non-GET operations are not intercepted', async () => {
  const w = worker();
  assert.equal(await w.request('https://tavus.example/conversation'), undefined);
  assert.equal(await w.request('/api/account/state', { method: 'POST' }), undefined);
  assert.equal(w.fetches.length, 0);
  assert.equal(w.stores.size, 0);
});

test('manifest has stable app identity, scope and real PNG install icons', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.id, '/'); assert.equal(manifest.scope, '/'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const data = readFileSync(new URL('../public' + icon.src, import.meta.url));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(icon.purpose, 'any');
  }
});
