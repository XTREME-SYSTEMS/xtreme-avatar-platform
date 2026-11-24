import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {convertDictation,mergeDictation,spokenNumber,spokenDate,spokenPhone} from '../public/voice-field-values.js';

test('spoken values preserve exact phone digits and conservative numeric meaning',()=>{
 for(const [input,expected] of [['one hundred twenty five','125'],['twelve thousand three hundred','12300'],['minus twenty point five','-20.5'],['one two three','123'],['2,500.25','2500.25'],['six point zero five','6.05'],['3 thousand','3000']])assert.equal(spokenNumber(input),expected);
 for(const input of ['twenty thirty','one hundred hundred','ten thousand million','do whatever','one hundred twenty thirty'])assert.equal(spokenNumber(input),null);
 assert.equal(spokenPhone('plus one seven seven two zero one two three four five six'),'+17720123456');
 assert.equal(spokenPhone('call my friend'),null);
});
test('date, email, URL and selection conversion do not invent choices or change URL case',()=>{
 assert.equal(spokenDate('November 7 2026'),'2026-11-07');assert.equal(spokenDate('February 30 2026'),null);
 assert.equal(spokenDate('tomorrow',new Date(2026,10,7,12)),'2026-11-08');
 assert.equal(convertDictation('Jeremy at example dot com',{type:'email'}).value,'Jeremy@example.com');
 assert.equal(convertDictation('https://example.com/Plans/FILE.pdf',{type:'url'}).value,'https://example.com/Plans/FILE.pdf');
 assert.ok(convertDictation('javascript:alert(1)',{type:'url'}).error);
 const options=[{label:'In progress',value:'active'},{label:'Complete',value:'done'},{label:'Hidden',value:'hidden',disabled:true}];
 assert.equal(convertDictation('In progress.',{type:'select',options}).value,'active');assert.ok(convertDictation('Hidden',{type:'select',options}).error);
 assert.equal(convertDictation('10:30 PM',{type:'time'}).value,'22:30');assert.ok(convertDictation('25:99',{type:'time'}).error);
});
test('text insertion respects selection, existing text and length without truncation',()=>{
 assert.equal(mergeDictation('Hello world','Jeremy',{start:6,end:11,maxLength:40}).value,'Hello Jeremy');
 assert.equal(mergeDictation('Site note:','fresh floor',{maxLength:40}).value,'Site note: fresh floor');
 assert.ok(mergeDictation('Hello','a very long phrase',{maxLength:8}).error);
});

const source=readFileSync(new URL('../public/voice-fields.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
function boot(definitions=[{}],{supported=true,live=false}={}){
 const handlers=new Map(),windowHandlers=new Map(),recognitions=[],emitted=[],timers=new Map();let timer=0,observer;
 const listen=(registry,type,fn)=>registry.set(type,[...(registry.get(type)||[]),fn]);
 function element(tag='span',definition={}){
  const local=new Map(),attributes={};const el={tagName:tag.toUpperCase(),type:tag==='input'?'text':'',name:'',id:'',value:'',maxLength:-1,selectionStart:null,selectionEnd:null,isConnected:true,disabled:false,readOnly:false,hidden:false,options:[],children:[],labels:[{textContent:'Entry'}],...definition};
  el.setAttribute=(key,value)=>attributes[key]=value;el.getAttribute=key=>attributes[key]||null;el.attributes=attributes;
  el.closest=()=>null;el.append=(...nodes)=>el.children.push(...nodes);el.remove=()=>{el.isConnected=false;};el.focus=()=>{};el.setSelectionRange=()=>{};
  el.addEventListener=(type,fn)=>listen(local,type,fn);
  el.click=()=>{for(const fn of local.get('click')||[])fn({target:el,preventDefault(){}});};
  el.insertAdjacentElement=(position,node)=>{el.tools=node;};
  el.dispatchEvent=event=>{emitted.push({field:el.id,event:event.type});for(const fn of handlers.get(event.type)||[])fn({type:event.type,target:el});};
  Object.defineProperty(el,'validity',{get:()=>({rangeUnderflow:el.min!==undefined&&Number(el.value)<el.min,rangeOverflow:el.max!==undefined&&Number(el.value)>el.max})});
  return el;
 }
 const fields=definitions.map((d,i)=>element(d.tag||'input',{id:'field-'+i,...d}));
 class Recognition{constructor(){recognitions.push(this);}start(){this.onstart?.();}abort(){this.aborted=true;this.onend?.();}stop(){this.stopped=true;}result(text,final=true){const result=[{transcript:text}];result.isFinal=final;this.onresult?.({results:[result]});}}
 const account={user:{id:'one'},locked:false};const location={hash:'#workspace'};
 const window={XtremeAccount:account,XtremeAssistantVoice:{isActive:()=>live},isSecureContext:true,SpeechRecognition:supported?Recognition:undefined,addEventListener:(type,fn)=>listen(windowHandlers,type,fn),dispatchEvent:event=>{for(const fn of windowHandlers.get(event.type)||[])fn(event);}};
 const document={documentElement:{lang:'en-US'},body:element('body'),visibilityState:'visible',querySelectorAll:()=>fields,querySelector:()=>null,createElement:tag=>element(tag),addEventListener:(type,fn)=>listen(handlers,type,fn)};
 vm.runInNewContext(source,{window,document,location,Event,convertDictation,mergeDictation,MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},queueMicrotask:fn=>fn(),setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)});
 return {fields,window,document,account,location,recognitions,emitted,refresh:()=>observer(),button:i=>fields[i].tools?.children[0],status:i=>fields[i].tools?.children[1].textContent,emit:(type,event={})=>{for(const fn of handlers.get(type)||[])fn(event);},end:()=>{account.locked=true;window.dispatchEvent(new Event('xtreme:account-ended'));}};
}

