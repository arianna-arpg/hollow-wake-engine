// Original-only exploration of the real persistent follower refresh/retire ports.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {forgeItem} from '../src/engine/itemgen';import {bankRelic} from '../src/engine/accountReliquary';
import {RELIQUARY} from '../src/data/containers';import type {Actor} from '../src/engine/actor';
import {SIM_TAP} from '../src/engine/tap';
bootSimEngine();const restore=seedGlobalRandom(0x7724),rng=mulberry32(0x7724),rows:unknown[]=[],events:unknown[]=[];
const ids=new WeakMap<object,number>();let serial=0;const id=(x:object|null|undefined)=>{if(!x)return null;if(!ids.has(x))ids.set(x,++serial);return ids.get(x);};
const near=(a:number,b:number)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
try{
 const w=makeSimWorld('magician',0x7724),p=w.player,m=w.meta,native=w as any;w.walk=null;w.actors=[p];
 m.modeId='immortal';m.charId='follower-build';m.relicScope='follower-build';m.items=[];m.equipped={};m.containers={};
 for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);
 const idol=forgeItem({uniqueId:'unquarried_idol',ilvl:30,quality:1,rng})!;assert(idol);assert.equal(bankRelic(w.account,idol,'follower-build'),idol);
 idol.x=0;idol.y=0;w.account.reliquary.seated=[idol.relicKey!];w.restoreAccountRelics(w.localSeat);
 const grant=()=>native.companionGrants.owners.get(p)?.get('summon_stone_golem');let watched:Actor|undefined;
 const record=(phase:string,a:Actor,args:unknown[]=[])=>{if(a===watched)events.push({phase,body:id(a),dead:a.dead,life:a.life,args});};
 for(const name of ['kill','relevelActor','bakeMinionOwnerStats','presenceMoment','clutchOnDeath','onSquadDeath']){
  const original=native[name];native[name]=function(a:Actor,...args:any[]){record(name,a,name==='kill'?[args[0]??false]:name==='relevelActor'?[args[0]]:name==='presenceMoment'?[args[0]]:[]);return original.call(this,a,...args);};
 }
 for(const [owner,name,label]of [[w.guardArts,'clear','guard-clear'],[w.satellites,'retire','satellites-retire'],[native.auroras,'retire','auroras-retire'],[native.guardians,'retire','guardians-retire'],[native.creepers,'retire','creepers-retire']] as const){
  const original=(owner as any)[name];(owner as any)[name]=function(a:Actor,...args:any[]){record(label,a);return original.call(this,a,...args);};
 }
 SIM_TAP.current={onDeath:a=>record('death-tap',a)};
 const body=(a:Actor|undefined)=>a?{identity:id(a),dead:a.dead,downed:a.downed,level:a.level,owner:id(a.owner),life:a.life,maxLife:a.maxLife(),radius:a.radius,
  source:a.sourceSkillId,relic:a.summonInst?.relicSource,skills:a.skills.map(s=>s&&{identity:id(s),def:s.def.id,level:s.level}),
  sources:a.sheet.sourceNames().map(key=>[key,a.sheet.getSourceMods(key)]),inRoster:w.actors.includes(a)}:null;
 const observe=(label:string)=>{const r=grant();rows.push(JSON.parse(JSON.stringify({label,time:w.time,ownerLevel:p.level,accountEnabled:w.account.reliquary.enabled,rank:w.account.reliquary.rank,
  grant:r?{identity:id(r),inst:id(r.inst),level:r.inst.level,source:r.inst.grantedBy,relic:r.inst.relicSource,remaining:r.remaining,body:body(r.body)}:null,
  watched:body(watched),events,kills:w.kills,drops:w.drops.length,orbs:w.orbs.length,experience:m.xp})));};
 w.recalcPlayer();observe('authored-relic-prepares-persistent-grant-without-spawning');assert(grant()&&!grant().body);
 native.updateCompanionGrants(0);watched=grant().body;assert(watched);w.actors=w.actors.filter(a=>a===p||a===watched);observe('original-update-spawns-real-follower');
 watched.life=watched.maxLife()*.4;const originalBody=watched,originalInst=grant().inst;
 w.account.reliquary.rank=7;w.recalcPlayer();assert.equal(grant().body,originalBody);assert.equal(grant().inst,originalInst);near(watched.life/watched.maxLife(),.4);
 observe('account-build-refresh-preserves-body-and-wound-fraction');
 p.level=18;w.recalcPlayer();assert.equal(watched.level,p.level);near(watched.life/watched.maxLife(),.4);observe('keeper-level-rebuild-relevels-and-rebakes-real-body');
 const life=watched.life;w.recalcPlayer();near(watched.life,life);observe('repeated-rebuild-does-not-heal-follower');
 const killedBefore=w.kills,dropsBefore=w.drops.length,orbsBefore=w.orbs.length;
 events.length=0;w.account.reliquary.enabled=false;w.recalcPlayer();assert(!grant());assert(watched.dead);assert.equal(w.kills,killedBefore);assert.equal(w.drops.length,dropsBefore);assert.equal(w.orbs.length,orbsBefore);
 assert(events.some((e:any)=>e.phase==='kill'&&e.args[0]===true));assert(events.some((e:any)=>e.phase==='death-tap'&&e.dead));
 observe('disabled-grant-runs-silent-world-retirement-and-owned-cleanup');
 const eventCount=events.length;w.recalcPlayer();assert.equal(events.length,eventCount);observe('already-retired-body-is-not-killed-twice');
 w.account.reliquary.enabled=true;w.recalcPlayer();assert(grant()&&!grant().body);assert.notEqual(grant().inst,originalInst);observe('reenabled-grant-gets-new-instance-before-spawn');
 native.updateCompanionGrants(0);assert(grant().body&&grant().body!==originalBody);observe('reenabled-update-spawns-new-body');
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-companion-world-build-draft/v1',notes:'Real authored Unquarried Idol follower; actual World callbacks recorded without replacement. This is not coverage of every World.kill branch or durable acknowledgement.',rows}),{flag:'wx'});
}finally{SIM_TAP.current=null;restore();}
