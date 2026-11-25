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
  const handlers={},windowHandlers={};
  const status={textContent:'',dataset:{}};
  const renderFns={privacy:()=> 'Draft policy, not a published or lawyer-approved notice.'};
  let requestSequence=0;
  const ctx={
    renderer:renderFns,
    skins:{aluminum:'Brushed Aluminum Gold',blue:'Electric Blue'},
    skin:'aluminum',render(){},
    head:(title,sub)=>'<h1>'+title+'</h1><p>'+sub+'</p>',
    card:inside=>inside,
    row:(_icon,title,sub,to)=>'<button data-go="'+to+'">'+title+' '+sub+'</button>',
    svgIcon:()=>'<svg></svg>',
    showNotice(){},
    window:{addEventListener:(type,handler)=>{windowHandlers[type]=handler;},RTCPeerConnection:null},
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
    crypto:{randomUUID:()=> '11111111-1111-4111-8111-'+String(++requestSequence).padStart(12,'0')}
  };
  vm.runInNewContext(read('public/xtreme-v3/app-live.js'),ctx,{filename:'app-live.js'});
  return {renderFns,handlers,windowHandlers,status};
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

function chatHarness({onPost,initialHistory,account}={}) {
  const calls=[];
  let user=account||{id:'11111111-1111-4111-8111-111111111111',role:'owner'};
  let history=initialHistory||{messages:[],pending:false};
  const complete=payload=>{
    const messages=[{id:payload.requestId+'-user',role:'user',content:payload.message},
      {id:payload.requestId+'-assistant',role:'assistant',content:'Stored answer'}];
    history={messages,pending:false};
    return reply({ok:true,requestId:payload.requestId,reply:'Stored answer',messages});
  };
  const h=environment(async(path,config)=>{
    const body=config.body?JSON.parse(config.body):null;
    calls.push({path,body,headers:config.headers});
    if(path==='/api/account')return reply({user,data:{profile:{}},versions:{profile:0}});
    if(path==='/api/work-hub')return reply({version:0,jobs:[],results:[]});
    if(path==='/api/assistant/status')return reply({chat:{ready:true}});
    if(path==='/api/assistant/chat')return body?(onPost?onPost(body,complete):complete(body)):reply(history);
    if(path==='/api/assistant/voice/status')return reply({ready:false});
    if(path==='/api/connections/google/status')return reply({connected:false});
    return reply({},404);
  });
  return {...h,calls,setUser(next){user=next;history={messages:[],pending:false};},
    async submit(message){await h.handlers.submit({target:{id:'live-chat-form',values:{message}},preventDefault(){}});},
    async click(command){await h.handlers.click({target:{closest:()=>({dataset:{live:command},disabled:false})},preventDefault(){}});},
    input(message){h.handlers.input({target:{name:'message',form:{id:'live-chat-form'},value:message}});}
  };
}

test('lost chat response retains the original request and newer draft for a safe retry',async()=>{
  let attempts=0;
  const h=chatHarness({onPost:(body,complete)=>{
    if(++attempts===1)throw Error('Connection lost after dispatch');
    return complete(body);
  }});
  await settle(); await h.submit('First question');
  assert.match(h.renderFns.chat(),/Retry this message/);
  assert.match(h.renderFns.chat(),/First question/);
  h.input('Next question');
  await h.submit('Do not send a duplicate');
  assert.equal(h.calls.filter(c=>c.body).length,1);
  await h.click('retry-chat');
  const posts=h.calls.filter(c=>c.body);
  assert.equal(posts.length,2); assert.deepEqual(posts[1].body,posts[0].body);
  assert.match(h.renderFns.chat(),/Stored answer/);
  assert.match(h.renderFns.chat(),/Next question/);
  assert.doesNotMatch(h.renderFns.chat(),/Retry this message/);
  assert.doesNotMatch(h.renderFns.chat(),/type="submit" disabled/);
});

test('reload recovers the server pending message without dispatching another request',async()=>{
  const pending={requestId:'33333333-3333-4333-8333-333333333333',message:'Earlier question'};
  const h=chatHarness({initialHistory:{messages:[],pending:true,pendingRequest:pending}});
  await settle();
  assert.equal(h.calls.filter(c=>c.body).length,0);
  assert.match(h.renderFns.chat(),/Retry this message/);
  await h.click('retry-chat');
  assert.deepEqual(h.calls.find(c=>c.body).body,pending);
  assert.match(h.renderFns.chat(),/Stored answer/);
});

test('terminal chat rejection keeps the draft and a later explicit submit gets a new ID',async()=>{
  let attempts=0;
  const h=chatHarness({onPost:(body,complete)=>++attempts===1?
    reply({error:'Rejected',code:'request_failed',terminal:true},429):complete(body)});
  await settle(); await h.submit('Keep this question');
  assert.match(h.renderFns.chat(),/Keep this question/);
  assert.doesNotMatch(h.renderFns.chat(),/type="submit" disabled/);
  await h.submit('Revised question');
  const posts=h.calls.filter(c=>c.body);
  assert.notEqual(posts[1].body.requestId,posts[0].body.requestId);
  assert.equal(posts[1].body.message,'Revised question');
  assert.match(h.renderFns.chat(),/Stored answer/);
});

test('an unverified chat acknowledgment stays pending instead of accepting fabricated success',async()=>{
  const h=chatHarness({onPost:body=>reply({ok:true,requestId:body.requestId,reply:'Unverified reply',messages:[]})});
  await settle(); await h.submit('Prove this reply');
  assert.match(h.renderFns.chat(),/Retry this message/);
  assert.match(h.renderFns.chat(),/Prove this reply/);
  assert.doesNotMatch(h.renderFns.chat(),/Unverified reply/);
});

