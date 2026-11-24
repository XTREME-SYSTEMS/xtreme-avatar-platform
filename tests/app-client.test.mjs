import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const sources = Object.fromEntries(['app', 'workspace', 'calling', 'decision-tools', 'bid-tools'].map(name => [name, readFileSync(new URL(`../public/${name}.js`, import.meta.url), 'utf8')]));
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[key]));

// A bounded DOM/event harness for the actual three client scripts. It parses their
// rendered controls so routing tests click real attributes rather than invented ones.
// Every provider fetch is blocked; account saves only record local fixture values.
function harness(role = 'owner', loadWorkspace = true, loadDecisions = true, loadBid = true, speech = null, options = {}) {
  const documentHandlers = new Map(), windowHandlers = new Map(), saves = [], fetches = [], copied = [];
  const recognizers = [], timers = new Map(); let timerId = 0;
  let focused = null, hash = '#home', hashPending = false;
  class Node {
    constructor(tag = 'div', attrs = {}) {
      this.tag = tag; this.attrs = attrs; this.id = attrs.id; this.dataset = {};
      for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      this.value = attrs.value || ''; this.textContent = ''; this.nodes = []; this.html = '';
      this.disabled = Object.hasOwn(attrs, 'disabled');
      this.classList = { add() {}, remove() {} };
    }
    matches(selector) {
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return (this.attrs.class || '').split(/\s+/).includes(selector.slice(1));
      const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attr) return Object.hasOwn(this.attrs, attr[1]) && (attr[2] === undefined || this.attrs[attr[1]] === attr[2]);
      return this.tag === selector;
    }
    closest(selector) { return this.matches(selector) ? this : null; }
    setAttribute(key, value) { this.attrs[key] = value; }
    focus() { focused = this; }
    get innerHTML() { return this.html; }
    set innerHTML(value) {
      this.html = value; this.nodes = [];
      const tags = /<([a-z][\w-]*)\b([^>]*)>/gi; let match;
      while ((match = tags.exec(value))) {
        const attrs = {}; const pattern = /([^\s=]+)(?:="([^"]*)")?/g; let attribute;
        while ((attribute = pattern.exec(match[2]))) attrs[attribute[1]] = decode(attribute[2] ?? '');
        const node = new Node(match[1], attrs);
        if (node.tag === 'textarea') node.value = decode(value.slice(tags.lastIndex).split('</textarea>')[0]);
        this.nodes.push(node);
      }
    }
    querySelectorAll(selector) { return this.nodes.filter(node => node.matches(selector)); }
    replaceChildren() { this.innerHTML = ''; }
  }
  const main = new Node('main', { id: 'main' }), nav = new Node('nav', { id: 'bottom-nav' });
  const content = new Node('div', { id: 'sheet-content' }), toast = new Node('div', { id: 'toast' });
  const sheet = new Node('dialog', { id: 'sheet' }); sheet.open = false;
  sheet.showModal = () => { sheet.open = true; }; sheet.close = () => { sheet.open = false; };
  const roots = [main, nav, content, toast, sheet];
  const all = () => roots.flatMap(node => [node, ...node.nodes]);
  const document = {
    querySelector(selector) { return selector === 'dialog[open]' ? (sheet.open ? sheet : null) : all().find(node => node.matches(selector)) || null; },
    querySelectorAll(selector) { return all().filter(node => node.matches(selector)); },
    addEventListener(type, listener) { documentHandlers.set(type, [...(documentHandlers.get(type) || []), listener]); },
  };
  const window = {
    scrollTo() {},
    addEventListener(type, listener) { windowHandlers.set(type, [...(windowHandlers.get(type) || []), listener]); },
    dispatchEvent(event) { for (const listener of windowHandlers.get(event.type) || []) listener(event); return true; },
  };
  const location = { get hash() { return hash; }, set hash(value) { const next = value.startsWith('#') ? value : '#' + value; if (next !== hash) { hash = next; hashPending = true; } } };
  const account = {
    locked: false, user: { id: 'fixture-owner', role }, read: (key, fallback) => structuredClone(options.initial?.[key] ?? fallback), panel: () => '<section>Your account</section>',
    async save(key, value) { saves.push({ key, value: structuredClone(value) }); return options.save ? options.save(key,value) : true; },
    invalidate() { this.locked = true; this.user = null; window.dispatchEvent(new Event('xtreme:account-ended')); main.replaceChildren(); nav.replaceChildren(); content.replaceChildren(); sheet.close(); },
  };
  window.XtremeAccount = account;
  if (options.videoModule) window.XtremeVideoModule = options.videoModule;
  if (speech) {
    class Recognition {
      constructor() { if (speech === 'constructor-failure') throw new Error('No recognizer'); this.starts = 0; this.aborts = 0; this.stops = 0; recognizers.push(this); }
      start() { this.starts++; if (speech === 'start-failure') throw new Error('Start denied'); }
      stop() { this.stops++; }
      abort() { this.aborts++; }
      result(transcript, isFinal = true) { const result = [{ transcript }]; result.isFinal = isFinal; this.onresult({ results: [result] }); }
    }
    window[speech === 'webkit' ? 'webkitSpeechRecognition' : 'SpeechRecognition'] = Recognition;
  }
  const context = vm.createContext({ window, document, location, Event, CustomEvent, TextEncoder, structuredClone, crypto: webcrypto, Uint8Array, Date, Intl, AbortController,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, navigator: { clipboard: { writeText: async value => { copied.push(value); } } },
    fetch: async (...args) => { fetches.push(args); throw new Error('Provider access is forbidden in this test.'); },
  });
  for (const name of ['app', 'workspace', 'calling', 'decision-tools', 'bid-tools'].filter(name => (loadWorkspace || name !== 'workspace') && (loadDecisions || name !== 'decision-tools') && (loadBid || name !== 'bid-tools'))) vm.runInContext(sources[name], context, { filename: `${name}.js` });
  async function dispatch(type, target) {
    const event = { type, target, preventDefault() {} };
    await Promise.all((documentHandlers.get(type) || []).map(listener => listener(event)));
    if (hashPending) { hashPending = false; window.dispatchEvent(new Event('hashchange')); }
    await new Promise(resolve => setImmediate(resolve));
  }
  const find = (selector, root) => (root ? [root, ...root.nodes] : all()).find(node => node.matches(selector));
  const click = async (selector, root) => { const node = find(selector, root); assert.ok(node, `Missing control ${selector}`); await dispatch('click', node); };
  const type = async (selector, value) => { const node = find(selector); assert.ok(node, `Missing input ${selector}`); node.value = value; await dispatch('input', node); };
  const navigate = route => { location.hash = route; hashPending = false; window.dispatchEvent(new Event('hashchange')); };
  const loadDecisionTools = () => vm.runInContext(sources['decision-tools'], context, { filename: 'decision-tools.js' });
  const loadBidTools = () => vm.runInContext(sources['bid-tools'], context, { filename: 'bid-tools.js' });
  const expire = ms => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } };
  return { window, document, account, main, nav, sheet, content, saves, fetches, copied, recognizers, expire, find, click, type, dispatch, navigate, loadDecisionTools, loadBidTools, get hash() { return hash; }, get focused() { return focused; } };
}

