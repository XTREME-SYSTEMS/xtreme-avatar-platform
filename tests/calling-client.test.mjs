import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../public/calling.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
// Execute the app's actual shared phone contract; no duplicated test normalizer.
const phoneSource = appSource.slice(0, appSource.indexOf('const paths='));
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const single = () => ({ call_id: 'call_1', to: '+15551234567', purpose: 'PRIVATE CALL PURPOSE', mode: 'eden_speaks', state: 'prepared' });
const conference = () => ({ conference_id: 'room_1', purpose: 'PRIVATE CONFERENCE PURPOSE', ended: false, stop_requested: false, requires_reconciliation: false, steps: ['+15551234567', '+15552345678', '+15553456789'].map((to, index) => ({ step: index + 1, to, state: 'planned', joined_room: false })) });
const reply = (data, extra = {}) => ({ ok: true, status: 200, json: async () => ({ ok: true, data: structuredClone(data), review_token: 'test-only-review', ...extra }) });

// Minimal event/DOM harness. Fetch is always mocked; no provider or real account is contacted.
// invalidate models the already-tested XtremeAccount gate contract and records invocation.
function harness(fetcher, { normalizer = true } = {}) {
  const listeners = new Map(), windowListeners = new Map(), requests = [], invalidations = [], timers = new Map();
  let timer = 0;
  const content = { innerHTML: '', querySelectorAll: () => [] };
  const sheet = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const nodes = { '#sheet-content': content, '#sheet': sheet, '#call-notice': { textContent: '' }, '#call-error': { textContent: '' } };
  const emit = (type, event = {}) => { for (const fn of windowListeners.get(type) || []) fn(event); };
  const account = {
    locked: false, user: { id: 'owner-a', role: 'owner' },
    invalidate(message, signIn) {
      invalidations.push({ message, signIn });
      this.locked = true; this.user = null;
      emit('xtreme:account-ended');
      content.innerHTML = ''; sheet.close();
    },
  };
  const window = { XtremeAccount: account, addEventListener(type, fn) { windowListeners.set(type, [...(windowListeners.get(type) || []), fn]); } };
  const document = { querySelector: selector => nodes[selector] || null, addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); } };
  const context = vm.createContext({
    window, document, Intl, Set, Uint8Array, AbortController,
    crypto: { getRandomValues: bytes => webcrypto.getRandomValues(bytes) }, // Exercise HTTP-preview UUID fallback.
    setTimeout(fn, ms) { const id = ++timer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    FormData: class { constructor(form) { this.values = form.values; } get(key) { return this.values[key]; } },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ body, options });
      return fetcher(body, options);
    },
  });
  if (normalizer) vm.runInContext(phoneSource, context, { filename: 'app.js phone contract' });
  vm.runInContext(source, context, { filename: 'calling.js' });
  const submit = (id, values, dataset = {}) => { for (const fn of listeners.get('submit') || []) fn({ preventDefault() {}, target: { id, values, dataset } }); };
  const prepare = (kind = 'call', overrides = {}) => submit('call-prepare-form', {
    purpose: kind === 'conference' ? 'PRIVATE CONFERENCE PURPOSE' : 'PRIVATE CALL PURPOSE',
    to: '+15551234567', recipient_timezone: 'America/New_York',
    guest1: '+15552345678', guest2: '+15553456789', operator_timezone: 'America/New_York', zone1: 'America/New_York', zone2: 'America/New_York',
    ...overrides,
  }, { kind });
  const confirm = (step = '', overrides = {}) => submit('call-confirm-form', { consent: 'on', charges: 'on', ...overrides }, { step: String(step) });
  const click = action => { for (const fn of listeners.get('click') || []) fn({ target: { closest: () => ({ dataset: { call: action } }) } }); };
  const unloadWarns = () => { let warned = false; emit('beforeunload', { preventDefault() { warned = true; }, returnValue: undefined }); return warned; };
  return { account, window, nodes, content, sheet, requests, invalidations, timers, prepare, confirm, click, unloadWarns };
}

for (const status of [401, 403, 409]) {
  test(`${status === 409 ? 'account_changed 409' : status} gates the account and clears private calling UI`, async () => {
    let parsed = 0;
    const h = harness(async () => ({ ok: false, status, json: async () => { parsed++; if (status !== 409) throw new Error('Auth failures must gate before JSON parsing'); return { ok: false, code: 'account_changed', error: 'Account changed.' }; } }));
    h.window.XtremeCalling.reviewNumber('+15551234567');
    assert.match(h.content.innerHTML, /15551234567/);
    h.prepare(); await settle();
    assert.equal(h.invalidations.length, 1);
    assert.equal(h.account.locked, true); assert.equal(h.account.user, null);
    assert.equal(h.content.innerHTML, ''); assert.equal(h.sheet.open, false);
    assert.equal(h.requests[0].options.signal.aborted, true);
    assert.equal(parsed, status === 409 ? 1 : 0);
    assert.equal(h.timers.size, 0);
  });
}

