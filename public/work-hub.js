/* Private saved work. No background agent or external account is invoked here. */
(() => {
 'use strict';
 const account=window.XtremeAccount,owner=account?.user?.id;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stages={lead:'Lead',estimating:'Estimating',scheduled:'Scheduled',active:'In progress',complete:'Complete'};
 const kinds={note:'Note',proposal:'Proposal draft',estimate:'Estimate draft',document:'Document',other:'Other'};
 const controllers=new Set();
 let snapshot=null,loading=false,busy=false,mode='projects',generation=0,notice='',needsRefresh=false,editor=null,lastAttemptedDay='';
 const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 function active(){if(!account||account.locked||!owner)return false;if(account.user?.id!==owner){account.invalidate?.('Your signed-in account changed. Reload your workspace.');return false;}return true;}
 function safeLink(value){try{const u=new URL(value),h=u.hostname.toLowerCase().replace(/\.$/,'');return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&!/[\s\\]/.test(value)&&!['localhost','localhost.localdomain'].includes(h)&&!h.endsWith('.local')&&!h.endsWith('.internal')&&!h.endsWith('.localhost')&&!/^\[/.test(h)&&!/^\d+(?:\.\d+){3}$/.test(h)&&h.includes('.');}catch{return false;}}
 async function request(path,input){
  if(!active())throw new Error('Sign in to open your workspace.');
  const stamp=generation,controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(path,{method:input?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'x-xtreme-account':owner,...(input?{'content-type':'application/json'}:{})},body:input?JSON.stringify(input):undefined,signal:controller.signal});
   let result;try{result=await response.json();}catch{throw new Error('The server did not return a confirmed result. Refresh before retrying.');}
   if(stamp!==generation||!active())throw new Error('Your account changed.');
   if([401,403].includes(response.status)||result.code==='account_changed'){account.invalidate?.(result.error||'Sign in to continue.',response.status===401);throw new Error('Your account changed.');}
   if(!response.ok)throw new Error(result.error||'The request was not confirmed. Refresh before retrying.');
   if(result.userId!==owner)throw new Error('The account response did not match. Reload before continuing.');
   return result;
  }catch(error){if(error.name==='AbortError')throw new Error(input?'Save not confirmed. Refresh to check before retrying.':'The workspace took too long to load. Try Refresh.');throw error;}finally{clearTimeout(timer);controllers.delete(controller);}
 }
 function refreshView(){if(!active())return;const root=document.querySelector('#work-hub-root');if(root)root.innerHTML=body();window.dispatchEvent(new Event('xtreme:work-hub-changed'));}
 async function load(){
  if(!active()||loading||busy)return;loading=true;lastAttemptedDay=day();const stamp=generation;refreshView();
  try{const next=await request('/api/work-hub?day='+day());if(stamp!==generation||!active())return;if(!Number.isSafeInteger(next.version)||!Array.isArray(next.jobs)||!Array.isArray(next.results)||!next.briefing)throw new Error('The workspace response could not be read.');snapshot=next;needsRefresh=false;notice=editor?'Your draft is kept below. Review it before saving.':'';}
  catch(error){if(stamp===generation&&active()){notice=error.message;needsRefresh=true;}}
  finally{if(stamp===generation&&active()){loading=false;refreshView();}}
 }
 function links(items){return items?.length?`<ul class="hub-links">${items.filter(l=>safeLink(l.url)).map(l=>`<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>`:'';}
 const button=(action,label,id='',extra='')=>`<button type="button" class="silver-button" data-workhub="${action}" ${id?`data-id="${esc(id)}"`:''} ${busy||loading?'disabled':''} ${extra}>${label}</button>`;
 function editorHtml(){
  if(!editor)return '';const d=editor.data,isJob=editor.type==='jobs';
  const field=(key,label,max,type='text')=>`<label class="field" for="hub-${key}">${label}<input id="hub-${key}" name="${key}" data-hub-field="${key}" type="${type}" maxlength="${max}" value="${esc(d[key])}" ${busy?'readonly':''} ${key==='name'||key==='title'?'required':''}></label>`;
  return `<form id="hub-editor" class="hub-editor surface"><div class="hub-heading"><h2>${editor.existing?'Edit':isJob?'New':'Save a'} ${isJob?'job folder':'result'}</h2>${button('cancel','Close')}</div>${isJob?`${field('name','Job name',100)}<div class="hub-field-pair">${field('client','Client',100)}${field('location','Job location',160)}</div><div class="hub-field-pair"><label class="field" for="hub-stage">Stage<select id="hub-stage" data-hub-field="stage" ${busy?'disabled':''}>${Object.entries(stages).map(([key,label])=>`<option value="${key}" ${d.stage===key?'selected':''}>${label}</option>`).join('')}</select></label>${field('dueDate','Next due date (optional)',10,'date')}</div><label class="field" for="hub-notes">Job notes<textarea id="hub-notes" data-hub-field="notes" maxlength="2000" rows="4" ${busy?'readonly':''}>${esc(d.notes)}</textarea></label>`:`${field('title','Result title',100)}<label class="field" for="hub-kind">Result type<select id="hub-kind" data-hub-field="kind" ${busy?'disabled':''}>${Object.entries(kinds).map(([key,label])=>`<option value="${key}" ${d.kind===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field" for="hub-text">Saved text<textarea id="hub-text" data-hub-field="text" maxlength="6000" rows="6" ${busy?'readonly':''}>${esc(d.text)}</textarea></label><p class="helper">Saved by you. This does not start work or certify an estimate.</p>`}<fieldset class="hub-documents"><legend>Document links</legend><p class="helper">Link plans, photos, proposals, or other files already stored online. File uploads are not available here.</p>${d.links.map((l,i)=>`<div class="hub-link-fields"><label class="field" for="hub-link-label-${i}">Label<input id="hub-link-label-${i}" data-hub-link="${i}" data-hub-part="label" maxlength="80" value="${esc(l.label)}" placeholder="Plans, photos, proposal…" ${busy?'readonly':''}></label><label class="field" for="hub-link-url-${i}">HTTPS link<input id="hub-link-url-${i}" data-hub-link="${i}" data-hub-part="url" type="url" maxlength="2048" value="${esc(l.url)}" placeholder="https://…" ${busy?'readonly':''}></label></div>`).join('')}${d.links.length<5?button('add-link','+ Add another link'):''}</fieldset><div class="hub-editor-actions"><button class="dark-button" type="submit" ${busy||loading||needsRefresh?'disabled':''}>${busy?'Saving…':editor.existing?'Save changes':isJob?'Create job folder':'Save result'}</button>${button('cancel','Cancel')}</div>${needsRefresh?'<p class="hub-warning">Refresh before saving. Your unsaved text stays here.</p>':''}<p class="helper" role="status">${esc(notice)}</p></form>`;
 }
 function projects(){
  const items=snapshot?.jobs||[];
  return `<section class="hub-intro"><p class="eyebrow">YOUR PROJECTS</p><h2>Everything for the job.</h2><p>Keep the client, next date, notes, and document links together.</p></section><div class="hub-toolbar">${button('new-job','+ New job folder')}<span>${items.length} / 30 folders</span></div>${editor?.type==='jobs'?editorHtml():''}<div class="hub-card-list">${items.length?[...items].reverse().map(j=>`<article class="hub-card"><div class="hub-heading"><span class="hub-tag">${esc(stages[j.stage]||j.stage)}</span>${button('edit-job','Edit',j.id)}</div><h3>${esc(j.name)}</h3>${j.client?`<p class="hub-client">${esc(j.client)}</p>`:''}${j.location?`<p>${esc(j.location)}</p>`:''}${j.dueDate?`<p class="hub-date">Next due · <time datetime="${esc(j.dueDate)}">${esc(j.dueDate)}</time></p>`:'<p class="helper">No due date set</p>'}${j.notes?`<p class="hub-preserve">${esc(j.notes)}</p>`:''}${links(j.links)}<div class="hub-card-footer">${button('delete-job','Delete folder',j.id)}</div></article>`).join(''):'<section class="hub-empty surface"><h3>Your first job starts here.</h3><p>Create a folder for a current project or a bid you are preparing.</p></section>'}</div>`;
 }
 function results(){
  const items=snapshot?.results||[];
  return `<section class="hub-intro"><p class="eyebrow">RESULTS INBOX</p><h2>Your useful work, together.</h2><p>Keep finished notes, proposal drafts, estimates, and document links within reach.</p></section><div class="hub-toolbar">${button('new-result','+ Save a result')}<span>${items.length} / 50 saved</span></div><p class="helper">Items are saved by you. Automatic delivery from agents is not connected.</p>${editor?.type==='results'?editorHtml():''}<div class="hub-card-list">${items.length?[...items].reverse().map(r=>`<article class="hub-card"><div class="hub-heading"><span class="hub-tag">${esc(kinds[r.kind]||r.kind)}</span>${button('edit-result','Edit',r.id)}</div><h3>${esc(r.title)}</h3><p class="helper">Saved by you · ${esc(r.updatedAt?.slice(0,10)||'')}</p>${r.text?`<p class="hub-preserve">${esc(r.text)}</p>`:''}${links(r.links)}<div class="hub-card-footer">${button('delete-result','Delete result',r.id)}</div></article>`).join(''):'<section class="hub-empty surface"><h3>A place for the work you want to keep.</h3><p>Save a proposal draft, useful answer, or project document here.</p></section>'}</div>`;
 }
 function briefing(){
  const b=snapshot?.briefing;if(!b)return '';
  return `<section class="hub-intro"><p class="eyebrow">TODAY · ${esc(b.day)}</p><h2>Your day, at a glance.</h2><p>From your saved job dates and task drafts. Use Refresh for the latest saved information.</p></section><div class="hub-stat-grid"><div><strong>${b.dueToday.length}</strong><span>Jobs due today</span></div><div><strong>${b.overdue.length}</strong><span>Past due</span></div><div><strong>${b.openTaskCount}</strong><span>Open task drafts</span></div></div><section class="hub-card"><h3>Due today</h3>${b.dueToday.length?`<ul class="hub-brief-list">${b.dueToday.map(j=>`<li><strong>${esc(j.name)}</strong><span>${esc(stages[j.stage]||j.stage)}</span></li>`).join('')}</ul>`:'<p>No saved job due dates fall today.</p>'}<a class="text-button" href="#projects">Open job folders →</a></section>${b.overdue.length?`<section class="hub-card"><h3>Dates to review</h3><ul class="hub-brief-list">${b.overdue.map(j=>`<li><strong>${esc(j.name)}</strong><span>Due ${esc(j.dueDate)}</span></li>`).join('')}</ul></section>`:''}<section class="hub-card"><h3>Your open task drafts</h3>${b.openTasks.length?`<ul class="hub-brief-list">${b.openTasks.map(t=>`<li><strong>${esc(t.title||'Saved task')}</strong><span>Draft · not executed</span></li>`).join('')}</ul>`:'<p>No open task drafts are saved.</p>'}${b.openTaskCount>8?'<p class="helper">Showing the first 8 drafts. Open Tasks to review all.</p>':''}<a class="text-button" href="#workspace">Open Tasks →</a></section><section class="hub-card hub-connection-note"><h3>Calendar & email</h3><p>Google Calendar events and Gmail priorities are not included yet. Connectors must be enabled and verified for your account first.</p><a class="text-button" href="#connections">Google Workspace →</a></section><p class="helper">${b.unscheduledJobs} open job${b.unscheduledJobs===1?'':'s'} without a due date. Task notes are not treated as confirmed calendar events.</p>`;
 }
 function body(){
  if(!active())return '';
  if(!snapshot)return `<section class="hub-empty surface" role="status"><h2>${loading?'Opening your private work…':'Your private work'}</h2><p>${esc(notice||'Load your saved jobs, results, and daily briefing.')}</p>${button('refresh',loading?'Loading…':'Refresh')}</section>`;
  return `<div class="hub-refresh">${button('refresh',loading?'Refreshing…':'Refresh')}<span>${loading?'Checking your saved work…':needsRefresh?'Refresh needed':'Private to your account'}</span></div>${notice&&!editor?`<p class="hub-notice" role="status">${esc(notice)}</p>`:''}${needsRefresh?'<p class="hub-warning">Showing the last loaded information. Refresh to get the latest version.</p>':''}${mode==='results'?results():mode==='briefing'?briefing():projects()}`;
 }
 function render(next='projects'){mode=['projects','results','briefing'].includes(next)?next:'projects';return `<div id="work-hub-root" class="work-hub">${body()}</div>`;}
 function activate(next='projects'){mode=['projects','results','briefing'].includes(next)?next:'projects';if(active()&&lastAttemptedDay!==day())void load();}
 function openEditor(type,id){
  if(!active()||busy||loading)return;if(editor&&!confirm('Discard your unsaved changes?'))return;
  const existing=id?snapshot?.[type].find(v=>v.id===id):null;if(id&&!existing)return;
  const data=type==='jobs'?{name:'',client:'',location:'',stage:'lead',dueDate:'',notes:'',links:[]}:{title:'',kind:'note',text:'',links:[]};
  if(existing)for(const key of Object.keys(data))data[key]=structuredClone(existing[key]);
  if(!data.links.length)data.links=[{label:'',url:''}];
  editor={type,id:existing?.id||`${type==='jobs'?'job':'result'}_${crypto.randomUUID()}`,existing:Boolean(existing),data};notice='';refreshView();document.querySelector('#hub-editor input')?.focus();
 }
 async function mutate(type,input){
  if(!active()||busy||loading||!snapshot||needsRefresh)return;busy=true;const stamp=generation;notice='Saving…';refreshView();
  try{const result=await request('/api/work-hub/'+type,{...input,version:snapshot.version});if(stamp!==generation||!active())return;if(result.saved!==true||!Number.isSafeInteger(result.version))throw new Error('Save not confirmed. Refresh to check before retrying.');editor=null;notice=input.action==='delete'?'Deleted from your private workspace.':'Saved to your private workspace.';busy=false;await load();}
  catch(error){if(stamp===generation&&active()){notice=error.message;needsRefresh=true;}}
  finally{if(stamp===generation&&active()){busy=false;refreshView();}}
 }
 async function save(){if(!editor||!active()||busy)return;const data=structuredClone(editor.data);data.links=data.links.filter(l=>l.label.trim()||l.url.trim());if(data.links.some(l=>!l.label.trim()||!safeLink(l.url))){notice='Each link needs a label and a public HTTPS address.';refreshView();return;}await mutate(editor.type,{action:editor.existing?'update':'create',id:editor.id,data});}
 function updateField(event){if(!editor||!active()||busy)return;const field=event.target?.dataset?.hubField,index=event.target?.dataset?.hubLink;if(field&&Object.hasOwn(editor.data,field)&&field!=='links')editor.data[field]=event.target.value;if(index!==undefined&&editor.data.links[Number(index)]&&['label','url'].includes(event.target.dataset.hubPart))editor.data.links[Number(index)][event.target.dataset.hubPart]=event.target.value;}
 document.addEventListener('input',updateField);document.addEventListener('change',updateField);
 document.addEventListener('submit',event=>{if(event.target.id!=='hub-editor')return;event.preventDefault();void save();});
 document.addEventListener('click',event=>{
  const b=event.target.closest?.('[data-workhub]');if(!b||!active()||busy||loading)return;event.preventDefault();const action=b.dataset.workhub,id=b.dataset.id;
  if(action==='refresh'){void load();return;}
  if(action==='new-job'){openEditor('jobs');return;}if(action==='new-result'){openEditor('results');return;}
  if(action==='edit-job'){openEditor('jobs',id);return;}if(action==='edit-result'){openEditor('results',id);return;}
  if(action==='add-link'&&editor&&editor.data.links.length<5){editor.data.links.push({label:'',url:''});refreshView();return;}
  if(action==='cancel'){if(editor&&!confirm('Discard your unsaved changes?'))return;editor=null;notice='';refreshView();return;}
  if(action==='delete-job'||action==='delete-result'){if(editor){notice='Save or close your open draft before deleting another item.';refreshView();return;}const type=action==='delete-job'?'jobs':'results',item=snapshot?.[type].find(v=>v.id===id);if(item&&confirm(`Delete “${item.name||item.title}” from your saved workspace? Linked files will stay where they are.`))void mutate(type,{action:'delete',id});}
 });
 window.addEventListener('xtreme:work-changed',()=>{if(active()&&mode==='briefing'&&document.querySelector('#work-hub-root'))void load();});
 window.addEventListener('beforeunload',event=>{if(active()&&(editor||busy)){event.preventDefault();event.returnValue='';}});
 window.addEventListener('xtreme:account-ended',()=>{generation++;for(const c of controllers)c.abort();controllers.clear();snapshot=null;editor=null;notice='';busy=false;loading=false;needsRefresh=false;lastAttemptedDay='';document.querySelector('#work-hub-root')?.replaceChildren();});
 window.XtremeWorkHub=Object.freeze({render,activate,refresh:load,hasUnsaved:()=>Boolean(active()&&(editor||busy))});
 window.dispatchEvent(new Event('xtreme:work-hub-ready'));
})();
