import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActorGaugePublisher} from '../dist/actor-gauges.js';
import {StatSheet,StatRules} from '../dist/index.js';

const sources=()=>({statuses:[],charges:new Map()});
const sink=()=>({calls:[],setGauges(entries){this.calls.push(entries);}});
const set=(source,kind,id,value)=>{
 if(kind==='status')source.statuses=[{id,stacks:value}];
 else if(kind==='charge')source.charges.set(id,value);
 else if(kind==='brim')(source.brims??=new Map()).set(id,{fill:value/5});
 else if(kind==='reserve')(source.reserves??=new Map()).set(id,{pips:value});
 else(source.derivedGauges??=new Map()).set(id,value);
};
const clear=source=>{source.statuses=[];source.charges.clear();source.brims=undefined;source.reserves=undefined;source.derivedGauges=null;};
test('initial empty publication occurs once without allocating source storage',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();assert.equal(p.refresh(a,out),true);assert.equal(p.refresh(a,out),false);assert.deepEqual(out.calls,[[]]);assert.equal(a.brims,undefined);
});
test('all sources retain namespace and native entry order',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();for(const [i,kind]of ['status','charge','brim','reserve','derived'].entries())set(a,kind,'shared',i+1);
 p.refresh(a,out);assert.deepEqual(out.calls[0],[['status:shared',1],['charge:shared',2],['brim:shared',3],['reserve:shared',4],['shared',5]]);
});
for(const [from,to]of [['status','charge'],['charge','brim'],['brim','reserve'],['reserve','derived'],['derived','status']])test(`namespace correction: ${from} to ${to} at unchanged raw id and value`,()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();set(a,from,'communion',1);p.refresh(a,out);clear(a);set(a,to,'communion',1);
 assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls[1],[[to==='derived'?'communion':to+':communion',1]]);assert.equal(p.refresh(a,out),false);
});
test('independent actual stat-sheet oracle replaces stale charge damage with brim damage',()=>{
 const p=new ActorGaugePublisher(),a=sources(),sheet=new StatSheet(new StatRules({damage:{base:1}}));
 sheet.setSource('diagnostic',[{stat:'damage',kind:'increased',value:1,gauge:'charge:communion'},{stat:'damage',kind:'increased',value:4,gauge:'brim:communion'}]);
 a.charges.set('communion',1);p.refresh(a,sheet);assert.equal(sheet.get('damage'),2);
 a.charges.clear();a.brims=new Map([['communion',{fill:.1047619047619048}]]);p.refresh(a,sheet);
 assert.equal(sheet.gauge('charge:communion'),0);assert.equal(sheet.gauge('brim:communion'),1);assert.equal(sheet.get('damage'),5);
});
test('brim rounding changes only at the half-pip threshold',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink(),bank={fill:.099};a.brims=new Map([['spell',bank]]);
 p.refresh(a,out);bank.fill=.1;assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls.at(-1),[['brim:spell',1]]);
 bank.fill=.299;assert.equal(p.refresh(a,out),false);bank.fill=.3;assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls.at(-1),[['brim:spell',2]]);
});
test('zero and negative source values disappear from the complete replacement',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();for(const kind of ['status','charge','brim','reserve','derived'])set(a,kind,kind,2);p.refresh(a,out);
 clear(a);for(const kind of ['status','charge','brim','reserve','derived'])set(a,kind,kind,-1);p.refresh(a,out);assert.deepEqual(out.calls.at(-1),[]);
 assert.equal(p.refresh(a,out),false);set(a,'charge','new',3);set(a,'derived','custom',4);
 assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls.at(-1),[['charge:new',3],['custom',4]]);
 a.charges.clear();assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls.at(-1),[['custom',4]]);assert.equal(p.refresh(a,out),false);
});
test('replacement sheet republishes unchanged values while replacing maps does not',()=>{
 const p=new ActorGaugePublisher(),a=sources(),first=sink(),second=sink();a.charges.set('x',1);p.refresh(a,first);a.charges=new Map(a.charges);assert.equal(p.refresh(a,first),false);
 assert.equal(p.refresh(a,second),true);assert.deepEqual(second.calls,[first.calls[0]]);
});

for(const kind of ['status','reserve'])test(`absent ${kind} count is omitted and removing a positive count clears its gauge`,()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink(),record={id:'sparse'},field=kind==='status'?'stacks':'pips';
 if(kind==='status')a.statuses=[record];else a.reserves=new Map([['sparse',record]]);
 assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls,[[]]);assert.equal(p.refresh(a,out),false);
 record[field]=2;assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls.at(-1),[[kind+':sparse',2]]);
 delete record[field];assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls.at(-1),[]);assert.equal(p.refresh(a,out),false);
 record[field]=undefined;assert.equal(p.refresh(a,out),false);assert.equal(out.calls.length,3);
});