test('pending preparation cannot be replaced and its late result does not reopen a dismissed modal', async () => {
  const pending = deferred(); const h = harness(() => pending.promise);
  h.window.XtremeCalling.reviewNumber('+15551234567'); h.prepare();
  const original = h.content.innerHTML; h.sheet.close();
  h.window.XtremeCalling.reviewNumber('+15559999999'); h.click('conference');
  assert.equal(h.content.innerHTML, original); assert.equal(h.sheet.open, false);
  assert.match(h.nodes['#call-error'].textContent, /pending/);
  pending.resolve(reply(single())); await settle();
  assert.equal(h.sheet.open, false); assert.equal(h.requests.length, 1);
  h.click('resume'); await settle();
  assert.equal(h.sheet.open, true); assert.match(h.content.innerHTML, /Review your call/);
  assert.match(h.content.innerHTML, /15551234567/); assert.doesNotMatch(h.content.innerHTML, /15559999999/);
});

test('national number is canonical in preparation, visible review and approved start; preparing never dials', async () => {
  const canonical = '+17722090266';
  const h = harness(body => reply({ ...single(), to: body.action === 'prepare' ? body.args.to : canonical, state: body.action === 'start' ? 'queued' : 'prepared' }));
  h.window.XtremeCalling.reviewNumber('(772) 209-0266');
  assert.match(h.content.innerHTML, /Default country code \+1 \(US\/Canada\)/);
  assert.match(h.content.innerHTML, /For other countries, enter \+ and the country code/);
  h.prepare('call', { to: '(772) 209-0266' }); await settle();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].body.action, 'prepare');
  assert.equal(h.requests[0].body.args.to, canonical);
  assert.match(h.content.innerHTML, /<strong>\+17722090266<\/strong>/);
  h.confirm('', { consent: null }); await settle();
  h.confirm('', { charges: null }); await settle();
  assert.equal(h.requests.length, 1, 'Both existing approval checks are still required');
  h.confirm(); await settle();
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].body.action, 'start');
  assert.equal(h.requests[1].body.args.confirm_to, canonical);
  assert.equal(h.requests[1].body.args.recipient_consented, true);
  assert.equal(h.requests[1].body.args.approve_charges, true);
  assert.equal(h.requests[1].body.review_token, 'test-only-review');
  assert.equal(h.requests[1].options.headers['x-xtreme-account'], 'owner-a');
});

test('review form accepts country-prefixed national and explicit international numbers without guessing others', async () => {
  const h = harness(async () => ({ ok: false, status: 503, json: async () => ({ ok: false, code: 'bridge_unlinked' }) }));
  h.window.XtremeCalling.reviewNumber('');
  for (const [input, canonical] of [['1 (202) 555-0198', '+12025550198'], ['+44 (20) 7946-0958', '+442079460958']]) {
    h.prepare('call', { to: input }); await settle();
    assert.equal(h.requests.at(-1).body.args.to, canonical);
  }
  const count = h.requests.length;
  for (const input of ['5550198', '442079460958', '1201555019', '2021550198', '2025550198x2', '2025550198;2', '2025550198,2', '*2025550198#', '++12025550198', '+12025550198<script>', '2025550198\n']) {
    h.prepare('call', { to: input }); await settle();
    assert.equal(h.requests.length, count, `Rejected before API: ${JSON.stringify(input)}`);
    assert.match(h.nodes['#call-notice'].textContent, /10-digit US\/Canada/);
  }
});

test('conference guests normalize before duplicate validation and preparation', async () => {
  const h = harness(body => reply(conference()));
  h.click('conference');
  h.prepare('conference', { guest1: '2025550198', guest2: '+1 (202) 555-0198' }); await settle();
  assert.equal(h.requests.length, 0); assert.match(h.nodes['#call-notice'].textContent, /two different/);
  h.prepare('conference', { guest1: '(202) 555-0198', guest2: '1 202 555 0124' }); await settle();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].body.action, 'conference_prepare');
  assert.deepEqual(h.requests[0].body.args.recipients.map(item => item.to), ['+12025550198', '+12025550124']);
});