test('Home and Call share all twelve keys, manual number state, and updated shortcut context', async () => {
  const h = harness();
  assert.deepEqual(h.main.nodes.filter(node => node.dataset.key).map(node => node.dataset.key), ['1','2','3','4','5','6','7','8','9','*','0','#']);
  assert.equal(h.nav.nodes.filter(node => node.tag === 'button').length, 5);
  for (const key of ['1','2','3','*','0','#']) await h.click(`[data-key="${key}"]`);
  assert.equal(h.find('#dial-number').value, '123*0#');
  assert.ok(h.main.nodes.filter(node => Object.hasOwn(node.dataset, 'number')).every(node => node.dataset.number === '123*0#'));
  await h.type('#dial-number', '+1 (555) 123-4567');
  await h.click('[data-route="calls"]', h.main);
  assert.equal(h.find('#dial-number').value, '+1 (555) 123-4567');
  assert.equal(h.main.nodes.filter(node => node.dataset.key).length, 12);
  await h.click('[data-action="backspace"]'); await h.click('[data-key="8"]');
  await h.click('[data-route="home"]', h.nav);
  assert.equal(h.find('#dial-number').value, '+1 (555) 123-4568');
  assert.ok(h.main.nodes.filter(node => Object.hasOwn(node.dataset, 'number')).every(node => node.dataset.number === '+1 (555) 123-4568'));
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('plus, backspace, manual input and keys respect the shared 24-character boundary', async () => {
  const h = harness();
  await h.click('[data-action="backspace"]'); assert.equal(h.find('#dial-number').value, '');
  await h.click('[data-action="plus-number"]'); await h.click('[data-action="plus-number"]');
  assert.equal(h.find('#dial-number').value, '+');
  await h.type('#dial-number', '1'.repeat(30)); assert.equal(h.find('#dial-number').value, '1'.repeat(24));
  await h.click('[data-key="9"]'); await h.click('[data-action="plus-number"]');
  assert.equal(h.find('#dial-number').value.length, 24);
  await h.click('[data-action="backspace"]'); await h.click('[data-action="plus-number"]');
  assert.equal(h.find('#dial-number').value, '+' + '1'.repeat(23));
  await h.click('[data-route="calls"]', h.main); await h.click('[data-key="7"]');
  assert.equal(h.find('#dial-number').value.length, 24);
});

test('manual number content is escaped when Home renders values and shortcut attributes', async () => {
  const h = harness(), hostile = '"><img src=x onerror=1>';
  await h.type('#dial-number', hostile); await h.click('[data-route="calls"]', h.main); await h.click('[data-route="home"]', h.nav);
  assert.equal(h.find('#dial-number').value, hostile);
  assert.match(h.main.innerHTML, /&quot;&gt;&lt;img src=x onerror=1&gt;/);
  assert.doesNotMatch(h.main.innerHTML, /<img src=x/);
  assert.ok(h.main.nodes.filter(node => Object.hasOwn(node.dataset, 'number')).every(node => node.dataset.number === hostile));
  await h.click('[data-template="sitenote"]');
  assert.equal(h.hash, '#workspace'); assert.doesNotMatch(h.find('#assist-request-text').value, /Phone:|onerror|<img/);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('invalid numbers fail inline and valid numbers only open the existing review form', async () => {
  const h = harness(); await h.click('[data-action="call"]');
  assert.match(h.find('#call-error').textContent, /country code/); assert.equal(h.sheet.open, false);
  await h.type('#dial-number', '+1 (555) 123-4567'); assert.equal(h.find('#call-error').textContent, '');
  await h.click('[data-action="call"]');
  assert.equal(h.sheet.open, true); assert.match(h.content.innerHTML, /Have AI Assist call/);
  assert.match(h.content.innerHTML, /value="\+15551234567"/); assert.match(h.content.innerHTML, /Reviewing does not dial/);
  h.sheet.close(); await h.click('[data-call="conference"]');
  assert.match(h.content.innerHTML, /3-way call/); assert.match(h.content.innerHTML, /no AI participant or recording/);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('Home and Call dial pads accept common national formats with a visible +1 default', async () => {
  const h = harness();
  for (const route of ['home', 'calls']) {
    h.navigate(route);
    assert.match(h.main.innerHTML, /Default country code \+1 \(US\/Canada\)/);
    assert.equal(h.find('#dial-number').attrs['aria-describedby'], 'dial-number-hint');
    for (const [input, expected] of [['7722090266', '+17722090266'], ['(202) 555-0198', '+12025550198'], ['1 202 555 0198', '+12025550198'], ['+44 (20) 7946-0958', '+442079460958']]) {
      await h.type('#dial-number', input); await h.click('[data-action="call"]');
      assert.equal(h.sheet.open, true, input);
      assert.match(h.content.innerHTML, new RegExp(`value="\\${expected}"`));
      assert.match(h.content.innerHTML, /Reviewing does not dial/);
      h.sheet.close();
    }
  }
  assert.equal(h.fetches.length, 0); assert.equal(h.saves.length, 0);
});

test('phone normalization rejects ambiguous, malformed and non-number input on the actual dial pads', async () => {
  const h = harness();
  for (const input of ['', '5550198', '442079460958', '1201555019', '2021550198', '2025550198x2', '2025550198;2', '2025550198,2', '*2025550198#', '++12025550198', '12+025550198', '+012025550198', '2025550198\n', '<b>2025550198</b>']) {
    await h.type('#dial-number', input); await h.click('[data-action="call"]');
    assert.equal(h.sheet.open, false, JSON.stringify(input));
    assert.match(h.find('#call-error').textContent, /10-digit US\/Canada/);
  }
  assert.equal(h.window.XtremePhone.normalize(null), '');
  assert.equal(h.window.XtremePhone.normalize(2025550198), '');
  assert.equal(h.window.XtremePhone.normalize('+1234567890123456'), '');
  assert.equal(h.window.XtremePhone.normalize('+15551234567'), '+15551234567', 'An explicit + keeps the existing E.164 shape contract');
  assert.equal(h.fetches.length, 0); assert.equal(h.saves.length, 0);
});

test('Job briefing, Bid follow-up and Site note route into real workspace and preserve the typed draft', async () => {
  const h = harness(); await h.click('[data-template="jobbrief"]');
  assert.equal(h.hash, '#workspace'); assert.match(h.find('#assist-request-text').value, /^Job briefing/);
  await h.type('#assist-request-text', 'Keep this private unsaved draft');
  await h.click('[data-route="home"]', h.nav); await h.type('#dial-number', '+1 (555) 123-4567');
  await h.click('[data-template="bidfollowup"]');
  assert.equal(h.find('#assist-request-text').value, 'Keep this private unsaved draft\n\nBid follow-up\n\nPhone: +15551234567\nClient / project:\nProposal or scope:\nOutstanding questions:\nNext step:');
  await h.click('[data-route="home"]', h.nav); await h.click('[data-template="sitenote"]');
  assert.match(h.find('#assist-request-text').value, /^Keep this private unsaved draft/);
  assert.match(h.find('#assist-request-text').value, /Site note\n\nPhone: \+15551234567\nJobsite \/ project:/);
  assert.equal(h.window.XtremeWork.hasUnsaved(), true); assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
  assert.equal(h.nav.nodes.filter(node => node.tag === 'button').length, 5);
});

test('nonowners cannot review the shared line and ended accounts cannot route stale pad actions', async () => {
  const member = harness('member'); await member.type('#dial-number', '+15551234567'); await member.click('[data-action="call"]');
  assert.match(member.content.innerHTML, /available to the account owner/); assert.doesNotMatch(member.content.innerHTML, /id="call-prepare-form"/);
  assert.equal(member.fetches.length, 0);
  const h = harness(); await h.type('#dial-number', '+15551234567');
  const staleCall = h.find('[data-action="call"]'), staleShortcut = h.find('[data-template="sitenote"]'), staleKey = h.find('[data-key="7"]');
  h.account.invalidate();
  for (const target of [staleCall, staleShortcut, staleKey]) await h.dispatch('click', target);
  h.window.dispatchEvent(new Event('xtreme:work-ready'));
  assert.equal(h.main.innerHTML, ''); assert.equal(h.nav.innerHTML, ''); assert.equal(h.sheet.open, false);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('unloaded workspace shortcuts report loading or failure without losing the intended route', async () => {
  const h = harness('owner', false);
  await h.click('[data-template="jobbrief"]');
  assert.equal(h.hash, '#home'); assert.match(h.find('#toast').textContent, /workspace is loading/);
  h.window.XtremeWorkFailed = true; await h.click('[data-template="sitenote"]');
  assert.equal(h.hash, '#home'); assert.match(h.find('#toast').textContent, /could not load/);
  await h.click('[data-route="workspace"]', h.nav);
  assert.equal(h.hash, '#workspace'); assert.match(h.main.innerHTML, /Reload workspace/);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('Prediction and Simulation launch real local tools and retain input without saving or provider calls', async () => {
  const h = harness(); await h.click('[data-route="prediction"]');
  assert.equal(h.hash, '#prediction'); assert.match(h.main.innerHTML, /no connected AI model/);
  await h.type('#prediction-history', '10,12,9,15,14,18');
  await h.dispatch('submit', h.find('#prediction-form'));
  // Independent hand-calculated nonlinear fixture: OLS slope=52/35, intercept=7.8.
  assert.match(h.main.innerHTML, /id="prediction-month-1">18\.2</);
  assert.match(h.main.innerHTML, /id="prediction-month-2">19\.7</);
  assert.match(h.main.innerHTML, /id="prediction-month-3">21\.2</);
  assert.match(h.main.innerHTML, /id="prediction-mae">6\.8</);
  assert.match(h.main.innerHTML, /id="prediction-baseline-mae">6\.7</);
  await h.click('[data-route="home"]', h.nav); await h.click('[data-route="simulation"]');
  assert.equal(h.hash, '#simulation'); assert.ok(h.find('#sim-jobs')); assert.ok(h.find('#sim-direct-change'));
  await h.type('#sim-jobs', '12');
  await h.click('[data-route="home"]', h.nav); await h.click('[data-route="prediction"]');
  assert.equal(h.find('#prediction-history').value, '10,12,9,15,14,18');
  await h.type('#prediction-history', '9,12,9,15,14,18');
  await h.click('[data-route="home"]', h.nav); await h.click('[data-route="prediction"]');
  assert.doesNotMatch(h.main.innerHTML, /id="prediction-month-1"/);
  await h.click('[data-route="home"]', h.nav); await h.click('[data-route="simulation"]');
  assert.equal(h.find('#sim-jobs').value, '12');
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('decision routes honestly show loading/failure and render when the module becomes ready', async () => {
  const h = harness('owner', true, false); await h.click('[data-route="prediction"]');
  assert.match(h.main.innerHTML, /Opening your decision tool/); assert.equal(h.find('#prediction-history'), undefined);
  h.window.XtremeDecisionsFailed = true; h.navigate('simulation');
  assert.match(h.main.innerHTML, /could not load/); assert.match(h.main.innerHTML, /Reload tools/);
  h.loadDecisionTools(); assert.ok(h.find('#simulation-form'));
  assert.match(h.main.innerHTML, /no connected AI model/);
  h.account.invalidate(); h.window.dispatchEvent(new Event('xtreme:decisions-ready'));
  assert.equal(h.main.innerHTML, ''); assert.equal(h.nav.innerHTML, '');
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('company-facing routes and video greeting use AI Assist without changing the configured deployment', () => {
  const h = harness();
  for (const route of ['home', 'voice', 'video', 'calls', 'settings', 'workspace', 'prediction', 'simulation', 'bid', 'leads']) {
    h.navigate(route); assert.doesNotMatch(h.main.innerHTML, /\bEden\b|\bSkye\b/);
  }
  const videoSource = readFileSync(new URL('../public/tavus-layer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(videoSource, /\bEden\b|\bSkye\b/);
  assert.match(videoSource, /Hello, I’m your AI assistant/);
  assert.match(videoSource, /912d9c39-bf54-4e8e-80d9-311c860fd7c9/);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('bid route uses exact half-cent rounding and only copies a current explicitly calculated draft', async () => {
  const h = harness(); await h.click('[data-route="bid"]');
  assert.equal(h.hash, '#bid'); assert.ok(h.find('#bid-form')); assert.equal(h.find('#bid-line-1-cost').value, '');
  for (const [id, value] of Object.entries({ 'bid-project':'Fixture project', 'bid-client':'Fixture client', 'bid-scope':'Measured fixture scope', 'bid-line-1-description':'Fixture item', 'bid-line-1-quantity':'1.25', 'bid-line-1-unit':'each', 'bid-line-1-cost':'.004', 'bid-markup':'50', 'bid-tax':'25' })) await h.type('#' + id, value);
  await h.dispatch('submit', h.find('#bid-form'));
  // 1.25 × .004 = .005 -> .01; 50% markup -> .01; 25% tax on .02 -> .01.
  for (const [id, expected] of Object.entries({ 'subtotal':'0.01', 'markup-amount':'0.01', 'before-tax':'0.02', 'tax-amount':'0.01', total:'0.03' })) assert.ok(h.main.innerHTML.includes(`<output id="bid-${id}">${expected}</output>`));
  assert.match(h.main.innerHTML, /Tax is calculated on all line costs plus markup/);
  assert.match(h.main.innerHTML, /no connected AI model/); assert.equal(h.copied.length, 0);
  const copyButton = h.find('[data-bid-action="copy"]'); await h.dispatch('click', copyButton);
  assert.equal(h.copied.length, 1); assert.match(h.copied[0], /TOTAL BID DRAFT: 0\.03/);
  await h.type('#bid-line-1-quantity', '2'); await h.dispatch('click', copyButton);
  assert.equal(h.copied.length, 1);
  await h.click('[data-route="home"]', h.nav); await h.click('[data-route="bid"]');
  assert.equal(h.find('#bid-line-1-quantity').value, '2'); assert.doesNotMatch(h.main.innerHTML, /id="bid-total"/);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('bid route has honest loading/retry states and an ended account cannot restore its inputs', async () => {
  const h = harness('owner', true, true, false); await h.click('[data-route="bid"]');
  assert.match(h.main.innerHTML, /Opening your bid generator/);
  h.window.XtremeBidFailed = true; h.navigate('bid'); assert.match(h.main.innerHTML, /could not load/); assert.match(h.main.innerHTML, /Reload tools/);
  h.loadBidTools(); assert.ok(h.find('#bid-form')); await h.type('#bid-project', 'Private fixture project');
  h.account.invalidate(); h.window.dispatchEvent(new Event('xtreme:bid-ready')); h.window.dispatchEvent(new Event('xtreme:bid-changed'));
  assert.equal(h.main.innerHTML, ''); assert.equal(h.window.XtremeBid.render(), '');
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('Leads is an explicit external handoff and its local search brief preserves an existing draft', async () => {
  const h = harness(); await h.click('[data-route="workspace"]', h.nav); await h.type('#assist-request-text', 'Keep this private jobsite note');
  await h.click('[data-route="home"]', h.nav); await h.click('[data-route="leads"]');
  assert.equal(h.hash, '#leads');
  const link = h.find('[href="https://autoleads.base44.app"]'); assert.ok(link);
  assert.equal(link.attrs.target, '_blank'); assert.equal(link.attrs.rel, 'noopener noreferrer');
  assert.match(h.main.innerHTML, /Sign in with your own authorized account/);
  assert.match(h.main.innerHTML, /Direct scraping from this phone app is awaiting connection/);
  assert.match(h.main.innerHTML, /No search or outreach starts/);
  assert.equal(h.fetches.length, 0); assert.equal(h.saves.length, 0);
  await h.click('[data-template="leadbrief"]');
  assert.equal(h.hash, '#workspace'); assert.match(h.find('#assist-request-text').value, /^Keep this private jobsite note\n\nConstruction lead search/);
  assert.match(h.find('#assist-request-text').value, /Public sources to check:/);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('Dictate starts only on tap, uses final number text, and never calls or saves automatically', async () => {
  const h = harness('owner', true, true, true, 'native');
  assert.equal(h.recognizers.length, 0);
  assert.match(h.main.innerHTML, /Dictate a phone number/);
  await h.type('#dial-number', '+15550001111');
  await h.click('[data-action="dictate-number"]');
  const mic = h.recognizers[0]; assert.equal(mic.starts, 1); assert.equal(mic.continuous, false);
  mic.onstart(); assert.match(h.find('#dial-dictation-status').textContent, /Listening/);
  assert.equal(h.find('#dial-dictate').attrs['aria-pressed'], 'true');
  mic.result('plus one five five five one two three four five six seven', false);
  assert.equal(h.find('#dial-number').value, '+15550001111');
  mic.result('plus one five five five one two three four five six seven');
  assert.equal(h.find('#dial-number').value, '+15551234567');
  assert.ok(h.main.nodes.filter(n => Object.hasOwn(n.dataset, 'number')).every(n => n.dataset.number === '+15551234567'));
  assert.equal(h.find('#dial-dictate').attrs['aria-pressed'], 'false');
  assert.equal(mic.aborts, 1); mic.onend();
  assert.match(h.find('#dial-dictation-status').textContent, /Check every digit/);
  assert.equal(h.sheet.open, false); assert.equal(h.fetches.length, 0); assert.equal(h.saves.length, 0);
  await h.click('[data-route="calls"]', h.main);
  assert.equal(h.find('#dial-number').value, '+15551234567');
  assert.ok(h.find('[data-action="dictate-number"]'));
});

test('Dictate accepts grouped digits and repetitions, rejects unclear or oversized speech without losing the prior number', async () => {
  const cases = [
    ['+1 (555) 123-4567.', '+15551234567'],
    ['phone number is plus one triple five double zero one two three four', '+1555001234'],
    ['star six seven one two three hash', '*67123#'],
    ['one oh two zero', '1020'],
    ['dial +44 20 7946 0123', '+442079460123'],
    ['call the office at 5551234567', null], ['five hundred and sixty one', null],
    ['plus one plus five five five', null], ['double twelve', null],
    ['<img src=x onerror=1>', null], ['1'.repeat(25), null], ['', null],
  ];
  for (const [spoken, expected] of cases) {
    const h = harness('owner', true, true, true, 'webkit');
    await h.type('#dial-number', '+15550000000'); await h.click('[data-action="dictate-number"]');
    h.recognizers[0].result(spoken);
    assert.equal(h.find('#dial-number').value, expected ?? '+15550000000', spoken);
    assert.equal(h.sheet.open, false); assert.equal(h.fetches.length, 0); assert.equal(h.saves.length, 0);
  }
});

test('manual edits and keypad actions abort dictation and ignore late recognition', async () => {
  for (const action of ['input', 'key', 'backspace', 'plus-number']) {
    const h = harness('owner', true, true, true, 'native');
    await h.type('#dial-number', '555'); await h.click('[data-action="dictate-number"]');
    const mic = h.recognizers[0];
    if (action === 'input') await h.type('#dial-number', '777');
    else await h.click(action === 'key' ? '[data-key="9"]' : `[data-action="${action}"]`);
    const expected = h.find('#dial-number').value;
    assert.equal(mic.aborts, 1); mic.result('1111111111'); mic.onend();
    assert.equal(h.find('#dial-number').value, expected);
    assert.equal(h.fetches.length, 0);
  }
});

test('navigation, backgrounding, account changes, and leaving the page terminate microphone access', async () => {
  for (const action of ['route', 'hidden', 'pagehide', 'account-end', 'identity-change']) {
    const h = harness('owner', true, true, true, 'native');
    await h.type('#dial-number', '555'); await h.click('[data-action="dictate-number"]'); const mic = h.recognizers[0];
    if (action === 'route') h.navigate('calls');
    if (action === 'hidden') { h.document.visibilityState = 'hidden'; await h.dispatch('visibilitychange', null); }
    if (action === 'pagehide') h.window.dispatchEvent(new Event('pagehide'));
    if (action === 'account-end') h.account.invalidate();
    if (action === 'identity-change') h.account.user = { id: 'different-user' };
    mic.result('1111111111'); mic.onend();
    assert.equal(mic.aborts, 1, action);
    if (action === 'account-end') assert.equal(h.main.innerHTML, '');
    else assert.equal(h.find('#dial-number').value, '555', action);
    assert.equal(h.fetches.length, 0); assert.equal(h.saves.length, 0);
  }
});

test('permission, missing microphone, network, and unavailable-browser states are recoverable and keep the number', async () => {
  const unsupported = harness(); await unsupported.click('[data-action="dictate-number"]');
  assert.match(unsupported.find('#dial-dictation-status').textContent, /not available in this browser/);
  assert.equal(unsupported.focused.id, 'dial-number');
  for (const code of ['not-allowed','service-not-allowed','audio-capture','network','no-speech','language-not-supported','aborted','unknown']) {
    const h = harness('owner', true, true, true, 'native'); await h.type('#dial-number','555'); await h.click('[data-action="dictate-number"]');
    const mic = h.recognizers[0]; mic.onerror({ error: code }); mic.onend();
    assert.equal(h.find('#dial-dictate').attrs['aria-pressed'], 'false');
    assert.equal(h.find('#dial-number').value,'555');
    await h.click('[data-action="dictate-number"]'); assert.equal(h.recognizers.length,2);
    mic.result('999'); assert.equal(h.find('#dial-number').value,'555');
  }
  for (const failure of ['constructor-failure','start-failure']) {
    const h = harness('owner', true, true, true, failure); await h.click('[data-action="dictate-number"]');
    assert.match(h.find('#dial-dictation-status').textContent, /could not start/);
    assert.equal(h.find('#dial-dictate').attrs['aria-pressed'], 'false');
  }
});

test('tap-to-stop waits briefly for a final result and timeouts always release the recognizer', async () => {
  const h = harness('owner', true, true, true, 'native'); await h.click('[data-action="dictate-number"]');
  const mic = h.recognizers[0]; await h.click('[data-action="dictate-number"]'); await h.click('[data-action="dictate-number"]');
  assert.equal(mic.stops, 1); mic.result('plus one five five five one two three four five six seven');
  assert.equal(h.find('#dial-number').value, '+15551234567');
  await h.click('[data-action="dictate-number"]'); const timedOut = h.recognizers[1];
  h.expire(20000); assert.equal(timedOut.aborts, 1); timedOut.result('999');
  assert.equal(h.find('#dial-number').value, '+15551234567');
  await h.click('[data-action="dictate-number"]'); await h.click('[data-action="dictate-number"]');
  h.expire(4000); assert.equal(h.recognizers[2].aborts, 1);
  assert.equal(h.find('#dial-dictate').attrs['aria-pressed'], 'false');
  assert.equal(h.fetches.length, 0); assert.equal(h.saves.length, 0);
});

test('opening call review or a video session stops dictation before other media starts', async () => {
  for (const action of ['review','conference','video']) {
    const h = harness('owner', true, true, true, 'native');
    await h.type('#dial-number', '+15551234567'); await h.click('[data-action="dictate-number"]'); const mic = h.recognizers[0];
    await h.click(action === 'review' ? '[data-action="call"]' : action === 'conference' ? '[data-call="conference"]' : '[data-open-session="video"]');
    assert.equal(mic.aborts, 1); mic.result('999');
    assert.equal(h.find('#dial-number').value, '+15551234567');
    assert.equal(h.fetches.length, 0);
  }
});

test('a late start event from a cancelled session cannot stop a newer dictation', async () => {
  const h = harness('owner', true, true, true, 'native');
  await h.click('[data-action="dictate-number"]'); const oldMic = h.recognizers[0];
  await h.type('#dial-number', '555');
  await h.click('[data-action="dictate-number"]'); const newMic = h.recognizers[1];
  oldMic.onstart();
  assert.equal(newMic.aborts, 0); assert.equal(h.find('#dial-dictate').attrs['aria-pressed'], 'true');
  newMic.onstart(); newMic.result('plus one five five five one two three four five six seven');
  assert.equal(h.find('#dial-number').value, '+15551234567');
  assert.equal(h.fetches.length, 0); assert.equal(h.saves.length, 0);
});


test('assistant home leads with four modes and retains calls and construction inside closed More tools', async () => {
  const h = harness();
  const primary = h.main.innerHTML.split('class="assistant-more-tools"')[0];
  assert.deepEqual([...primary.matchAll(/<strong>(Voice|Video|Chat|Tasks)<\/strong>/g)].map(match => match[1]), ['Voice','Video','Chat','Tasks']);
  assert.match(primary, /data-open-session="video"/);
  assert.doesNotMatch(primary, /data-route="(?:prediction|simulation|bid|leads|calls)"|id="dial-number"/);
  assert.match(h.main.innerHTML, /<details class="assistant-more-tools"><summary>/);
  for (const name of ['prediction','simulation','bid','leads','calls']) assert.ok(h.find(`[data-route="${name}"]`, h.main));
  assert.equal(h.main.nodes.filter(node => node.dataset.key).length, 12);
  assert.deepEqual([...h.nav.innerHTML.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]), ['Home','Voice','Auto Leads','Bid Gen','Tasks']);
  await h.click('[data-route="workspace"]', h.nav);
  assert.match(h.main.innerHTML, /What needs doing/);
  assert.equal(h.find('[data-route="workspace"]', h.nav).attrs['aria-current'], 'page');
  assert.doesNotMatch(h.find('[data-route="home"]', h.nav).attrs.class, /active/);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('Voice cannot open a camera-off Tavus session and Chat clearly distinguishes drafts from live AI replies', async () => {
  const h = harness('owner', true, true, true, 'standard');
  await h.click('[data-route="voice"]', h.nav);
  assert.doesNotMatch(h.main.innerHTML, /data-open-session="voice"/);
  assert.match(h.main.innerHTML, /id="assistant-voice-status"/);
  assert.equal(h.find('[data-assistant-voice]').attrs['aria-disabled'], 'true');
  await h.click('[data-assistant-voice]');
  assert.match(h.find('#toast').textContent, /awaiting connection/);
  assert.equal(h.recognizers.length, 0);
  await h.click('[data-route="home"]', h.nav); await h.click('[data-route="messages"]', h.main);
  assert.match(h.main.innerHTML, /AI connection pending/);
  assert.match(h.main.innerHTML, /Drafts stay private · Nothing sent/);
  assert.ok(Object.hasOwn(h.find('.assistant-chat-send').attrs,'disabled'));
  assert.equal(h.find('#message-to'),undefined);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});


test('closing More tools releases number dictation and ignores its late result', async () => {
  const h = harness('owner', true, true, true, 'standard');
  await h.type('#dial-number', '+15551234567');
  await h.click('[data-action="dictate-number"]');
  const recognition = h.recognizers[0], disclosure = h.find('.assistant-more-tools');
  disclosure.open = false;
  await h.dispatch('toggle', disclosure);
  assert.equal(recognition.aborts, 1);
  recognition.result('nine nine nine');
  assert.equal(h.find('#dial-number').value, '+15551234567');
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});


test('Chat keeps private assistant drafts separate from preserved SMS drafts and escapes them across navigation', async () => {
  const smsDraft={to:'+15551234567',body:'Existing SMS draft',channel:'SMS'};
  const h=harness('owner',true,true,true,null,{initial:{draft:smsDraft,assistant_chat_draft:'Earlier private assistant draft'}});
  await h.click('[data-route="home"]',h.nav); await h.click('[data-route="messages"]',h.main);
  assert.equal(h.find('#assistant-chat-input').value,'Earlier private assistant draft');
  assert.match(h.main.innerHTML,/Draft saved privately · Not sent/);
  const text='Private </textarea><img src=x onerror=1> context';
  await h.type('#assistant-chat-input',text);
  assert.deepEqual(h.saves,[{key:'assistant_chat_draft',value:text}]);
  assert.match(h.find('#assistant-chat-save-status').textContent,/Draft saved privately · Not sent/);
  await h.click('[data-route="home"]',h.nav); await h.click('[data-route="sms"]',h.main);
  assert.equal(h.find('#message-to').value,smsDraft.to);assert.equal(h.find('#message-body').value,smsDraft.body);
  assert.equal(h.find('#assistant-chat-input'),undefined);
  await h.click('[data-route="home"]',h.nav); await h.click('[data-route="messages"]',h.main);
  assert.equal(h.find('#assistant-chat-input').value,text);
  assert.doesNotMatch(h.main.innerHTML,/<img src=x/);assert.match(h.main.innerHTML,/&lt;\/textarea&gt;/);
  h.navigate('chat');assert.ok(h.find('#assistant-chat-input'));assert.match(h.find('[data-route="home"]',h.nav).attrs.class,/active/);
  assert.equal(h.fetches.length,0);
});

test('Chat suggestions append bounded drafts, never send or create an assistant response', async () => {
  const h=harness();h.navigate('messages');
  assert.match(h.main.innerHTML,/What can we work on/);assert.doesNotMatch(h.main.innerHTML,/Draft saved privately/);
  const prompts=h.main.nodes.filter(node=>node.dataset.chatPrompt);assert.equal(prompts.length,4);
  await h.type('#assistant-chat-input','My existing private notes');await h.click('[data-chat-prompt="day"]');
  assert.equal(h.find('#assistant-chat-input').value,'My existing private notes\n\nHelp me plan my day. My priorities are:');
  assert.equal(h.focused,h.find('#assistant-chat-input'));
  await h.type('#assistant-chat-input','x'.repeat(4010));assert.equal(h.find('#assistant-chat-input').value.length,4000);
  const count=h.saves.length;await h.click('[data-chat-prompt="bid"]');
  assert.equal(h.saves.length,count);assert.match(h.find('#assistant-chat-save-status').textContent,/draft is full/);
  await h.dispatch('submit',h.find('#assistant-chat-form'));
  assert.equal(h.saves.length,count);assert.match(h.find('#assistant-chat-save-status').textContent,/has not been sent/);
  assert.ok(h.saves.every(save=>save.key==='assistant_chat_draft'&&typeof save.value==='string'&&save.value.length<=4000));
  assert.equal(h.fetches.length,0);assert.equal(h.find('#message-form'),undefined);
});

test('Chat save failures stay visible and a late older success cannot mark a newer draft saved', async () => {
  let finishOld,attempt=0;
  const older=new Promise(resolve=>{finishOld=resolve});
  const h=harness('owner',true,true,true,null,{save:()=>++attempt===1?older:false});h.navigate('messages');
  await h.type('#assistant-chat-input','First version');assert.match(h.find('#assistant-chat-save-status').textContent,/Saving private draft/);
  await h.type('#assistant-chat-input','Newer private version');assert.match(h.find('#assistant-chat-save-status').textContent,/Draft not saved/);
  finishOld(true);await new Promise(resolve=>setImmediate(resolve));
  assert.match(h.find('#assistant-chat-save-status').textContent,/Draft not saved/);
  await h.click('[data-route="home"]',h.nav);await h.click('[data-route="home"]',h.nav); await h.click('[data-route="messages"]',h.main);
  assert.equal(h.find('#assistant-chat-input').value,'Newer private version');assert.match(h.main.innerHTML,/Draft not saved/);
  assert.equal(h.fetches.length,0);
});

test('Chat clears private draft state at account end and ignores stale saves or changed identities', async () => {
  let finish;const pending=new Promise(resolve=>{finish=resolve});
  const h=harness('owner',true,true,true,null,{save:()=>pending});h.navigate('messages');
  await h.type('#assistant-chat-input','PRIVATE DRAFT');const input=h.find('#assistant-chat-input');
  h.account.invalidate();assert.equal(input.value,'');finish(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.main.innerHTML,'');assert.equal(h.nav.innerHTML,'');assert.equal(h.saves.length,1);assert.equal(h.fetches.length,0);
  const switched=harness();switched.navigate('messages');switched.account.user={id:'different-account',role:'owner'};
  await switched.type('#assistant-chat-input','Must not reach another account');
  assert.equal(switched.saves.length,0);assert.equal(switched.account.locked,true);assert.equal(switched.main.innerHTML,'');
});


test('a full-draft prompt notice cannot hide pending save or a subsequent save failure',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve});
 const h=harness('owner',true,true,true,null,{save:()=>pending});h.navigate('messages');
 await h.type('#assistant-chat-input','x'.repeat(4000));
 await h.click('[data-chat-prompt="day"]');
 assert.equal(h.saves.length,1);assert.match(h.find('#assistant-chat-save-status').textContent,/Saving private draft… · Not sent/);
 finish(false);await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.find('#assistant-chat-save-status').textContent,/Draft not saved/);
 assert.match(h.find('#assistant-chat-save-status').textContent,/Not sent/);
 await h.click('[data-chat-prompt="notes"]');
 assert.match(h.find('#assistant-chat-save-status').textContent,/Draft not saved/);
 assert.equal(h.find('#assistant-chat-input').value.length,4000);assert.equal(h.saves.length,1);
 const saved=harness();saved.navigate('messages');await saved.type('#assistant-chat-input','x'.repeat(4000));
 await saved.click('[data-chat-prompt="day"]');
 assert.match(saved.find('#assistant-chat-save-status').textContent,/Your draft is full.*Not sent/);
});

test('Video exposes slow loading and explicit retry without changing the home interface', async () => {
  let retries = 0;
  const module = { state: 'loading', retry() { retries++; this.state = 'loading'; return true; } };
  const h = harness('owner', true, true, true, null, { videoModule: module });
  const home = h.main.innerHTML, nav = h.nav.innerHTML;
  await h.click('[data-open-session="video"]');
  assert.equal(h.sheet.open, true);
  assert.match(h.content.innerHTML, /Opening Video Studio/);
  assert.equal(h.find('[data-video-retry]'), undefined);
  module.state = 'slow'; h.window.dispatchEvent(new Event('xtreme:video-module'));
  assert.match(h.content.innerHTML, /taking longer/);
  assert.ok(h.find('[data-account="reload"]'));
  assert.equal(h.find('[data-video-retry]'), undefined);
  module.state = 'error'; h.window.dispatchEvent(new Event('xtreme:video-module'));
  await h.click('[data-video-retry]');
  assert.equal(retries, 1); assert.match(h.content.innerHTML, /Opening Video Studio/);
  module.state = 'ready'; h.window.dispatchEvent(new Event('xtreme:video-module'));
  assert.equal(h.sheet.open, false); assert.equal(h.content.innerHTML, '');
  assert.match(h.find('#toast').textContent, /ready.*Tap Video/);
  assert.equal(h.main.innerHTML, home); assert.equal(h.nav.innerHTML, nav);
  await h.click('[data-open-session="video"]');
  assert.equal(h.sheet.open, false); assert.equal(retries, 1);
  assert.equal(h.fetches.length, 0); assert.equal(h.saves.length, 0);
});

test('late video module readiness leaves another dialog or signed-out screen alone', async () => {
  const module = { state: 'error', retry() {} };
  const h = harness('owner', true, true, true, null, { videoModule: module });
  await h.click('[data-open-session="video"]');
  h.content.innerHTML = '<h2>Other task</h2>';
  module.state = 'ready'; h.window.dispatchEvent(new Event('xtreme:video-module'));
  assert.equal(h.sheet.open, true); assert.match(h.content.innerHTML, /Other task/);
  h.account.invalidate(); h.window.dispatchEvent(new Event('xtreme:video-module'));
  assert.equal(h.sheet.open, false); assert.equal(h.main.innerHTML, '');
  assert.equal(h.find('#toast').textContent, '');
});

test('avatar and Connected apps entries reach dedicated screens without changing primary navigation', async () => {
  const h = harness();
  await h.click('[data-route="models"]');
  assert.equal(h.hash, '#models'); assert.match(h.main.innerHTML, /Opening your assistant collection/);
  assert.equal(h.nav.nodes.filter(node => node.tag === 'button').length, 5);
  h.window.XtremeAssistantSettings = { render: () => '<section>Assistant collection is ready</section>' };
  h.window.dispatchEvent(new Event('xtreme:assistant-settings-ready'));
  assert.match(h.main.innerHTML, /Assistant collection is ready/);
  h.navigate('settings'); assert.ok(h.find('[data-route="models"]')); assert.ok(h.find('[data-route="connections"]'));
  await h.click('[data-route="connections"]');
  assert.equal(h.hash, '#connections'); assert.match(h.main.innerHTML, /Opening your connected apps/);
  h.window.XtremeGoogleWorkspace = { render: () => '<section>Workspace setup</section>' };
  h.window.dispatchEvent(new Event('xtreme:google-workspace-ready'));
  assert.match(h.main.innerHTML, /Workspace setup/);
  assert.equal(h.saves.length, 0); assert.equal(h.fetches.length, 0);
});

test('settings module failures offer reload and late readiness cannot restore a signed-out screen', () => {
  const h = harness(); h.window.XtremeAssistantSettingsFailed = true; h.navigate('models');
  assert.match(h.main.innerHTML, /could not load/); assert.ok(h.find('[data-account="reload"]'));
  h.window.XtremeGoogleWorkspaceFailed = true; h.navigate('connections');
  assert.match(h.main.innerHTML, /could not load/); assert.ok(h.find('[data-account="reload"]'));
  h.account.invalidate();
  h.window.dispatchEvent(new Event('xtreme:assistant-settings-ready'));
  h.window.dispatchEvent(new Event('xtreme:google-workspace-ready'));
  assert.equal(h.main.innerHTML, ''); assert.equal(h.nav.innerHTML, '');
});

test('skill prompts append to the private draft without sending or dropping existing text', async () => {
  const h = harness(); h.navigate('messages'); await h.type('#assistant-chat-input', 'My private context');
  h.navigate('models');
  h.window.dispatchEvent(new CustomEvent('xtreme:assistant-prompt', { detail: { prompt: 'Draft a proposal for review.' } }));
  await new Promise(resolve => setImmediate(resolve));
  h.navigate('messages'); // Deliver the browser's queued hashchange event.
  assert.equal(h.hash, '#messages'); assert.equal(h.find('#assistant-chat-input').value, 'My private context\n\nDraft a proposal for review.');
  assert.ok(h.saves.every(save => save.key === 'assistant_chat_draft')); assert.equal(h.fetches.length, 0);
  h.account.invalidate(); h.window.dispatchEvent(new CustomEvent('xtreme:assistant-prompt', { detail: { prompt: 'Late prompt' } }));
  assert.equal(h.main.innerHTML, '');
});

test('Chat delegates submit to the live module and clears only its acknowledged draft', async () => {
  const h = harness(); let renders = 0; const submitted = [];
  h.window.XtremeAssistantChat = { render() { renders++; }, submit() { submitted.push(h.window.XtremeChatDraft.value); } };
  h.navigate('messages'); assert.equal(renders, 1);
  await h.type('#assistant-chat-input', 'Review this bid.');
  await h.dispatch('submit', h.find('#assistant-chat-form'));
  assert.deepEqual(submitted, ['Review this bid.']);
  assert.doesNotMatch(h.find('#assistant-chat-save-status').textContent, /AI connection pending/);
  h.window.XtremeChatDraft.sent('Different earlier text');
  assert.equal(h.find('#assistant-chat-input').value, 'Review this bid.');
  h.window.XtremeChatDraft.sent('Review this bid.');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.find('#assistant-chat-input').value, '');
  assert.equal(h.window.XtremeChatDraft.value, '');
  assert.deepEqual(h.saves.at(-1), { key: 'assistant_chat_draft', value: '' });
  assert.equal(h.find('#assistant-chat-save-status').textContent, 'Message sent.');
  await h.type('#assistant-chat-input', 'Next draft');
  assert.match(h.find('#assistant-chat-save-status').textContent, /Draft saved privately/);
  h.account.invalidate(); h.window.XtremeChatDraft.sent('Next draft');
  assert.equal(h.window.XtremeChatDraft.value, ''); assert.equal(h.main.innerHTML, '');
});

test('confirmed Chat send distinguishes failure to clear the saved draft from an unsent message', async () => {
  const h = harness('owner', true, true, true, null, { save: (_key, value) => value !== '' });
  h.navigate('messages'); await h.type('#assistant-chat-input', 'Actually sent.');
  h.window.XtremeChatDraft.sent('Actually sent.');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.find('#assistant-chat-input').value, '');
  assert.match(h.find('#assistant-chat-save-status').textContent, /Message sent.*saved draft could not be cleared/);
  assert.doesNotMatch(h.find('#assistant-chat-save-status').textContent, /Not sent/);
});

test('Voice module hydrates the existing orb screen and video stops voice without changing the home design', async () => {
  const h=harness(),home=h.main.innerHTML;let renders=0,stops=0;
  h.window.XtremeAssistantVoice={render(){renders++;},stop(){stops++;}};
  h.navigate('voice');assert.equal(renders,1);assert.ok(h.find('[data-assistant-voice]'));
  h.navigate('home');await h.click('[data-open-session="video"]',h.main);assert.equal(stops,1);
  h.navigate('home');assert.equal(h.main.innerHTML,home);
});

test('five primary navigation items reach existing tools while Home retains Video, Chat, and Account', async () => {
  const h=harness();
  assert.deepEqual(h.nav.nodes.filter(node=>node.tag==='button').map(node=>node.dataset.route),['home','voice','leads','bid','workspace']);
  for(const route of ['leads','bid','workspace']){
    await h.click(`[data-route="${route}"]`,h.nav);assert.equal(h.hash,'#'+route);
    assert.equal(h.find(`[data-route="${route}"]`,h.nav).attrs['aria-current'],'page');
    assert.doesNotMatch(h.find('[data-route="home"]',h.nav).attrs.class,/active/);
  }
  await h.click('[data-route="home"]',h.nav);assert.ok(h.find('[data-open-session="video"]',h.main));
  await h.click('[data-route="messages"]',h.main);assert.ok(h.find('#assistant-chat-input'));
  await h.click('[data-route="home"]',h.nav);assert.ok(h.main.innerHTML.includes('data-route="settings"'));
  await h.click('[data-route="settings"]',h.main);assert.equal(h.hash,'#settings');assert.match(h.main.innerHTML,/Your account/);
  const css=readFileSync(new URL('../public/polish.css',import.meta.url),'utf8');assert.match(css,/\.bottom-nav\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.equal(h.fetches.length,0);
});


test('private work hub routes stay under Tasks and activate only the selected screen', () => {
  const h = harness(), activated=[];
  h.window.XtremeWorkHub={render:mode=>`<section>Private ${mode}</section>`,activate:mode=>activated.push(mode)};
  for(const mode of ['projects','results','briefing']){h.navigate(mode);assert.equal(h.hash,'#'+mode);assert.match(h.main.innerHTML,new RegExp('Private '+mode));assert.equal(activated.at(-1),mode);assert.equal(h.nav.nodes.filter(n=>n.tag==='button').length,5);}
  h.account.invalidate();h.window.dispatchEvent(new Event('xtreme:work-hub-changed'));assert.equal(h.main.innerHTML,'');
});
