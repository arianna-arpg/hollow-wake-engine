import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
const {createHitPreparation}=await import(process.env.HWE_HIT_PREPARATION_MODULE || '../dist/hit-preparation.js');
const test=(name,body)=>nodeTest(name,()=>{try{body();}catch(error){
  if(error instanceof assert.AssertionError)throw new assert.AssertionError({message:error.message,operator:error.operator});
  throw error;
}});

function rig() {
  const events=[],queries=[],values={fuseDelay:1,afflictionYield:1};
  const actor=(id,team)=>({id,team,pos:{opaque:'position-'+id},tier:2,alertUntil:0,statuses:[],
    sheet:{get(name,tags,extra){queries.push([id,name,tags,extra]);return values[name]??0;},
      removeSource(id){events.push(['remove',id]);}}});
  const caster=actor(1,'hero'),target=actor(2,'enemy'),def={tags:['cold'],color:'#abc'},extra=[{id:'extra'}],tags=new Set(['spell']);
  const inst={def,extra,tags},packet={amounts:{cold:12,fire:8},critical:false},queue=[],result={done:true};
  const record=name=>(...args)=>{events.push([name,...args]);};
  const ports={time:()=>10,fuse:()=>undefined,instanceTags:i=>i.tags,definitionTags:d=>new Set(d.tags),modifiers:i=>i.extra,
    copyPosition:p=>({...p}),fuseQueue:()=>queue,fuseCue:record('fuseCue'),combat:record('combat'),guiseCue:record('guise'),
    forTarget:(_c,i)=>i,noise:record('noise'),shatterCue:record('shatter'),concealed:()=>false,ambushCue:record('ambush'),
    rearAngle:()=>0,distance:()=>5,proximityRadius:()=>10,victimScopeArmed:()=>false,victimTags:()=>['enemy'],
    roll:(...args)=>{record('roll')(...args);return packet;},tone:()=> 'cold',guard:(...args)=>{record('guard')(...args);return false;},
    shell:(...args)=>{record('shell')(...args);return false;},continue:(...args)=>{record('continue')(...args);return result;}};
  const service=createHitPreparation(ports);
  return {actor,caster,target,def,extra,tags,inst,packet,queue,result,ports,service,events,queries,values,
    run:(...args)=>service.prepare(caster,inst,target,...args)};
}
const of=(r,name)=>r.events.filter(e=>e[0]===name);
const prepared=r=>of(r,'continue').at(-1)?.slice(1);

