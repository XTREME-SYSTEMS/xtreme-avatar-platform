import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/pwa.js', import.meta.url), 'utf8');
function client({ standalone = false, secure = true, framed = false, modal = false } = {}) {
  const handlers = new Map(), registrations = [], dispatched = [];
  const window = { isSecureContext: secure, matchMedia: () => ({ matches: standalone, addEventListener() {} }), addEventListener: (type, fn) => handlers.set(type, fn), dispatchEvent: event => dispatched.push(event) };
  window.self = window; window.top = framed ? {} : window;
  const document = { readyState: 'complete', querySelector: selector => modal && selector === 'dialog[open]' ? {} : null, createElement() { throw new Error('Unexpected automatic UI'); } };
  const navigator = { userAgent: 'Chrome', platform: 'Linux', maxTouchPoints: 0, serviceWorker: { register: async (...args) => { registrations.push(args); return {}; } } };
  vm.runInNewContext(source, { window, document, navigator, CustomEvent });
  return { window, handlers, registrations, dispatched };
}
test('install event is retained without automatic prompt, UI or reload', () => {
  const h = client(); let prompts = 0, prevented = 0;
  h.handlers.get('beforeinstallprompt')({ preventDefault() { prevented++; }, prompt() { prompts++; } });
  assert.equal(prevented, 1); assert.equal(prompts, 0);
  assert.equal(h.window.XtremePWA.canPrompt, true);
  h.handlers.get('appinstalled')(); assert.equal(h.window.XtremePWA.canPrompt, false);
});
test('worker registration uses root scope and avoids stale HTTP worker cache', () => {
  const h = client(); assert.equal(h.registrations.length, 1);
  assert.equal(h.registrations[0][0], '/sw.js');
  assert.equal(h.registrations[0][1].scope, '/');
  assert.equal(h.registrations[0][1].updateViaCache, 'none');
  assert.equal(client({ secure: false }).registrations.length, 0);
  assert.equal(client({ framed: true }).registrations.length, 0);
});
test('install dialog cannot interrupt another modal or a locked account', () => {
  const h = client({ modal: true }); assert.equal(h.window.XtremePWA.showInstall(), false);
  const locked = client(); locked.window.XtremeAccount = { locked: true };
  assert.equal(locked.window.XtremePWA.showInstall(), false);
  assert.equal(client({ standalone: true }).window.XtremePWA.standalone, true);
});
