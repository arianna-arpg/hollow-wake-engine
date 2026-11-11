// Original offspring orchestration only. The spawn port records borrowed inputs
// and deliberate failures; real body construction belongs to the contact course.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {makeSkillInstance,type SkillInstance,type SummonDelivery} from '../src/engine/skills';
import type {AIAction} from '../src/engine/brain';import {SKILLS} from '../src/data/skills';import {mod} from '../src/engine/stats';
bootSimEngine();const restore=seedGlobalRandom(0x0ff517),rows:unknown[]=[];
type Action=Extract<AIAction,{do:'summon'}>;type Overrides={monsterId?:string;pos?:{x:number;y:number};delivery?:SummonDelivery;offspring?:NonNullable<Action['inheritSummon']>};
function fixture(){const w=makeSimWorld('magician',0x0ff517),owner=new Actor('keeper','player',{x:100,y:100}),parent=new Actor('parent','player',{x:160,y:140}),base=SKILLS.summon_skeleton;assert(base.delivery.type==='summon');const inst=makeSkillInstance({...base,delivery:{...base.delivery}},1),act:Action={do:'summon',monster:'skeleton_warrior',inheritSummon:{maxActive:3,size:.5,life:.6,damage:.7}};owner.skills=[inst];parent.owner=owner;parent.summonInst=inst;w.actors=[owner,parent];const host=w as unknown as {spawnMinion(a:Actor,i:SkillInstance,o?:Overrides):Actor|null};
 const calls:{owner:Actor;inst:SkillInstance;overrides:Overrides}[]=[],c={w,owner,parent,inst,act,calls,draws:0,error:undefined as string|undefined,onSpawn:undefined as ((ordinal:number,o:Overrides)=>void)|undefined};host.spawnMinion=(a,i,o)=>{assert(o);calls.push({owner:a,inst:i,overrides:o});c.onSpawn?.(calls.length,o);return null;};return c;}
type Context=ReturnType<typeof fixture>;
function course(label:string,setup:(c:Context)=>void,check:(c:Context)=>void){const c=fixture();setup(c);const random=Math.random;Math.random=()=>{c.draws++;return random();};try{c.w.spawnSummonOffspring(c.parent,c.act);}catch(e){c.error=String(e);}finally{Math.random=random;}check(c);rows.push({label,error:c.error,draws:c.draws,calls:c.calls.map(r=>({ownerBorrowed:r.owner===c.owner,instanceBorrowed:r.inst===c.inst,shapeBorrowed:r.overrides.offspring===c.act.inheritSummon,overrides:r.overrides}))});}
const refused=(c:Context)=>{assert.equal(c.error,undefined);assert.equal(c.calls.length,0);assert.equal(c.draws,0);};
const spawned=(c:Context,n=1)=>{assert.equal(c.error,undefined);assert.equal(c.calls.length,n);assert.equal(c.draws,1);for(const r of c.calls){assert.equal(r.owner,c.owner);assert.equal(r.inst,c.inst);assert.equal(r.overrides.offspring,c.act.inheritSummon);}};
try{
 course('authored-parent-default-count-ring-and-lifetime',()=>{},c=>{spawned(c);const o=c.calls[0].overrides;assert.equal(o.monsterId,'skeleton_warrior');assert.equal(o.delivery?.duration,8);assert(o.pos);assert(Math.abs(Math.hypot(o.pos.x-160,o.pos.y-140)-28)<1e-10);});
 course('missing-owner-refuses',c=>{c.parent.owner=undefined;},refused);
 course('dead-owner-refuses',c=>{c.owner.dead=true;},refused);
 course('missing-source-instance-refuses',c=>{c.parent.summonInst=undefined;},refused);
 course('missing-inheritance-shape-refuses',c=>{c.act.inheritSummon=undefined;},refused);
 course('offspring-cannot-become-parent',c=>{c.parent.summonOffspring=true;},refused);
 course('non-summon-source-refuses',c=>{c.inst.def=SKILLS.grit_stance;},refused);
 course('unseated-source-refuses',c=>{c.owner.skills=[];},refused);
 course('same-definition-clone-is-not-source-instance',c=>{c.owner.skills=[makeSkillInstance(c.inst.def,1)];},refused);
 course('dead-parent-may-run-death-choreography',c=>{c.parent.dead=true;},c=>{spawned(c);});
 course('fractional-count-rounds-half-up',c=>{c.act.count=2.5;},c=>{spawned(c,3);});
 course('negative-count-still-samples-base-angle',c=>{c.act.count=-2;},c=>{spawned(c,0);});
 course('zero-count-still-samples-base-angle',c=>{c.act.count=0;},c=>{spawned(c,0);});
 course('zero-ring-keeps-exact-parent-position',c=>{c.act.ring=0;},c=>{spawned(c);assert.deepEqual(c.calls[0].overrides.pos,c.parent.pos);assert.notEqual(c.calls[0].overrides.pos,c.parent.pos);});
 course('zero-lifespan-is-preserved-in-delivery',c=>{c.act.lifespan=0;},c=>{spawned(c);assert.equal(c.calls[0].overrides.delivery?.duration,0);});
 course('null-birth-result-does-not-stop-later-attempts',c=>{c.act.count=2;},c=>{spawned(c,2);});
 course('throwing-second-birth-retains-earlier-call',c=>{c.act.count=3;c.onSpawn=n=>{if(n===2)throw Error('second birth failed');};},c=>{assert.equal(c.error,'Error: second birth failed');assert.equal(c.calls.length,2);assert.equal(c.draws,1);});
 course('contracts-and-shell-are-removed-from-shallow-copy',c=>{assert(c.inst.def.delivery.type==='summon');c.inst.def={...c.inst.def,delivery:{...c.inst.def.delivery,persistent:{reserve:30,respawnTime:2},poolGroup:'group',exclusiveGroup:'exclusive',crewOnDeath:[],shell:{lifeFraction:.5,arcDeg:90,regenDelay:2,regenFraction:.1,reformFraction:.3,strikeSkill:'cleave',strikeInterval:1},crewMods:[mod('armor','flat',2)]}};},c=>{spawned(c);const d=c.inst.def.delivery,o=c.calls[0].overrides.delivery;assert(d.type==='summon');assert(o);assert.notEqual(o,d);for(const key of ['persistent','poolGroup','exclusiveGroup','crewOnDeath','shell'] as const){assert.equal(o[key],undefined);assert.notEqual(d[key],undefined);}assert.equal(o.crewMods,d.crewMods);});
 course('later-birth-rereads-action-and-position-with-captured-owner-source',c=>{c.act.count=2;c.act.ring=0;c.onSpawn=n=>{if(n===1){c.parent.pos={x:240,y:260};c.parent.owner=undefined;c.parent.summonInst=undefined;c.act.count=9;c.act.monster='skeleton_archer';c.act.lifespan=3;}};},c=>{spawned(c,2);assert.deepEqual(c.calls[0].overrides.pos,{x:160,y:140});assert.deepEqual(c.calls[1].overrides.pos,{x:240,y:260});assert.equal(c.calls[0].overrides.monsterId,'skeleton_warrior');assert.equal(c.calls[1].overrides.monsterId,'skeleton_archer');assert.equal(c.calls[1].overrides.delivery?.duration,3);});
 assert.equal(rows.length,19);writeFileSync(process.argv[2],JSON.stringify({scope:'original-summon-offspring/v1',limits:['Diagnostic spawn port observes orchestration only; body construction and retirement need separate courses.'],rows}),{flag:'wx'});
}finally{restore();}