test('partially cached call module stays strict if the shared phone normalizer is absent', async () => {
  const h = harness(() => reply(single()), { normalizer: false });
  h.window.XtremeCalling.reviewNumber('');
  h.prepare('call', { to: '2025550198' }); await settle();
  assert.equal(h.requests.length, 0);
  h.prepare('call', { to: '+1 (202) 555-0198' }); await settle();
  assert.equal(h.requests[0].body.args.to, '+12025550198');
});

for (const kind of ['call', 'conference']) {
  test(`pending ${kind} start shows submitting, warns before unload, and cannot double dial`, async () => {
    const pending = deferred(); const prepareAction = kind === 'conference' ? 'conference_prepare' : 'prepare';
    const startAction = kind === 'conference' ? 'conference_dial_leg' : 'start';
    const data = kind === 'conference' ? conference() : single();
    const h = harness(body => body.action === prepareAction ? reply(data) : pending.promise);
    if (kind === 'conference') h.click('conference'); else h.window.XtremeCalling.reviewNumber(data.to);
    h.prepare(kind); await settle();
    assert.match(h.content.innerHTML, /id="call-confirm-form"/); assert.equal(h.unloadWarns(), false);
    h.confirm(kind === 'conference' ? 1 : '');
    assert.match(h.content.innerHTML, /Submitting the reviewed call/);
    assert.doesNotMatch(h.content.innerHTML, /id="call-confirm-form"/);
    assert.equal(h.unloadWarns(), true);
    h.confirm(kind === 'conference' ? 1 : ''); h.click('status');
    assert.equal(h.requests.filter(request => request.body.action === startAction).length, 1);
    assert.equal(h.requests.length, 2);
    const receipt = structuredClone(data);
    if (kind === 'conference') receipt.steps[0].state = 'queued'; else receipt.state = 'queued';
    pending.resolve(reply(receipt)); await settle();
    assert.equal(h.timers.size, 0);
  });
}

test('account-ended aborts an in-flight request and a late successful reply cannot restore private content', async () => {
  const pending = deferred(); const h = harness(() => pending.promise);
  h.window.XtremeCalling.reviewNumber('+15551234567'); h.prepare();
  h.account.invalidate('Switched account.');
  assert.equal(h.requests[0].options.signal.aborted, true);
  // Simulate a response racing the abort; the generation/identity check must still reject it.
  pending.resolve(reply(single())); await settle();
  assert.equal(h.content.innerHTML, ''); assert.equal(h.sheet.open, false);
  assert.equal(h.unloadWarns(), false); assert.equal(h.timers.size, 0);
});

for (const kind of ['call', 'conference']) {
  test(`recovered pending ${kind} hides start controls and warns before unload`, async () => {
    const data = kind === 'conference' ? conference() : single();
    const h = harness(body => {
      assert.equal(body.action, 'resume');
      return reply(data, { kind, recovery_pending: true });
    });
    h.click('resume'); await settle();
    assert.equal(h.sheet.open, true);
    assert.doesNotMatch(h.content.innerHTML, /id="call-confirm-form"/);
    assert.match(h.content.innerHTML, /previous request may still be processing/);
    assert.equal(h.unloadWarns(), true);
    h.window.XtremeCalling.reviewNumber('+15559999999');
    assert.doesNotMatch(h.content.innerHTML, /id="call-prepare-form"/);
    assert.doesNotMatch(h.content.innerHTML, /id="call-confirm-form"/);
    assert.equal(h.requests.length, 1);
  });
}

test('identical preparation retries retain request ID; changed fields receive a new ID', async () => {
  const h = harness(async () => ({ ok: false, status: 503, json: async () => ({ ok: false, code: 'bridge_unlinked', error: 'Unavailable.' }) }));
  h.window.XtremeCalling.reviewNumber('+15551234567');
  h.prepare(); await settle(); h.prepare(); await settle();
  h.prepare('call', { purpose: 'A different purpose' }); await settle();
  h.prepare('call', { purpose: 'A different purpose' }); await settle();
  const ids = h.requests.map(request => request.body.args.request_id);
  assert.match(ids[0], /^[a-f0-9]{32}$/); // crypto.randomUUID is intentionally absent in this harness.
  assert.equal(ids[0], ids[1]); assert.notEqual(ids[1], ids[2]); assert.equal(ids[2], ids[3]);
  assert.ok(h.requests.every(request => request.body.action === 'prepare'));
  assert.ok(h.requests.every(request => request.options.headers['x-xtreme-account'] === 'owner-a'));
});
