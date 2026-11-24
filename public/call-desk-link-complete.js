(()=>{
 'use strict';
 const $=id=>document.getElementById(id),key='xtreme-call-desk-completion-v1',fragment=new URLSearchParams(location.hash.slice(1));
 let attempt=null,busy=false,epoch=0,verifiedOwner=null;
 history.replaceState(null,'',location.pathname);
 try{if(fragment.has('code')){attempt={code:fragment.get('code'),state:fragment.get('state')};sessionStorage.setItem(key,JSON.stringify(attempt));}else attempt=JSON.parse(sessionStorage.getItem(key)||'null');}catch{attempt=fragment.has('code')?{code:fragment.get('code'),state:fragment.get('state')}:null;}
 async function finish(){
  if(busy)return;busy=true;const run=++epoch;$('complete-retry').hidden=true;$('complete-signin').hidden=true;$('complete-status').textContent='Checking your signed-in account and connection…';
  try{
   const account=await fetch('/api/account',{credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(run!==epoch)return;
   if(account.status===401){verifiedOwner=null;$('complete-signin').hidden=false;throw new Error('Sign in with the same Xtreme Avatar account that started this connection.');}
   if(!account.ok)throw new Error('Your Xtreme Avatar account must have active membership to finish connecting.');
   const data=await account.json();if(run!==epoch)return;
   if(!data.user?.id)throw new Error('Your signed-in account could not be verified.');
   if(verifiedOwner&&verifiedOwner!==data.user.id){verifiedOwner=null;throw new Error('Your signed-in account changed. Open Connected apps to review this account.');}
   let response;
   if(attempt){
    if(!/^[0-9a-f]{64}$/.test(attempt.code||'')||!/^[0-9a-f]{64}$/.test(attempt.state||''))throw new Error('Start a new connection from Connected apps, then approve it in your private Call Desk account.');
    response=await fetch('/api/call-desk-link/complete',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'content-type':'application/json','X-Xtreme-Account':data.user.id},body:JSON.stringify(attempt),signal:AbortSignal.timeout(15000)});
   }else response=await fetch('/api/call-desk-link/status',{credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'X-Xtreme-Account':data.user.id},signal:AbortSignal.timeout(15000)});
   const result=await response.json();if(run!==epoch)return;
   if(!response.ok)throw new Error(result.error||'The connection has not been confirmed.');
   if(result.linked!==true){verifiedOwner=null;throw new Error('No active connection was confirmed. Open Connected apps to connect your own Call Desk account.');}
   try{sessionStorage.removeItem(key);}catch{}attempt=null;verifiedOwner=data.user.id;
   $('complete-status').textContent='Connected. New assistant chats and voice sessions can use your own saved profile, enabled memories, and approved coaching.';
  }catch(e){if(run!==epoch)return;$('complete-status').textContent=e.message||'The connection result could not be confirmed. Check again.';$('complete-retry').hidden=false;}
  finally{if(run===epoch)busy=false;}
 }
 $('complete-retry').addEventListener('click',finish);
 window.addEventListener('pagehide',()=>{epoch++;busy=false;verifiedOwner=null;$('complete-status').textContent='Connection needs a fresh check.';});
 window.addEventListener('pageshow',()=>{if(document.visibilityState==='visible')void finish();});
 window.addEventListener('focus',()=>{if(document.visibilityState==='visible')void finish();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void finish();else{$('complete-status').textContent='Connection needs a fresh check.';}});
 void finish();
})();
