import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/decision-tools.js', import.meta.url), 'utf8');
function harness() {
  const handlers = new Map(), windowHandlers = new Map(), nodes = new Map(), events = [];
  let network = 0, writes = 0, invalidations = 0;
  for (const mode of ['prediction','simulation']) for (const part of ['tool','results','error']) nodes.set(`#${mode}-${part}`, { innerHTML:'PRIVATE CONTENT', textContent:'PRIVATE CONTENT', replaceChildren() { this.innerHTML=''; this.textContent=''; } });
  const window = { addEventListener:(type,fn)=>windowHandlers.set(type,fn), dispatchEvent(event) { events.push(event.type); windowHandlers.get(event.type)?.(event); } };
  const account = { locked:false, user:{id:'account-a'}, read(){ throw new Error('No automatic account data pulls'); }, save(){ writes++; throw new Error('No saving'); }, invalidate(){ invalidations++; this.locked=true; this.user=null; window.dispatchEvent(new Event('xtreme:account-ended')); } };
  window.XtremeAccount=account;
  const document={querySelector:selector=>nodes.get(selector)||null,addEventListener:(type,fn)=>handlers.set(type,fn)};
  vm.runInNewContext(source,{window,document,Event,CustomEvent,fetch(){network++;throw new Error('No network');},localStorage:{getItem(){throw new Error('No storage');},setItem(){throw new Error('No storage');}}});
  const input=(id,value)=>handlers.get('input')({target:{id,value:String(value)}});
  const submit=mode=>handlers.get('submit')({preventDefault(){},target:{id:mode+'-form'}});
  const click=(mode,action)=>handlers.get('click')({preventDefault(){},target:{closest:()=>({dataset:{mode,decisionAction:action}})}});
  const render=mode=>window.XtremeDecisions.render(mode);
  const output=(mode,id)=>{const match=render(mode).match(new RegExp(`<output id="${id}">([^<]+)</output>`));return match?Number(match[1].replaceAll(',','')):null;};
  return{account,input,submit,click,render,output,nodes,events,get network(){return network},get writes(){return writes},get invalidations(){return invalidations}};
}
function baseline(h,overrides={}) { for(const [key,value] of Object.entries({jobs:10,price:100,direct:40,fixed:200,'jobs-change':20,'price-change':10,'direct-change':25,...overrides}))h.input('sim-'+key,value); }

