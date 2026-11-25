import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('production shell is the approved UI and not an unmarked demo', () => {
  const html=read('public/xtreme-v3/index.html');
  const route=read('app/route.ts');
  assert.match(html,/XTREME AVATAR<\/strong><small>XPS INTELLIGENCE/);
  assert.match(html,/app-live\.js/);
  assert.match(html,/id="connection-status"/);
  assert.doesNotMatch(html,/PRIVATE DESIGN PREVIEW|Demo data · No live provider actions/);
  assert.match(route,/xtreme-v3\/index\.html/);
});

test('authenticated app script compiles and uses existing allowlisted service APIs',()=>{
  const script=read('public/xtreme-v3/app-live.js');
  assert.doesNotThrow(()=>new vm.Script(script,{filename:'app-live.js'}));
  for(const route of ['/api/account','/api/work-hub','/api/work-hub/jobs',
    '/api/work-hub/results','/api/assistant/chat','/api/assistant/status',
    '/api/assistant/voice/status','/api/assistant/voice/start',
    '/api/assistant/voice/end','/api/connections/google/status']) {
    assert.ok(script.includes(route),route);
  }
  assert.match(script,/credentials:\s*'same-origin'/);
  assert.match(script,/X-Xtreme-Account/);
  assert.doesNotMatch(script,/NEXT_PUBLIC_.*SECRET|private_api_key|fakeResponses/);
});

function environment(fetcher) {
  const handlers={};
  const status={textContent:'',dataset:{}};
  const renderFns={privacy:()=> 'Draft policy, not a published or lawyer-approved notice.'};
  const ctx={
    renderer:renderFns,
    skins:{aluminum:'Brushed Aluminum Gold',blue:'Electric Blue'},
    skin:'aluminum',render(){},
    head:(title,sub)=>'<h1>'+title+'</h1><p>'+sub+'</p>',
    card:inside=>inside,
    row:(_icon,title,sub)=>'<p>'+title+' '+sub+'</p>',
    svgIcon:()=>'<svg></svg>',
    showNotice(){},
    window:{addEventListener(){},RTCPeerConnection:null},
    navigator:{},
    document:{
      getElementById:()=>status,
      addEventListener:(type,handler)=>{handlers[type]=handler;}
    },
    AbortController, setTimeout, clearTimeout, FormData:class {
      constructor(form){this.values=form.values||{};}
      get(key){return this.values[key]||null;}
    },
    fetch:fetcher,
    crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}
  };
  vm.runInNewContext(read('public/xtreme-v3/app-live.js'),ctx,{filename:'app-live.js'});
  return {renderFns,handlers,status};
}
const reply=(body,status=200)=>({ok:status>=200&&status<300,status,async json(){return body;}});
const settle=()=>new Promise(resolve=>setTimeout(resolve,25));

test('signed-out visitor sees actual Google sign-in, not private examples',async()=>{
  const {renderFns,status}=environment(async()=>reply({error:'Please sign in.'},401));
  await settle();
  assert.match(renderFns.home(),/Continue with Google/);
  assert.doesNotMatch(renderFns.home(),/sample items|EXAMPLE OPPORTUNITY/);
  assert.equal(status.dataset.status,'signed-out');
});

test('signed-in owner sees authenticated work and saved chat history',async()=>{
  const user={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',role:'owner'};
  const jobs=[{id:'j1',name:'Real saved job',client:'',location:'',stage:'lead',dueDate:'',notes:'',links:[]}];
  const calls=[];
  const fetcher=async(path,config)=>{
    calls.push({path,headers:config.headers});
    if(path==='/api/account')return reply({user,data:{profile:{name:'Owner'}},versions:{profile:1}});
    if(path==='/api/work-hub')return reply({version:1,jobs,results:[],briefing:{}});
    if(path==='/api/assistant/status')return reply({chat:{ready:true}});
    if(path==='/api/assistant/chat')return reply({messages:[{role:'assistant',content:'Verified stored reply'}],pending:false});
    if(path==='/api/assistant/voice/status')return reply({ready:false,reason:'Not configured'});
    if(path==='/api/connections/google/status')return reply({connected:false});
    return reply({error:'unexpected route'},404);
  };
  const {renderFns,status}=environment(fetcher);
  await settle();
  assert.equal(status.dataset.status,'ready');
  assert.match(renderFns.home(),/Real saved job/);
  assert.match(renderFns.chat(),/Verified stored reply/);
  assert.match(renderFns.voice(),/Not configured/);
  assert.ok(calls.filter(c=>c.path!=='/api/account').every(c=>c.headers['X-Xtreme-Account']===user.id));
  assert.doesNotMatch(renderFns.tasks(),/Demo:/);
});