test('dictation attaches to app fields without opening the microphone or exposing secret controls',()=>{
 const h=boot([{},{tag:'textarea'},{type:'number'},{tag:'select'},{type:'password'},{type:'hidden'},{type:'file'},{id:'api-key'},{readOnly:true},{id:'dial-number'}]);
 assert.equal(h.recognitions.length,0);for(let i=0;i<4;i++)assert.ok(h.button(i));for(let i=4;i<10;i++)assert.equal(h.button(i),undefined);
});
test('interim recognition never saves; final text updates existing input handlers without submitting',()=>{
 const h=boot([{value:'A note',selectionStart:6,selectionEnd:6,maxLength:80}]);h.button(0).click();const r=h.recognitions[0];r.result('about the job',false);assert.equal(h.fields[0].value,'A note');assert.equal(h.emitted.length,0);
 r.result('about the job');assert.equal(h.fields[0].value,'A note about the job');assert.deepEqual(h.emitted.map(x=>x.event),['input','change']);assert.ok(r.aborted);assert.match(h.status(0),/Review/);
});
test('out-of-range and oversized values leave original entries intact',()=>{
 const h=boot([{type:'number',value:'5',min:0,max:10},{value:'full',maxLength:5}]);h.button(0).click();h.recognitions[0].result('twenty');assert.equal(h.fields[0].value,'5');assert.equal(h.emitted.length,0);
 h.button(1).click();h.recognitions[1].result('some more');assert.equal(h.fields[1].value,'full');assert.equal(h.emitted.length,0);
});
test('selection dictation uses an exact allowed choice and emits existing change handlers',()=>{
 const h=boot([{tag:'select',value:'draft',options:[{label:'Draft',value:'draft'},{label:'In progress',value:'active'}]}]);h.button(0).click();h.recognitions[0].result('In progress');assert.equal(h.fields[0].value,'active');assert.equal(h.emitted.length,2);
});
test('route, field edits, removed controls and account changes reject late speech results',()=>{
 for(const mode of ['route','edit','removed','account']){
  const h=boot([{value:'private'}]);h.button(0).click();const r=h.recognitions[0];
  if(mode==='route'){h.location.hash='#home';h.window.dispatchEvent(new Event('hashchange'));}
  if(mode==='edit'){h.fields[0].value='edited';h.emit('input',{target:h.fields[0]});}
  if(mode==='removed'){h.fields[0].isConnected=false;h.refresh();}
  if(mode==='account')h.end();
  r.result('late private words');assert.equal(h.fields[0].value,mode==='edit'?'edited':'private');assert.equal(h.emitted.length,0);assert.ok(r.aborted);
 }
});
test('unsupported browsers and active live voice never start a competing microphone',()=>{
 const unsupported=boot([{}],{supported:false});unsupported.button(0).click();assert.equal(unsupported.recognitions.length,0);assert.match(unsupported.status(0),/keyboard/);
 const active=boot([{}],{live:true});active.button(0).click();assert.equal(active.recognitions.length,0);assert.match(active.status(0),/End your live conversation/);
});
test('microphone denial, Escape and hidden-page events stop listening without a field write',()=>{
 for(const mode of ['denied','escape','hidden']){
  const h=boot();h.button(0).click();const r=h.recognitions[0];
  if(mode==='denied')r.onerror({error:'not-allowed'});if(mode==='escape')h.emit('keydown',{key:'Escape'});if(mode==='hidden'){h.document.visibilityState='hidden';h.emit('visibilitychange');}
  r.result('late');assert.equal(h.fields[0].value,'');assert.equal(h.emitted.length,0);assert.ok(r.aborted);
 }
});
