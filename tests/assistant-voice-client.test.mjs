import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const source=readFileSync(new URL('../public/assistant-voice.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const reply=(body,status=200)=>({ok:status<400,status,json:async()=>body});
const answer=()=>({ok:true,state:'ready',configurationVerified:true,sessionId:'live_test',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111',maxSeconds:180,expiresAt:Date.now()/1000+180});
async function harness(options={}){
 const calls=[],permissions=[],peers=[],tracks=[],audios=[],timers=new Map(),intervals=new Map();let timerId=0,roots=[];
 class Target{
  constructor(){this.events=new Map();}
  addEventListener(type,fn){this.events.set(type,[...(this.events.get(type)||[]),fn]);}
  removeEventListener(type,fn){this.events.set(type,(this.events.get(type)||[]).filter(f=>f!==fn));}
  emit(type,detail={}){for(const fn of [...(this.events.get(type)||[])])fn({type,target:this,...detail});}
 }
 class Node extends Target{
  constructor(tag='div',attrs={}){super();this.tag=tag;this.attrs=attrs;this.id=attrs.id||'';this.className=attrs.class||'';this.children=[];this.text='';this.disabled=false;}
  matches(selector){if(selector[0]==='#')return this.id===selector.slice(1);if(selector[0]==='.')return this.className.split(' ').includes(selector.slice(1));const attr=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);return attr?Object.hasOwn(this.attrs,attr[1])&&(attr[2]===undefined||this.attrs[attr[1]]===attr[2]):this.tag===selector;}
  closest(selector){return this.matches(selector)?this:null;}
  setAttribute(key,value){this.attrs[key]=value;}
  getAttribute(key){return this.attrs[key];}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this.text='';}
  remove(){roots=roots.filter(node=>node!==this);this.removed=true;}
  get textContent(){return this.text+this.children.map(node=>node.textContent).join(' ');}
  set textContent(value){this.text=String(value);this.children=[];}
 }
 class Track extends Target{constructor(){super();this.kind='audio';this.enabled=true;this.stopped=false;tracks.push(this);}stop(){this.stopped=true;}}
 class Stream{constructor(items=[new Track()]){this.items=items;}getTracks(){return this.items;}getAudioTracks(){return this.items.filter(track=>track.kind==='audio');}}
 class Audio extends Node{constructor(){super('audio');this.plays=0;this.blocked=Boolean(options.blockAudio);audios.push(this);}pause(){this.paused=true;}async play(){this.plays++;if(this.blocked)throw new Error('Autoplay blocked');}}
 class Channel extends Target{constructor(){super();this.readyState='open';this.sent=[];}send(message){this.sent.push(JSON.parse(message));}close(){this.readyState='closed';this.emit('close');}}
 class Peer extends Target{
  constructor(){super();this.connectionState='new';this.iceGatheringState=options.slowIce?'gathering':'complete';this.added=[];this.closed=false;peers.push(this);}
  addTrack(track,stream){this.added.push({track,stream});}
  createDataChannel(label){this.label=label;this.channel=new Channel();return this.channel;}
  async createOffer(){assert.ok(this.channel,'Data channel must exist before offer');return {type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111'};}
  async setLocalDescription(value){this.localDescription=value;}
  async setRemoteDescription(value){this.remoteDescription=value;}
  close(){this.closed=true;this.connectionState='closed';this.emit('connectionstatechange');}
  connected(){this.connectionState='connected';this.emit('connectionstatechange');}
  started(){this.channel.emit('message',{data:JSON.stringify({type:'session.started',session:{id:'live_test'}})});}
 }
 const all=()=>{const walk=node=>[node,...node.children.flatMap(walk)];return roots.flatMap(walk);};
 const find=selector=>all().find(node=>node.matches(selector))||null;
 const bodyClasses=new Set(),document=new Target();document.querySelector=find;document.createElement=tag=>tag==='audio'?new Audio():new Node(tag);document.body={append(node){roots.push(node);},classList:{add:value=>bodyClasses.add(value),remove:value=>bodyClasses.delete(value)}};
 const window=new Target();if(options.mediaContext)window.XtremeMediaContext={read:()=>options.mediaContext};window.dispatchEvent=event=>window.emit(event.type,event);
 const account={locked:false,user:{id:'member-a'},invalidate(){this.locked=true;window.emit('xtreme:account-ended');this.user=null;roots=[];}};window.XtremeAccount=account;
 const location={hash:'#voice'};
 function mount(){roots=roots.filter(node=>node.id!=='main');const main=new Node('main',{id:'main'});if(location.hash==='#voice'){const section=new Node('section',{class:'assistant-voice-space'});section.append(new Node('button',{'data-assistant-voice':''}),new Node('p',{id:'assistant-voice-status'}),new Node('small',{id:'assistant-voice-detail'}));main.append(section);}roots.unshift(main);window.XtremeAssistantVoice?.render();}
 mount();
 const context=vm.createContext({window,document,location,crypto:webcrypto,AbortController,Event,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},Date,TextEncoder,MediaStream:Stream,RTCPeerConnection:options.unsupported?undefined:Peer,
  navigator:{mediaDevices:{getUserMedia:async constraint=>{permissions.push(constraint);if(options.media)return options.media();return new Stream();}}},
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},setInterval(fn,ms){const id=++timerId;intervals.set(id,{fn,ms});return id;},clearInterval(id){intervals.delete(id);},
  fetch:async(path,config)=>{const call={path,config,body:config.body?JSON.parse(config.body):null};calls.push(call);const custom=await options.handler?.(call);if(custom)return custom;return reply(path.endsWith('/start')?answer():path.endsWith('/end')||path.includes('?requestId=')?{ok:true,state:'closed',finalized:true}:{ready:options.ready!==false,pendingRequest:options.pendingRequest||null});}
 });
 vm.runInContext(source,context);await tick();
 async function click(selector){const target=find(selector);assert.ok(target,'Missing control '+selector);document.emit('click',{target,preventDefault(){}});await tick();}
 async function expire(ms){for(const [id,timer]of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}await tick();}
 return {window,account,find,calls,permissions,peers,tracks,audios,click,expire,Stream,Track,timers,intervals,mount,bodyClasses,async navigate(hash){location.hash=hash;mount();window.emit('hashchange');await tick();},async start(){await click('[data-assistant-voice]');},async connect(){peers.at(-1).connected();peers.at(-1).started();await tick();},runAgain:()=>vm.runInContext(source,context)};
}

test('voice boot only checks private readiness; unavailable browsers never request microphone',async()=>{
 const h=await harness();assert.equal(h.calls.length,1);assert.equal(h.calls[0].config.method,'GET');assert.equal(h.calls[0].config.credentials,'same-origin');assert.equal(h.calls[0].config.cache,'no-store');assert.equal(h.calls[0].config.headers['X-Xtreme-Account'],'member-a');
 assert.equal(h.permissions.length,0);assert.equal(h.find('[data-assistant-voice]').disabled,false);h.runAgain();assert.equal(h.calls.length,1);
 for(const options of [{ready:false},{unsupported:true}]){const blocked=await harness(options);await blocked.start();assert.equal(blocked.permissions.length,0);assert.equal(blocked.find('[data-assistant-voice]').disabled,true);}
});

test('gesture requests audio only, negotiates server SDP, and waits for actual started event plus connected transport',async()=>{
 const h=await harness();await h.start();assert.equal(h.permissions.length,1);assert.equal(h.permissions[0].audio,true);assert.equal(h.permissions[0].video,false);
 const peer=h.peers[0];assert.equal(peer.label,'oai-events');assert.equal(peer.added.length,1);
 const post=h.calls.find(call=>call.path.endsWith('/start'));assert.equal(post.body.sdp,peer.localDescription.sdp);assert.match(post.body.requestId,/^[0-9a-f-]{36}$/);
 assert.equal(peer.remoteDescription.type,'answer');assert.doesNotMatch(h.find('#assistant-voice-status').textContent,/^Connected$/);
 peer.connected();assert.doesNotMatch(h.find('#assistant-voice-status').textContent,/^Connected$/);
 peer.started();assert.equal(h.find('#assistant-voice-status').textContent,'Connected');assert.match(h.find('#assistant-voice-detail').textContent,/Waiting for assistant audio/);
 assert.deepEqual(peer.channel.sent,[]);await h.start();assert.equal(h.permissions.length,1);assert.equal(h.tracks[0].enabled,false);
 await h.click('[data-voice-control="mute"]');assert.equal(h.tracks[0].enabled,true);assert.ok(h.find('#assistant-voice-duration'));
});

test('remote audio blocking offers a user play action without claiming audible output',async()=>{
 const h=await harness({blockAudio:true});await h.start();await h.connect();
 h.peers[0].emit('track',{track:new h.Track()});await tick();assert.ok(h.find('[data-voice-control="play"]'));assert.match(h.find('#assistant-voice-detail').textContent,/Enable audio/);
 h.audios[0].blocked=false;await h.click('[data-voice-control="play"]');assert.equal(h.audios[0].plays,2);assert.doesNotMatch(h.find('#assistant-voice-detail').textContent,/Speak naturally/);
 h.audios[0].emit('playing');assert.match(h.find('#assistant-voice-detail').textContent,/Speak naturally/);
});

test('denied permission and canceled late microphone grants never create provider sessions',async()=>{
 const denied=await harness({media:()=>Promise.reject(Object.assign(new Error('Denied'),{name:'NotAllowedError'}))});await denied.start();assert.match(denied.find('#assistant-voice-detail').textContent,/permission was denied/);assert.equal(denied.calls.filter(call=>call.body).length,0);
 const grant=deferred();let stream;const h=await harness({media:()=>grant.promise});await h.start();await h.click('[data-voice-control="stop"]');stream=new h.Stream();grant.resolve(stream);await tick();assert.ok(stream.getTracks().every(track=>track.stopped));assert.equal(h.calls.filter(call=>call.path.endsWith('/start')).length,0);
});

test('incomplete ICE times out with microphone released and no billable startup',async()=>{
 const h=await harness({slowIce:true});await h.start();assert.equal(h.calls.filter(call=>call.body).length,0);await h.expire(8000);
 assert.ok(h.tracks[0].stopped);assert.ok(h.peers[0].closed);assert.equal(h.calls.filter(call=>call.path.endsWith('/start')).length,0);
});

test('explicit stop releases local media immediately and waits for finalized server cleanup before restarting',async()=>{
 let ended=0;const h=await harness({handler:call=>call.path.endsWith('/end')?reply(++ended===1?{state:'closing',finalized:false}:{state:'closed',finalized:true},ended===1?202:200):call.path.includes('?requestId=')?reply({state:'closing',finalized:false}):undefined});
 await h.start();await h.connect();const id=h.calls.find(call=>call.path.endsWith('/start')).body.requestId;
 await h.click('[data-voice-control="stop"]');assert.ok(h.tracks[0].stopped);assert.ok(h.peers[0].closed);assert.equal(h.audios[0].srcObject,null);
 assert.deepEqual(h.peers[0].channel.sent,[{type:'session.close'}]);assert.equal(h.calls.at(-1).body.requestId,id);assert.equal(h.calls.at(-1).body.sessionId,'live_test');
 await h.start();assert.equal(h.permissions.length,1);assert.ok(h.find('[data-voice-control="recover"]'));
 await h.click('[data-voice-control="recover"]');assert.equal(h.find('[data-assistant-voice]').disabled,false);assert.match(h.find('#assistant-voice-detail').textContent,/ended/);
});

test('uncertain startup is never blindly duplicated and cleanup uses its original request ID',async()=>{
 const h=await harness({handler:call=>call.path.endsWith('/start')?Promise.reject(new Error('Lost response')):call.path.endsWith('/end')?reply({state:'creating',finalized:false},202):undefined});
 await h.start();const start=h.calls.find(call=>call.path.endsWith('/start'));assert.ok(h.tracks[0].stopped);assert.ok(h.peers[0].closed);
 assert.equal(h.calls.at(-1).body.requestId,start.body.requestId);assert.equal(h.calls.at(-1).body.sessionId,undefined);
 await h.start();assert.equal(h.calls.filter(call=>call.path.endsWith('/start')).length,1);assert.equal(h.permissions.length,1);
});

test('reload discovers a prior private session and cleans it up without opening the microphone',async()=>{
 const requestId='9b52f8c1-5db7-4c26-83c3-c2a37da2d7a9',h=await harness({pendingRequest:{requestId}});
 assert.equal(h.find('[data-assistant-voice]').disabled,true);await h.start();assert.equal(h.permissions.length,0);
 await h.click('[data-voice-control="recover"]');assert.ok(h.calls.at(-1).path.endsWith('?requestId='+requestId));assert.equal(h.find('[data-assistant-voice]').disabled,false);
});

test('account teardown and pagehide release tracks and attempt authenticated cleanup',async()=>{
 for(const action of ['account','pagehide']){
  const h=await harness();await h.start();await h.connect();
  if(action==='account')h.account.invalidate();else h.window.emit('pagehide');await tick();
  assert.ok(h.tracks[0].stopped);assert.ok(h.peers[0].closed);assert.equal(h.audios[0].srcObject,null);
  const end=h.calls.find(call=>call.path.endsWith('/end'));assert.ok(end);assert.equal(end.config.headers['X-Xtreme-Account'],'member-a');
  assert.equal(end.config.keepalive,true);
 }
});

test('missing provider started event and session duration limits stop the session instead of faking connection',async()=>{
 const h=await harness();await h.start();h.peers[0].connected();await h.expire(25000);assert.ok(h.tracks[0].stopped);assert.ok(h.peers[0].closed);assert.equal(h.calls.filter(call=>call.path.endsWith('/end')).length,1);
 const limited=await harness({handler:call=>call.path.endsWith('/start')?reply({...answer(),maxSeconds:1,expiresAt:Date.now()/1000+100}):undefined});await limited.start();await limited.connect();await limited.expire(1000);assert.ok(limited.tracks[0].stopped);assert.equal(limited.calls.filter(call=>call.path.endsWith('/end')).length,1);
});

test('late startup response after user cancellation never restores a peer or active microphone',async()=>{
 const starting=deferred(),h=await harness({handler:call=>call.path.endsWith('/start')?starting.promise:undefined});await h.start();await h.click('[data-voice-control="stop"]');starting.resolve(reply(answer()));await tick();
 assert.ok(h.tracks[0].stopped);assert.ok(h.peers[0].closed);assert.equal(h.peers[0].remoteDescription,undefined);assert.doesNotMatch(h.find('#assistant-voice-status').textContent,/^Connected$/);
});

test('a missed started event requires verified remote audio playback as well as a connected peer',async()=>{
 const h=await harness();await h.start();h.peers[0].connected();
 h.peers[0].emit('track',{track:new h.Track()});await tick();
 assert.doesNotMatch(h.find('#assistant-voice-status').textContent,/^Connected$/);
 h.audios[0].emit('playing');assert.equal(h.find('#assistant-voice-status').textContent,'Connected');
 const notConnected=await harness();await notConnected.start();notConnected.peers[0].emit('track',{track:new notConnected.Track()});notConnected.audios[0].emit('playing');assert.doesNotMatch(notConnected.find('#assistant-voice-status').textContent,/^Connected$/);
});

test('terminal pre-admission rejection releases the mic and allows retry without a nonexistent end request',async()=>{
 const h=await harness({handler:call=>call.path.endsWith('/start')?reply({error:'No allowance',code:'user_daily_limit',terminal:true},429):undefined});
 await h.start();assert.ok(h.tracks[0].stopped);assert.equal(h.calls.filter(call=>call.path.endsWith('/end')).length,0);assert.equal(h.find('[data-assistant-voice]').disabled,false);
 await h.start();const starts=h.calls.filter(call=>call.path.endsWith('/start'));assert.equal(starts.length,2);assert.notEqual(starts[0].body.requestId,starts[1].body.requestId);
});

test('another tab pending request reconciles the canonical ID without ending an unadmitted request',async()=>{
 const prior='9b52f8c1-5db7-4c26-83c3-c2a37da2d7a9';let reads=0;
 const h=await harness({handler:call=>call.path.endsWith('/start')?reply({error:'Previous request pending',code:'request_pending'},409):call.path.endsWith('/status')&&++reads>1?reply({ready:true,pendingRequest:{requestId:prior}}):undefined});
 await h.start();assert.ok(h.tracks[0].stopped);assert.equal(h.calls.filter(call=>call.path.endsWith('/end')).length,0);assert.ok(h.find('[data-voice-control="recover"]'));
 await h.click('[data-voice-control="recover"]');assert.ok(h.calls.at(-1).path.endsWith('?requestId='+prior));
});

test('pagehide during an outstanding end request sends a same-ID keepalive cleanup',async()=>{
 const pending=deferred();let ends=0;
 const h=await harness({handler:call=>call.path.endsWith('/end')&&++ends===1?pending.promise:undefined});
 await h.start();await h.connect();await h.click('[data-voice-control="stop"]');const first=h.calls.at(-1);
 h.window.emit('pagehide');await tick();const second=h.calls.at(-1);
 assert.equal(second.path,first.path);assert.deepEqual(second.body,first.body);assert.equal(second.config.keepalive,true);assert.equal(first.config.signal.aborted,true);
 pending.resolve(reply({state:'closed',finalized:true}));await tick();assert.ok(h.tracks[0].stopped);assert.ok(h.peers[0].closed);
});


test('a blocked preview offers direct app recovery without acquiring a microphone or starting a session',async()=>{
 const h=await harness({mediaContext:{framed:true,microphone:false,camera:false}});
 assert.equal(h.find('[data-assistant-voice]').disabled,true);await h.start();
 assert.equal(h.permissions.length,0);assert.equal(h.calls.filter(call=>call.body).length,0);
 assert.match(h.find('#assistant-voice-detail').textContent,/page blocks microphone access/);
 const link=h.find('a');assert.equal(link.href,'https://xtreme-avatar-mobile.strategic-ai.chatgpt.site/');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
});

test('allowed frames and camera-only blocks can start audio while unknown previews receive an honest fallback',async()=>{
 for(const context of [{framed:true,microphone:true,camera:false},{framed:true,microphone:null,camera:null}]){
  const h=await harness({mediaContext:context});assert.equal(h.find('[data-assistant-voice]').disabled,false);
  if(context.microphone===null){assert.match(h.find('#assistant-voice-controls').textContent,/If microphone access fails/);assert.ok(h.find('a'));}
  else assert.equal(h.find('a'),null);
  await h.start();assert.equal(h.permissions.length,1);assert.equal(h.permissions[0].video,false);
 }
 const denied=await harness({mediaContext:{framed:true,microphone:null},media:()=>Promise.reject(Object.assign(new Error('Denied'),{name:'NotAllowedError'}))});await denied.start();
 assert.match(denied.find('#assistant-voice-detail').textContent,/outside this preview/);assert.doesNotMatch(denied.find('#assistant-voice-detail').textContent,/permission was denied/);
});

test('a changed effective policy is checked again before a voice session starts',async()=>{
 const context={framed:true,microphone:true},h=await harness({mediaContext:context});context.microphone=false;await h.start();
 assert.equal(h.permissions.length,0);assert.equal(h.calls.filter(call=>call.body).length,0);assert.equal(h.find('[data-assistant-voice]').disabled,true);
});

test('live voice survives work navigation with an accessible external mute and end bar',async()=>{
 const h=await harness();await h.start();await h.connect();const original=h.calls.find(call=>call.path.endsWith('/start')).body.requestId;
 assert.equal(h.find('#assistant-voice-dock'),null);
 for(const route of ['#home','#calendar','#projects','#workspace','#messages','#settings']){
  await h.navigate(route);assert.ok(h.find('#assistant-voice-dock'));assert.equal(h.find('[data-assistant-voice]'),null);
  assert.ok(!h.tracks[0].stopped);assert.ok(!h.peers[0].closed);assert.equal(h.window.XtremeAssistantVoice.getSessionState().requestId,original);
  assert.equal(h.calls.filter(call=>call.path.endsWith('/start')).length,1);assert.equal(h.calls.filter(call=>call.path.endsWith('/end')).length,0);
 }
 assert.ok(h.bodyClasses.has('xtreme-voice-session-open'));assert.match(h.find('#assistant-voice-dock-status').textContent,/microphone on/);
 await h.click('[data-voice-control="mute"]');assert.equal(h.tracks[0].enabled,false);assert.match(h.find('#assistant-voice-dock-status').textContent,/muted/);
 await h.navigate('#voice');assert.equal(h.find('#assistant-voice-dock'),null);assert.equal(h.find('[data-assistant-voice]').attrs['aria-pressed'],'false');assert.ok(!h.bodyClasses.has('xtreme-voice-session-open'));
 await h.navigate('#calendar');await h.click('[data-voice-control="stop"]');assert.ok(h.tracks[0].stopped);assert.ok(h.peers[0].closed);assert.equal(h.find('#assistant-voice-dock'),null);
 assert.equal(h.calls.filter(call=>call.path.endsWith('/end')).length,1);assert.equal(h.calls.at(-1).body.requestId,original);
});

test('navigation during microphone permission keeps one attempt and can mute its eventual track',async()=>{
 const permission=deferred(),h=await harness({media:()=>permission.promise});await h.start();await h.navigate('#projects');
 assert.ok(h.find('#assistant-voice-dock'));await h.click('[data-voice-control="mute"]');
 const stream=new h.Stream();permission.resolve(stream);await tick();assert.equal(stream.getAudioTracks()[0].enabled,false);
 assert.equal(h.calls.filter(call=>call.path.endsWith('/start')).length,1);await h.connect();assert.match(h.find('#assistant-voice-dock-status').textContent,/muted/);
});

test('privacy close and account changes clear the dock and expose no old session identity',async()=>{
 for(const action of ['privacy','account','pagehide','switch']){
  const h=await harness();await h.start();await h.connect();await h.navigate('#calendar');
  if(action==='privacy')h.window.emit('xtreme:voice-privacy-close');else if(action==='account')h.account.invalidate();else if(action==='pagehide')h.window.emit('pagehide');else{h.account.user={id:'member-b'};h.window.XtremeAssistantVoice.render();}await tick();
  assert.ok(h.tracks[0].stopped);assert.equal(h.find('#assistant-voice-dock'),null);assert.ok(!h.bodyClasses.has('xtreme-voice-session-open'));
  const state=h.window.XtremeAssistantVoice.getSessionState();assert.equal(state.active,false);assert.equal(state.requestId,null);assert.equal(state.sessionId,null);
 }
});

test('unknown cleanup remains visible on another route and cannot silently reopen the microphone',async()=>{
 const h=await harness({handler:call=>call.path.endsWith('/end')?reply({state:'closing',finalized:false},202):undefined});await h.start();await h.connect();await h.navigate('#home');await h.click('[data-voice-control="stop"]');
 assert.ok(h.tracks[0].stopped);assert.ok(h.find('#assistant-voice-dock'));assert.match(h.find('#assistant-voice-dock-status').textContent,/microphone off/);assert.ok(h.find('[data-voice-control="recover"]'));
 await h.navigate('#calendar');assert.equal(h.permissions.length,1);assert.equal(h.calls.filter(call=>call.path.endsWith('/start')).length,1);
});

test('session change events contain bounded metadata and never infer model action commands',async()=>{
 const h=await harness(),seen=[];h.window.addEventListener('xtreme:voice-session-changed',event=>seen.push(event.detail));await h.start();await h.connect();await h.navigate('#home');await h.click('[data-voice-control="mute"]');
 assert.ok(seen.some(value=>value.state==='live'&&value.active));assert.equal(seen.at(-1).muted,true);assert.ok(Object.isFrozen(seen.at(-1)));
 assert.deepEqual(Object.keys(seen.at(-1)).sort(),['active','muted','pending','requestId','sessionId','state']);
 const calls=h.calls.length;h.peers[0].channel.emit('message',{data:JSON.stringify({type:'execute',script:'malicious',action:'calendar.create'})});assert.equal(h.calls.length,calls);
 h.window.emit('xtreme:account-ended');assert.equal(seen.at(-1).state,'ended');assert.equal(seen.at(-1).sessionId,null);
});

test('voice accepts actions only on current authenticated session receipts, never data-channel commands',async()=>{
 const action={id:'9dd562cf-d059-4a5d-8875-70c66d19472b',kind:'navigate',screen:'calendar'},received=[];
 const h=await harness({handler:call=>call.path.endsWith('/start')?reply({...answer(),requestId:call.body.requestId,actions:[action]}):call.path.includes('?requestId=')?reply({requestId:'wrong-session',state:'ready',actions:[action]}):undefined});
 h.window.XtremeAssistantActions={receive(actions,context){received.push({actions,context});}};await h.start();await h.connect();assert.equal(received.length,1);assert.equal(received[0].context.requestId,h.calls.find(call=>call.body).body.requestId);assert.equal(received[0].context.source,'voice');
 h.peers[0].channel.emit('message',{data:JSON.stringify({type:'session.delegation.created',actions:[action]})});for(const interval of h.intervals.values())if(interval.ms===15000)interval.fn();await tick();assert.equal(received.length,1);
});

test('late action bridge cannot apply receipts from a stopped voice session',async()=>{
 const action={id:'9dd562cf-d059-4a5d-8875-70c66d19472b',kind:'navigate',screen:'calendar'},received=[];
 const h=await harness({handler:call=>call.path.endsWith('/start')?reply({...answer(),requestId:call.body.requestId,actions:[action]}):undefined});await h.start();await h.connect();await h.click('[data-voice-control="stop"]');
 h.window.XtremeAssistantActions={receive(...args){received.push(args);}};h.window.emit('xtreme:assistant-actions-ready');assert.equal(received.length,0);
});
