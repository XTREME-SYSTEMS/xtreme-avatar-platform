/* Existing deployment only; public deployment identifier is not a credential. */
(()=>{
'use strict';
const DEPLOYMENT_ID='912d9c39-bf54-4e8e-80d9-311c860fd7c9';
const SDK_URL='https://unpkg.com/@tavus/embed@latest';
let active=null,sdkError=false,historyClosing=false,sdk=null;
function loadSdk(){if(sdk)return;sdk=document.createElement('script');sdk.id='tavus-sdk';sdk.src=SDK_URL;sdk.async=true;sdk.addEventListener('error',showLoadFailure);document.head.append(sdk);}
function showLoadFailure(){sdkError=true;if(!active||active.blocked)return;clearTimeout(active.loadingTimer);active.status.hidden=false;active.status.querySelector('h2').textContent='Video studio couldn’t load';active.status.querySelector('p').textContent='The video service could not be reached. Check your connection, then reload the app to try again.';}
function openPublishedLink(){const link=document.createElement('a');const target=window.XtremeMediaContext?.read()?.publishedUrl||location.origin+'/';link.href=target;link.target='_blank';link.rel='noopener noreferrer';link.className='tavus-layer-back';link.textContent='Open app in a new tab';return link;}
function policyBlocked(session){
 if(active!==session)return;clearTimeout(session.loadingTimer);session.blocked=true;
 try{if(session.ready&&typeof session.embed?.destroy==='function')session.embed.destroy();}catch{}session.embed?.remove();session.embed=null;
 session.dialog.querySelector('.tavus-preview-hint')?.remove();session.dialog.querySelector('.tavus-camera-note')?.remove();
 session.error.hidden=true;session.status.hidden=false;session.status.classList.add('tavus-policy-blocked');
 session.status.querySelector('h2').textContent='Open the app to use your microphone';
 session.status.querySelector('p').textContent='This page blocks microphone access, even when your browser permission is on. Open the published app in a new tab, then tap Video again. You may need to sign in.';
 if(!session.status.querySelector('a'))session.status.append(openPublishedLink());
}
function closeLayer({fromHistory=false,restoreFocus=true}={}){
 const session=active;if(!session)return;active=null;clearTimeout(session.loadingTimer);
 try{if(session.ready&&typeof session.embed?.destroy==='function')session.embed.destroy();}catch{}
 // Tavus also ends a live or pending conversation when the element unmounts.
 session.embed?.remove();session.dialog.close();session.dialog.remove();
 document.documentElement.style.overflow=session.htmlOverflow;document.body.style.overflow=session.bodyOverflow;
 window.scrollTo(0,session.scrollY);
 if(restoreFocus&&session.opener?.isConnected)session.opener.focus({preventScroll:true});
 if(session.pushed&&!fromHistory&&history.state?.xtremeTavusLayer===session.key){historyClosing=true;try{history.back();}catch{historyClosing=false;}}
}
function openLayer(opener,mode='video'){
 if(window.XtremeAccount?.locked||active||historyClosing)return;
 const context=window.XtremeMediaContext?.read()||{};
 const dialog=document.createElement('dialog');dialog.id='tavus-live-layer';dialog.setAttribute('aria-label','AI Assist video studio');
 dialog.innerHTML='<div class="tavus-layer-bar"><button type="button" class="tavus-layer-back" aria-label="Close video studio and return"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg> Back</button><span class="tavus-layer-name">Xtreme Avatar</span></div><div class="tavus-layer-stage"><div class="tavus-layer-status" role="status" aria-live="polite"><h2>Opening your AI video studio</h2><p>Preparing your conversation…</p></div><p class="tavus-layer-error" role="status" hidden></p></div>';
 const embed=context.microphone===false?null:document.createElement('tavus-embed');if(embed){embed.setAttribute('deployment-id',DEPLOYMENT_ID);embed.setAttribute('layout','full-screen');
 // Anonymous browser memory is not an authenticated account boundary. Keep
 // this app's video sessions stateless until private account memory is bridged.
 embed.setAttribute('override-config',JSON.stringify({customization:{conversation:{unique_memory_tag:false}}}));
 embed.setAttribute('camera-on-start',mode==='voice'||context.camera===false?'off':'on');
 embed.setAttribute('custom-greeting',"Hello, I’m your AI assistant. It’s good to see you.");
 // Preserve the existing deployment and haircheck. Voice begins with the visitor camera off.
 // No room is created or started automatically. Tavus owns permissions and call controls.
 }
 const session={dialog,embed,opener,ready:false,status:dialog.querySelector('.tavus-layer-status'),error:dialog.querySelector('.tavus-layer-error'),htmlOverflow:document.documentElement.style.overflow,bodyOverflow:document.body.style.overflow,scrollY:window.scrollY,key:Date.now().toString(36),pushed:false};
 active=session;
 if(embed){loadSdk();
 session.loadingTimer=setTimeout(()=>{if(active!==session||session.status.hidden)return;session.status.querySelector('h2').textContent='Video is taking longer to load';session.status.querySelector('p').textContent='Check your connection. You can use Back at any time, or reload the app to try again.';},20000);
 embed.addEventListener('tavus:ready',()=>{if(active!==session||session.blocked)return;session.ready=true;session.status.hidden=true;});
 embed.addEventListener('tavus:mode-change',e=>{if(active!==session||session.blocked)return;session.status.hidden=true;if(e.detail?.mode!=='unavailable')session.error.hidden=true;});
 embed.addEventListener('tavus:error',e=>{if(active!==session||session.blocked)return;if(e.detail?.code==='MICROPHONE_BLOCKED_BY_PAGE'){policyBlocked(session);return;}session.status.hidden=true;session.error.textContent=typeof e.detail?.message==='string'?e.detail.message.slice(0,350):'The video service is unavailable. You can return with Back.';session.error.hidden=false;});
 embed.addEventListener('tavus:conversation-started',()=>{if(active!==session||session.blocked)return;session.error.hidden=true;session.status.hidden=true;});
 dialog.querySelector('.tavus-layer-stage').append(embed);
 }
 if(context.framed&&context.microphone===null){const hint=document.createElement('div');hint.className='tavus-preview-hint';const text=document.createElement('span');text.textContent='If microphone access fails inside this preview, try the published app.';hint.append(text,openPublishedLink());dialog.querySelector('.tavus-layer-stage').prepend(hint);}
 if(context.camera===false&&context.microphone!==false){const note=document.createElement('p');note.className='tavus-camera-note';note.textContent='This page blocks your camera. You can continue with your microphone and the assistant’s video.';dialog.querySelector('.tavus-layer-stage').prepend(note);}
 dialog.querySelector('.tavus-layer-back').addEventListener('click',()=>closeLayer());
 dialog.addEventListener('cancel',e=>{e.preventDefault();closeLayer();});
 document.body.append(dialog);document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';dialog.showModal();
 try{history.pushState({...history.state,xtremeTavusLayer:session.key},'',location.href);session.pushed=true;}catch{}
 if(context.microphone===false)policyBlocked(session);else if(sdkError)showLoadFailure();
}
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-open-session]');if(!button)return;e.preventDefault();e.stopImmediatePropagation();openLayer(button,button.dataset.openSession);},true);
window.addEventListener('xtreme:account-ended',()=>closeLayer({fromHistory:true,restoreFocus:false}));
window.addEventListener('popstate',()=>{historyClosing=false;if(active&&history.state?.xtremeTavusLayer!==active.key)closeLayer({fromHistory:true});});
window.addEventListener('hashchange',()=>{if(active)closeLayer({fromHistory:true});});
window.addEventListener('pagehide',()=>closeLayer({fromHistory:true,restoreFocus:false}));
// The SDK script is fixed and does not receive keys, private context, or memory tags.

})();
