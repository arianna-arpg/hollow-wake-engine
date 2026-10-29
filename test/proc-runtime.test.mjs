import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {test} from 'node:test';import assert from 'node:assert/strict';
import {ProcRuntime,ProcContent,BorrowedProcRegistry} from '../dist/proc-runtime.js';
import {StatSheet} from '../dist/stats.js';import {StatRules} from '../dist/stat-rules.js';
const rules={maxExtraDepth:2,depthFalloff:.5,ppmCatchup:4};
const definition=(id='A',fields={})=>({id,trigger:'condition',effect:{type:'ward',flat:10},...fields});
const clocks=a=>({ready:[...a.procReadyAt],attempt:[...a.procAttemptAt],fired:[...a.procFiredAt]});
function actor(){return {dead:false,procReadyAt:new Map(),procAttemptAt:new Map(),procFiredAt:new Map(),buffs:new Map(),statuses:[],
  condRose:[],healedSince:0,gasped:false,sheet:new StatSheet(new StatRules({procDepth:{base:0,min:0},luck:{base:0,min:0},highRollWindow:{base:0,min:0}}))};}
function rig(rows=[definition()],options={}){
  const a=actor(),calls=[],reads=[],hooks={},state={time:0,roll:0,draws:0,court:1};
  const content=options.borrowed?new BorrowedProcRegistry({definitions:()=>rows,definition:id=>rows.find(r=>r.id===id),riders:()=>options.riders??[]},rules)
    :new ProcContent({schemaVersion:1,capability:'proc-dispatch/v1',contentId:'test',rules:options.rules??rules,procs:rows,riders:options.riders??[]});
  const ports={
    time(){return state.time;},random(){assert.equal(this,ports);state.draws++;return state.roll;},
    stat(a,id,tags,extra){reads.push(id);return a.sheet.get(id,tags,extra);},condition(a,id){hooks.condition?.();return a.sheet.hasCondition(id);},
    armed:(a,ids,extra)=>a.sheet.armedFamily('proc_',ids,extra),tags:i=>i.tags,extra:i=>i.extra??[],carryTags:i=>i.carryTags??i.tags,carryCourt:()=>state.court,
    victim:(ids,target)=>ids.every(id=>target.conditions?.includes(id)||target.statuses.some(s=>s.id===id&&s.stacks>0)),
    execute(proc,owner,inst,target,depth,aim){calls.push({id:proc.id,owner,inst,target,depth,aim});hooks.execute?.(proc,owner,inst,target,depth);},
    castRider(owner,inst,target,depth,payload){calls.push({rider:true,owner,inst,target,depth,payload});},bankStatus(){calls.push({bank:true});},lastGasp(){calls.push({gasp:true});},
  };
  const runtime=new ProcRuntime(content,ports);return {actor:a,runtime,content,ports,calls,reads,hooks,state};
}
const skill={def:{id:'cleave'},tags:new Set(['attack','melee','physical','aoe'])};
const original=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-thirty-eight/proc-rules.json.gz',import.meta.url))));