for(const kind of ['status','reserve'])test(`present invalid ${kind} count still rejects without publishing and retries`,()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();set(a,kind,'sparse',1);p.refresh(a,out);
 for(const value of [NaN,Infinity,-Infinity,null]){
  set(a,kind,'sparse',value);const before=out.calls.length;assert.throws(()=>p.refresh(a,out),/finite/);assert.equal(out.calls.length,before);
  set(a,kind,'sparse',1);assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls.at(-1),[[kind+':sparse',1]]);assert.equal(p.refresh(a,out),false);
 }
});

test('sparse record accessors are sampled once in source order',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink(),reads=[];
 a.statuses=[{get id(){reads.push('id');return 's';},get stacks(){reads.push('stacks');return undefined;}}];
 a.reserves=new Map([['r',{get pips(){reads.push('pips');return undefined;}}]]);
 p.refresh(a,out);assert.deepEqual(reads,['id','stacks','pips']);assert.deepEqual(out.calls,[[]]);
});
test('entry ordering and duplicate status values remain observable',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();a.statuses=[{id:'poison',stacks:1},{id:'poison',stacks:2}];p.refresh(a,out);a.statuses.reverse();p.refresh(a,out);
 assert.deepEqual(out.calls[0],[['status:poison',1],['status:poison',2]]);assert.deepEqual(out.calls[1],[['status:poison',2],['status:poison',1]]);
});
test('sinks can retain or mutate delivered tuples without corrupting the exact cache',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();a.charges.set('x',1);p.refresh(a,out);const first=out.calls[0];first[0][1]=999;first.push(['foreign',10]);
 assert.equal(p.refresh(a,out),false);a.charges.set('x',2);p.refresh(a,out);assert.deepEqual(out.calls[1],[['charge:x',2]]);assert.equal(first[0][1],999);
});
for(const applied of [false,true])test(`throwing sink retries unchanged sources after ${applied?'partial application':'refusal'}`,()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();a.charges.set('x',1);p.refresh(a,out);a.charges.set('x',2);
 const publish=out.setGauges;let fail=true;out.setGauges=function(entries){if(applied||!fail)publish.call(this,entries);if(fail){fail=false;throw new Error('sink failure');}};
 assert.throws(()=>p.refresh(a,out),/sink failure/);assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls.at(-1),[['charge:x',2]]);assert.equal(p.refresh(a,out),false);
});
test('failed sampling leaves sink unchanged and invalidates a partially refreshed cache',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();a.charges.set('x',1);p.refresh(a,out);a.charges.set('x',2);a.charges.set('bad',NaN);
 assert.throws(()=>p.refresh(a,out),/finite/);assert.equal(out.calls.length,1);a.charges.delete('bad');assert.equal(p.refresh(a,out),true);assert.deepEqual(out.calls[1],[['charge:x',2]]);
});
test('recursive refresh is rejected before reading the recursive source',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();let read=false;const recursive={get statuses(){read=true;return [];},charges:new Map()};
 out.setGauges=()=>p.refresh(recursive,out);assert.throws(()=>p.refresh(a,out),/reenter/);assert.equal(read,false);out.setGauges=entries=>out.calls.push(entries);assert.equal(p.refresh(a,out),true);
});
test('invalidation during sink callback schedules the next publication',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();let invalidate=true;out.setGauges=entries=>{out.calls.push(entries);if(invalidate){invalidate=false;p.invalidate();}};
 assert.equal(p.refresh(a,out),true);assert.equal(p.refresh(a,out),true);assert.equal(p.refresh(a,out),false);assert.equal(out.calls.length,2);
});
test('reset drops cached state and is refused during a callback',()=>{
 const p=new ActorGaugePublisher(),a=sources(),out=sink();a.charges.set('x',1);p.refresh(a,out);p.reset();assert.equal(p.refresh(a,out),true);
 out.setGauges=()=>p.reset();p.invalidate();assert.throws(()=>p.refresh(a,out),/active/);
});
test('independent publishers cannot share cached values or sink identity',()=>{
 const first=new ActorGaugePublisher(),second=new ActorGaugePublisher(),a=sources(),b=sources(),outA=sink(),outB=sink();set(a,'charge','x',1);set(b,'charge','x',4);
 first.refresh(a,outA);second.refresh(b,outB);clear(a);first.refresh(a,outA);assert.equal(second.refresh(b,outB),false);assert.deepEqual(outB.calls,[[['charge:x',4]]]);
});
