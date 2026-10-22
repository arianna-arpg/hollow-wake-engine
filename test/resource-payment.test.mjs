import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {ResourcePayment} from '../dist/resource-payment.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-nine/resource-payment.json.gz',import.meta.url))));
const copy=x=>structuredClone(x);
const fields=['mana','life','es','reservedMana','reservedLife'];
const key={overdriveCap:'cap',overdriveIdleDelay:'idleDelay',overdriveFlow:'flow',overdriveRecovery:'recovery',overdriveRecoveryFlat:'flat',overdriveLifeFactor:'lifeFactor'};
function replayPorts(events=[]){return {
 maxMana:a=>a.maxMana,maxLife:a=>a.maxLife,esToMana:a=>a.terms.esToMana,
 spec:l=>l.terms.spec,context:l=>l.terms,
 stat:(_a,c,id,base)=>c[key[id]]??base??0,attackSpeed:a=>a.terms.attackSpeed,
 lifeSpent:(a,amount)=>events.push({amount,life:a.life,mana:a.mana,reservedMana:a.reservedMana,reservedLife:a.reservedLife}),
};}
function restore(s,terms){const a={...copy(s),terms,overdrive:{}};for(const lane of ['mana','life'])if(s.lanes[lane])a.overdrive[lane]={...s.lanes[lane],terms:terms[lane]};return a;}
function debts(a){return Object.fromEntries(['mana','life'].map(l=>[l,a.overdrive[l]?{debt:a.overdrive[l].debt,idle:a.overdrive[l].idle}:null]));}
function expectedDebts(s){return Object.fromEntries(['mana','life'].map(l=>[l,s.lanes[l]?{debt:s.lanes[l].debt,idle:s.lanes[l].idle}:null]));}

