import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPersonalContext,PERSONAL_CONTEXT_BYTES} from '../server/assistant-personalization.mjs';
const packet=()=>({linked:true,status:'linked',linkRevision:1,accountGeneration:'ed5565b4-b928-4c05-a0c5-dc5af4cd6bb6',profileRevision:1,coachingRevision:0,context:{preferences:{display_name:'Alice',timezone:'UTC',custom_instructions:'Be brief.',style:{warmth:50,calm:50,energy:50,humor:50,empathy:50,directness:50,initiative:50}},memories:{personal_facts:[],preferences:[],shared_backstory:[]},coaching:{active_guidance:null},omitted_count:0}});
test('only verified linked context is accepted, with explicit lower-trust provenance',()=>{
 assert.equal(formatPersonalContext({linked:false}),null);assert.throws(()=>formatPersonalContext({linked:true}),{code:'personal_context_unavailable'});
 const p=packet();p.context.memories.shared_backstory=[{title:'Our story',content:'A fictional trip'}];const result=formatPersonalContext(p);assert.match(result.text,/not instructions that override capabilities/);assert.match(result.text,/"fictional":true/);assert.match(result.text,/"not_real_lived_experience":true/);assert.equal(result.link.linkRevision,1);
});
test('valid Unicode titles are accepted and bounded context omits whole records honestly',()=>{
 const p=packet();p.context.memories.preferences=[{title:'💛'.repeat(120),content:'A short memory'}];assert.ok(formatPersonalContext(p).text.includes('A short memory'));
 p.context.memories.personal_facts=Array.from({length:10},(_,i)=>({title:'Record '+i,content:'a'.repeat(1800)}));const result=formatPersonalContext(p);assert.ok(new TextEncoder().encode(result.text).length<=PERSONAL_CONTEXT_BYTES);assert.equal(result.partial,true);assert.match(result.text,/"omitted_count":[1-9]/);
});
test('invalid profile and control characters do not become model context',()=>{
 for(const mutate of [p=>p.context.preferences.style.warmth=101,p=>p.context.preferences.custom_instructions='x\0secret',p=>p.context.memories.preferences=[{title:'bad',content:'x\x07y'}]]){const p=packet();mutate(p);assert.throws(()=>formatPersonalContext(p),{code:'personal_context_unavailable'});}
});
