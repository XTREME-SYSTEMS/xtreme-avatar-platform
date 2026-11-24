/* Construction bid drafts from entered quantities and rates. No provider, storage, or network. */
(() => {
  'use strict';
  const account = window.XtremeAccount, ownerId = account?.user?.id;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const blankLine = id => ({ id: String(id), description:'', quantity:'', unit:'', cost:'' });
  const fresh = () => ({ project:'', client:'', scope:'', exclusions:'', assumptions:'', markup:'0', tax:'0', lines:[blankLine(1)], nextId:2, result:null, error:'', example:false });
  let state = fresh();
  const fields = [['project','Project',120],['client','Client',120],['scope','Scope of work',3000],['exclusions','Exclusions',1500],['assumptions','Assumptions',1500]];
  function active() {
    if (!account || account.locked || !ownerId) return false;
    if (account.user?.id !== ownerId) { account.invalidate?.('Your signed-in account changed. Reload to continue.'); return false; }
    return true;
  }
  function changed() { if (active()) window.dispatchEvent(new Event('xtreme:bid-changed')); }
  function invalidateResult() {
    state.result = null; state.error = '';
    document.querySelector('#bid-results')?.replaceChildren();
    const error = document.querySelector('#bid-error'); if (error) error.textContent = '';
  }
  function text(value, label, max, required = true) {
    const result = String(value ?? '').trim();
    if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) throw new Error(`${label}: ${required ? 'enter text within' : 'use at most'} ${max} characters.`);
    return result;
  }
  function decimal(raw, label, maximum, positive = false) {
    const value = String(raw ?? '').trim();
    if (!value || value.length > 24 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error(`${label}: enter a nonnegative number using a decimal point.`);
    const [whole, fraction = ''] = value.split('.'), denominator = 10n ** BigInt(fraction.length), numerator = BigInt((whole || '0') + fraction);
    if ((positive && numerator === 0n) || numerator > BigInt(maximum) * denominator) throw new Error(`${label}: enter ${positive ? 'more than 0 and' : '0 to'} ${maximum.toLocaleString('en-US')}${positive ? ' or less' : ''}.`);
    return { numerator, denominator, display: value };
  }
  // Positive values round half up. Decimal ratios avoid floating-point cent errors.
  const rounded = (numerator, denominator) => (numerator * 2n + denominator) / (denominator * 2n);
  const money = cents => `${(cents / 100n).toLocaleString('en-US')}.${(cents % 100n).toString().padStart(2,'0')}`;
  function calculate() {
    const values = {};
    for (const [key,label,max] of fields) values[key] = text(state[key], label, max, !['exclusions','assumptions'].includes(key));
    if (!state.lines.length || state.lines.length > 20) throw new Error('Enter 1–20 cost line items.');
    const lines = state.lines.map((line, index) => {
      const prefix = `Line ${index + 1}`;
      const description = text(line.description, `${prefix} description`, 160), unit = text(line.unit, `${prefix} unit`, 32);
      const quantity = decimal(line.quantity, `${prefix} quantity`, 1000000, true), cost = decimal(line.cost, `${prefix} unit cost`, 10000000);
      return { description, unit, quantity: quantity.display, cost: cost.display, cents: rounded(quantity.numerator * cost.numerator * 100n, quantity.denominator * cost.denominator) };
    });
    const markup = decimal(state.markup, 'Markup percentage', 100), tax = decimal(state.tax, 'Tax percentage', 30);
    const subtotal = lines.reduce((sum,line) => sum + line.cents, 0n);
    const markupAmount = rounded(subtotal * markup.numerator, 100n * markup.denominator);
    const beforeTax = subtotal + markupAmount, taxAmount = rounded(beforeTax * tax.numerator, 100n * tax.denominator), total = beforeTax + taxAmount;
    const proposal = [
      state.example ? 'EXAMPLE CONSTRUCTION BID DRAFT — fictional inputs, not researched rates' : 'CONSTRUCTION BID DRAFT',
      `Project: ${values.project}`, `Client: ${values.client}`, '', 'SCOPE OF WORK', values.scope, '', 'COST LINE ITEMS — amounts in your currency',
      ...lines.map((line,index) => `${index + 1}. ${line.description}\n   ${line.quantity} ${line.unit} × ${line.cost} = ${money(line.cents)}`),
      '', `Cost subtotal: ${money(subtotal)}`, `Markup (${markup.display}% of cost subtotal): ${money(markupAmount)}`, `Subtotal plus markup: ${money(beforeTax)}`, `Tax (${tax.display}% on subtotal plus markup): ${money(taxAmount)}`, `TOTAL BID DRAFT: ${money(total)}`,
      '', 'EXCLUSIONS', values.exclusions || 'None entered — review before sending.', '', 'ASSUMPTIONS', values.assumptions || 'None entered — review before sending.',
      '', 'Markup is added to cost; it is not profit margin. Tax is applied to all line costs plus markup using your entered rate. Confirm the applicable tax treatment before sending.',
      'Draft — review quantities, scope, tax, and pricing before sending.',
    ].join('\n');
    return { ...values, lines, markup:markup.display, tax:tax.display, subtotal, markupAmount, beforeTax, taxAmount, total, proposal, example:state.example };
  }
  function results(result) {
    if (!result) return '';
    return `<section aria-label="Calculated bid draft"><h2>${result.example ? 'Example bid draft' : 'Your bid draft'}</h2><p class="bid-note">Draft — review quantities, scope, tax, and pricing before sending.</p><h3>${esc(result.project)}</h3><p>Client: ${esc(result.client)}</p><p class="bid-scope">${esc(result.scope)}</p><table class="bid-table"><caption>Cost line items · amounts in your currency</caption><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Unit cost</th><th scope="col">Amount</th></tr></thead><tbody>${result.lines.map(line => `<tr><th scope="row">${esc(line.description)}</th><td>${esc(line.quantity)} ${esc(line.unit)}</td><td>${esc(line.cost)}</td><td>${money(line.cents)}</td></tr>`).join('')}</tbody></table><dl class="bid-totals"><dt>Cost subtotal</dt><dd><output id="bid-subtotal">${money(result.subtotal)}</output></dd><dt>Markup (${esc(result.markup)}%)</dt><dd><output id="bid-markup-amount">${money(result.markupAmount)}</output></dd><dt>Subtotal plus markup</dt><dd><output id="bid-before-tax">${money(result.beforeTax)}</output></dd><dt>Tax (${esc(result.tax)}%)</dt><dd><output id="bid-tax-amount">${money(result.taxAmount)}</output></dd><dt>Total bid draft</dt><dd><output id="bid-total">${money(result.total)}</output></dd></dl><details><summary>Proposal text, exclusions and assumptions</summary><pre id="bid-proposal-text" class="bid-proposal">${esc(result.proposal)}</pre></details><button type="button" class="gold-button" data-bid-action="copy">Copy proposal text</button><p id="bid-copy-status" role="status"></p><p class="bid-note">Copying does not send, save, or publish this draft.</p></section>`;
  }
  function render() {
    if (!active()) return '';
    return `<section id="bid-tool" class="bid-tool" aria-label="Construction bid generator"><p class="bid-note">On-device bid calculator · no connected AI model. Enter your own material, labor, equipment, and subcontractor quantities and rates. Inputs stay in this tab until reload or sign-out.</p>${state.example ? '<p class="bid-example">Example inputs · fictional values, not researched rates. Clear these before preparing a real bid.</p>' : ''}<form id="bid-form" class="bid-form" novalidate>${fields.slice(0,3).map(([key,label,max]) => `<label class="bid-field" for="bid-${key}">${label}${key === 'scope' ? `<textarea id="bid-${key}" rows="4" maxlength="${max}">${esc(state[key])}</textarea>` : `<input id="bid-${key}" type="text" maxlength="${max}" value="${esc(state[key])}">`}</label>`).join('')}<fieldset class="bid-lines"><legend>Cost line items (${state.lines.length}/20)</legend><p>Use one currency throughout. Each extended line is rounded to cents before totals are calculated.</p>${state.lines.map((line,index) => `<fieldset class="bid-line" data-line-id="${line.id}"><legend>Item ${index + 1}</legend>${[['description','Description','text','',160],['quantity','Quantity','number','0.000001',24],['unit','Unit (sq ft, hours, each…)','text','',32],['cost','Unit cost','number','0',24]].map(([key,label,type,min,max]) => `<label class="bid-field" for="bid-line-${line.id}-${key}">${label}<input id="bid-line-${line.id}-${key}" data-bid-line="${line.id}" data-field="${key}" type="${type}" ${type === 'number' ? `inputmode="decimal" min="${min}" step="any"` : ''} maxlength="${max}" value="${esc(line[key])}"></label>`).join('')}<button type="button" class="text-button" data-bid-action="remove" data-line-id="${line.id}" ${state.lines.length === 1 ? 'disabled' : ''}>Remove item ${index + 1}</button></fieldset>`).join('')}<button type="button" class="silver-button" data-bid-action="add" ${state.lines.length >= 20 ? 'disabled' : ''}>Add cost item</button></fieldset><div class="bid-rates"><label class="bid-field" for="bid-markup">Markup on cost (%)<input id="bid-markup" type="number" inputmode="decimal" min="0" max="100" step="any" value="${esc(state.markup)}"></label><label class="bid-field" for="bid-tax">Tax rate (%)<input id="bid-tax" type="number" inputmode="decimal" min="0" max="30" step="any" value="${esc(state.tax)}"></label></div><p class="bid-note">Markup is not margin. Tax is calculated on all line costs plus markup. Enter your applicable rate; no tax rate is recommended.</p>${fields.slice(3).map(([key,label,max]) => `<label class="bid-field" for="bid-${key}">${label}<textarea id="bid-${key}" rows="3" maxlength="${max}">${esc(state[key])}</textarea></label>`).join('')}<div class="bid-actions"><button type="submit" class="gold-button">Generate bid draft</button><button type="button" class="silver-button" data-bid-action="example">Load example</button><button type="button" class="text-button" data-bid-action="clear">Clear</button></div><p id="bid-error" class="bid-error" role="alert">${esc(state.error)}</p></form><div id="bid-results" class="bid-results" aria-live="polite">${results(state.result)}</div></section>`;
  }
  async function copy() {
    if (!active() || !state.result) return;
    const snapshot = state.result;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(snapshot.proposal);
      if (active() && state.result === snapshot) { const node = document.querySelector('#bid-copy-status'); if (node) node.textContent = 'Proposal text copied. Review it before sending.'; }
    } catch {
      if (active() && state.result === snapshot) { const node = document.querySelector('#bid-copy-status'); if (node) node.textContent = 'Copy is unavailable here. Expand the proposal text to select and copy it.'; }
    }
  }
  document.addEventListener('input', event => {
    if (!active()) return;
    const lineId = event.target.dataset?.bidLine, key = event.target.dataset?.field;
    if (lineId && ['description','quantity','unit','cost'].includes(key)) { const line = state.lines.find(item => item.id === lineId); if (line) { line[key] = event.target.value; invalidateResult(); } return; }
    const field = event.target.id?.startsWith('bid-') ? event.target.id.slice(4) : '';
    if ([...fields.map(item => item[0]),'markup','tax'].includes(field)) { state[field] = event.target.value; invalidateResult(); }
  });
  document.addEventListener('submit', event => {
    if (event.target.id !== 'bid-form') return; event.preventDefault(); if (!active()) return;
    state.result = null; state.error = '';
    try { state.result = calculate(); } catch (error) { state.error = error.message; }
    changed();
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-bid-action]'); if (!button || !active()) return;
    event.preventDefault(); const action = button.dataset.bidAction;
    if (action === 'copy') { void copy(); return; }
    if (action === 'clear') state = fresh();
    else if (action === 'example') { state = { ...fresh(), example:true, project:'Example renovation', client:'Example client', scope:'Example scope only. Replace with your measured project scope.', lines:[{id:'1',description:'Example materials',quantity:'10',unit:'units',cost:'35'},{id:'2',description:'Example labor',quantity:'8',unit:'hours',cost:'45'}], nextId:3, markup:'15', tax:'0', assumptions:'Example quantities and rates only; not researched or recommended.' }; }
    else if (action === 'add') { if (state.lines.length >= 20) return; state.lines.push(blankLine(state.nextId++)); invalidateResult(); }
    else if (action === 'remove') { if (state.lines.length <= 1 || !state.lines.some(line => line.id === button.dataset.lineId)) return; state.lines = state.lines.filter(line => line.id !== button.dataset.lineId); invalidateResult(); }
    else return;
    changed();
  });
  window.addEventListener('xtreme:account-ended', () => { state = fresh(); document.querySelector('#bid-tool')?.replaceChildren(); });
  window.XtremeBid = Object.freeze({ render });
  window.dispatchEvent(new Event('xtreme:bid-ready'));
})();
