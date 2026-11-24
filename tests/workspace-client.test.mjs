import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../public/workspace.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const owned = (id, text, status = 'draft') => ({ id, kind: 'Executive request', details: JSON.stringify({ type: 'xtreme-work-request', version: 1, text, status }), created: '2026-11-05T12:00:00Z', numbers: [] });
const legacy = { id: 'legacy-a', kind: 'Call plan', details: 'Original recipient notes <private>', created: '2026-10-01T10:00:00Z', numbers: ['+15551234567'] };
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function harness(initial = [], save = async () => true) {
  const docHandlers = new Map(), windowHandlers = new Map(), calls = [], events = [], invalidations = [], copied = [];
  let focusCount = 0;
  const input = { value: '', focus() { focusCount++; } }, workStatus = { textContent: '' }, detailStatus = { textContent: '' };
  const content = { innerHTML: '', replaceChildren() { this.innerHTML = ''; } };
  const detailNode = { querySelectorAll: () => [] };
  const sheet = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const document = {
    querySelector(selector) {
      if (selector === '#assist-request-text') return input;
      if (selector === '#assist-work-status') return workStatus;
      if (selector === '#sheet') return sheet;
      if (selector === '#sheet-content') return content;
      if (selector === '#assist-detail') return content.innerHTML.includes('id="assist-detail"') ? detailNode : null;
      if (selector === '#assist-detail-status') return content.innerHTML.includes('id="assist-detail-status"') ? detailStatus : null;
      if (selector === 'dialog[open]') return sheet.open ? sheet : null;
      return null;
    },
    addEventListener(type, fn) { docHandlers.set(type, [...(docHandlers.get(type) || []), fn]); },
  };
  const window = {
    addEventListener(type, fn) { windowHandlers.set(type, [...(windowHandlers.get(type) || []), fn]); },
    dispatchEvent(event) { events.push(event.type); for (const fn of windowHandlers.get(event.type) || []) fn(event); return true; },
  };
  const account = {
    locked: false, user: { id: 'account-a' }, read: (key, fallback) => structuredClone(key === 'plans' ? initial : fallback),
    save: async (key, value) => { calls.push({ key, value: structuredClone(value) }); return save(key, value); },
    invalidate(message) { invalidations.push(message); this.locked = true; this.user = null; window.dispatchEvent(new Event('xtreme:account-ended')); content.replaceChildren(); sheet.close(); },
  };
  window.XtremeAccount = account;
  vm.runInNewContext(source, { window, document, Event, TextEncoder, structuredClone, crypto: webcrypto, Uint8Array, Date, navigator: { clipboard: { writeText: async text => { copied.push(text); } } } });
  const click = (action, fields = {}) => { for (const fn of docHandlers.get('click') || []) fn({ preventDefault() {}, target: { closest: () => ({ dataset: { work: action, ...fields } }) } }); };
  const type = value => { input.value = value; for (const fn of docHandlers.get('input') || []) fn({ target: { id: 'assist-request-text', value } }); };
  const submit = () => { for (const fn of docHandlers.get('submit') || []) fn({ preventDefault() {}, target: { id: 'assist-request-form' } }); };
  const unloadWarns = () => { let warned = false; window.dispatchEvent({ type: 'beforeunload', preventDefault() { warned = true; } }); return warned; };
  return { account, calls, events, invalidations, copied, content, sheet, input, detailStatus, click, type, submit, unloadWarns, render: () => window.XtremeWork.renderHome(), hasUnsaved: () => window.XtremeWork.hasUnsaved(), get focuses() { return focusCount; } };
}

test('home shows actual private draft/done counts, escapes stored text, and preserves legacy visibility', () => {
  const h = harness([owned('a', '<img src=x onerror=alert(1)>'), owned('b', 'Finished by me', 'done'), legacy]);
  const html = h.render();
  assert.match(html, /1 draft<\/span>/); assert.match(html, /1 done<\/span>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /Earlier saved items \(1\)/); assert.match(html, /Private task drafts · Assistant execution not connected/);
  h.click('open', { id: legacy.id });
  assert.match(h.content.innerHTML, /Original recipient notes &lt;private&gt;/);
  assert.doesNotMatch(h.content.innerHTML, /data-work="(?:edit|toggle|delete)"/);
  assert.equal(h.calls.length, 0);
});