test('payment, headroom and repayment match original primitive observations',()=>{
 assert.equal(fixture.courses.length,37);let payments=0,frames=0;
 for(const course of fixture.courses)for(const row of course.steps){
  const events=[],runtime=new ResourcePayment(replayPorts(events)),a=restore(row.before,row.terms),command=row.command,label=course.name+' '+command.op;
  if(['pay','quote','unchecked'].includes(command.op)){
   assert.equal(runtime.canAfford(a,command.cost),row.result,label);
   if(command.op==='unchecked'||command.op==='pay'&&row.result){runtime.pay(a,command.cost);payments++;}
   for(const f of fields)assert.equal(a[f],row.after[f],label+' '+f);
   assert.deepEqual(debts(a),expectedDebts(row.after),label);
   assert.deepEqual(events,row.events.filter(e=>e.kind==='spent').map(e=>({amount:e.amount,life:e.at.life,mana:e.at.mana,reservedMana:e.at.reservedMana,reservedLife:e.at.reservedLife})),label);
  }else if(command.op==='tick'){
   if(!a.dead&&!a.downed)runtime.advanceDebt(a,command.dt,row.terms.lifeRegen+row.terms.lifeRegenPct*a.maxLife);
   assert.deepEqual(debts(a),expectedDebts(row.after),label);
   assert.equal(a.reservedMana,row.after.reservedMana,label);assert.equal(a.reservedLife,row.after.reservedLife,label);frames++;
  }
  const after=restore(row.after,row.terms);
  for(const lane of ['mana','life'])assert.equal(runtime.headroom(after,lane),row.after.lanes[lane]?.headroom??0,label+' '+lane);
  assert.equal(runtime.availableMana(after),row.after.availableMana,label);assert.equal(runtime.lifeCeiling(after),row.after.lifeCeiling,label);
 }
 assert.equal(payments,19);assert.equal(frames,29);
});
function actor(){return {mana:10,life:100,es:40,reservedMana:0,reservedLife:0,maxMana:100,maxLife:100,overdrive:{},terms:{esToMana:.5,attackSpeed:1}};}
function loan(spec={cap:.5}){return {debt:0,idle:0,terms:{spec}};}
test('independent arithmetic: shield availability, whole-life borrowing, shared reservations',()=>{
 const p=new ResourcePayment(replayPorts()),a=actor();a.overdrive.mana=loan();a.overdrive.life=loan({cap:.4});a.life=20;
 assert.equal(p.canAfford(a,{mana:80,life:20}),true);p.pay(a,{mana:80,life:20});
 assert.deepEqual(fields.map(f=>a[f]),[0,20,20,50,20]);assert.deepEqual(debts(a),{mana:{debt:50,idle:2.5},life:{debt:20,idle:2.5}});
 const b=actor();b.overdrive.mana=loan();b.reservedMana=95;b.mana=0;b.es=0;
 assert.equal(p.headroom(b,'mana'),5);assert.equal(p.canAfford(b,{mana:6,life:0}),false);
});
test('repayment crossing uses the whole frame and never fills freed pools',()=>{
 const p=new ResourcePayment(replayPorts()),a=actor();a.overdrive.mana=loan();a.overdrive.life=loan();a.overdrive.mana.debt=20;a.overdrive.life.debt=30;
 a.overdrive.mana.idle=.1;a.overdrive.life.idle=.1;a.reservedMana=20;a.reservedLife=30;
 p.advanceDebt(a,.2,8);
 assert.equal(a.overdrive.mana.debt,19);assert.equal(a.overdrive.life.debt,28.8);assert.equal(a.mana,10);assert.equal(a.life,100);
 p.advanceDebt(a,100,8);assert.equal(a.overdrive.mana.debt,0);assert.equal(a.overdrive.life.debt,0);assert.equal(a.reservedLife,0);
 p.advanceDebt(a,1,8);assert(a.overdrive.life.idle< -100);
});
test('life-spent callbacks observe committed pools and may nest without cross-actor scratch',()=>{
 const a=actor(),b=actor(),calls=[];let nested=false;
 const ports=replayPorts(),p=new ResourcePayment({...ports,lifeSpent:(who,n)=>{calls.push([who===a?'a':'b',n,who.life,who.mana]);if(!nested){nested=true;p.pay(b,{mana:4,life:3});p.pay(a,{mana:1,life:2});}}});
 p.pay(a,{mana:5,life:10});assert.deepEqual(calls,[['a',10,90,5],['b',3,97,6],['a',2,88,4]]);
 assert.equal(a.life,88);assert.equal(b.life,97);
});
test('invalid arguments fail before mutation; unchecked valid costs retain partial spending',()=>{
 const p=new ResourcePayment(replayPorts());
 for(const value of [-1,NaN,Infinity])for(const field of ['mana','life']){const a=actor(),before=copy(a),cost={mana:1,life:1,[field]:value};assert.throws(()=>p.canAfford(a,cost));assert.throws(()=>p.pay(a,cost));assert.deepEqual(a,before);}
 for(const[dt,regen]of [[-1,8],[NaN,8],[Infinity,8],[1,NaN],[1,Infinity]]){const a=actor();a.overdrive.mana=loan();const before=copy(a);assert.throws(()=>p.advanceDebt(a,dt,regen));assert.deepEqual(a,before);}
 const a=actor();a.mana=3;a.es=0;assert.equal(p.canAfford(a,{mana:10,life:5}),false);p.pay(a,{mana:10,life:5});assert.equal(a.mana,0);assert.equal(a.life,95);
 const dead=actor();dead.life=0;assert.equal(p.canAfford(dead,{mana:0,life:0}),true);
});
test('ports are captured once and lane reads preserve phase and short-circuit ordering',()=>{
 const log=[],ports=replayPorts(),p=new ResourcePayment({...ports,context:l=>{log.push(l.id);return l.terms;}}),a=actor();
 a.overdrive.mana={...loan(),debt:10,id:'mana'};a.overdrive.life={...loan(),debt:10,id:'life'};a.reservedMana=10;a.reservedLife=10;
 p.advanceDebt(a,0,8);assert.deepEqual(log,['mana','life']);
 const originalPorts=replayPorts(),q=new ResourcePayment(originalPorts);originalPorts.maxMana=()=>999;assert.equal(q.availableMana(actor()),100);
});
