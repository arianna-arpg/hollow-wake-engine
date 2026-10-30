import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
const {createHitSustain}=await import(process.env.HWE_HIT_SUSTAIN_MODULE || '../dist/hit-sustain.js');
const test=(name,body)=>nodeTest(name,()=>{try{body();}catch(error){if(error instanceof assert.AssertionError)throw new assert.AssertionError({message:error.message,operator:error.operator});throw error;}});

function rig(){
 const events=[],queries=[],distances=new Map();let r;
 const actor=(id,team='friend')=>{
  const a={id,team,pos:{point:id},tier:0,dead:false,life:10,cap:1000,radius:10,buffs:new Set(),values:{healPower:1,vampiricShare:0,bondShare:0},
   sheet:{get(key,tags,extra){queries.push({actor:a,key,tags,extra});return a.read?a.read(key,tags,extra):a.values[key]??0;}},
   healBy(amount){events.push(['heal',id,amount]);const before=a.life;if(!a.dead&&amount>0)a.life=Math.min(a.cap,a.life+amount);const got=a.life-before;a.afterHeal?.(amount,got);return got;},
  };return a;
 };
 const caster=actor(1),target=actor(2,'enemy'),first=actor(3),second=actor(4),def={siphon:undefined,tags:new Set(['spell']),feedingCue:{profile:'life'}},extra=[{id:'prepared'}];
 const ports={actors:()=>{events.push(['actors']);return r.actors;},tags:d=>{assert.equal(d,def);return d.tags;},sameStory:(a,b)=>{events.push(['story',a.id,b.id]);return (a.tier??0)===(b.tier??0);},
  distance:(a,b)=>{events.push(['distance',a,b]);return distances.get(a.point+':'+b.point)??0;},get sharingRadius(){return r.radius;},
  resourceFlow:(a,b,got,cue)=>events.push(['flow',a.id,b.id,got,cue]),sharedHealingCue:(a,got)=>events.push(['share-cue',a.id,got]),bondedHealingCue:(a,got)=>events.push(['bond-cue',a.id,got]),
 };
 r={events,queries,distances,caster,target,first,second,def,extra,ports,actor,actors:[caster,target,first,second],radius:10};
 r.service=createHitSustain(ports);r.apply=(dealt=100,depth=0)=>r.service.apply(caster,target,def,extra,dealt,depth);
 r.bond=(a=first)=>{a.buffs.add('bond');caster.bond={targetId:a.id,buffId:'bond'};};
 r.tree=(a=second,patch={})=>{a.construct={range:5,stored:20,baseRadius:10,healBurst:{cap:200},...patch};return a;};
 return r;
}
const events=(r,name)=>r.events.filter(e=>e[0]===name);
const heals=r=>events(r,'heal');
const shares=r=>events(r,'share-cue');

