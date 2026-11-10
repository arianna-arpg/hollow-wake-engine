import test from 'node:test';
import assert from 'node:assert/strict';
import {CompanionRecovery} from '../dist/companion-recovery.js';

function actor(owner){return{companion:true,dead:false,downed:false,name:'body',owner,life:25,max:100,companionReviveRemaining:2,companionReviveDwell:.4,expiredStatuses:[],statuses:[]};}
function fixture(){
 const owner={name:'keeper'},a=actor(owner),calls=[],bodies=[a],settings={cfg:{seconds:6,divideByPack:true,cleanse:true,status:'shelter'}},defs={shelter:{duration:2,beneficial:true},blessing:{duration:4,beneficial:true},wound:{duration:7}};
 const ports={rules:()=>{calls.push(['rules']);return settings.cfg;},actors:()=>{calls.push(['actors']);return bodies;},status:id=>{calls.push(['status',id]);return defs[id];},
  cleanse:a=>{calls.push(['cleanse']);a.statuses=a.statuses.filter(s=>defs[s.id]?.beneficial);},
  endStatus:(a,id)=>{calls.push(['end',id]);a.statuses=a.statuses.filter(s=>s.id!==id);},
  applyStatus:(a,id,dps,scale,source)=>{calls.push(['apply',id,dps,scale,source]);a.statuses.push({id,remaining:defs[id].duration*scale,source});},
  maxLife:a=>{calls.push(['maxLife']);return a.max;},revivalCue:a=>{calls.push(['cue',a.life]);}};
 const runtime=new CompanionRecovery(ports);return{owner,a,calls,bodies,settings,defs,ports,runtime};
}
const window=a=>a.statuses.find(s=>s.id==='shelter')?.remaining;
export const contracts=[
 ['ineligible recovery is a complete no-op before any host read',()=>{
  for(const patch of [{companion:false},{dead:true},{downed:true},{companionDormant:true},{owner:undefined}]){const h=fixture();Object.assign(h.a,patch);const before=structuredClone(h.a);h.runtime.recover(h.a);assert.deepEqual(h.a,before);assert.deepEqual(h.calls,[]);}
 }],
 ['ineligible revival retains life, timers and all host state',()=>{
  for(const patch of [{companion:false},{dead:true},{downed:false},{companionDormant:true}]){const h=fixture();Object.assign(h.a,{downed:true,life:0},patch);const before=structuredClone(h.a);h.runtime.revive(h.a);assert.deepEqual(h.a,before);assert.deepEqual(h.calls,[]);}
 }],
 ['cleanse replaces the pending list but retains beneficial payload identities',()=>{
  const h=fixture(),good={id:'blessing',payload:{id:4}},bad={id:'wound'},unknown={id:'unknown'},old=[bad,good,unknown];h.a.expiredStatuses=old;h.a.statuses=[bad,good];h.runtime.recover(h.a);
  assert.notEqual(h.a.expiredStatuses,old);assert.deepEqual(old,[bad,good,unknown]);assert.deepEqual(h.a.expiredStatuses,[good]);assert.equal(h.a.expiredStatuses[0],good);assert(h.a.statuses.includes(good));assert(!h.a.statuses.includes(bad));assert.equal(h.a.life,25);
 }],
 ['disabled cleanse retains pending-list identity and all harmful payloads',()=>{
  const h=fixture(),bad={id:'wound'};h.settings.cfg.cleanse=false;h.a.expiredStatuses=[bad];h.a.statuses=[bad];const old=h.a.expiredStatuses;h.runtime.recover(h.a);
  assert.equal(h.a.expiredStatuses,old);assert(h.a.statuses.includes(bad));assert(!h.calls.some(c=>c[0]==='cleanse'));assert.equal(window(h.a),6);
 }],
 ['pack budget includes downed and different-host bodies using owner identity',()=>{
  const h=fixture();h.bodies.push({...actor(h.owner),downed:true,bondGroup:'other'},actor(h.owner),{...actor(h.owner),dead:true},{...actor(h.owner),companionDormant:true},{...actor(h.owner),companion:false},actor({name:'keeper'}));
  h.runtime.recover(h.a);assert.equal(window(h.a),2);assert.equal(h.bodies.length,7);assert.deepEqual(h.calls.find(c=>c[0]==='apply'),['apply','shelter',0,1,'keeper']);
 }],
 ['reapplication replaces all prior windows with the exact new budget',()=>{
  const h=fixture();h.a.statuses=[{id:'shelter',remaining:20},{id:'shelter',remaining:1}];h.runtime.recover(h.a);assert.equal(h.a.statuses.length,1);assert.equal(window(h.a),6);
  h.a.statuses[0].remaining=.1;h.runtime.recover(h.a);assert.equal(h.a.statuses.length,1);assert.equal(window(h.a),6);
 }],
 ['missing or nonpositive status definitions still end existing protection',()=>{
  for(const duration of [undefined,0,-2]){const h=fixture();h.a.statuses=[{id:'shelter',remaining:20}];if(duration===undefined)delete h.defs.shelter;else h.defs.shelter.duration=duration;h.runtime.recover(h.a);assert.equal(window(h.a),undefined);assert(h.calls.some(c=>c[0]==='end'));assert(!h.calls.some(c=>c[0]==='apply'));}
 }],
 ['zero and negative budgets remove old shelter without application',()=>{
  for(const seconds of [0,-6]){const h=fixture();h.settings.cfg.seconds=seconds;h.a.statuses=[{id:'shelter',remaining:20}];h.runtime.recover(h.a);assert.equal(window(h.a),undefined);assert(!h.calls.some(c=>c[0]==='apply'));}
 }],
 ['current policy controls division without caching the prior pack count',()=>{
  const h=fixture();h.bodies.push(actor(h.owner));h.runtime.recover(h.a);assert.equal(window(h.a),3);h.settings.cfg.divideByPack=false;h.runtime.recover(h.a);assert.equal(window(h.a),6);h.settings.cfg.seconds=2;h.runtime.recover(h.a);assert.equal(window(h.a),2);
 }],
 ['an absent body in an empty pack keeps the one-body denominator floor',()=>{
  const h=fixture();h.bodies.length=0;h.runtime.recover(h.a);assert.equal(window(h.a),6);
 }],
 ['revival clears clocks, recovers, sets fractional life, then emits its cue',()=>{
  const h=fixture();Object.assign(h.a,{downed:true,life:0});const cleanse=h.ports.cleanse;h.ports.cleanse=a=>{assert(!a.downed);assert.equal(a.companionReviveRemaining,undefined);assert.equal(a.companionReviveDwell,0);assert.equal(a.life,0);cleanse(a);};h.runtime.revive(h.a);
  assert.equal(h.a.life,50);assert.deepEqual(h.calls.map(c=>c[0]),['rules','cleanse','actors','rules','status','end','apply','maxLife','cue']);assert.deepEqual(h.calls.at(-1),['cue',50]);
 }],
 ['revival preserves the original one-life floor and permits overfull fractions',()=>{
  for(const[fraction,life]of [[0,1],[-1,1],[.25,25],[2,200]]){const h=fixture();h.a.downed=true;h.a.life=0;h.runtime.revive(h.a,fraction);assert.equal(h.a.life,life);assert.deepEqual(h.calls.at(-1),['cue',life]);}
 }],
 ['ownerless revival still clears clocks and restores life without recovery',()=>{
  const h=fixture();Object.assign(h.a,{downed:true,life:0,owner:undefined});h.runtime.revive(h.a);assert.equal(h.a.life,50);assert(!h.a.downed);assert.equal(h.a.companionReviveRemaining,undefined);assert.equal(h.a.companionReviveDwell,0);assert.deepEqual(h.calls,[['maxLife'],['cue',50]]);
 }],
 ['recovery uses the actor list after cleanse and a fresh duration-policy read',()=>{
  const h=fixture(),cleanse=h.ports.cleanse;h.ports.cleanse=a=>{cleanse(a);h.bodies.push(actor(h.owner));h.settings.cfg={seconds:8,divideByPack:true,cleanse:false,status:'other'};};h.runtime.recover(h.a);
  assert.equal(window(h.a),4);assert.deepEqual(h.calls.find(c=>c[0]==='apply'),['apply','shelter',0,2,'keeper']);
 }],
 ['host exceptions retain preceding writes and do not continue later effects',()=>{
  const h=fixture(),failure=new Error('cleanse failed');Object.assign(h.a,{downed:true,life:0});h.ports.cleanse=()=>{throw failure;};assert.throws(()=>h.runtime.revive(h.a),error=>error===failure);
  assert(!h.a.downed);assert.equal(h.a.companionReviveRemaining,undefined);assert.equal(h.a.companionReviveDwell,0);assert.equal(h.a.life,0);assert.deepEqual(h.calls,[['rules']]);
 }],
 ['failed presentation retains completed recovery and restored life',()=>{
  const h=fixture(),failure=new Error('cue failed');Object.assign(h.a,{downed:true,life:0});h.ports.revivalCue=()=>{throw failure;};assert.throws(()=>h.runtime.revive(h.a),error=>error===failure);assert.equal(h.a.life,50);assert.equal(window(h.a),6);assert(!h.a.downed);
 }],
 ['status removal failure does not roll back cleanse or apply a replacement',()=>{
  const h=fixture(),failure=new Error('end failed');h.a.expiredStatuses=[{id:'wound'}];h.ports.endStatus=()=>{throw failure;};assert.throws(()=>h.runtime.recover(h.a),error=>error===failure);assert.deepEqual(h.a.expiredStatuses,[]);assert(!h.calls.some(c=>c[0]==='apply'));
 }],
 ['one service operates on independent owners without retained body state',()=>{
  const h=fixture(),other=actor({name:'other keeper'});h.bodies.push(other);h.runtime.recover(h.a);h.settings.cfg.seconds=4;h.runtime.recover(other);assert.equal(window(h.a),6);assert.equal(window(other),4);assert.equal(other.statuses[0].source,'other keeper');
 }],
];

for(const[name,run]of contracts)test(name,run);
