import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('homepage uses the approved Figma V4/V5 UI, not legacy HOME_HTML', () => {
  const route = source('app/route.ts');
  assert.match(route, /xtreme-v3\/index\.html/);
  assert.doesNotMatch(route, /import\s*\{\s*HOME_HTML\s*\}/);
  assert.match(route, /307/);
});

test('approved home includes top brand, skins and functional screen slots', () => {
  const page = source('public/xtreme-v3/index.html');
  const logic = source('public/xtreme-v3/main.js');
  const css = source('public/xtreme-v3/fidelity.css');
  assert.match(page, /<strong>XTREME AVATAR<\/strong><small>XPS INTELLIGENCE<\/small>/);
  assert.match(page, /fidelity\.css/);
  assert.match(page, /main\.js/);
  assert.match(logic, /const skins=\{/);
  assert.match(logic, /function video\(\)/);
  assert.match(logic, /function voice\(\)/);
  assert.match(logic, /function tasks\(\)/);
  assert.match(logic, /function finished\(\)/);
  assert.match(css, /V5 DESIGN LOCK/);
  assert.match(css, /#06080b/);
});

test('the original authorized API routes remain in place', () => {
  assert.match(source('app/api/[...path]/route.ts'), /proxyApi/);
  assert.match(source('server/supabase-auth.ts'), /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});

test('GET / returns a real 307 redirect and never mutates immutable headers', async () => {
  const { GET } = await import('../app/route.ts');
  const response = GET(new Request('https://xtreme-avatar-platform.example.test/'));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://xtreme-avatar-platform.example.test/xtreme-v3/index.html');
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
});

test('legacy homepage is absent from canonical repository', () => {
  assert.equal(existsSync(new URL('../home-html.ts', import.meta.url)), false);
  const current = source('app/route.ts');
  assert.match(current, /xtreme-v3\\/index\\.html/);
  assert.doesNotMatch(current, /HOME_HTML\s*\}/);
});

test('existing approved UI and connection sources survive cleanup', () => {
  for (const file of [
    'public/xtreme-v3/index.html',
    'public/xtreme-v3/main.js',
    'public/xtreme-v3/styles.css',
    'public/xtreme-v3/fidelity.css',
    'server/supabase-auth.ts',
    'server/assistant-voice.mjs',
    'server/communications.mjs',
    'server/call-desk-link.mjs',
    'public/tavus-layer.js',
    'public/assistant-voice.js'
  ]) assert.equal(existsSync(new URL('../'+file, import.meta.url)), true, file);
});
