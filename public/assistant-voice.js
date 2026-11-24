/* Account-scoped GPT Live WebRTC. Provider configuration and credentials stay server-side. */
(()=>{
'use strict';
if(window.XtremeAssistantVoice)return;
const account=window.XtremeAccount,owner=account?.user?.id;
if(!owner||account.locked)return;
const requests=new Set(),$=selector=>document.querySelector(selector);
const mediaContext=()=>window.XtremeMediaContext?.read()||{};
const blockedMessage='This page blocks microphone access even when browser permission is on. Open the published app in a new tab, then tap Voice. You may need to sign in.';
let dead=false,ready=false,checking=false,phase='checking',detail='Checking the voice connection. Your microphone is off.',attempt=null,generation=0,lastPublishedState='';
function current(){if(dead||account.locked)return false;if(account.user?.id!==owner){account.invalidate?.('Your signed-in account changed. Reload to open the correct account.');return false;}return true;}
function live(a){return Boolean(a)&&current()&&attempt===a&&!a.cancelled;}
function getSessionState(){
 const valid=!dead&&!account.locked&&account.user?.id===owner,a=valid?attempt:null;
 return Object.freeze({state:valid?phase:'ended',active:Boolean(a)&&!a.cancelled,pending:Boolean(a),muted:Boolean(a?.muted),requestId:a?.requestId||null,sessionId:a?.sessionId||null});
}
function publishState(){const state=getSessionState(),value=JSON.stringify(state);if(value!==lastPublishedState){lastPublishedState=value;window.dispatchEvent(new CustomEvent('xtreme:voice-session-changed',{detail:state}));}}
function deliverActions(a,receipt){
 if(!live(a))return;
 if(receipt?.requestId===a.requestId&&Array.isArray(receipt.actions)&&receipt.actions.length<=12)a.actions=receipt.actions;
 if(a.actions&&window.XtremeAssistantActions){const actions=a.actions;a.actions=null;window.XtremeAssistantActions.receive(actions,{source:'voice',requestId:a.requestId,automatic:true});}
}
function clearDock(){ $('#assistant-voice-dock')?.remove();document.body.classList?.remove('xtreme-voice-session-open'); }
function renderDock(){
 const state=getSessionState();
 if(!state.pending||location.hash==='#voice'){clearDock();return;}
 let dock=$('#assistant-voice-dock');
 if(!dock){dock=document.createElement('section');dock.id='assistant-voice-dock';dock.setAttribute('aria-label','Ongoing AI voice session');document.body.append(dock);}
 document.body.classList?.add('xtreme-voice-session-open');
 const label=document.createElement('p');label.id='assistant-voice-dock-status';label.setAttribute('role','status');label.setAttribute('aria-live','polite');
 label.textContent=state.active?(phase==='live'?(state.muted?'Voice · microphone muted':'Voice · microphone on'):phase==='permission'?'Voice · waiting for microphone':'Voice · connecting'):'Voice · microphone off';
 const controls=document.createElement('div');controls.className='assistant-voice-dock-controls';
 if(state.active){const toggle=button(state.muted?'Unmute':'Mute','mute');toggle.setAttribute('aria-pressed',String(state.muted));controls.append(toggle,button('End','stop'));if(attempt.audioBlocked)controls.append(button('Enable audio','play'));}
 else {const recovery=button(phase==='ending'?'Ending…':'Check cleanup','recover');recovery.disabled=phase==='ending';controls.append(recovery);}
 dock.replaceChildren(label,controls);
}
async function request(path,body,{keepalive=false,cleanup=false}={}){
 if((cleanup?account.user?.id!==owner:!current()))throw new Error('Account ended.');
 const controller=new AbortController();if(!keepalive)requests.add(controller);
 const timeout=keepalive?null:setTimeout(()=>controller.abort(),path==='start'?60000:15000);
 try{
  const response=await fetch('/api/assistant/voice/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'X-Xtreme-Account':owner,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),...(keepalive?{keepalive:true}:{signal:controller.signal})});
  const result=await response.json();
  if(!response.ok){if(!cleanup&&(result?.code==='account_changed'||[401,403].includes(response.status)))account.invalidate?.('Your account access changed. Sign in again.',response.status===401);throw Object.assign(new Error('Voice request failed.'),{status:response.status,code:result?.code,terminal:result?.terminal===true||path==='start'&&result?.code==='invalid_request'});}
  return result;
 }finally{clearTimeout(timeout);requests.delete(controller);}
}
function button(label,action){const el=document.createElement('button');el.type='button';el.className='silver-button';el.textContent=label;el.setAttribute('data-voice-control',action);return el;}
function render(){
 if(!current()){clearDock();publishState();return;}
 renderDock();publishState();
 const orb=$('[data-assistant-voice]'),status=$('#assistant-voice-status'),note=$('#assistant-voice-detail');if(!orb||!status)return;
 const context=mediaContext(),pageBlocked=context.microphone===false&&!attempt;
 const talking=phase==='live',blocked=pageBlocked||checking||Boolean(attempt)&&!talking||!ready;
 orb.disabled=blocked;orb.setAttribute('aria-disabled',String(blocked));orb.setAttribute('aria-label',talking?(attempt.muted?'Unmute microphone':'Mute microphone'):'Start voice conversation');orb.setAttribute('aria-pressed',String(talking&&!attempt.muted));
 status.textContent=({checking:'Checking voice connection',idle:'Ready to talk',unavailable:'Voice unavailable',permission:'Allow microphone access',connecting:'Connecting voice…',live:attempt?.muted?'Microphone muted':'Connected',ending:'Ending voice session…',recovery:'Session cleanup needs checking',error:'Voice could not connect'}[phase]||'Voice connection pending');
 if(pageBlocked)status.textContent='Open the app to use your microphone';
 if(note)note.textContent=pageBlocked?blockedMessage:detail;
 let controls=$('#assistant-voice-controls');if(!controls){controls=document.createElement('div');controls.id='assistant-voice-controls';controls.className='assistant-voice-controls';$('.assistant-voice-space')?.append(controls);}
 controls.replaceChildren();
 if(attempt&&!attempt.cancelled){if(talking)controls.append(button(attempt.muted?'Unmute':'Mute','mute'));controls.append(button('Stop','stop'));if(attempt.audioBlocked)controls.append(button('Enable audio','play'));}
 else if(attempt){const retry=button('Check session','recover');retry.disabled=phase==='ending';controls.append(retry);}
 else if(!ready)controls.append(button('Check connection','check'));
 if(!attempt&&(pageBlocked||context.framed&&context.microphone===null)){
  const hint=document.createElement('p');hint.className='helper';hint.textContent=pageBlocked?'':'If microphone access fails inside this preview, try the published app.';
  const link=document.createElement('a');link.href='https://xtreme-avatar-mobile.strategic-ai.chatgpt.site/';link.target='_blank';link.rel='noopener noreferrer';link.className='silver-button';link.textContent='Open published app';controls.append(hint,link);
 }
 if(attempt?.connectedAt){const timer=document.createElement('p');timer.id='assistant-voice-duration';timer.className='assistant-voice-duration';controls.append(timer);duration();}
}
function duration(){const el=$('#assistant-voice-duration');if(!el||!attempt?.connectedAt)return;const seconds=Math.max(0,Math.floor((Date.now()-attempt.connectedAt)/1000));el.textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
function cleanLocal(a){
 a.cancelled=true;a.actions=null;for(const timer of ['setupTimer','connectTimer','limitTimer','disconnectTimer'])clearTimeout(a[timer]);clearInterval(a.tick);clearInterval(a.pollTimer);a.cancelIce?.();
 a.stream?.getTracks().forEach(track=>track.stop());a.audio?.pause();if(a.audio){a.audio.srcObject=null;a.audio.remove();}
 try{a.channel?.close();}catch{}try{a.peer?.close();}catch{}
}
function terminal(receipt){return receipt?.finalized===true||receipt?.state==='rejected';}
async function endRemote(a,keepalive=false){
 if(a.ending&&!keepalive)return;a.ending=true;
 try{
  const result=await request('end',{requestId:a.requestId,...(a.sessionId?{sessionId:a.sessionId}:{})},{keepalive,cleanup:true});
  if(attempt!==a)return;
  if(terminal(result)){attempt=null;phase=ready?'idle':'unavailable';detail='Voice session ended. Your microphone is off.';}
  else{phase='recovery';detail='Your microphone is off. The service has not confirmed session cleanup yet.';}
 }catch{if(attempt===a){phase='recovery';detail='Your microphone is off. Check the session before starting another conversation.';}}
 finally{a.ending=false;if(current())render();}
}
function stop(message='Voice session ended. Your microphone is off.',{keepalive=false}={}){
 const a=attempt;if(!a)return;
 // A user stop releases the microphone immediately; server finalization is tracked separately.
 if(a.providerStarted&&a.channel?.readyState==='open'){try{a.channel.send(JSON.stringify({type:'session.close'}));}catch{}}
 cleanLocal(a);generation++;detail=message;
 for(const controller of requests)controller.abort();requests.clear();
 if(a.startSent){phase='ending';if(current())render();void endRemote(a,keepalive);}
 else{attempt=null;phase=ready?'idle':'unavailable';if(current())render();}
}
async function check(){
 if(!current()||checking||attempt&&!attempt.cancelled)return;
 checking=true;const run=++generation;render();
 try{
  const result=await request('status');if(!current()||run!==generation)return;
  ready=mediaContext().microphone!==false&&result?.ready===true&&Boolean(navigator.mediaDevices?.getUserMedia)&&typeof RTCPeerConnection==='function';
  if(result?.pendingRequest?.requestId){attempt=attempt||{requestId:result.pendingRequest.requestId,sessionId:result.pendingRequest.sessionId,cancelled:true,startSent:true};phase='recovery';detail='A previous voice session needs cleanup. Your microphone is off.';}
  else if(attempt){phase='recovery';detail='Check the earlier session before starting another. Your microphone is off.';}
  else{phase=ready?'idle':'unavailable';detail=ready?'Tap the microphone to speak with AI Assist. Camera stays off.':'Voice is not available in this account or browser yet. Your microphone is off.';}
 }catch{if(current()&&run===generation){ready=false;phase='unavailable';detail='The voice service could not be reached. Your microphone is off.';}}
 finally{if(current()&&run===generation){checking=false;render();}}
}
async function recover(){
 const a=attempt;if(!current()||!a||!a.cancelled||a.ending)return;
 phase='ending';render();
 try{const receipt=await request('status?requestId='+encodeURIComponent(a.requestId));if(!current()||attempt!==a)return;if(terminal(receipt)){attempt=null;phase=ready?'idle':'unavailable';detail='The previous session is closed. Your microphone is off.';render();return;}if(typeof receipt.sessionId==='string')a.sessionId=receipt.sessionId;}catch{if(!current())return;}
 if(attempt===a)await endRemote(a);
}
function iceReady(a){
 if(a.peer.iceGatheringState==='complete')return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timer);a.peer.removeEventListener('icegatheringstatechange',changed);a.cancelIce=null;error?reject(error):resolve();};
  const changed=()=>{if(a.peer.iceGatheringState==='complete')finish();};
  const timer=setTimeout(()=>finish(new Error('ICE gathering timed out.')),8000);a.cancelIce=()=>finish(new Error('Voice setup stopped.'));a.peer.addEventListener('icegatheringstatechange',changed);
 });
}
function markConnected(a){
 // A trusted server sideband may consume the initial started event. In that case,
 // require verified setup plus observed remote playback, never SDP/track creation alone.
 if(!live(a)||!(a.providerStarted||a.configurationVerified&&a.audioPlaying)||!a.remoteApplied||a.peer.connectionState!=='connected')return;
 if(!a.connectedAt){a.connectedAt=Date.now();a.tick=setInterval(duration,1000);}
 clearTimeout(a.connectTimer);phase='live';detail=a.audioBlocked?'Tap Enable audio to hear AI Assist.':a.audioPlaying?'Speak naturally. AI Assist is listening.':'Voice is connected. Waiting for assistant audio.';render();
}
async function play(a){if(!live(a)||!a.audio?.srcObject)return;try{await a.audio.play();if(live(a)){a.audioBlocked=false;render();}}catch{if(live(a)){a.audioBlocked=true;detail='Tap Enable audio to hear AI Assist.';render();}}}
function mute(){const a=attempt;if(!live(a))return;a.muted=!a.muted;a.stream?.getAudioTracks().forEach(track=>{track.enabled=!a.muted;});detail=a.muted?'Microphone muted. Tap again when you’re ready.':'Your microphone is on.';render();}
async function poll(a){
 if(!live(a)||a.polling)return;a.polling=true;
 try{const receipt=await request('status?requestId='+encodeURIComponent(a.requestId));if(live(a))deliverActions(a,receipt);if(live(a)&&terminal(receipt)){cleanLocal(a);attempt=null;phase=ready?'idle':'unavailable';detail='Voice session ended. Your microphone is off.';render();}}
 catch{if(live(a))stop('The voice connection could not be verified. Your microphone is off.');}
 finally{a.polling=false;}
}
async function start(){
 if(!current()||checking||!ready||attempt)return;
 if(mediaContext().microphone===false){ready=false;phase='unavailable';detail=blockedMessage;render();return;}
 const a={requestId:crypto.randomUUID(),cancelled:false,startSent:false,muted:false,providerStarted:false};attempt=a;phase='permission';detail='Allow microphone access to talk. Camera stays off.';render();
 a.setupTimer=setTimeout(()=>{if(live(a))stop('Voice setup timed out. Your microphone is off.');},60000);
 try{
  // Called from the existing microphone button, never during page load or navigation.
  const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
  if(!live(a)){stream.getTracks().forEach(track=>track.stop());return;}a.stream=stream;stream.getAudioTracks().forEach(track=>{track.enabled=!a.muted;});
  if(!stream.getAudioTracks().length)throw new Error('No microphone track.');
  a.peer=new RTCPeerConnection();a.audio=document.createElement('audio');a.audio.autoplay=true;a.audio.playsInline=true;a.audio.hidden=true;document.body.append(a.audio);
  a.audio.addEventListener('playing',()=>{if(live(a)){a.audioPlaying=true;a.audioBlocked=false;markConnected(a);if(phase==='live'){detail=a.muted?'Microphone muted.':'Speak naturally. AI Assist is listening.';render();}}});
  a.peer.addEventListener('track',event=>{if(!live(a)||event.track.kind!=='audio')return;a.audio.srcObject=new MediaStream([event.track]);void play(a);});
  a.peer.addEventListener('connectionstatechange',()=>{if(!live(a))return;const state=a.peer.connectionState;if(state==='connected'){clearTimeout(a.disconnectTimer);markConnected(a);}else if(state==='failed'||state==='closed')stop('Voice disconnected. Your microphone is off.');else if(state==='disconnected'){phase='connecting';detail='Voice connection interrupted. Checking the connection…';render();clearTimeout(a.disconnectTimer);a.disconnectTimer=setTimeout(()=>{if(live(a)&&a.peer.connectionState!=='connected')stop('Voice disconnected. Your microphone is off.');},5000);}});
  for(const track of stream.getAudioTracks()){a.peer.addTrack(track,stream);track.addEventListener('ended',()=>{if(live(a))stop('Your microphone stopped. The voice session is ending.');});}
  a.channel=a.peer.createDataChannel('oai-events');
  a.channel.addEventListener('message',event=>{
   if(!live(a))return;let value;try{value=JSON.parse(event.data);}catch{return;}
   if(value.type==='session.started'&&value.session?.id===a.sessionId){a.providerStarted=true;markConnected(a);}
   else if(value.type==='session.closed'){stop('The conversation ended. Your microphone is off.');}
   else if(value.type==='error')stop('The voice service reported a problem. Your microphone is off.');
  });
  a.channel.addEventListener('close',()=>{if(live(a))stop('Voice disconnected. Your microphone is off.');});
  a.channel.addEventListener('error',()=>{if(live(a))stop('Voice disconnected. Your microphone is off.');});
  phase='connecting';detail='Connecting your private voice session…';render();
  await a.peer.setLocalDescription(await a.peer.createOffer());await iceReady(a);if(!live(a))return;
  a.sdp=a.peer.localDescription?.sdp;if(typeof a.sdp!=='string'||!a.sdp.startsWith('v=0')||!a.sdp.includes('m=audio ')||a.sdp.includes('\0')||new TextEncoder().encode(a.sdp).length>24000)throw new Error('No valid voice offer.');
  a.startSent=true;const result=await request('start',{requestId:a.requestId,sdp:a.sdp});
  if(!live(a)){if(typeof result?.sessionId==='string')a.sessionId=result.sessionId;void endRemote(a);return;}
  if(typeof result?.sessionId==='string')a.sessionId=result.sessionId;
  if(result?.configurationVerified!==true||result.state!=='ready'||!a.sessionId||typeof result.sdp!=='string'||!result.sdp.startsWith('v=0'))throw new Error('Voice session was not verified.');
  a.configurationVerified=true;
  deliverActions(a,result);
  clearTimeout(a.setupTimer);
  const maximum=Math.min(180,Math.max(1,Number(result.maxSeconds)||180)),expiry=Number(result.expiresAt)*1000;
  const remaining=Math.min(maximum*1000,Number.isFinite(expiry)?Math.max(0,expiry-Date.now()):maximum*1000);
  a.limitTimer=setTimeout(()=>{if(live(a))stop('Voice time limit reached. Your microphone is off.');},remaining);
  a.connectTimer=setTimeout(()=>{if(live(a))stop('The live voice connection was not confirmed. Your microphone is off.');},25000);
  a.pollTimer=setInterval(()=>void poll(a),15000);
  await a.peer.setRemoteDescription({type:'answer',sdp:result.sdp});if(!live(a))return;a.remoteApplied=true;markConnected(a);
 }catch(error){
  if(!live(a))return;
  const message=error.name==='NotAllowedError'?(mediaContext().microphone===false?blockedMessage:mediaContext().framed?'Microphone access could not be opened here. Try the published app outside this preview, or check browser microphone permission.':'Microphone permission was denied. Allow it in your browser, then try again.'):error.name==='NotFoundError'?'No microphone was found. Connect one and try again.':'Voice could not connect. Your microphone is off.';
  if(error.terminal||error.code==='request_pending')a.startSent=false;
  stop(message);if(!attempt&&current()){phase='error';detail=message;render();}
  if(error.code==='request_pending'&&current())void check();
 }
}
window.XtremeAssistantVoice={render,stop,toggleMute:mute,getSessionState,isActive:()=>getSessionState().active};
document.addEventListener('click',event=>{
 if(!current())return;
 if(event.target.closest?.('[data-assistant-voice]')){event.preventDefault();if(phase==='live')mute();else void start();return;}
 const action=event.target.closest?.('[data-voice-control]')?.getAttribute('data-voice-control');
 if(action==='stop')stop();if(action==='mute')mute();if(action==='play')void play(attempt);if(action==='check')void check();if(action==='recover')void recover();
});
// Hash navigation changes the work surface, not the user's explicit voice session.
window.addEventListener('hashchange',()=>render());
window.addEventListener('xtreme:assistant-actions-ready',()=>deliverActions(attempt));
window.addEventListener('xtreme:voice-privacy-close',()=>stop('Voice ended for privacy. Your microphone is off.'));
window.addEventListener('xtreme:account-ended',()=>{stop('Account ended.',{keepalive:true});dead=true;generation++;for(const controller of requests)controller.abort();requests.clear();clearDock();publishState();});
window.addEventListener('pagehide',()=>{stop('Page closed.',{keepalive:true});dead=true;generation++;checking=false;for(const controller of requests)controller.abort();requests.clear();clearDock();publishState();});
window.addEventListener('pageshow',event=>{if(event.persisted&&!account.locked&&account.user?.id===owner){dead=false;void check();}});
void check();
})();