test('default preparation returns the continuation result and borrows all records',()=>{
  const r=rig();assert.equal(r.run(),r.result);
  assert.deepEqual(r.events.map(e=>e[0]),['combat','roll','guard','shell','continue']);
  const args=prepared(r);assert.equal(args.length,15);
  assert.deepEqual(args,[r.caster,r.inst,r.target,1,0,false,undefined,undefined,undefined,r.def,r.extra,r.packet,false,null,0]);
  assert.equal(args[0],r.caster);assert.equal(args[1],r.inst);assert.equal(args[9],r.def);assert.equal(args[10],r.extra);assert.equal(args[11],r.packet);
});
test('explicit delivery values and the larger causal depth reach continuation',()=>{
  const r=rig(),flat={cold:4},effects=[{type:'status'}],origin={opaque:'impact'};r.inst.procChainDepth=4;
  r.run(2,3,flat,true,false,effects,origin,0);const a=prepared(r);
  assert.deepEqual(a.slice(3,9),[2,4,true,effects,origin,0]);assert.equal(a[6],effects);assert.equal(a[7],origin);
  assert.equal(of(r,'roll')[0][3],flat);assert.deepEqual(r.packet.amounts,{cold:24,fire:16});
  r.run(1,7);assert.equal(prepared(r)[4],7);
});
test('definition is captured before target replacement while modifiers and roll use replacement',()=>{
  const r=rig(),replacement={def:{tags:['fire'],color:'red',backstabMult:9},tags:new Set(['attack']),extra:[{id:'replacement'}]};
  r.def.backstabMult=2;r.ports.rearAngle=()=>3;r.ports.forTarget=(...args)=>{assert.deepEqual(args,[r.caster,r.inst,r.target,0]);return replacement;};
  r.run();const a=prepared(r);assert.equal(a[1],replacement);assert.equal(a[9],r.def);assert.equal(a[10],replacement.extra);assert.equal(a[3],2);
  assert.equal(of(r,'roll')[0][2],replacement);assert.equal(r.queries.find(q=>q[1]==='noiseOnHit')[3],replacement.extra);
  assert.deepEqual([...r.queries.find(q=>q[1]==='noiseOnHit')[2]],['cold']);
  assert.equal(r.queries.find(q=>q[1]==='hitToAffliction')[2],replacement.tags);
});
test('fuse admission preserves payload references, copies position, and retains explicit tier zero',()=>{
  const r=rig(),fuse={delay:3,tell:'wait'},flat={cold:9},effects=[{type:'heal'}],origin={opaque:'impact',extra:8};
  r.values.fuseDelay=2;r.ports.fuse=()=>fuse;r.target.segHitPending=42;r.inst.procChainDepth=5;
  assert.equal(r.run(1.5,1,flat,true,false,effects,origin,0),undefined);assert.equal(r.queue.length,1);
  const q=r.queue[0];assert.deepEqual(q,{kind:'hit',due:16,caster:r.caster,inst:r.inst,targetId:2,mult:1.5,depth:5,flat,force:true,hitEffects:effects,hitOrigin:origin,hitTier:0});
  assert.equal(q.inst,r.inst);assert.equal(q.flat,flat);assert.equal(q.hitEffects,effects);assert.notEqual(q.hitOrigin,origin);assert.equal(q.hitOrigin.extra,8);
  assert.equal(r.target.segHitPending,undefined);assert.deepEqual(r.events,[['fuseCue',r.target,r.def,fuse]]);
  assert.equal(r.queries[0][2],r.tags);assert.equal(r.queries[0][3],r.extra);
});
test('queue receiver and push method are captured before queued fields are evaluated',()=>{
  const r=rig(),later=[],earlier=r.queue;let queue=earlier;r.ports.fuse=()=>({delay:1});r.ports.fuseQueue=()=>queue;
  r.caster.sheet.get=()=>{queue=later;earlier.push=()=>{throw Error('late push must not run');};return 1;};
  r.run();assert.equal(earlier.length,1);assert.equal(later.length,0);assert.deepEqual(earlier[0].hitOrigin,r.caster.pos);
  assert.notEqual(earlier[0].hitOrigin,r.caster.pos);assert.equal(earlier[0].hitTier,2);
});
test('fuse cue failure leaves its queued hit and segment latch intact',()=>{
  const r=rig();r.ports.fuse=()=>({delay:0});r.target.segHitPending=7;r.ports.fuseCue=()=>{throw Error('tell failed');};
  assert.throws(()=>r.run(),/tell failed/);assert.equal(r.queue.length,1);assert.equal(r.target.segHitPending,7);assert.deepEqual(r.events,[]);
});
test('already fused hits bypass fuse lookup and continue through ordinary preparation',()=>{
  const r=rig();let lookups=0;r.ports.fuse=()=>{lookups++;return undefined;};r.run(1,0,undefined,false,true);
  assert.equal(lookups,0);assert.equal(r.queue.length,0);assert.equal(of(r,'continue').length,1);
});
test('combat bookkeeping precedes guise break and target replacement',()=>{
  const r=rig();r.caster.possession={guiseFaction:'enemy'};r.ports.combat=()=>{assert.equal(r.caster.possession.guiseBroken,undefined);r.events.push(['combat']);};
  r.ports.guiseCue=()=>{assert.equal(r.caster.possession.guiseBroken,true);r.events.push(['guise']);};
  r.ports.forTarget=(_c,i)=>{r.events.push(['target']);return i;};r.run();assert.deepEqual(r.events.slice(0,3).map(e=>e[0]),['combat','guise','target']);
  r.ports.combat=()=>r.events.push(['combat']);r.run();assert.equal(of(r,'guise').length,1);
  const self=rig();self.caster.possession={guiseFaction:'enemy'};self.service.prepare(self.caster,self.inst,self.caster);assert.equal(self.caster.possession.guiseBroken,undefined);
});
test('guise callback failure preserves the break before further preparation',()=>{
  const r=rig();r.caster.possession={guiseFaction:'enemy'};r.ports.guiseCue=()=>{throw Error('guise failed');};
  assert.throws(()=>r.run(),/guise failed/);assert.equal(r.caster.possession.guiseBroken,true);assert.equal(of(r,'roll').length,0);
});
test('positive noise uses live target position and may alter subsequent shatter policy',()=>{
  const r=rig();r.values.noiseOnHit=3;r.target.statuses=[{id:'ice',stacks:2}];
  r.ports.noise=(at,radius,c)=>{assert.equal(at,r.target.pos);assert.equal(radius,3);assert.equal(c,r.caster);r.def.shatterStatus={statuses:['ice'],mult:2};};
  r.run();assert.equal(prepared(r)[3],2);assert.equal(r.target.statuses.length,0);
  for(const n of [0,-2]){const quiet=rig();quiet.values.noiseOnHit=n;quiet.run();assert.equal(of(quiet,'noise').length,0);}
});
test('shatter removes matching entries in reverse order and folds every consumed stack',()=>{
  const r=rig();r.def.shatterStatus={statuses:['ice','stone'],mult:1.5,perStack:true};
  r.target.statuses=[{id:'ice',stacks:2},{id:'other',stacks:9},{id:'stone',stacks:3},{id:'ice',stacks:1}];r.run(2);
  assert.deepEqual(of(r,'remove').map(e=>e[1]),['status:ice','status:stone','status:ice']);assert.deepEqual(r.target.statuses,[{id:'other',stacks:9}]);
  assert.equal(prepared(r)[3],8);assert.equal(of(r,'shatter').length,1);
});
test('zero-stack shatter still emits its cue and nonmatching statuses do not multiply damage',()=>{
  for(const perStack of [true,false]){const r=rig();r.def.shatterStatus={statuses:['ice'],mult:3,perStack};r.target.statuses=[{id:'ice',stacks:0}];r.run();
    assert.equal(prepared(r)[3],perStack?1:3);assert.equal(of(r,'shatter').length,1);}
  const r=rig();r.def.shatterStatus={statuses:['ice'],mult:3};r.target.statuses=[{id:'other',stacks:2}];r.run();assert.equal(prepared(r)[3],1);assert.equal(of(r,'shatter').length,0);
});
test('shatter cleanup failure retains the removed record and stops before multiplier and cue',()=>{
  const r=rig();r.def.shatterStatus={statuses:['ice'],mult:3};r.target.statuses=[{id:'ice',stacks:1},{id:'ice',stacks:2}];
  r.target.sheet.removeSource=()=>{throw Error('cleanup failed');};assert.throws(()=>r.run(),/cleanup failed/);
  assert.deepEqual(r.target.statuses,[{id:'ice',stacks:1}]);assert.equal(of(r,'shatter').length,0);assert.equal(of(r,'roll').length,0);
});
test('ambush observes fresh time and short circuits invisibility when concealment succeeds',()=>{
  const r=rig();let time=9;r.ports.time=()=>++time;r.ports.concealed=(c,t)=>{assert.equal(c,r.caster);assert.equal(t,10);return true;};
  r.target.alertUntil=11;r.values.ambushBonus=.5;r.run();assert.equal(prepared(r)[3],1.5);assert.equal(of(r,'ambush').length,1);
  assert(!r.queries.some(q=>q[1]==='invisible'));
});
test('ambush requires surprise, opposition, elapsed alert and a positive bonus',()=>{
  for(const mode of ['visible','aware','friendly','alert','zero','negative','invisible']){const r=rig();r.values.ambushBonus=.5;r.ports.concealed=()=>mode!=='visible'&&mode!=='invisible';
    if(mode==='aware')r.target.aiTargetId=1;if(mode==='friendly')r.target.team='hero';if(mode==='alert')r.target.alertUntil=10.01;
    if(mode==='zero')r.values.ambushBonus=0;if(mode==='negative')r.values.ambushBonus=-1;if(mode==='invisible')r.values.invisible=1;
    r.run();assert.equal(prepared(r)[3],mode==='invisible'?1.5:1);assert.equal(of(r,'ambush').length,mode==='invisible'?1:0);}
});
test('rear hits use strict absolute angle threshold and only multipliers above one',()=>{
  for(const [angle,mult,expected]of [[2,2,1],[-2,2,1],[2.01,2,2],[-2.01,3,3],[3,1,1],[3,0,1],[3,-2,1]]){
    const r=rig();r.def.backstabMult=mult;r.ports.rearAngle=(t,c)=>{assert.equal(t,r.target);assert.equal(c,r.caster);return angle;};r.run();
    assert.equal(prepared(r)[3],expected);assert.equal(prepared(r)[12],expected>1);}
});
test('proximity scales linearly inside its live radius and stops at the edge',()=>{
  for(const [distance,expected]of [[0,3],[5,2],[10,1],[12,1]]){const r=rig();r.values.proximityDamage=2;r.ports.distance=(a,b)=>{assert.equal(a,r.caster.pos);assert.equal(b,r.target.pos);return distance;};
    r.run();assert.equal(prepared(r)[3],expected);}
  const r=rig();r.values.proximityDamage=-1;r.ports.distance=()=>{throw Error('unneeded distance');};r.run();assert.equal(prepared(r)[3],1);
});
test('owned breakables apply affinity once, retain explicit zero, and require exact owner identity',()=>{
  for(const [affinityMult,expected]of [[undefined,6],[4,12],[0,0]]){const r=rig();r.target.construct={breakable:{ownerMult:3,affinityTags:['cold','cold'],affinityMult}};r.target.owner=r.caster;r.run();assert.equal(prepared(r)[3],expected);}
  const r=rig();r.target.construct={breakable:{ownerMult:3,affinityTags:['fire']}};r.target.owner=r.caster;r.run();assert.equal(prepared(r)[3],3);
  r.target.owner={...r.caster};r.run();assert.equal(prepared(r)[3],1);
});
test('victim scope is lazy and forwards the exact tag list to the roller',()=>{
  const r=rig(),victim=['enemy','near'];let calls=0;r.ports.victimTags=(t,c,time)=>{calls++;assert.equal(t,r.target);assert.equal(c,r.caster);assert.equal(time,10);return victim;};
  r.run();assert.equal(calls,0);assert.equal(of(r,'roll')[0][4],undefined);
  r.ports.victimScopeArmed=(c,extra)=>{assert.equal(c,r.caster);assert.equal(extra,r.extra);return true;};r.run();assert.equal(calls,1);assert.equal(of(r,'roll')[1][4],victim);
});
test('packet scaling is in place for zero and negative multipliers and preserves other fields',()=>{
  for(const mult of [0,-2,1.5]){const r=rig(),amounts=r.packet.amounts;r.run(mult);assert.equal(prepared(r)[11],r.packet);assert.equal(r.packet.amounts,amounts);
    assert.deepEqual(amounts,{cold:12*mult,fire:8*mult});assert.equal(r.packet.critical,false);}
});
test('tone observes scaled damage before affliction conversion',()=>{
  const r=rig();r.target.tune={};r.values.hitToAffliction=.25;r.values.afflictionYield=3;
  r.ports.tone=amounts=>{assert.equal(amounts,r.packet.amounts);assert.deepEqual(amounts,{cold:24,fire:16});return 'fire';};r.run(2);
  assert.deepEqual(r.packet.amounts,{cold:18,fire:12});assert.equal(prepared(r)[13],'fire');assert.equal(prepared(r)[14],30);
  assert.equal(of(r,'guard')[0][4],30);
});
test('affliction conversion clamps the host fraction and keeps exact arithmetic order',()=>{
  for(const fraction of [-.5,0,.3,1,1.25,2]){const r=rig();r.values.hitToAffliction=fraction;r.values.afflictionYield=1.7;r.run();const f=Math.min(1,Math.max(0,fraction));
    assert.equal(r.packet.amounts.cold,12-12*f);assert.equal(r.packet.amounts.fire,8-8*f);assert.equal(prepared(r)[14],f>0?(12*f+8*f)*1.7:0);
    assert.equal(r.queries.filter(q=>q[1]==='afflictionYield').length,f>0?1:0);}
});
test('guard receives raw post-conversion sum and suppresses shell and continuation',()=>{
  const r=rig();r.values.hitToAffliction=.5;r.ports.guard=(...args)=>{assert.deepEqual(args,[r.target,r.caster,r.caster.pos,10]);return true;};r.run();
  assert.equal(of(r,'shell').length,0);assert.equal(of(r,'continue').length,0);
});
test('nonpositive raw damage skips both interceptors but still reaches continuation',()=>{
  for(const amounts of [{},{cold:0},{cold:-3,fire:2},{cold:undefined,fire:0}]){const r=rig();r.packet.amounts=amounts;r.run();
    assert.equal(of(r,'guard').length,0);assert.equal(of(r,'shell').length,0);assert.equal(of(r,'continue').length,1);}
});
test('shell uses caster position after guard and may modify the borrowed packet',()=>{
  const r=rig(),moved={opaque:'after guard'};r.ports.guard=()=>{r.caster.pos=moved;return false;};
  r.ports.shell=(target,pos,packet,caster)=>{assert.equal(target,r.target);assert.equal(pos,moved);assert.equal(packet,r.packet);assert.equal(caster,r.caster);packet.amounts.cold=1;return false;};
  r.run();assert.equal(prepared(r)[11].amounts.cold,1);
});
test('shell interception and callback errors stop continuation without rolling back earlier writes',()=>{
  const r=rig();r.ports.shell=()=>true;r.run();assert.equal(of(r,'continue').length,0);
  const f=rig();f.values.hitToAffliction=.5;f.ports.shell=()=>{f.target.shellTouched=true;throw Error('shell failed');};
  assert.throws(()=>f.run(),/shell failed/);assert.equal(f.target.shellTouched,true);assert.deepEqual(f.packet.amounts,{cold:6,fire:4});assert.equal(of(f,'continue').length,0);
});
test('nested preparation retains separate scalar captures and packet identities',()=>{
  const r=rig(),inner=r.actor(3,'enemy'),outerPacket=r.packet,innerPacket={amounts:{cold:7}},received=[];
  r.def.backstabMult=2;r.ports.rearAngle=t=>t===r.target?3:0;r.ports.roll=()=>r.packet;
  r.ports.guard=(target)=>{if(target===r.target){r.packet=innerPacket;r.service.prepare(r.caster,r.inst,inner,3,8);}return false;};
  r.ports.continue=(...args)=>{received.push(args);return args[2].id;};assert.equal(r.run(2,4),2);
  assert.equal(received.length,2);assert.equal(received[0][2],inner);assert.equal(received[0][3],3);assert.equal(received[0][4],8);assert.equal(received[0][11],innerPacket);assert.equal(received[0][12],false);
  assert.equal(received[1][2],r.target);assert.equal(received[1][3],4);assert.equal(received[1][4],4);assert.equal(received[1][11],outerPacket);assert.equal(received[1][12],true);
});
test('continuation failure propagates after preparation changes have become observable',()=>{
  const r=rig();r.values.hitToAffliction=.5;r.ports.continue=()=>{throw Error('landing failed');};
  assert.throws(()=>r.run(),/landing failed/);assert.deepEqual(r.packet.amounts,{cold:6,fire:4});assert.equal(of(r,'shell').length,1);
});
