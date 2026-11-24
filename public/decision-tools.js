/* Deterministic, on-device calculators. No model, provider, storage, or network calls. */
(() => {
  'use strict';
  const account = window.XtremeAccount, ownerId = account?.user?.id;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (value, decimals = 1) => Number(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const defaults = () => ({ jobs: '', price: '', direct: '', fixed: '', 'jobs-change': '0', 'price-change': '0', 'direct-change': '0' });
  const fresh = () => ({ prediction: { input: '', result: null, error: '', example: false }, simulation: { input: defaults(), result: null, error: '', example: false } });
  let state = fresh();
  function active() {
    if (!account || account.locked || !ownerId) return false;
    if (account.user?.id !== ownerId) { account.invalidate?.('Your signed-in account changed. Reload to continue.'); return false; }
    return true;
  }
  function changed(mode) { if (active()) window.dispatchEvent(new CustomEvent('xtreme:decisions-changed', { detail: { mode } })); }
  function line(history) {
    const n = history.length, meanX = (n + 1) / 2, meanY = history.reduce((sum, value) => sum + value, 0) / n;
    let covariance = 0, variance = 0;
    history.forEach((value, index) => { const dx = index + 1 - meanX; covariance += dx * (value - meanY); variance += dx * dx; });
    const slope = covariance / variance, intercept = meanY - slope * meanX;
    return { slope, forecast: offset => Math.max(0, intercept + slope * (n + offset)) };
  }
  function predict(raw) {
    if (typeof raw !== 'string' || raw.length > 500) throw new Error('Enter 6–24 monthly completed-job counts, separated by spaces or commas.');
    const clean = raw.trim();
    if (!clean || /[,;]\s*[,;]/.test(clean) || /^[,;]/.test(clean) || /[,;]$/.test(clean)) throw new Error('Enter complete monthly completed-job counts without blank entries.');
    const tokens = clean.split(/[\s,;]+/);
    if (tokens.length < 6 || tokens.length > 24) throw new Error('Enter 6–24 monthly completed-job counts, oldest to newest.');
    if (tokens.some(token => !/^\d+$/.test(token) || token.length > 7 || Number(token) > 1000000)) throw new Error('Each count must be a whole number from 0 to 1,000,000.');
    const history = tokens.map(Number), trend = line(history), training = history.slice(0, -3), heldOut = history.slice(-3), heldTrend = line(training);
    const comparison = heldOut.map((actual, index) => ({ month: training.length + index + 1, actual, trend: heldTrend.forecast(index + 1), baseline: training.at(-1) }));
    const meanError = key => comparison.reduce((sum, row) => sum + Math.abs(row.actual - row[key]), 0) / 3;
    return { history, forecasts: [1, 2, 3].map(offset => trend.forecast(offset)), slope: trend.slope, comparison, trainingCount: training.length, mae: meanError('trend'), baselineMae: meanError('baseline') };
  }
  const fields = [
    ['jobs', 'Completed jobs per month', 0, 1000000, '1'],
    ['price', 'Average contract value per job', 0, 1000000, 'any'],
    ['direct', 'Direct cost per job', 0, 1000000, 'any'],
    ['fixed', 'Monthly overhead', 0, 1000000000, 'any'],
    ['jobs-change', 'Change in workload (%)', -100, 1000, 'any'],
    ['price-change', 'Change in contract value (%)', -100, 1000, 'any'],
    ['direct-change', 'Change in direct cost per job (%)', -100, 1000, 'any'],
  ];
  function simulate(input) {
    const values = {};
    for (const [key, label, min, max] of fields) {
      const raw = String(input[key] ?? '').trim(), value = Number(raw);
      if (!raw || raw.length > 24 || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(value) || value < min || value > max || (key === 'jobs' && !Number.isInteger(value))) throw new Error(`${label}: enter ${key === 'jobs' ? 'a whole number' : 'a number'} from ${number(min, 0)} to ${number(max, 0)}.`);
      values[key] = value;
    }
    const totals = (jobs, price, direct) => {
      const revenue = jobs * price, directCosts = jobs * direct, costs = directCosts + values.fixed;
      return { jobs, price, direct, revenue, directCosts, fixed: values.fixed, costs, result: revenue - costs };
    };
    return {
      base: totals(values.jobs, values.price, values.direct),
      scenario: totals(values.jobs * (1 + values['jobs-change'] / 100), values.price * (1 + values['price-change'] / 100), values.direct * (1 + values['direct-change'] / 100)),
      inputs: values,
    };
  }
  function exampleNotice(mode) { return state[mode].example ? '<p class="decisions-example">Example inputs · replace these values before using this for a real decision.</p>' : ''; }
  function actions(mode, label) { return `<div class="decisions-actions"><button type="submit" class="gold-button">${label}</button><button type="button" class="silver-button" data-decision-action="example" data-mode="${mode}">Load example</button><button type="button" class="text-button" data-decision-action="clear" data-mode="${mode}">Clear</button></div>`; }
  function predictionResults(result) {
    if (!result) return '';
    return `<section aria-label="Completed-job volume estimates"><h2>Projected completed-job volume</h2><p>Next three months · trend estimates, not guarantees.</p><table class="decisions-table"><caption>Projected monthly completed jobs</caption><thead><tr><th scope="col">Period</th><th scope="col">Completed jobs</th></tr></thead><tbody>${result.forecasts.map((value, index) => `<tr><th scope="row">Month +${index + 1}</th><td><output id="prediction-month-${index + 1}">${number(value)}</output></td></tr>`).join('')}</tbody></table><h3>Last three months: holdout check</h3><p>Fit to the first ${result.trainingCount} months, then compared with the three months held aside. Smaller mean absolute error is better; this small check does not establish future accuracy.</p><dl class="decisions-metrics"><dt>Trend mean absolute error</dt><dd><output id="prediction-mae">${number(result.mae)}</output> completed jobs</dd><dt>Last-value baseline error</dt><dd><output id="prediction-baseline-mae">${number(result.baselineMae)}</output> completed jobs</dd></dl><table class="decisions-table"><caption>Held-out monthly completed-job counts</caption><thead><tr><th scope="col">Month</th><th scope="col">Actual</th><th scope="col">Trend</th><th scope="col">Last value</th></tr></thead><tbody>${result.comparison.map(row => `<tr><th scope="row">${row.month}</th><td>${number(row.actual, 0)}</td><td>${number(row.trend)}</td><td>${number(row.baseline, 0)}</td></tr>`).join('')}</tbody></table><details><summary>History and method</summary><p>Completed-job history, oldest to newest: ${result.history.map(value => number(value, 0)).join(' · ')}.</p><p>Ordinary least-squares straight-line trend over all ${result.history.length} months. Slope: <output id="prediction-slope">${number(result.slope, 2)}</output> completed jobs per month. Negative estimates are floored at zero. Seasonality, job size, crew capacity, external factors, and confidence intervals are not modeled. These are volume estimates, not project schedules.</p></details></section>`;
  }
  function simulationResults(result) {
    if (!result) return '';
    const rows = [['jobs','Completed jobs per month',1],['price','Contract value per job',2],['direct','Direct cost per job',2],['revenue','Revenue',2],['directCosts','Total direct costs',2],['fixed','Monthly overhead',2],['costs','Total costs',2],['result','Operating result before tax',2]];
    return `<section aria-label="Scenario results"><h2>Base versus scenario</h2><table class="decisions-table"><caption>Monthly results · amounts in your currency</caption><thead><tr><th scope="col">Measure</th><th scope="col">Base</th><th scope="col">Scenario</th></tr></thead><tbody>${rows.map(([key,label,decimals]) => `<tr><th scope="row">${label}</th><td><output id="sim-base-${key}">${number(result.base[key], decimals)}</output></td><td><output id="sim-scenario-${key}">${number(result.scenario[key], decimals)}</output></td></tr>`).join('')}</tbody></table><p>Change in operating result: <output id="sim-result-change">${number(result.scenario.result - result.base.result, 2)}</output>.</p><details><summary>Assumptions and formulas</summary><p>Completed-job workload changes by ${number(result.inputs['jobs-change'])}%, contract value by ${number(result.inputs['price-change'])}%, and direct cost per job by ${number(result.inputs['direct-change'])}%. Monthly overhead stays unchanged. Fractional job counts represent monthly averages.</p><p>Revenue = completed jobs × average contract value. Direct costs = completed jobs × direct cost per job. Operating result before tax = revenue − direct costs − monthly overhead. Direct costs should include labor, materials, equipment, and subcontractors. The full average contract value is counted for each completed job in that month. Billing timing, retainage, change orders, taxes, financing, job-size differences, and crew capacity are not modeled.</p></details></section>`;
  }
  function render(mode) {
    if (!active() || !['prediction', 'simulation'].includes(mode)) return '';
    const current = state[mode];
    const form = mode === 'prediction'
      ? `<label class="decisions-field" for="prediction-history">Completed jobs per month<textarea id="prediction-history" name="history" rows="4" maxlength="500" inputmode="numeric" aria-describedby="prediction-help">${esc(current.input)}</textarea></label><p id="prediction-help">Enter 6–24 monthly completed-job counts, oldest to newest, separated by commas or spaces. Enter 0 for a month with no completed jobs.</p>${actions(mode,'Estimate next 3 months')}`
      : `<fieldset class="decisions-baseline"><legend>Construction monthly baseline</legend><p>Use one currency throughout. Direct costs include labor, materials, equipment, and subcontractors. Enter 0 for a zero value.</p>${fields.slice(0,4).map(([key,label,min,max,step]) => `<label class="decisions-field" for="sim-${key}">${label}<input id="sim-${key}" name="${key}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${esc(current.input[key])}"></label>`).join('')}</fieldset><fieldset class="decisions-changes"><legend>What if?</legend><p>Changes may range from −100% to +1,000%. Zero means unchanged.</p>${fields.slice(4).map(([key,label,min,max,step]) => `<label class="decisions-field" for="sim-${key}">${label}<input id="sim-${key}" name="${key}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${esc(current.input[key])}"></label>`).join('')}</fieldset>${actions(mode,'Calculate scenario')}`;
    return `<section id="${mode}-tool" class="decisions-tool" aria-label="${mode === 'prediction' ? 'Completed-job volume projection' : 'Construction scenario simulation'}"><p class="decisions-note">On-device calculator · no connected AI model. Inputs stay in this tab and are cleared when you reload or sign out.</p>${exampleNotice(mode)}<form id="${mode}-form" class="decisions-form" novalidate>${form}<p id="${mode}-error" class="decisions-error" role="alert">${esc(current.error)}</p></form><div id="${mode}-results" class="decisions-results" aria-live="polite">${mode === 'prediction' ? predictionResults(current.result) : simulationResults(current.result)}</div></section>`;
  }
  function discardResults(mode) {
    state[mode].result = null; state[mode].error = '';
    document.querySelector(`#${mode}-results`)?.replaceChildren();
    const error = document.querySelector(`#${mode}-error`); if (error) error.textContent = '';
  }
  document.addEventListener('input', event => {
    if (!active()) return;
    if (event.target.id === 'prediction-history') { state.prediction.input = event.target.value; discardResults('prediction'); }
    const key = event.target.id?.startsWith('sim-') ? event.target.id.slice(4) : '';
    if (fields.some(field => field[0] === key)) { state.simulation.input[key] = event.target.value; discardResults('simulation'); }
  });
  document.addEventListener('submit', event => {
    const mode = event.target.id === 'prediction-form' ? 'prediction' : event.target.id === 'simulation-form' ? 'simulation' : null;
    if (!mode) return; event.preventDefault(); if (!active()) return;
    const current = state[mode]; current.result = null; current.error = '';
    try { current.result = mode === 'prediction' ? predict(current.input) : simulate(current.input); }
    catch (error) { current.error = error.message; }
    changed(mode);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-decision-action]'); if (!button || !active()) return;
    const mode = button.dataset.mode; if (!['prediction','simulation'].includes(mode)) return;
    event.preventDefault();
    if (button.dataset.decisionAction === 'clear') state[mode] = fresh()[mode];
    else if (button.dataset.decisionAction === 'example') {
      state[mode] = fresh()[mode]; state[mode].example = true;
      state[mode].input = mode === 'prediction' ? '18, 21, 20, 24, 27, 29, 31, 34, 33, 38, 40, 43' : { jobs:'30', price:'1500', direct:'650', fixed:'18000', 'jobs-change':'10', 'price-change':'5', 'direct-change':'3' };
    } else return;
    changed(mode);
  });
  window.addEventListener('xtreme:account-ended', () => {
    state = fresh();
    for (const mode of ['prediction','simulation']) document.querySelector(`#${mode}-tool`)?.replaceChildren();
  });
  window.XtremeDecisions = Object.freeze({ render });
  window.dispatchEvent(new Event('xtreme:decisions-ready'));
})();