test('saving a request persists a versioned envelope and retains every legacy field unchanged', async () => {
  const h = harness([legacy]); h.type('Prepare my meeting\nAgenda and decisions');
  assert.equal(h.unloadWarns(), true); h.submit(); await tick();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].key, 'plans');
  assert.deepEqual(h.calls[0].value[0], legacy);
  const saved = h.calls[0].value[1], value = JSON.parse(saved.details);
  assert.equal(saved.kind, 'Executive request'); assert.deepEqual(saved.numbers, []);
  assert.equal(value.type, 'xtreme-work-request'); assert.equal(value.version, 1); assert.equal(value.status, 'draft');
  assert.equal(value.text, 'Prepare my meeting\nAgenda and decisions');
  assert.match(h.render(), /1 draft<\/span>/); assert.match(h.render(), /Task saved for your review/);
  assert.equal(h.unloadWarns(), false);
});

test('duplicate submissions are suppressed and failed save keeps visible draft without false saved counts', async () => {
  const pending = deferred(); const h = harness([], () => pending.promise);
  h.type('Important unsaved request'); h.submit(); h.submit();
  assert.equal(h.calls.length, 1); assert.match(h.render(), /Saving…/); assert.match(h.render(), /readonly/);
  assert.match(h.render(), /0 drafts<\/span>/);
  pending.resolve(false); await tick();
  assert.match(h.render(), /Important unsaved request/); assert.match(h.render(), /Not saved/);
  assert.match(h.render(), /0 drafts<\/span>/); assert.equal(h.unloadWarns(), true);
});

test('edit, mark done and confirmed delete persist only the selected request while retaining legacy data', async () => {
  const h = harness([legacy, owned('request-a', 'Original request')]);
  h.click('open', { id: 'request-a' }); h.click('edit', { id: 'request-a' });
  assert.equal(h.sheet.open, false); assert.equal(h.input.value, 'Original request');
  h.type('Edited request'); h.submit(); await tick();
  assert.equal(JSON.parse(h.calls[0].value[1].details).text, 'Edited request');
  h.click('open', { id: 'request-a' }); h.click('toggle', { id: 'request-a' }); await tick();
  assert.equal(JSON.parse(h.calls[1].value[1].details).status, 'done'); assert.match(h.render(), /1 done<\/span>/);
  h.click('open', { id: 'request-a' }); h.click('ask-delete', { id: 'request-a' });
  assert.equal(h.calls.length, 2); assert.match(h.content.innerHTML, /Delete this saved task/);
  h.click('delete', { id: 'request-a' }); await tick();
  assert.deepEqual(h.calls[2].value, [legacy]); assert.match(h.render(), /0 drafts<\/span>/);
  for (const call of h.calls) assert.deepEqual(call.value[0], legacy);
});

test('late successful save after account end cannot restore private state or dispatch a changed event', async () => {
  const pending = deferred(); const h = harness([owned('a', 'PRIVATE SAVED TEXT')], () => pending.promise);
  h.type('PRIVATE PENDING TEXT'); h.submit(); h.account.invalidate('Account switched.');
  const before = h.events.filter(type => type === 'xtreme:work-changed').length;
  pending.resolve(true); await tick();
  assert.equal(h.render(), ''); assert.equal(h.input.value, ''); assert.equal(h.sheet.open, false);
  assert.equal(h.events.filter(type => type === 'xtreme:work-changed').length, before);
  assert.equal(h.unloadWarns(), false);
});

test('account identity mismatch gates instead of reading or saving another user workspace', () => {
  const h = harness([owned('a', 'PRIVATE')]); h.type('Draft'); h.account.user = { id: 'account-b' };
  h.submit(); assert.equal(h.invalidations.length, 1); assert.equal(h.calls.length, 0); assert.equal(h.render(), '');
});

test('capacity limit refuses a thirty-first item without overwriting earlier entries', async () => {
  const initial = Array.from({ length: 30 }, (_, index) => ({ ...legacy, id: `legacy-${index}` }));
  const h = harness(initial); h.type('New request'); h.submit(); await tick();
  assert.equal(h.calls.length, 0); assert.match(h.render(), /30 saved items/); assert.match(h.render(), /New request/);
  assert.match(h.render(), /Earlier saved items \(30\)/);
});

