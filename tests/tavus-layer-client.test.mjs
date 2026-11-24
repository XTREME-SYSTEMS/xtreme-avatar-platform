import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../public/tavus-layer.js',import.meta.url),'utf8');
const published='https://xtreme-avatar-mobile.strategic-ai.chatgpt.site/';
function harness(media={framed:false,microphone:null,camera:null}){
 const created=[],timers=new Map();let timerId=0,backs=0,focused=0;
 class Target{constructor(){this.events=new Map();}addEventListener(type,fn){this.events.set(type,[...(this.events.get(type)||[]),fn]);}emit(type,event={}){for(const fn of this.events.get(type)||[])fn({target:this,preventDefault(){},stopImmediatePropagation(){},...event});}}
 class Node extends Target{
  constructor(tag,cls=''){super();this.tag=tag;this.className=cls;this.children=[];this.attrs={};this.style={};this.hidden=false;this.textContent='';this.classList={add:value=>{this.className+=' '+value;}};}
  setAttribute(key,value){this.attrs[key]=value;}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  prepend(...nodes){for(const node of nodes)node.parent=this;this.children.unshift(...nodes);}
  remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}
  matches(selector){return selector[0]==='.'?this.className.split(' ').includes(selector.slice(1)):selector[0]==='#'?this.id===selector.slice(1):this.tag===selector;}
  querySelector(selector){for(const node of this.children){if(node.matches(selector))return node;const found=node.querySelector(selector);if(found)return found;}return null;}
  set innerHTML(value){this.html=value;if(this.tag!=='dialog')return;const bar=new Node('div','tavus-layer-bar'),back=new Node('button','tavus-layer-back'),stage=new Node('div','tavus-layer-stage'),status=new Node('div','tavus-layer-status'),error=new Node('p','tavus-layer-error');error.hidden=true;status.append(new Node('h2'),new Node('p'));stage.append(status,error);bar.append(back);this.append(bar,stage);}
  showModal(){this.open=true;}close(){this.open=false;}
 }
 const document=new Target();document.head=new Node('head');document.body=new Node('body');document.documentElement=new Node('html');document.createElement=tag=>{const node=new Node(tag);created.push(node);return node;};
 const window=new Target();window.XtremeMediaContext={read:()=>media};window.XtremeAccount={locked:false};window.scrollY=37;window.scrollTo=()=>{};
 const history={state:{},pushState(value){this.state=value;},back(){backs++;}};
 const context=vm.createContext({document,window,history,location:{href:published+'#home'},Date,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}});
 vm.runInContext(source,context);
 const opener={dataset:{openSession:'video'},isConnected:true,focus(){focused++;},closest(selector){return selector==='[data-open-session]'?this:null;}};
 const open=()=>document.emit('click',{target:opener});
 const dialog=()=>document.body.querySelector('#tavus-live-layer');
 return {document,window,created,open,dialog,timers,get backs(){return backs;},get focused(){return focused;},sdk:()=>created.find(node=>node.tag==='script'),embed:()=>created.find(node=>node.tag==='tavus-embed')};
}

test('confirmed microphone policy block keeps Back and direct recovery without mounting Tavus or loading its SDK',()=>{
 const h=harness({framed:true,microphone:false,camera:true});h.open();const dialog=h.dialog();assert.ok(dialog.open);assert.equal(h.sdk(),undefined);assert.equal(h.embed(),undefined);
 assert.match(dialog.querySelector('p').textContent,/page blocks microphone access/);
 const link=dialog.querySelector('a');assert.equal(link.href,published);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
 assert.equal(h.timers.size,0);dialog.querySelector('.tavus-layer-back').emit('click');assert.equal(h.dialog(),null);assert.equal(h.backs,1);assert.equal(h.focused,1);assert.equal(h.document.body.style.overflow,undefined);
});

test('allowed iframe mounts existing deployment and a camera-only policy block leaves video usable camera off',()=>{
 for(const camera of [true,false]){
  const h=harness({framed:true,microphone:true,camera});assert.equal(h.sdk(),undefined);h.open();assert.ok(h.sdk());assert.ok(h.embed());
  assert.equal(h.embed().attrs['deployment-id'],'912d9c39-bf54-4e8e-80d9-311c860fd7c9');assert.equal(h.embed().attrs['camera-on-start'],camera?'on':'off');assert.equal(h.dialog().querySelector('a'),null);
  if(!camera)assert.match(h.dialog().querySelector('.tavus-camera-note').textContent,/continue with your microphone/);
  h.open();assert.equal(h.created.filter(node=>node.tag==='tavus-embed').length,1);
 }
});

test('unknown framed policy suggests the published app but does not prevent the SDK session',()=>{
 const h=harness({framed:true,microphone:null,camera:null});h.open();assert.ok(h.embed());assert.ok(h.sdk());assert.match(h.dialog().querySelector('.tavus-preview-hint').querySelector('span').textContent,/If microphone access fails/);assert.equal(h.dialog().querySelector('a').href,published);
 const direct=harness();direct.open();assert.ok(direct.embed());assert.equal(direct.dialog().querySelector('.tavus-preview-hint'),null);
});

test('SDK microphone policy error tears down its element and offers recovery even without the policy API',()=>{
 const h=harness();h.open();const embed=h.embed();let destroyed=0;embed.destroy=()=>destroyed++;embed.emit('tavus:ready');embed.emit('tavus:error',{detail:{code:'MICROPHONE_BLOCKED_BY_PAGE',message:'Provider text'}});
 assert.equal(destroyed,1);assert.ok(embed.removed);assert.equal(h.timers.size,0);const status=h.dialog().querySelector('.tavus-layer-status');assert.equal(status.hidden,false);assert.equal(status.querySelector('a').href,published);
 embed.emit('tavus:ready');embed.emit('tavus:mode-change',{detail:{mode:'active'}});h.sdk().emit('error');assert.equal(status.hidden,false);assert.match(status.querySelector('p').textContent,/page blocks microphone access/);
 h.window.emit('xtreme:account-ended');assert.equal(h.dialog(),null);assert.equal(h.backs,0);assert.equal(h.focused,0);
});

test('ordinary Tavus errors retain their actual message and no policy failure is invented',()=>{
 const h=harness();h.open();h.embed().emit('tavus:error',{detail:{code:'SOMETHING_ELSE',message:'Could not reach service'}});assert.equal(h.dialog().querySelector('.tavus-layer-error').textContent,'Could not reach service');assert.equal(h.dialog().querySelector('a'),null);assert.ok(!h.embed().removed);
});


test('confirmed SDK policy failure replaces earlier optional preview or camera guidance',()=>{
 const h=harness({framed:true,microphone:null,camera:false});h.open();assert.ok(h.dialog().querySelector('.tavus-preview-hint'));assert.ok(h.dialog().querySelector('.tavus-camera-note'));
 h.embed().emit('tavus:error',{detail:{code:'MICROPHONE_BLOCKED_BY_PAGE'}});
 assert.equal(h.dialog().querySelector('.tavus-preview-hint'),null);assert.equal(h.dialog().querySelector('.tavus-camera-note'),null);assert.equal(h.dialog().querySelector('.tavus-layer-status').querySelector('a').href,published);
});
