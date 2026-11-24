import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