test('template chips only fill and focus the composer, and editing another item does not discard an unsaved draft', () => {
  const h = harness([owned('a', 'Saved request')]); h.type('My current draft'); h.click('template', { template: 'meeting' });
  assert.match(h.input.value, /^My current draft\n\nPrepare a meeting/); assert.equal(h.focuses, 1); assert.equal(h.calls.length, 0);
  h.click('open', { id: 'a' }); h.click('edit', { id: 'a' });
  assert.match(h.render(), /My current draft/); assert.match(h.detailStatus.textContent, /Save or clear/);
  assert.equal(h.calls.length, 0);
});


test('copy requires an explicit action and copies saved text without saving or sending it', async () => {
  const h = harness([owned('a', 'Copy this private request')]);
  h.click('open', { id: 'a' }); assert.equal(h.copied.length, 0);
  h.click('copy', { id: 'a' }); await tick();
  assert.deepEqual(h.copied, ['Copy this private request']); assert.equal(h.calls.length, 0);
  assert.match(h.detailStatus.textContent, /copied/);
});

test('shared signout guard reports typed/pending changes and clears after save or account end', async () => {
  const pending = deferred(); const h = harness([], () => pending.promise);
  assert.equal(h.hasUnsaved(), false);
  h.type('   '); assert.equal(h.hasUnsaved(), false);
  h.type('Keep my unsaved request'); assert.equal(h.hasUnsaved(), true);
  h.submit(); assert.equal(h.hasUnsaved(), true);
  pending.resolve(true); await tick(); assert.equal(h.hasUnsaved(), false);
  h.type('Another private draft'); assert.equal(h.hasUnsaved(), true);
  h.account.invalidate('Account ended.'); assert.equal(h.hasUnsaved(), false);
});

test('Notes shortcut appends normalized phone context to the actual private draft without saving until submit', async () => {
  const h = harness(); h.type('Existing business notes');
  h.click('template', { template: 'note', number: '+1 (555) 123-4567' });
  assert.equal(h.input.value, 'Existing business notes\n\nQuick note\n\nPhone: +15551234567\nNotes:\nNext step:');
  assert.equal(h.calls.length, 0); assert.equal(h.hasUnsaved(), true); assert.equal(h.focuses, 1);
  h.submit(); await tick();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].key, 'plans');
  assert.equal(JSON.parse(h.calls[0].value[0].details).text, 'Existing business notes\n\nQuick note\n\nPhone: +15551234567\nNotes:\nNext step:');
  assert.deepEqual(h.calls[0].value[0].numbers, []); // Context is text only, not a calling plan.
});

test('Follow up accepts bounded phone-like context while invalid or oversized context is omitted', () => {
  const valid = harness(); valid.click('template', { template: 'followup', number: '555.123.4567' });
  assert.match(valid.input.value, /^Follow up\n\nPhone: 5551234567\nWith:/); assert.equal(valid.calls.length, 0);
  for (const number of ['<img src=x onerror=alert(1)>', '+15551234567\n<script>', '1'.repeat(16), ' '.repeat(40) + '+15551234567', '123', 'javascript:alert(1)']) {
    const h = harness(); h.click('template', { template: 'note', number });
    assert.equal(h.input.value, 'Quick note\n\nNotes:\nNext step:'); assert.equal(h.calls.length, 0);
  }
  const meeting = harness(); meeting.click('template', { template: 'meeting', number: '+15551234567' });
  assert.doesNotMatch(meeting.input.value, /Phone:/);
});

test('an overflowing or unknown shortcut cannot discard or expand an existing draft', () => {
  const h = harness(); const original = 'Private notes '.repeat(305).slice(0, 3990); h.type(original);
  h.click('template', { template: 'note', number: '+15551234567' });
  assert.equal(h.input.value, original); assert.match(h.render(), /This draft is full/); assert.equal(h.calls.length, 0);
  h.click('template', { template: '__proto__', number: '+15551234567' });
  assert.equal(h.input.value, original); assert.equal(h.calls.length, 0);
});