test('a late response from the previous account never enters the new conversation',async()=>{
  let finish;
  const h=chatHarness({onPost:(body,complete)=>new Promise(resolve=>{finish=()=>resolve(complete(body));})});
  await settle(); const sending=h.submit('Private previous-account question');
  h.setUser({id:'22222222-2222-4222-8222-222222222222',role:'member'});
  await h.windowHandlers.focus(); finish(); await sending;
  assert.doesNotMatch(h.renderFns.chat(),/Private previous-account question|Stored answer/);
  assert.equal(h.status.dataset.status,'ready');
  assert.ok(h.calls.filter(c=>c.path==='/api/account').every(c=>!c.headers['X-Xtreme-Account']));
});

test('revoked account response clears private conversation and disables sending',async()=>{
  const h=chatHarness({initialHistory:{messages:[{id:'private-assistant',role:'assistant',content:'Private history'}],pending:false},
    onPost:()=>reply({error:'Account changed',code:'account_changed'},401)});
  await settle(); assert.match(h.renderFns.chat(),/Private history/);
  await h.submit('Pending private question');
  assert.doesNotMatch(h.renderFns.chat(),/Private history|Pending private question/);
  assert.match(h.renderFns.chat(),/Continue with Google/);
  assert.equal(h.status.dataset.status,'signed-out');
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

test('recovered voice request keeps an explicit End action until closure is confirmed',async()=>{
  const requestId='33333333-3333-4333-8333-333333333333';
  const calls=[];
  let endAttempts=0;
  const h=environment(async(path,config)=>{
    const body=config.body?JSON.parse(config.body):null;
    calls.push({path,body});
    if(path==='/api/account')return reply({user:{id:'11111111-1111-4111-8111-111111111111',role:'owner'},data:{profile:{}}});
    if(path==='/api/work-hub')return reply({version:0,jobs:[],results:[]});
    if(path==='/api/assistant/status')return reply({chat:{ready:true}});
    if(path==='/api/assistant/chat')return reply({messages:[],pending:false});
    if(path==='/api/connections/google/status')return reply({connected:false});
    if(path==='/api/assistant/voice/status')return reply({ready:true,pendingRequest:{requestId}});
    if(path==='/api/assistant/voice/status?requestId='+requestId)
      return reply({requestId,state:'ready',finalized:false});
    if(path==='/api/assistant/voice/end'){
      if(++endAttempts===1)return reply({requestId,state:'closing',finalized:false},202);
      if(endAttempts===2)throw Error('Lost end response');
      return reply({requestId,state:'closed',finalized:true});
    }
    return reply({},404);
  });
  const click=command=>h.handlers.click({target:{closest:()=>({dataset:{live:command},disabled:false})},preventDefault(){}});
  const recoverable=()=>{
    assert.match(h.renderFns.voice(),/data-live="end-voice"[^>]*>End previous call/);
    assert.match(h.renderFns.voice(),/data-live="check-voice"/);
    assert.doesNotMatch(h.renderFns.voice(),/data-live="start-voice"|Voice call active/);
  };
  await settle();recoverable();
  assert.equal(calls.filter(c=>c.body).length,0);
  await click('check-voice');recoverable();
  await click('end-voice');recoverable();
  await click('end-voice');recoverable();
  await click('end-voice');
  assert.match(h.renderFns.voice(),/data-live="start-voice"/);
  assert.doesNotMatch(h.renderFns.voice(),/End previous call|Check previous call/);
  const ends=calls.filter(c=>c.path==='/api/assistant/voice/end');
  assert.equal(ends.length,3);
  for(const call of ends)assert.deepEqual(call.body,{requestId});
  assert.equal(calls.filter(c=>c.path==='/api/assistant/voice/start').length,0);
});

test('a saved idea is reachable from the notebook and existing More navigation',async()=>{
  let work={version:0,jobs:[],results:[]};
  const h=environment(async(path,config)=>{
    if(path==='/api/account')return reply({user:{id:'11111111-1111-4111-8111-111111111111',role:'owner'},data:{profile:{}}});
    if(path==='/api/work-hub')return reply(work);
    if(path==='/api/work-hub/results'){
      const body=JSON.parse(config.body);
      assert.equal(body.action,'create');assert.equal(body.version,work.version);
      work={...work,version:work.version+1,results:[...work.results,{id:body.id,...body.data}]};
      return reply({ok:true});
    }
    if(path==='/api/assistant/status')return reply({chat:{ready:true}});
    if(path==='/api/assistant/chat')return reply({messages:[],pending:false});
    if(path==='/api/assistant/voice/status')return reply({ready:false});
    if(path==='/api/connections/google/status')return reply({connected:false});
    return reply({},404);
  });
  await settle();
  await h.handlers.submit({target:{id:'live-idea-form',values:{title:'Saved project idea',details:'Keep these requirements'}},preventDefault(){}});
  for(const name of ['ideas','more']){
    const navigation=h.renderFns[name]().match(/data-go="([^"]+)"[^>]*>Saved ideas and results/);
    assert.ok(navigation,'Saved results must be reachable from '+name);
    const destination=h.renderFns[navigation[1]]();
    assert.match(destination,/Saved project idea/);
    assert.match(destination,/Keep these requirements/);
  }
});
