import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
const {createHitLanding}=await import(process.env.HWE_HIT_LANDING_MODULE || '../dist/hit-landing.js');
const test=(name,body)=>nodeTest(name,()=>{try{body();}catch(error){if(error instanceof assert.AssertionError)throw new assert.AssertionError({message:error.message,operator:error.operator});throw error;}});

function rig() {
  const events=[],queries=[];
  // Each sheet closes over its own actor; positions deliberately have no coordinates.
  const actor=(id,team,kind='monster')=>{const a={id,team,kind,pos:{opaque:id},life:100,dead:false,mimicWatch:false,values:{detectability:1},
    sheet:{get(name){queries.push([id,name]);return a.values[name]??0;}},
    isPanicked(){events.push(['panic',id]);return false;},
    healBy(amount){events.push(['heal',id,amount]);this.life+=amount;return amount;},
    noteRecent(event){events.push(['recent',id,event]);},spendBuffs(event){events.push(['spend',id,event]);}};return a;};
  const caster=actor(1,'player','player'),target=actor(2,'enemy'),other=actor(3,'enemy');
  const def={effects:[{type:'damage'}]},inst={def},extra=[{id:'mod'}],packet={tags:new Set(['spell']),amounts:{physical:10,cold:3}},received={physical:7};
  const result={evaded:false,blocked:false,immune:false,total:7,crit:false,receivedAmounts:received},answer={finished:true};
  const r={events,queries,caster,target,other,def,inst,extra,packet,received,result,answer,player:caster,meta:false};
  const record=name=>(...args)=>events.push([name,...args]);
  const ports={player:()=>r.player,time:()=>4,bindDeeds:record('bind'),concealed:()=>false,
    assault:record('assault'),applyHit:(c,t,p)=>{events.push(['apply',c,t,p]);t.life-=r.result.total;return r.result;},
    recordSelfDamage:record('self'),metaActive:()=>r.meta,deedEnemy:a=>a.team==='enemy',deedOwned:a=>a===r.player,
    recordDeed:record('deed'),trackHurt:(before,t)=>{events.push(['trackHurt',before,t]);return Math.max(0,before-t.life);},distance:()=>42,
    evadeCue:record('evadeCue'),blockCue:record('blockCue'),immuneCue:record('immuneCue'),rearCue:record('rearCue'),capturedArtCue:record('captureCue'),
    thorns:record('thorns'),blockCharges:record('charges'),ownProcs:record('proc'),blockTriggers:record('triggers'),kill:record('kill'),knockFixtures:record('knock'),
    refreshMimic:record('watch'),captureMimic:()=>false,bankPool:record('bank'),continue:(...args)=>{events.push(['continue',...args]);return answer;}};
  const service=createHitLanding(ports),args=[caster,inst,target,2,0,false,[{type:'ward'}],{opaque:'origin'},0,def,extra,packet,true,'cold',4];
  return Object.assign(r,{ports,service,args,run:()=>service.land(...args)});
}
const of=(r,name)=>r.events.filter(e=>e[0]===name),continued=r=>of(r,'continue').at(-1)?.slice(1);
const hitDeed=r=>{const event=of(r,'deed').find(e=>e[1].kind==='hit');assert(event,'Expected a hit deed');return event[1];};

