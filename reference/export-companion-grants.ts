// Original-only companion lifecycle observer; expected output is frozen independently of the SDK.
// Intended placement in the pinned game's balance/ directory for original-only capture.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {SKILLS} from '../src/data/skills';
import {CompanionGrants,companionGrantStat,summonReservationUnit,summonReservationStat} from '../src/engine/companionGrants';
import {makeSkillInstance,type SkillDef,type SkillInstance,type SummonDelivery} from '../src/engine/skills';
bootSimEngine();
const restore=seedGlobalRandom(0x7714),rows:unknown[]=[];
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const golem=SKILLS.summon_stone_golem,bone=SKILLS.summon_bone_golem;
const persistent=Object.values(SKILLS).filter(def=>def.delivery.type==='summon'&&def.delivery.persistent);
const authored=JSON.stringify(persistent);
type Held={inst:SkillInstance;body?:Actor;remaining:number};
function course(label:string,run:(h:ReturnType<typeof harness>)=>void){
 const h=harness();run(h);rows.push({label,trace:h.trace,observations:h.observations});
}
function harness(){
 const runtime=new CompanionGrants(),owner=new Actor('Owner','player',{x:0,y:0}),other=new Actor('Other','player',{x:1,y:0});
 const trace:unknown[]=[],observations:unknown[]=[];let sequence=0,source='first host',key:string|undefined='account-key';
 const identities=new WeakMap<object,number>(),id=(o:object|undefined)=>{if(!o)return null;if(!identities.has(o))identities.set(o,++sequence);return identities.get(o);};
 let actors:Actor[]=[owner,other],nullSpawn=false,throwAt='';
 const held=(a=owner):Map<string,Held>|undefined=>(runtime as any).owners.get(a);
 const capture=(label:string,a=owner)=>observations.push(copy({label,owner:id(a),dead:a.dead,downed:a.downed,
  held:[...(held(a)??[])].map(([key,row])=>({key,row:id(row),instance:id(row.inst),definition:id(row.inst.def),
   level:row.inst.level,marked:row.inst.companionGrant,source:row.inst.grantedBy,relic:row.inst.relicSource,
   sockets:row.inst.sockets.length,remaining:row.remaining,body:row.body?{id:id(row.body),dead:row.body.dead,life:row.body.life,inRoster:actors.includes(row.body)}:null}))}));
 const fail=(stage:string)=>{if(throwAt===stage)throw Error('injected '+stage);};
 const retire=(body:Actor)=>{trace.push(['retire',id(body)]);fail('retire');body.dead=true;};
 const refresh=(body:Actor,inst:SkillInstance)=>{trace.push(['refresh',id(body),id(inst),inst.level,inst.grantedBy,inst.relicSource]);fail('refresh');body.life+=1;};
 const derive=(defs:SkillDef[]=[golem],a=owner)=>runtime.derive(a,defs,skill=>{trace.push(['source',skill,source]);fail('source');return source;},retire,refresh,
  skill=>{trace.push(['relic',skill,key]);fail('relic');return key;});
 const spawn=(inst:SkillInstance,delivery:SummonDelivery)=>{
  trace.push(['spawn',id(inst),copy(delivery),Object.keys(delivery),delivery===inst.def.delivery]);fail('spawn');if(nullSpawn)return null;
  const body=new Actor('Follower','player',{x:0,y:0});body.life=13;actors.push(body);trace.push(['spawned',id(body)]);return body;
 };
 const update=(dt:number,a=owner)=>runtime.update(a,actors,dt,spawn,retire);
 const level=(amount:number,def=golem,a=owner)=>a.sheet.setSource('grant:'+def.id,[{stat:companionGrantStat(def.id),kind:'flat',value:amount}]);
 level(3);return {runtime,owner,other,trace,observations,capture,held,derive,update,level,
  source:(s:string,k:string|undefined)=>{source=s;key=k;},spawnNull:(on:boolean)=>{nullSpawn=on;},throwAt:(stage:string)=>{throwAt=stage;},
  drop:(body:Actor)=>{actors=actors.filter(a=>a!==body);}};
}
try{
 course('first-warm-and-changed-provenance',h=>{
  h.derive();h.capture('first');h.update(0);h.capture('spawn');const row=h.held()!.get(golem.id)!;
  h.derive();h.capture('warm');h.source('replacement worn host',undefined);h.level(4.9);h.derive();h.capture('changed');
  assert.equal(h.held()!.get(golem.id),row);assert.equal(row.inst.level,4);
 });
 course('fractional-cap-and-removal',h=>{
  for(const value of [.99,1.99,100000,0,-1]){h.level(value);h.derive();h.capture(String(value));h.update(0);h.capture('tick '+value);}
 });
 course('definition-order-and-duplicate-id',h=>{
  h.level(2,bone);h.derive([bone,golem,golem]);h.capture('duplicate-new');h.update(0);h.capture('spawn');
  h.derive([golem,bone,golem]);h.capture('duplicate-warm');h.derive([bone]);h.capture('removed-first');
 });
 course('nonpersistent-and-nonsummon-filter',h=>{
  const temporary={...golem,delivery:{...golem.delivery,persistent:undefined}} as SkillDef;
  h.derive([SKILLS.firebolt,temporary]);h.capture('filtered');h.derive();h.update(0);h.derive([temporary]);h.capture('retired');
 });
 course('definition-replacement-retains-original-instance',h=>{
  h.derive();h.update(0);const original=h.held()!.get(golem.id)!.inst;
  const replacement={...golem,leveling:{perLevel:golem.leveling?.perLevel??[],maxLevel:2}};h.level(10);h.derive([replacement]);h.capture('replacement');
  assert.equal(h.held()!.get(golem.id)!.inst,original);assert.equal(original.def,golem);
 });
 course('independent-owners',h=>{
  h.level(6,bone,h.other);h.derive();h.derive([bone],h.other);h.update(0);h.update(0,h.other);h.capture('one');h.capture('two',h.other);
  h.derive([]);h.capture('one removed');h.capture('two unchanged',h.other);
 });
 course('dead-body-scaled-timer-and-exact-threshold',h=>{
  h.owner.sheet.setSource('respawn',[{stat:'minionRespawnTime',kind:'more',value:.5}]);
  h.derive();h.update(0);h.held()!.get(golem.id)!.body!.dead=true;h.update(1);h.capture('countdown');
  const remaining=h.held()!.get(golem.id)!.remaining;h.update(remaining-.25);h.capture('before');h.update(.25);h.capture('exact');
 });
 course('downed-pauses-dead-body-countdown',h=>{
  h.derive();h.update(0);h.held()!.get(golem.id)!.body!.dead=true;h.owner.downed=true;h.update(100);h.capture('downed');
  h.update(100);h.capture('still downed');h.owner.downed=false;h.update(1);h.capture('resumed');
 });
 course('owner-death-uses-authored-delay',h=>{
  h.owner.sheet.setSource('respawn',[{stat:'minionRespawnTime',kind:'more',value:2}]);h.derive();h.update(0);h.owner.dead=true;
  h.update(100);h.capture('owner dead');h.update(100);h.capture('still dead');h.owner.dead=false;h.update(1);h.capture('revived');
 });
 course('missing-live-body-and-null-spawn',h=>{
  h.derive();h.update(0);h.drop(h.held()!.get(golem.id)!.body!);h.spawnNull(true);h.update(0);h.capture('missing and null');
  h.update(0);h.capture('retry null');h.spawnNull(false);h.update(0);h.capture('retry success');
 });
 course('missing-body-while-downed',h=>{
  h.derive();h.update(0);h.drop(h.held()!.get(golem.id)!.body!);h.owner.downed=true;h.update(100);h.capture('missing downed');
  h.owner.downed=false;h.update(0);h.capture('resumed');
 });
 course('dead-body-not-refreshed-or-retired-twice',h=>{
  h.derive();h.update(0);h.held()!.get(golem.id)!.body!.dead=true;h.derive();h.capture('dead warm');h.derive([]);h.capture('removed');
 });
 for(const stage of ['relic','refresh','source','retire'])course('derive-partial-exception-'+stage,h=>{
  h.level(2,bone);h.derive([golem,bone]);h.update(0);h.source('changed host','changed key');h.level(5);
  h.throwAt(stage);assert.throws(()=>h.derive(stage==='retire'?[]:[golem,bone]),new RegExp('injected '+stage));h.capture('partial');
  h.throwAt('');h.derive([golem,bone]);h.capture('retry');
 });
 for(const stage of ['spawn','retire'])course('update-partial-exception-'+stage,h=>{
  h.derive();if(stage==='retire'){h.update(0);h.owner.dead=true;}h.throwAt(stage);
  assert.throws(()=>h.update(0),new RegExp('injected '+stage));h.capture('partial');h.throwAt('');h.update(0);h.capture('retry');
 });
 for(const def of persistent)course('authored:'+def.id,h=>{
  h.level(2.75,def);h.derive([def]);h.capture('derive');h.update(0);h.capture('spawn');
  h.held()!.get(def.id)!.body!.dead=true;h.update(0);h.capture('body died');
 });
 const owner=new Actor('Price','player',{x:0,y:0}),inst=makeSkillInstance(golem,3,0),d=golem.delivery as SummonDelivery;
 const priceQueries:unknown[]=[],get=owner.sheet.get.bind(owner.sheet);
 owner.sheet.get=(...args:Parameters<Actor['sheet']['get']>)=>{
  const[stat,tags,mods,base]=args;priceQueries.push(copy({stat,tags:tags?[...tags]:null,mods:mods??null,base:base??null,arguments:args.length}));
  return get(...args);
 };
 const prices=[];prices.push(summonReservationUnit(owner,inst,d));
 owner.sheet.setSource('price',[{stat:'manaCost',kind:'more',value:.25},{stat:summonReservationStat(golem.id),kind:'more',value:.5}]);
 prices.push(summonReservationUnit(owner,inst,d));prices.push(summonReservationUnit(owner,inst,{...d,persistent:undefined}));
 assert.equal(JSON.stringify(persistent),authored);
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-companion-lifecycle/v1',rows,prices,priceQueries,persistentDefinitions:persistent.map(def=>def.id)}),{flag:'wx'});
}finally{restore();}