test('proc subclasses finish their fields before freezing without changing dispatch',()=>{
  const r=rig();
  assert.equal(Object.isFrozen(r.runtime),true);
  class Derived extends ProcRuntime {
    label='derived';
    #calls=0;
    constructor(source,ports){super(source,ports);Object.freeze(this);}
    own(...args){this.#calls++;return super.own(...args);}
    get calls(){return this.#calls;}
  }
  const runtime=new Derived(r.content,r.ports);
  assert.equal(runtime.label,'derived');assert.equal(Object.isFrozen(runtime),true);
  assert.throws(()=>{runtime.label='changed';},TypeError);
  r.actor.sheet.setBase('proc_A',1);runtime.own(r.actor,'condition');
  assert.equal(runtime.calls,1);assert.equal(r.calls.length,1);assert.equal(r.state.draws,1);
  class Open extends ProcRuntime {#value=7;get value(){return this.#value;}}
  const open=new Open(r.content,r.ports);
  assert.equal(open.value,7);assert.equal(Object.isExtensible(open),true);
});

test('carry and talent results preserve entry eligibility for following host phases',()=>{
  const r=rig([definition('A',{trigger:'hit',minionCarry:true})]);r.actor.sheet.setBase('proc_A',1);
  const event={dealt:1,depth:0,crit:false,lethal:true,elite:false};
  assert.equal(r.runtime.carry(r.actor,skill,actor(),{...event,dealt:0}),false);
  assert.equal(r.runtime.carry(r.actor,skill,actor(),{...event,depth:1}),false);
  r.hooks.execute=()=>{r.actor.dead=true;};
  assert.equal(r.runtime.carry(r.actor,skill,actor(),event),true);assert.equal(r.actor.dead,true);
  assert.equal(r.runtime.carry(r.actor,skill,actor(),event),false);assert.equal(r.runtime.talents(r.actor),false);
  const t=rig();t.actor.sheet.setBase('proc_A',1);t.actor.condRose=['lowLife'];t.hooks.execute=()=>{t.actor.dead=true;};
  assert.equal(t.runtime.talents(t.actor),true);assert.equal(t.actor.dead,true);
  const empty=rig([]);assert.equal(empty.runtime.carry(empty.actor,skill,actor(),event),true);assert.equal(empty.runtime.talents(empty.actor),true);
});

test('ordinary and rider rolls reject equality at the original 95 percent cap',()=>{
  const r=rig([definition()],{riders:[{id:'R',proc:'A',cast:{skillId:'spark'}}]});
  r.actor.sheet.setBase('proc_A',1);r.actor.sheet.setBase('procRider_R',1);r.state.roll=.95;
  r.runtime.own(r.actor,'condition');r.runtime.riders(r.content.definition('A'),r.actor,null,null,0);
  assert.equal(r.state.draws,2);assert.equal(r.calls.length,0);
  r.state.roll=.949;r.runtime.own(r.actor,'condition');r.runtime.riders(r.content.definition('A'),r.actor,null,null,0);
  assert.equal(r.calls.length,2);
});
test('proc rules match all 47 immutable original observations',()=>{
  let checked=0;
  for(const row of original.rows){
    const id='__m38_probe_rule',r=rig([definition(id)]),a=r.actor,s=r.runtime;let proc=definition(id);r.state.time=10;
    if(row.before){a.procReadyAt=new Map(row.before.ready);a.procAttemptAt=new Map(row.before.attempt);a.procFiredAt=new Map(row.before.fired);}
    if(row.kind==='chance'){
      const i=row.input;a.sheet.setBase('proc_'+id,i.value);a.sheet.setBase('luck',i.luck);proc.ppm=i.ppm??undefined;
      assert.equal(s.chance(a,proc,i.depth),row.result);assert.deepEqual(clocks(a),row.after);
    }else if(row.kind==='ready'){
      r.state.time=row.input.time;proc.icd=row.input.icd??undefined;assert.equal(s.ready(a,proc),row.result);assert.deepEqual(clocks(a),row.after);
    }else if(row.kind==='gate'){
      Object.assign(proc,row.fields);if(row.name==='when-present'||row.name==='unless-present')a.sheet.setConditions(['lowLife']);if(row.name==='required-buff')a.buffs.set('__probe',{});
      assert.equal(s.gates(a,proc,row.hasInstance?skill:null),row.result,row.name);assert.deepEqual(clocks(a),row.after);
    }else if(row.kind==='sequence'){
      proc.oncePerCast=true;for(const step of row.results){r.state.time=step.time;assert.equal(s.gates(a,proc,null),step.result);assert.deepEqual(clocks(a),step.clocks);}
    }else if(row.kind==='depth'){a.sheet.setBase('procDepth',row.value);assert.equal(s.depthAllowed(a),row.result);}
    else if(row.kind==='roll-top'){a.sheet.setBase('highRollWindow',row.extra);assert.equal(s.rollTop(a,.2,row.roll??undefined),row.result);}
    else if(row.kind==='own-event'){
      proc=definition(id,{ppm:6,icd:2,oncePerCast:true});const q=rig([proc]);q.state.time=10;
      q.actor.procReadyAt=new Map(row.before.ready);q.actor.procAttemptAt=new Map(row.before.attempt);q.actor.procFiredAt=new Map(row.before.fired);
      if(row.name==='armed-zero-chance-stamps-once')q.actor.sheet.setSource('probe',[{stat:'proc_'+id,kind:'flat',value:1,when:'lowLife'}]);else q.actor.sheet.setBase('proc_'+id,1);
      q.state.roll=row.name==='roll-fails-before-icd'?.99:0;q.runtime.own(q.actor,'condition',{condition:'lowLife'});
      assert.deepEqual(clocks(q.actor),row.after);assert.equal(q.calls.length,row.executions);assert.equal(q.state.draws,row.draws);
    }else throw new Error('Uncovered original rule '+row.kind);
    checked++;
  }
  assert.equal(checked,47);
});
test('same-actor nesting follows purchased depth without a shared busy guard',()=>{
  const r=rig();r.actor.sheet.setBase('proc_A',1);r.actor.sheet.setBase('procDepth',2);
  r.hooks.execute=(_p,a,_i,_t,depth)=>r.runtime.own(a,'condition',{depth:depth+1});r.runtime.own(r.actor,'condition');
  assert.deepEqual(r.calls.map(c=>c.depth),[0,1,2]);assert.equal(r.state.draws,3);
});
test('live grants and removals affect later owned candidates without changing content',()=>{
  for(const remove of[false,true]){
    const r=rig([definition('A'),definition('B')]);r.actor.sheet.setBase('proc_A',1);if(remove)r.actor.sheet.setBase('proc_B',1);
    r.hooks.execute=proc=>{if(proc.id==='A')r.actor.sheet.setBase('proc_B',remove?0:1);};r.runtime.own(r.actor,'condition');
    assert.deepEqual(r.calls.map(c=>c.id),remove?['A']:['A','B']);assert.equal(r.content.definition('B').trigger,'condition');
  }
});
test('borrowed live appends and same-length index staleness match the original diagnostics',()=>{
  const rows=[definition('A')],r=rig(rows,{borrowed:true});r.actor.sheet.setBase('proc_A',1);
  r.hooks.execute=proc=>{if(proc.id==='A'&&rows.length===1){rows.push(definition('B'));r.actor.sheet.setBase('proc_B',1);}};
  r.runtime.own(r.actor,'condition');assert.deepEqual(r.calls.map(c=>c.id),['A','B']);
  r.runtime.own(r.actor,'condition');rows[0].trigger='heal';r.calls.length=0;r.runtime.own(r.actor,'heal');assert.equal(r.calls.length,0);
  rows.push(definition('C'));r.runtime.own(r.actor,'heal');assert.deepEqual(r.calls.map(c=>c.id),['A']);assert.equal(r.calls[0].owner,r.actor);
});
test('pulse grants use an armed snapshot and missed beats are never replayed',()=>{
  const r=rig([definition('A',{trigger:'pulse',every:5}),definition('B',{trigger:'pulse',every:5})]);r.actor.sheet.setBase('proc_A',1);
  r.hooks.execute=proc=>{if(proc.id==='A')r.actor.sheet.setBase('proc_B',1);};r.runtime.pulses(r.actor);assert.deepEqual(r.calls.map(c=>c.id),['A']);
  r.calls.length=0;r.runtime.pulses(r.actor);assert.deepEqual(r.calls.map(c=>c.id),['B']);
  r.calls.length=0;r.state.time=100;r.state.roll=.99;r.runtime.pulses(r.actor);assert.equal(r.calls.length,0);assert.equal(r.actor.procReadyAt.get('A'),105);
  const draws=r.state.draws;r.runtime.pulses(r.actor);assert.equal(r.state.draws,draws);
});
test('throwing execution retains PPM and cooldown stamps and does not retry effects',()=>{
  const r=rig([definition('A',{ppm:6,icd:2})]);r.actor.sheet.setBase('proc_A',1);r.hooks.execute=()=>{throw Error('delivery failed');};
  assert.throws(()=>r.runtime.own(r.actor,'condition'),/delivery failed/);assert.equal(r.actor.procReadyAt.get('A'),2);
  r.runtime.own(r.actor,'condition');r.state.time=1;r.runtime.own(r.actor,'condition');assert.equal(r.calls.length,1);assert.equal(r.state.draws,2);assert.equal(r.actor.procAttemptAt.get('A'),1);
});
test('condition read failure precedes once-per-time stamping and random draws',()=>{
  const r=rig([definition('A',{when:'lowLife',oncePerCast:true})]);r.actor.sheet.setBase('proc_A',1);r.hooks.condition=()=>{throw Error('read failed');};
  assert.throws(()=>r.runtime.own(r.actor,'condition'),/read failed/);assert.equal(r.state.draws,0);assert.equal(r.actor.procFiredAt.size,0);
});
test('invalid random values fail before delivery while retaining earlier gate and attempt stamps',()=>{
  for(const roll of[NaN,Infinity,-.1,1]){
    const r=rig([definition('A',{ppm:6,icd:2,oncePerCast:true})]);r.actor.sheet.setBase('proc_A',1);r.state.roll=roll;
    assert.throws(()=>r.runtime.own(r.actor,'condition'),/random sample/);assert.equal(r.calls.length,0);assert.equal(r.actor.procFiredAt.get('A'),0);assert.equal(r.actor.procAttemptAt.get('A'),0);assert.equal(r.actor.procReadyAt.size,0);
  }
});
test('callbacks and tuning are captured while live actor values and callback receivers remain usable',()=>{
  const config={...rules},r=rig([definition('A')],{rules:config});r.actor.sheet.setBase('proc_A',1);r.actor.sheet.setBase('procDepth',2);
  config.maxExtraDepth=0;r.ports.random=()=>{throw Error('replacement callback');};r.ports.execute=()=>{throw Error('replacement sink');};
  r.runtime.own(r.actor,'condition',{depth:2});assert.equal(r.calls.length,1);assert.equal(r.state.draws,1);
});
test('actor clocks keep their identities and remain independent through a shared runtime',()=>{
  const r=rig([definition('A',{icd:2})]),other=actor(),maps=[r.actor.procReadyAt,r.actor.procAttemptAt,r.actor.procFiredAt];
  r.actor.sheet.setBase('proc_A',1);other.sheet.setBase('proc_A',1);r.runtime.own(r.actor,'condition');r.runtime.own(other,'condition');
  assert.equal(r.calls.length,2);assert.deepEqual([r.actor.procReadyAt,r.actor.procAttemptAt,r.actor.procFiredAt],maps);assert.equal(r.actor.procReadyAt,maps[0]);assert.notEqual(other.procReadyAt,maps[0]);
});
test('talent sweep failure retains detached-edge consumption and stops later phases',()=>{
  const r=rig();r.actor.sheet.setBase('proc_A',1);r.actor.condRose=['lowLife','fullLife'];r.actor.healedSince=12;r.actor.gasped=true;
  const old=r.actor.condRose;r.hooks.execute=()=>{throw Error('effect failed');};assert.throws(()=>r.runtime.talents(r.actor),/effect failed/);
  assert.notEqual(r.actor.condRose,old);assert.deepEqual(old,['lowLife','fullLife']);assert.deepEqual(r.actor.condRose,[]);assert.equal(r.actor.healedSince,12);assert.equal(r.actor.gasped,true);assert.equal(r.calls.length,1);
});
test('dead talent sweep clears edges in place and never reads pulse state',()=>{
  const r=rig([definition('A',{trigger:'pulse',every:5})]),a=r.actor;a.dead=true;a.condRose=['lowLife'];a.healedSince=12;a.gasped=true;const queue=a.condRose;
  r.runtime.talents(a);assert.equal(a.condRose,queue);assert.deepEqual(queue,[]);assert.equal(a.healedSince,0);assert.equal(a.gasped,false);assert.equal(r.reads.length,0);assert.equal(r.calls.length,0);
});
test('gain dispatch has no own-event armed guard and status banking precedes depth rejection',()=>{
  const r=rig([definition('A',{trigger:'chargeGain',oncePerCast:true})]);r.runtime.gain(r.actor,{kind:'charge',id:'fury',depth:0});
  assert.equal(r.actor.procFiredAt.get('A'),0);assert.equal(r.state.draws,0);
  r.runtime.status(r.actor,skill,actor(),'chill',skill.tags,[],1);assert.deepEqual(r.calls,[{bank:true}]);
});
test('carry uses summoning context, owner clocks and the explicit-zero ICD exemption',()=>{
  for(const [fields,expected]of [[{},0],[{icd:0},1],[{icd:2},1],[{ppm:6},1],[{trigger:'kill'},1]]){
    const r=rig([definition('A',{trigger:'hit',minionCarry:true,...fields})]);r.actor.sheet.setSource('summon',[{stat:'proc_A',kind:'flat',value:1,tags:['minion']}]);r.state.court=4;r.state.roll=.25;
    const summon={...skill,carryTags:new Set(['spell','minion'])};r.runtime.carry(r.actor,summon,actor(),{dealt:10,depth:0,crit:false,lethal:fields.trigger==='kill',elite:false,dominantType:'physical'});
    assert.equal(r.calls.length,expected);if(expected)assert.equal(r.calls[0].inst,summon);if(fields.icd===2)assert.equal(r.actor.procReadyAt.get('A'),2);
  }
});
test('kill eligibility follows chance bookkeeping and rider delivery keeps its depth and payload identity',()=>{
  const r=rig([definition('A',{trigger:'kill',ppm:6,oncePerCast:true})],{riders:[{id:'spark',proc:'A',cast:{skillId:'spark'}}]});r.actor.sheet.setBase('proc_A',1);
  r.runtime.hit(r.actor,skill,actor(),{dealt:10,depth:0,crit:false,lethal:false,elite:false,tags:skill.tags});
  assert.equal(r.state.draws,0);assert.equal(r.actor.procAttemptAt.get('A'),0);assert.equal(r.actor.procFiredAt.get('A'),0);
  r.actor.sheet.setBase('procRider_spark',1);r.runtime.riders(r.content.definition('A'),r.actor,skill,null,3);
  assert.equal(r.calls[0].depth,4);assert.equal(r.calls[0].payload,r.content.riders()[0].cast);
});