test('successful landing forwards borrowed inputs, scalar captures and the native result',()=>{
  const r=rig();assert.equal(r.run(),r.answer);const a=continued(r);assert.equal(a.length,19);assert.deepEqual(a.slice(0,15),r.args);
  for(const i of [0,1,2,6,7,9,10,11])assert.equal(a[i],r.args[i]);assert.deepEqual(a.slice(15),[true,7,false,r.result]);assert.equal(a[18],r.result);
  assert.deepEqual(r.events.map(e=>e[0]),['panic','assault','apply','rearCue','proc','recent','recent','proc','bank','bank','continue']);
});
test('non-damaging definitions continue with zero captures without reading landing ports',()=>{
  const r=rig();r.def.effects=[];r.inst={def:{effects:[{type:'damage'}]}};r.args[1]=r.inst;r.ports.player=()=>{throw Error('player must stay unread');};
  assert.doesNotThrow(r.run);assert.deepEqual(r.events.map(e=>e[0]),['continue']);assert.deepEqual(continued(r).slice(15),[false,0,false,undefined]);
});
test('forced damage short circuits authored effect lookup',()=>{
  const r=rig();Object.defineProperty(r.def,'effects',{get(){throw Error('effects must stay unread');}});r.args[5]=true;assert.doesNotThrow(r.run);assert.equal(continued(r)[15],true);
});
test('admission uses the captured definition even when the instance has different effects',()=>{
  const r=rig();r.args[1]={def:{effects:[]}};r.run();assert.equal(of(r,'apply').length,1);assert.equal(continued(r)[9],r.def);
});
test('binding occurs before live player identity and hidden/panic queries',()=>{
  const r=rig();r.args[2]=r.caster;r.ports.bindDeeds=()=>{r.events.push(['bind']);r.player=r.other;};r.run();
  assert.equal(r.events[0][0],'bind');assert.equal(of(r,'panic').length,0);assert.equal(of(r,'self').length,0);assert.deepEqual(r.queries,[]);
});
test('life and hidden/panic snapshots precede assault mutation and overkill accounting',()=>{
  const r=rig();r.meta=true;r.caster.values.invisible=1;r.target.isPanicked=()=>true;
  r.ports.assault=()=>{r.caster.values.invisible=0;r.caster.values.detectability=1;r.target.isPanicked=()=>false;};r.run();
  const deed=hitDeed(r);assert(deed.flags.includes('hidden'));assert(deed.flags.includes('panicked'));
  const self=rig();self.caster.life=5;self.args[2]=self.caster;self.result.total=20;self.ports.assault=()=>{self.caster.life=4;};self.run();assert.equal(of(self,'self')[0][2],5);
});
test('concealment and detectability have distinct short-circuit reads',()=>{
  for(const mode of ['invisible','concealed','quiet','visible']){const r=rig();r.meta=true;r.caster.values.invisible=mode==='invisible'?1:0;r.caster.values.detectability=mode==='quiet'?.5:1;let lookups=0;
    r.ports.concealed=(a,t)=>{lookups++;assert.equal(a,r.caster);assert.equal(t,4);return mode==='concealed';};r.run();
    const hit=hitDeed(r);assert.equal(hit.flags.includes('hidden'),mode!=='visible');assert.equal(lookups,mode==='invisible'?0:1);
    assert.equal(r.queries.some(q=>q[1]==='detectability'),mode==='quiet'||mode==='visible');}
});
test('account admission is evaluated after damage and can be changed by the hit port',()=>{
  const r=rig(),apply=r.ports.applyHit;r.ports.applyHit=(...args)=>{const out=apply(...args);r.meta=true;return out;};r.run();assert.equal(of(r,'deed').filter(e=>e[1].kind==='hit').length,1);
});
test('incoming accounting records only positive blocked and lost life values',()=>{
  for(const stopped of [undefined,0,9]){const r=rig();r.player=r.target;r.caster.team='enemy';r.target.team='player';r.meta=true;Object.assign(r.result,{blocked:true,blockedAmount:stopped,total:3});r.run();
    assert.deepEqual(of(r,'deed').map(e=>e[1]),[...(stopped>0?[{kind:'block',value:9}]:[]),{kind:'hurt',value:3}]);assert.equal(of(r,'trackHurt')[0][1],100);}
});
test('outgoing deed ownership and live enemy eligibility gate all records',()=>{
  for(const gate of ['meta','enemy','owner','life']){const r=rig();r.meta=gate!=='meta';r.result.poiseBroke=true;
    if(gate==='enemy')r.ports.deedEnemy=()=>false;if(gate==='owner')r.ports.deedOwned=()=>false;if(gate==='life')r.target.life=0;r.run();assert.deepEqual(of(r,'deed'),[],gate);}
});
test('poise and hit deeds retain subject, received elements, distance and independent flags',()=>{
  const r=rig();r.meta=true;r.result.poiseBroke=true;r.result.crit=true;r.result.receivedAmounts={cold:2,fire:0,lightning:3};r.packet.amounts={fire:99};r.target.life=1;r.run();
  assert.deepEqual(of(r,'deed').map(e=>e[1]),[{kind:'poise',subject:r.target,flags:[]},{kind:'hit',tags:['spell'],distance:42,keys:['cold','lightning'],flags:['cold','lightning','crit','lethal']}]);
  const alive=rig();alive.meta=true;alive.result.poiseBroke=true;alive.run();assert.deepEqual(of(alive,'deed')[0][1].flags,['surviving']);
});
test('deed elements fall back to the live packet only when received amounts are absent',()=>{
  for(const amounts of [undefined,{}]){const r=rig();r.meta=true;r.result.receivedAmounts=amounts;r.packet.amounts={fire:3,cold:0,lightning:-1};r.run();assert.deepEqual(hitDeed(r).keys,amounts?[]:['fire']);}
});
test('critical state and dealt total are captured at distinct points while result stays borrowed',()=>{
  const r=rig();r.result.crit=true;r.target.kind='player';r.caster.team='enemy';r.ports.metaActive=()=>{r.result.crit=false;return false;};
  r.ports.refreshMimic=()=>{r.target.mimicWatch=true;r.result.total=5;};r.ports.captureMimic=()=>true;r.ports.capturedArtCue=()=>{r.result.total=6;};r.ports.rearCue=()=>{r.result.total=99;};r.run();
  assert.deepEqual(continued(r).slice(15),[true,6,true,r.result]);assert.equal(continued(r)[18].total,99);assert.equal(continued(r)[18].crit,false);
  assert(of(r,'proc').every(e=>e[3].crit===true));assert.deepEqual(of(r,'recent').map(e=>[e[1],e[2]]),[[1,'hit'],[2,'hurt'],[1,'crit'],[2,'critHurt']]);
});
test('evasion heals before recency, consumes buffs, emits both reactions and ends the hit',()=>{
  const r=rig();Object.assign(r.result,{evaded:true,total:0});r.target.values.lifeOnEvade=5;r.run();
  assert.deepEqual(r.events.slice(3).map(e=>e[0]),['evadeCue','heal','recent','spend','proc','proc']);
  assert.deepEqual(of(r,'recent'),[['recent',2,'evade']]);assert.deepEqual(of(r,'spend'),[['spend',2,'evade']]);
  const procs=of(r,'proc');assert.deepEqual(procs[0].slice(1),[r.target,'evade',{depth:0}]);assert.deepEqual(procs[1].slice(1),[r.caster,'miss',{tags:r.packet.tags,extra:r.extra,inst:r.inst,target:r.target,depth:0}]);assert.equal(procs[1][3].tags,r.packet.tags);assert.equal(procs[1][3].extra,r.extra);assert.equal(continued(r),undefined);
});
test('nonpositive evade and block healing never invokes the healing callback',()=>{
  for(const event of ['evaded','blocked'])for(const amount of [-1,0]){const r=rig();r.result[event]=true;r.result.total=0;r.target.values[event==='evaded'?'lifeOnEvade':'lifeOnBlock']=amount;r.run();assert.equal(of(r,'heal').length,0);}
});
test('block reaction order, exact-zero charge depth and borrowed striker context are preserved',()=>{
  for(const depth of [-1,0,1]){const r=rig();r.args[4]=depth;r.result.blocked=true;r.target.values.lifeOnBlock=3;r.run();
    assert.deepEqual(r.events.slice(3).map(e=>e[0]),['blockCue','thorns',...(depth===0?['charges']:[]),'heal','recent','spend','proc','proc','triggers']);
    assert.deepEqual(of(r,'recent'),[['recent',2,'block']]);assert.deepEqual(of(r,'spend'),[['spend',2,'block']]);
    const p=of(r,'proc')[1];assert.equal(p[2],'foiled');assert.equal(p[3].tags,r.packet.tags);assert.equal(p[3].inst,r.inst);assert.equal(continued(r),undefined);}
});
test('block death observes healing and trigger changes and skips an already dead target',()=>{
  for(const mode of ['lethal','healed','trigger-healed','already-dead']){const r=rig();r.result.blocked=true;r.result.total=20;r.target.life=5;
    if(mode==='healed')r.target.values.lifeOnBlock=30;if(mode==='already-dead')r.target.dead=true;if(mode==='trigger-healed')r.ports.blockTriggers=()=>{r.target.life=2;};r.run();assert.equal(of(r,'kill').length,mode==='lethal'?1:0,mode);
    if(mode==='lethal')assert.deepEqual(of(r,'kill')[0].slice(1),[r.target,false,r.caster]);}
});
test('refusal priority remains evade, block, immune when a host supplies combined flags',()=>{
  const r=rig();Object.assign(r.result,{evaded:true,blocked:true,immune:true,total:0});r.run();assert.equal(of(r,'evadeCue').length,1);assert.equal(of(r,'blockCue').length,0);assert.equal(of(r,'knock').length,0);
});
test('immune contact knocks fixtures after its cue with captured tone and no wound',()=>{
  const r=rig();r.result.immune=true;r.result.total=0;r.run();assert.deepEqual(r.events.slice(3),[['immuneCue',r.target,r.caster],['knock',r.caster,r.target,'cold',false,r.inst]]);assert.equal(continued(r),undefined);
});
test('mimic occurrence checks player kind, enemy source and refreshed watch before capture',()=>{
  for(const mode of ['capture','known','unwatched','wrong-kind','friendly']){const r=rig();r.target.kind=mode==='wrong-kind'?'monster':'player';r.caster.team=mode==='friendly'?'player':'enemy';let calls=0;
    r.ports.refreshMimic=(a,time)=>{assert.equal(a,r.target);assert.equal(time,4);r.target.mimicWatch=mode!=='unwatched';r.events.push(['watch']);};r.ports.captureMimic=(...args)=>{calls++;assert.deepEqual(args,[r.target,r.caster,r.def]);return mode==='capture';};r.run();
    assert.equal(of(r,'watch').length,mode==='wrong-kind'||mode==='friendly'?0:1);assert.equal(calls,['capture','known'].includes(mode)?1:0);assert.equal(of(r,'captureCue').length,mode==='capture'?1:0);}
});
test('rear cue requires rear contact, positive captured damage and nonfalse cue policy',()=>{
  for(const mode of ['front','zero','disabled','empty','default']){const r=rig();if(mode==='front')r.args[12]=false;if(mode==='zero')r.result.total=0;if(mode==='disabled')r.def.backstabCue=false;if(mode==='empty')r.def.backstabCue='';r.run();assert.equal(of(r,'rearCue').length,['empty','default'].includes(mode)?1:0);}
});
test('zero contacts preserve struck amounts without hurt stamps or pool feeding',()=>{
  const r=rig();r.result.total=0;r.run();assert.equal(of(r,'proc').length,1);assert.equal(of(r,'proc')[0][2],'struck');assert.equal(of(r,'proc')[0][3].receivedAmounts,r.received);assert.equal(of(r,'recent').length,0);assert.equal(of(r,'bank').length,0);assert(continued(r));
});
test('struck and hurt borrow their live received amounts separately',()=>{
  const r=rig(),later={cold:8},proc=r.ports.ownProcs;r.ports.ownProcs=(...args)=>{proc(...args);if(args[1]==='struck')r.result.receivedAmounts=later;};r.run();
  assert.equal(of(r,'proc').length,2);
  assert.equal(of(r,'proc')[0][3].receivedAmounts,r.received);assert.equal(of(r,'proc')[1][3].receivedAmounts,later);
});
test('hurt mutation precedes ordered pool-entry snapshot and bank mutation cannot rewrite it',()=>{
  const r=rig(),proc=r.ports.ownProcs,bank=r.ports.bankPool;r.ports.ownProcs=(...args)=>{proc(...args);if(args[1]==='hurt'){r.packet.amounts.fire=6;r.packet.amounts.chaos=undefined;}};
  let changed=false;r.ports.bankPool=(...args)=>{bank(...args);if(!changed){changed=true;r.packet.amounts.cold=999;delete r.packet.amounts.fire;r.packet.amounts.lightning=40;}};r.run();assert.deepEqual(of(r,'bank').map(e=>e.slice(2)),[['physical',10],['cold',3],['fire',6],['chaos',0]]);
});
test('nested struck reactions retain independent captures and borrowed result identities',()=>{
  const r=rig(),innerPacket={tags:new Set(['attack']),amounts:{fire:3}},inner={...r.result,total:3,crit:false},outer={...r.result,total:9,crit:true};
  r.ports.applyHit=(_c,_t,p)=>p===r.packet?outer:inner;let nested=false;const proc=r.ports.ownProcs;
  r.ports.ownProcs=(...args)=>{proc(...args);if(args[1]==='struck'&&!nested){nested=true;r.service.land(r.target,r.inst,r.other,1,1,false,undefined,undefined,undefined,r.def,r.extra,innerPacket,false,null,0);}};
  r.run();const calls=of(r,'continue').map(e=>e.slice(1));assert.equal(calls.length,2);assert.deepEqual(calls[0].slice(15),[true,3,false,inner]);assert.deepEqual(calls[1].slice(15),[true,9,true,outer]);assert.equal(calls[0][11],innerPacket);assert.equal(calls[1][11],r.packet);
});
test('failures retain committed writes and stop all later phases',()=>{
  for(const phase of ['assault','applyHit','recordDeed','evadeCue','ownProcs','bankPool','continue']){const r=rig(),error=new Error(phase);r.meta=phase==='recordDeed';if(phase==='evadeCue')r.result.evaded=true;
    r.ports[phase]=()=>{r.target.life=17;throw error;};assert.throws(()=>r.run(),e=>e===error);assert.equal(r.target.life,17);assert.equal(of(r,'continue').length,0,phase);}
});
test('independent services do not share ports, actors or continuation state',()=>{
  const a=rig(),b=rig();a.result.total=19;a.run();assert.equal(b.target.life,100);b.run();assert.equal(continued(a)[16],19);assert.equal(continued(b)[16],7);assert.equal(continued(a)[18],a.result);assert.equal(continued(b)[18],b.result);
});