test('siphon uses captured damage, contextual power and measured recovery in order',()=>{
 const r=rig();r.def.siphon=.5;r.caster.values.healPower=2;r.caster.life=990;r.apply();
 assert.deepEqual(heals(r),[['heal',1,100]]);assert.equal(r.caster.life,1000);
 assert.deepEqual(events(r,'flow'),[['flow',1,2,10,r.def.feedingCue]]);
 assert(r.events.indexOf(heals(r)[0])<r.events.indexOf(events(r,'flow')[0]));
 assert.equal(r.queries[0].key,'healPower');assert(r.queries.every(q=>q.tags===r.def.tags&&q.extra===r.extra));
});
test('damage and siphon admission retain truthiness, death and distinct depth gates',()=>{
 for(const dealt of [0,-1,NaN]){const r=rig();r.def.siphon=.5;r.caster.values.vampiricShare=.2;r.tree();r.apply(dealt);assert.equal(r.events.length,0);assert.equal(r.queries.length,0);}
 for(const siphon of [undefined,0]){const r=rig();r.def.siphon=siphon;r.apply();assert.equal(heals(r).length,0);}
 const negative=rig();negative.def.siphon=-.5;negative.apply();assert.deepEqual(heals(negative),[['heal',1,-50]]);assert.equal(events(negative,'flow')[0][3],0);
 for(const depth of [-1,1,3]){const r=rig();r.def.siphon=.5;r.caster.values.vampiricShare=.2;r.bond();r.tree();r.apply(100,depth);assert.deepEqual(heals(r),[['heal',1,50]]);assert.equal(events(r,'actors').length,0);}
 const dead=rig();dead.caster.dead=true;dead.def.siphon=.5;dead.caster.values.vampiricShare=.2;dead.bond();dead.tree();dead.apply();assert.equal(heals(dead).length,0);assert.equal(dead.second.construct.stored,120);assert.equal(dead.queries.length,0);
});
test('sharing checks story before other eligibility and includes exact radius',()=>{
 const r=rig();r.caster.values.vampiricShare=.25;r.distances.set('1:3',10);r.distances.set('1:4',10.01);r.apply();
 assert.deepEqual(heals(r),[['heal',3,25]]);assert.deepEqual(shares(r),[['share-cue',3,25]]);
 for(const state of [{dead:true},{team:'enemy'},{tier:1}]){const s=rig();s.caster.values.vampiricShare=.25;Object.assign(s.first,state);s.apply();assert.deepEqual(heals(s),[['heal',4,25]]);assert(events(s,'story').some(e=>e[1]===3&&e[2]===1));assert(!events(s,'distance').some(e=>e[1]===s.caster.pos&&e[2]===s.first.pos));}
 const zero=rig();zero.caster.values.vampiricShare=.25;zero.first.tier=undefined;zero.apply();assert.equal(heals(zero).length,2);
});
test('nonpositive sharing and bond values skip healing queries and callbacks',()=>{
 for(const value of [0,-1]){const r=rig();r.caster.values.vampiricShare=value;r.caster.values.bondShare=value;r.bond();r.apply();assert.equal(heals(r).length,0);assert(!r.queries.some(q=>q.key==='healPower'));assert(r.caster.bond);}
});
test('sharing emits measured flows but text only above one half',()=>{
 for(const got of [0,.25,.5,.75]){const r=rig();r.caster.values.vampiricShare=.25;r.first.life=1000-got;r.apply();assert.equal(events(r,'flow').find(e=>e[1]===3)[3],got);assert.equal(shares(r).filter(e=>e[1]===3).length,got>.5?1:0);}
});
test('sharing traversal observes append and removal on its current array',()=>{
 const append=rig();append.caster.values.vampiricShare=.25;append.first.afterHeal=()=>append.actors.push(append.actor(5));append.apply();assert.deepEqual(heals(append).map(e=>e[1]),[3,4,5]);
 const remove=rig();remove.caster.values.vampiricShare=.25;remove.first.afterHeal=()=>remove.actors.splice(remove.actors.indexOf(remove.second),1);remove.apply();assert.deepEqual(heals(remove).map(e=>e[1]),[3]);
});
test('replacing the actor list retains sharing iterator but changes later phases',()=>{
 const r=rig();r.caster.values.vampiricShare=.25;r.caster.values.bondShare=.5;r.bond(r.second);r.tree(r.second);const added=r.tree(r.actor(5));
 r.first.afterHeal=()=>{r.actors=[r.caster,r.target,added];};r.apply();assert.deepEqual(heals(r).map(e=>e[1]),[3,4]);assert.equal(r.caster.bond,undefined);assert.equal(r.second.construct.stored,20);assert.equal(added.construct.stored,120);
});
test('each later sharing recipient uses live eligibility and radius',()=>{
 for(const mutate of [r=>r.second.dead=true,r=>r.second.team='enemy',r=>r.second.tier=1,r=>r.distances.set('1:4',11),r=>{r.radius=-1;}]){const r=rig();r.caster.values.vampiricShare=.25;r.first.afterHeal=()=>mutate(r);r.apply();assert.deepEqual(heals(r).map(e=>e[1]),[3]);}
});
test('sharing captures its amount while bond power and tags remain live',()=>{
 const r=rig();r.caster.values.vampiricShare=.25;r.caster.values.bondShare=.5;r.bond();const firstTags=r.def.tags,nextTags=new Set(['melee']);
 r.first.afterHeal=()=>{r.caster.values.healPower=3;r.def.tags=nextTags;};r.apply();assert.deepEqual(heals(r),[['heal',3,25],['heal',4,25],['heal',3,150]]);
 assert.equal(r.queries.find(q=>q.key==='vampiricShare').tags,firstTags);assert.equal(r.queries.find(q=>q.key==='bondShare').tags,nextTags);assert(r.queries.every(q=>q.extra===r.extra));
});
test('resource cues read the definition after the actual healing callback',()=>{
 const r=rig();r.def.siphon=.5;r.caster.afterHeal=()=>{r.def.feedingCue=false;r.caster.values.vampiricShare=.25;};r.first.afterHeal=()=>{r.def.feedingCue={profile:'new'};};r.apply();
 assert.deepEqual(events(r,'flow').map(e=>e[4]),[false,r.def.feedingCue,r.def.feedingCue]);
});
test('death inside siphon prevents sharing but does not prevent tree storage',()=>{
 const r=rig();r.def.siphon=.5;r.caster.values.vampiricShare=.25;r.tree();r.caster.afterHeal=()=>{r.caster.dead=true;};r.apply();assert.deepEqual(heals(r),[['heal',1,50]]);assert.equal(r.second.construct.stored,120);
});
test('death inside sharing does not recheck the outer gate for later recipients or bond',()=>{
 const r=rig();r.caster.values.vampiricShare=.25;r.caster.values.bondShare=.5;r.bond();r.first.afterHeal=()=>{r.caster.dead=true;};r.apply();assert.deepEqual(heals(r),[['heal',3,25],['heal',4,25],['heal',3,50]]);
});
test('bond selection is first-id, validates buff and death, and clears invalid bonds',()=>{
 for(const kind of ['missing','dead','buff','duplicate']){const r=rig();r.caster.values.bondShare=.5;r.bond();if(kind==='missing')r.caster.bond.targetId=99;if(kind==='dead')r.first.dead=true;if(kind==='buff')r.first.buffs.clear();if(kind==='duplicate'){r.first.buffs.clear();r.second.id=3;r.second.buffs.add('bond');}r.apply();assert.equal(r.caster.bond,undefined);assert.equal(heals(r).length,0);}
});
test('bond can feed self or a distant hostile actor on a different story',()=>{
 for(const self of [false,true]){const r=rig(),a=self?r.caster:r.first;r.caster.values.bondShare=.5;r.bond(a);a.team='unrelated';a.tier=8;r.distances.set('1:3',999);r.apply();assert.deepEqual(heals(r),[['heal',a.id,50]]);assert.equal(events(r,'flow').length,0);assert.deepEqual(events(r,'bond-cue'),[['bond-cue',a.id,50]]);}
});
test('bond multiplier defaults only nullish values and honors actual text threshold',()=>{
 for(const [feed,amount]of [[undefined,50],[null,50],[0,0],[-1,-50],[2,100]]){const r=rig();r.caster.values.bondShare=.5;r.bond();r.def.bondFeed=feed;r.apply();assert.deepEqual(heals(r),[['heal',3,amount]]);}
 for(const got of [.5,.75]){const r=rig();r.caster.values.bondShare=.5;r.bond();r.first.life=1000-got;r.apply();assert.equal(events(r,'bond-cue').length,got>.5?1:0);}
});
test('bond changes from earlier healing are read after sharing',()=>{
 for(const mode of ['clear','replace','buff']){const r=rig();r.caster.values.vampiricShare=.25;r.caster.values.bondShare=.5;r.bond();r.first.afterHeal=()=>{if(mode==='clear')r.caster.bond=undefined;if(mode==='replace')r.bond(r.second);if(mode==='buff')r.first.buffs.clear();};r.apply();assert.deepEqual(heals(r).map(e=>e[1]),mode==='replace'?[3,4,4]:[3,4]);if(mode!=='replace')assert.equal(r.caster.bond,undefined);}
});
test('tree storage compares target story and caster team, with an inclusive range',()=>{
 const r=rig();r.tree();r.caster.tier=1;r.distances.set('4:2',5);r.apply();assert.equal(r.second.construct.stored,120);assert(Math.abs(r.second.radius-13.6)<1e-12);
 for(const mutate of [r=>r.second.dead=true,r=>r.second.team='enemy',r=>r.second.tier=1,r=>r.distances.set('4:2',5.01),r=>r.second.construct.healBurst=undefined]){const s=rig();s.tree();mutate(s);s.apply();assert.equal(s.second.construct.stored,20);assert.equal(s.second.radius,10);}
});
test('tree storage caps before swelling and defaults only nullish state',()=>{
 for(const [stored,expected]of [[undefined,100],[0,100],[-50,50],[190,200],[300,200]]){const r=rig();r.tree(r.second,{stored});r.apply();assert.equal(r.second.construct.stored,expected);assert.equal(r.second.radius,10*(1+.6*expected/200));}
 const zero=rig();zero.tree(zero.second,{baseRadius:0});zero.apply();assert.equal(zero.second.radius,0);
 const absent=rig();absent.tree(absent.second,{baseRadius:undefined});absent.second.radius=20;absent.apply();assert(Math.abs(absent.second.radius-27.2)<1e-12);
 const cap=rig();cap.tree(cap.second,{healBurst:{cap:0}});cap.apply();assert.equal(cap.second.construct.stored,0);assert(Number.isNaN(cap.second.radius));
});
test('tree captures burst before spatial callback but reads the current construct for writes',()=>{
 const r=rig();r.tree();const original=r.second.construct;r.ports.distance=(from,to)=>{if(from===r.second.pos&&to===r.target.pos)r.second.construct={range:9,stored:180,baseRadius:20,healBurst:{cap:500}};return 0;};r.apply();
 assert.equal(original.stored,20);assert.equal(r.second.construct.stored,200);assert.equal(r.second.radius,32);
});
test('tree failure retains earlier tree commit and failing storage write',()=>{
 const r=rig();r.tree(r.first);r.tree(r.second);let stored=20;Object.defineProperty(r.second.construct,'stored',{get:()=>stored,set:value=>{stored=value;throw Error('tree fault');}});
 assert.throws(()=>r.apply(),/tree fault/);assert.equal(r.first.construct.stored,120);assert(Math.abs(r.first.radius-13.6)<1e-12);assert.equal(stored,120);assert.equal(r.second.radius,10);
});
test('healing callback failures retain prior recovery and stop all later effects',()=>{
 for(const lane of ['siphon','share','bond']){const r=rig();r.tree();let a;if(lane==='siphon'){r.def.siphon=.5;a=r.caster;}else{a=r.first;if(lane==='share')r.caster.values.vampiricShare=.25;else{r.caster.values.bondShare=.5;r.bond();}}
  a.afterHeal=()=>{throw Error('heal fault');};assert.throws(()=>r.apply(),/heal fault/);assert(a.life>10);assert.equal(events(r,'flow').length,0);assert.equal(r.second.construct.stored,20);
 }
});
test('a failed share cue retains healing and flow but stops later recipients and trees',()=>{
 const r=rig();r.caster.values.vampiricShare=.25;r.tree();r.ports.sharedHealingCue=()=>{throw Error('cue fault');};assert.throws(()=>r.apply(),/cue fault/);assert.deepEqual(heals(r),[['heal',3,25]]);assert.equal(events(r,'flow').length,1);assert.equal(r.second.construct.stored,20);
});
test('nested calls retain independent captured damage and reentrant ports',()=>{
 const r=rig();r.def.siphon=.5;r.caster.values.vampiricShare=.25;r.tree();let nested=false;r.first.afterHeal=()=>{if(nested)return;nested=true;r.apply(20,1);};r.apply();assert.deepEqual(heals(r),[['heal',1,50],['heal',3,25],['heal',1,10],['heal',4,25]]);assert.equal(r.second.construct.stored,120);
});
test('separate services and modifier arrays do not share mutable scratch or registries',()=>{
 const a=rig(),b=rig();a.def.siphon=.5;b.def.siphon=.25;a.extra.push({id:'other'});a.caster.afterHeal=()=>b.apply(20,1);a.apply(100,1);assert.deepEqual(heals(a),[['heal',1,50]]);assert.deepEqual(heals(b),[['heal',1,5]]);assert(a.queries.every(q=>q.extra===a.extra));assert(b.queries.every(q=>q.extra===b.extra));assert.equal(b.extra.length,1);
});