test('empty tools do not preload examples, pull account data, save, or call a network',()=>{
  const h=harness();assert.doesNotMatch(h.render('prediction'),/18, 21/);assert.equal(h.output('prediction','prediction-month-1'),null);
  assert.match(h.render('simulation'),/id="sim-jobs"[^>]*value=""/);assert.match(h.render('prediction'),/no connected AI model/);
  assert.equal(h.network,0);assert.equal(h.writes,0);assert.ok(h.events.includes('xtreme:decisions-ready'));
});
test('linear prediction and three-month holdout calculate known exact values',()=>{
  const h=harness();h.input('prediction-history','2,4,6,8,10,12');h.submit('prediction');
  assert.deepEqual([1,2,3].map(i=>h.output('prediction','prediction-month-'+i)),[14,16,18]);
  assert.equal(h.output('prediction','prediction-slope'),2);assert.equal(h.output('prediction','prediction-mae'),0);assert.equal(h.output('prediction','prediction-baseline-mae'),4);
  assert.match(h.render('prediction'),/first 3 months/);assert.match(h.render('prediction'),/not guarantees/);
});
test('zero and falling histories remain finite and forecasts cannot be negative',()=>{
  const h=harness();for(const history of ['0 0 0 0 0 0','10 8 6 4 2 0']){h.input('prediction-history',history);h.submit('prediction');assert.deepEqual([1,2,3].map(i=>h.output('prediction','prediction-month-'+i)),[0,0,0]);assert.doesNotMatch(h.render('prediction'),/NaN|Infinity/);}
});
test('malformed, missing, negative, fractional and oversized histories are rejected',()=>{
  const h=harness();for(const input of ['', '1 2 3 4 5',Array(25).fill('1').join(' '),'1,2,,3,4,5,6','1 2 3 -4 5 6','1 2 3 4.5 5 6','1 2 3 NaN 5 6','1 2 3 Infinity 5 6','1 2 3 1000001 5 6','1 2 3 1e2 5 6']){h.input('prediction-history',input);h.submit('prediction');assert.equal(h.output('prediction','prediction-month-1'),null);assert.match(h.render('prediction'),/id="prediction-error"[^>]*>[^<]+</);}
});
test('simulation computes base/scenario revenue, costs and operating result exactly',()=>{
  const h=harness();baseline(h);h.submit('simulation');
  assert.equal(h.output('simulation','sim-base-revenue'),1000);assert.equal(h.output('simulation','sim-base-costs'),600);assert.equal(h.output('simulation','sim-base-result'),400);
  assert.equal(h.output('simulation','sim-scenario-jobs'),12);assert.equal(h.output('simulation','sim-scenario-revenue'),1320);assert.equal(h.output('simulation','sim-scenario-costs'),800);assert.equal(h.output('simulation','sim-scenario-result'),520);assert.equal(h.output('simulation','sim-result-change'),120);
  assert.match(h.render('simulation'),/Monthly overhead stays unchanged/);
});
test('simulation handles zero and negative operating results without division errors',()=>{
  const h=harness();baseline(h,{jobs:0,price:0,direct:0,fixed:200,'jobs-change':-100,'price-change':0,'direct-change':0});h.submit('simulation');
  assert.equal(h.output('simulation','sim-base-result'),-200);assert.equal(h.output('simulation','sim-scenario-result'),-200);assert.doesNotMatch(h.render('simulation'),/NaN|Infinity/);
});
test('invalid baseline values and out-of-bounds percentage changes are rejected',()=>{
  const h=harness();for(const overrides of [{jobs:-1},{jobs:1.5},{price:-2},{direct:'NaN'},{fixed:'Infinity'},{price:''},{jobs:1000001},{'jobs-change':-101},{'price-change':1001},{direct:'0x10'}]){baseline(h,overrides);h.submit('simulation');assert.equal(h.output('simulation','sim-base-revenue'),null);assert.match(h.render('simulation'),/id="simulation-error"[^>]*>[^<]+</);}
});
test('editing any tool input clears its result immediately while route rendering retains inputs',()=>{
  const h=harness();h.input('prediction-history','2 4 6 8 10 12');h.submit('prediction');h.render('simulation');assert.equal(h.output('prediction','prediction-month-1'),14);
  h.input('prediction-history','3 4 6 8 10 12');assert.equal(h.output('prediction','prediction-month-1'),null);assert.equal(h.nodes.get('#prediction-results').innerHTML,'');assert.match(h.render('prediction'),/3 4 6 8 10 12/);
  baseline(h);h.submit('simulation');h.input('sim-fixed','300');assert.equal(h.output('simulation','sim-base-result'),null);assert.equal(h.nodes.get('#simulation-results').innerHTML,'');
});
test('examples are explicit and labeled; Clear resets only the selected tool',()=>{
  const h=harness();h.click('prediction','example');assert.match(h.render('prediction'),/Example inputs/);assert.match(h.render('prediction'),/18, 21/);assert.equal(h.output('prediction','prediction-month-1'),null);
  h.click('simulation','example');h.submit('simulation');assert.notEqual(h.output('simulation','sim-base-revenue'),null);
  h.click('prediction','clear');assert.doesNotMatch(h.render('prediction'),/Example inputs|18, 21/);assert.notEqual(h.output('simulation','sim-base-revenue'),null);assert.equal(h.network,0);assert.equal(h.writes,0);
});
test('account end and identity changes clear private results and prevent new calculations',()=>{
  const h=harness();h.input('prediction-history','2 4 6 8 10 12');h.submit('prediction');baseline(h);h.submit('simulation');h.account.invalidate();
  assert.equal(h.render('prediction'),'');assert.equal(h.render('simulation'),'');assert.equal(h.nodes.get('#prediction-tool').innerHTML,'');assert.equal(h.nodes.get('#simulation-tool').innerHTML,'');
  const switched=harness();switched.input('prediction-history','2 4 6 8 10 12');switched.account.user={id:'account-b'};switched.submit('prediction');assert.equal(switched.invalidations,1);assert.equal(switched.render('prediction'),'');
});
test('entered markup is escaped and never becomes executable output',()=>{
  const h=harness();h.input('prediction-history','</textarea><script>alert(1)</script>');const html=h.render('prediction');assert.match(html,/&lt;\/textarea&gt;&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);h.submit('prediction');assert.equal(h.output('prediction','prediction-month-1'),null);
});
