// Original-only admission observer. The factory deliberately stops at the body
// boundary; diagnostic kill/presentation hooks isolate admission order. This is
// not evidence for monster construction, death effects or a complete birth.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {StatSheet} from '../src/engine/stats';
import {makeSkillInstance,type SkillInstance,type SummonDelivery} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
bootSimEngine();const restore=seedGlobalRandom(0x51b170),rows:unknown[]=[];
type Overrides={monsterId?:string;pos?:{x:number;y:number};delivery?:SummonDelivery;dmgMult?:number;noReplace?:boolean;offspring?:{maxActive:number;size:number;life:number;damage:number}};
function actor(name:string){const a=new Actor(name,'player',{x:0,y:0});a.sheet=new StatSheet();a.sheet.setBase('life',100);a.sheet.setBase('mana',100);a.life=100;a.mana=100;a.level=7;return a;}
function fixture(){
 const w=makeSimWorld('magician',0x51b170),caster=actor('keeper'),base=SKILLS.summon_skeleton;
 assert.equal(base.delivery.type,'summon');
 const inst=makeSkillInstance({...base,delivery:{...base.delivery} as SummonDelivery},1);caster.skills=[inst];w.actors=[caster];w.walk=null;
 const host=w as unknown as {spawnMinion(a:Actor,i:SkillInstance,o?:Overrides):Actor|null;releaseContract(a:Actor,respawn:boolean):void};
 const events:Record<string,unknown>[]=[],c={w,caster,inst,host,events,overrides:undefined as Overrides|undefined,result:undefined as Actor|null|undefined,error:undefined as string|undefined,draws:0,onKill:undefined as ((a:Actor)=>void)|undefined,onRelease:undefined as ((a:Actor)=>void)|undefined,onText:undefined as (()=>void)|undefined};
 const release=host.releaseContract.bind(w);
 host.releaseContract=(a,respawn)=>{events.push({kind:'release',name:a.name,respawn,ownerReserved:caster.reservedMana,bodyReserved:a.manaReserved});c.onRelease?.(a);return release(a,respawn);};
 w.kill=(a,silent)=>{events.push({kind:'kill',name:a.name,silent,ownerReserved:caster.reservedMana,bodyReserved:a.manaReserved});c.onKill?.(a);a.dead=true;};
 w.text=(_p,text)=>{events.push({kind:'text',text});c.onText?.();};
 w.createMonster=(id,level,team,owner)=>{events.push({kind:'factory',id,level,team,ownerIdentity:owner===caster,ownerReserved:caster.reservedMana});throw Error('birth factory boundary');};
 return c;
}
type Context=ReturnType<typeof fixture>;
const patch=(c:Context,fields:Partial<SummonDelivery>)=>{assert(c.inst.def.delivery.type==='summon');c.inst.def={...c.inst.def,delivery:{...c.inst.def.delivery,...fields}};};
function existing(c:Context,name:string,fields:Partial<Actor>={}){const a=actor(name);a.owner=c.caster;a.sourceSkillId=c.inst.def.id;a.summonInst=c.inst;Object.assign(a,fields);c.w.actors.push(a);return a;}
function invoke(c:Context){const random=Math.random;Math.random=()=>{c.draws++;return random();};try{c.result=c.host.spawnMinion(c.caster,c.inst,c.overrides);}catch(e){c.error=String(e);}finally{Math.random=random;}}
const entered=(c:Context)=>{assert.equal(c.error,'Error: birth factory boundary');assert.equal(c.events.filter(e=>e.kind==='factory').length,1);};
const refused=(c:Context)=>{assert.equal(c.error,undefined);assert.equal(c.result,null);assert(!c.events.some(e=>e.kind==='factory'));};
const kills=(c:Context)=>c.events.filter(e=>e.kind==='kill').map(e=>e.name);
function course(label:string,setup:(c:Context)=>void,check:(c:Context)=>void){const c=fixture();setup(c);invoke(c);check(c);rows.push({label,error:c.error,result:c.result===null?'null':'factory-not-returned',draws:c.draws,reserved:c.caster.reservedMana,mana:c.caster.mana,actors:c.w.actors.map(a=>({name:a.name,dead:a.dead,reserved:a.manaReserved,offspring:a.summonOffspring})),events:c.events});}
try{
 course('non-summon-explicit-override-refuses-before-host-effects',c=>{c.overrides={delivery:SKILLS.grit_stance.delivery as unknown as SummonDelivery};},c=>{refused(c);assert.deepEqual(c.events,[]);});
 course('null-override-falls-back-to-instance-delivery',c=>{c.overrides={delivery:null as unknown as SummonDelivery};},c=>{entered(c);assert.equal(c.events[0].id,'skeleton_warrior');});
 course('explicit-override-and-type-are-read-once',c=>{assert(c.inst.def.delivery.type==='summon');const d={...c.inst.def.delivery};Object.defineProperty(d,'type',{get(){c.events.push({kind:'override-type'});return 'summon';}});c.overrides={};Object.defineProperty(c.overrides,'delivery',{get(){c.events.push({kind:'override-delivery'});return d;}});},c=>{entered(c);assert.deepEqual(c.events.map(e=>e.kind),['override-delivery','override-type','factory']);});
 course('delivery-kind-is-not-rechecked-after-eviction-callback',c=>{patch(c,{maxActive:1});const d=c.inst.def.delivery;assert(d.type==='summon');c.overrides={delivery:d};existing(c,'first');c.onKill=()=>{(d as {type:string}).type='aura';};},c=>{entered(c);assert.deepEqual(kills(c),['first']);});
 assert.equal(rows.length,4);writeFileSync(process.argv[2],JSON.stringify({scope:'original-summon-birth-boundary/v1',limits:['Diagnostic delivery overrides/getters and admission-only factory stop; this pins the entry boundary and read ordering, not arbitrary hostile content acceptance.'],rows}),{flag:'wx'});
}finally{restore();}
