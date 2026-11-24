import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAssistantActions} from '../server/assistant-action-receipts.mjs';
const rid='11111111-1111-4111-8111-111111111111',now=Date.parse('2026-11-07T20:00:00.000Z');
const review=()=>({id:rid,kind:'calendar_review',connectionRevision:2,review:{state:'review',requestId:rid,reviewToken:'a'.repeat(43),expiresAt:'2026-11-07T20:01:00.000Z',action:'create',eventId:null,eventRef:null,draft:{title:'Job walk',notes:'A\nB',location:'',start:'2026-12-01T12:00:00.000Z',end:'2026-12-01T13:00:00.000Z',allDay:false,timeZone:'UTC'},defaults:{visibility:'private',notifications:false,reminders:false}}});
test('only bounded host effects and the precise calendar review contract are accepted',()=>{
 const good=review();assert.deepEqual(validateAssistantActions([good],{now}),[good]);
 for(const change of [a=>a.id='11111111-1111-1111-1111-111111111111',a=>a.review.requestId='22222222-2222-4222-8222-222222222222',a=>a.review.reviewToken='a'.repeat(42),a=>a.review.reviewToken='a'.repeat(44),a=>a.review.eventId='other',a=>a.review.eventRef='ce1_'+'a'.repeat(64),a=>a.url='https://evil.test',a=>a.review.defaults.notifications=true,a=>a.review.expiresAt='2026-11-07T20:01:00Z',a=>a.review.draft.timeZone='bad/timezone',a=>a.review.draft.start='1999-12-01T12:00:00.000Z']){
 const a=structuredClone(good);change(a);assert.throws(()=>validateAssistantActions([a],{now})); }
 assert.throws(()=>validateAssistantActions([good,good],{now}));assert.throws(()=>validateAssistantActions(Array(5).fill(good),{now}));
 for(const screen of ['calls','sms','video','settings','prediction','simulation','https://evil.test'])assert.throws(()=>validateAssistantActions([{id:rid,kind:'navigate',screen}],{now}));
 assert.deepEqual(validateAssistantActions([{id:rid,kind:'navigate',screen:'calendar'}],{now}),[{id:rid,kind:'navigate',screen:'calendar'}]);
});
test('expired reviews validate for durable comparison and are omitted for presentation',()=>{
 const a=review(),later=now+61000;
 assert.throws(()=>validateAssistantActions([a],{now:later}));
 assert.deepEqual(validateAssistantActions([a],{now:later,retainExpired:true}),[a]);
 assert.deepEqual(validateAssistantActions([a],{now:later,history:true}),[]);
 const corrupt=review();corrupt.review.reviewToken='bad';assert.throws(()=>validateAssistantActions([corrupt],{now:later,history:true}));
});
