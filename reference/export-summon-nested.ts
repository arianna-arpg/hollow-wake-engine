// Original-only nested offspring -> complete body creation. The real factory,
// inheritance, placement and arrival run; diagnostic delivery fields and callback
// failures are explicitly identified. No portable SDK imports are permitted here.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {StatSheet,mod} from '../src/engine/stats';
import {makeSkillInstance,type SkillInstance,type SummonDelivery} from '../src/engine/skills';
import type {AIAction} from '../src/engine/brain';import {SKILLS} from '../src/data/skills';
bootSimEngine();const restore=seedGlobalRandom(0x607e57),rows:unknown[]=[];
type Action=Extract<AIAction,{do:'summon'}>;
type Overrides={pos?:{x:number;y:number};delivery?:SummonDelivery;offspring?:NonNullable<Action['inheritSummon']>};
function fixture(persistent=false){
 const w=makeSimWorld('magician',0x607e57),owner=new Actor('keeper','player',{x:100,y:100});
 owner.sheet=new StatSheet();owner.sheet.setBase('life',100);owner.sheet.setBase('mana',100);owner.life=100;owner.mana=100;owner.level=7;
 const base=SKILLS.summon_skeleton;assert(base.delivery.type==='summon');
 const delivery:SummonDelivery={...base.delivery,maxActive:1,...(persistent?{persistent:{reserve:20,respawnTime:2},poolGroup:'diagnostic-pool',exclusiveGroup:'diagnostic-exclusive',crewOnDeath:[],shell:{lifeFraction:.5,arcDeg:90,regenDelay:2,regenFraction:.1,reformFraction:.3,strikeSkill:'cleave',strikeInterval:1},crewMods:[mod('armor','flat',2)]}:{})};
 const inst=makeSkillInstance({...base,delivery},1);owner.skills=[inst];w.actors=[owner];w.walk=null;w.time=17;
 const host=w as unknown as {spawnMinion(a:Actor,i:SkillInstance,o?:Overrides):Actor|null;presenceArrival(a:Actor,c:Actor,i:SkillInstance):boolean};
 const parent=host.spawnMinion(owner,inst,{pos:{x:160,y:140}});assert(parent);assert(w.actors.includes(parent));
 const action:Action={do:'summon',monster:'skeleton_warrior',count:2,ring:24,inheritSummon:{maxActive:3,size:.5,life:.6,damage:.7}};
 const c={w,owner,inst,parent,host,action,draws:0,factoryCalls:0,births:[] as Actor[],events:[] as Record<string,unknown>[],error:undefined as string|undefined,onFactory:undefined as ((ordinal:number)=>void)|undefined,onArrival:undefined as ((body:Actor,ordinal:number)=>void)|undefined};
 const factory=w.createMonster.bind(w),arrival=host.presenceArrival.bind(w);
 w.createMonster=(...args)=>{c.factoryCalls++;c.events.push({kind:'factory',ordinal:c.factoryCalls,id:args[0],ownerBorrowed:args[3]===owner});c.onFactory?.(c.factoryCalls);const body=factory(...args);c.births.push(body);return body;};
 host.presenceArrival=(a,o,i)=>{c.events.push({kind:'arrival',id:a.id,published:w.actors.includes(a),ownerBorrowed:o===owner,sourceBorrowed:i===inst});const result=arrival(a,o,i);c.onArrival?.(a,c.births.length);return result;};
 return c;
}
type Context=ReturnType<typeof fixture>;
function snap(a:Actor){return{id:a.id,defId:a.defId,dead:a.dead,ownerId:a.owner?.id,source:a.sourceSkillId,pool:a.sourcePoolGroup,offspring:a.summonOffspring,life:a.life,maxLife:a.maxLife(),mana:a.mana,reserved:a.manaReserved,lifespan:a.lifespan,pos:a.pos,radius:a.radius,shell:!!a.shellGuard,death:a.summonDeathActions,skills:a.skills.map(i=>i?.def.id??null),sources:a.sheet.sourceNames().map(name=>({name,mods:a.sheet.getSourceMods(name)}))};}
function born(c:Context,n:number){assert.equal(c.error,undefined);assert.equal(c.births.length,n);for(const a of c.births){assert(c.w.actors.includes(a));assert.equal(a.owner,c.owner);assert.equal(a.summonInst,c.inst);assert.equal(a.sourceSkillId,c.inst.def.id);assert.equal(a.summonOffspring,true);assert.equal(a.life,a.maxLife());assert.equal(a.manaReserved,0);}assert(c.w.actors.includes(c.parent));}
function course(label:string,setup:(c:Context)=>void,check:(c:Context)=>void,persistent=false){const c=fixture(persistent);setup(c);const random=Math.random;Math.random=()=>{c.draws++;return random();};try{c.w.spawnSummonOffspring(c.parent,c.action);}catch(e){c.error=String(e);}finally{Math.random=random;}check(c);rows.push({label,error:c.error,draws:c.draws,factoryCalls:c.factoryCalls,ownerReserved:c.owner.reservedMana,ownerMana:c.owner.mana,parent:snap(c.parent),births:c.births.map(snap),world:c.w.actors.map(a=>a.id),events:c.events});}
try{
 course('real-parent-creates-two-real-children',()=>{},c=>{born(c,2);assert(!c.parent.dead);for(const a of c.births){assert.equal(a.lifespan,8);assert.equal(a.defId,'skeleton_warrior');assert(Math.abs(Math.hypot(a.pos.x-c.parent.pos.x,a.pos.y-c.parent.pos.y)-24)<1e-9);}assert(Math.abs(c.births[0].pos.x+c.births[1].pos.x-2*c.parent.pos.x)<1e-9);});
 course('child-cap-does-not-evict-the-parent',c=>{c.action.count=3;c.action.inheritSummon!.maxActive=2;},c=>{born(c,2);assert(!c.parent.dead);assert.equal(c.factoryCalls,2);});
 course('dead-parent-can-create-real-children',c=>{c.parent.dead=true;},c=>{born(c,2);assert(c.parent.dead);});
 course('unseated-source-refuses-real-factory',c=>{c.owner.skills=[];},c=>{born(c,0);assert.equal(c.factoryCalls,0);assert.equal(c.draws,0);});
 course('zero-count-retains-original-angle-draw',c=>{c.action.count=0;},c=>{born(c,0);assert.equal(c.draws,1);});
 course('zero-ring-and-life-reach-real-body',c=>{c.action.ring=0;c.action.lifespan=0;},c=>{born(c,2);for(const a of c.births){assert.deepEqual(a.pos,c.parent.pos);assert.equal(a.lifespan,0);}});
 course('persistent-shell-parent-retains-its-contract',()=>{},c=>{born(c,2);assert.equal(c.owner.reservedMana,20);assert.equal(c.parent.manaReserved,20);assert(c.parent.shellGuard);assert(c.owner.summonShells?.has(c.parent));for(const a of c.births){assert(!a.shellGuard);assert(!c.owner.summonShells?.has(a));assert.equal(a.sourcePoolGroup,undefined);assert.equal(a.summonDeathActions,undefined);assert.equal(a.sheet.getSourceMods('summon:crew')?.[0]?.value,2);}},true);
 course('arrival-callback-changes-the-next-real-child',c=>{c.action.ring=0;c.onArrival=(_body,n)=>{if(n===1){c.parent.pos={x:240,y:260};c.action.monster='skeleton_archer';c.action.lifespan=3;c.action.count=9;}};},c=>{born(c,2);assert.equal(c.births[0].defId,'skeleton_warrior');assert.equal(c.births[1].defId,'skeleton_archer');assert.deepEqual(c.births[0].pos,{x:160,y:140});assert.deepEqual(c.births[1].pos,{x:240,y:260});assert.equal(c.births[1].lifespan,3);});
 course('second-factory-failure-retains-first-real-child',c=>{c.action.count=3;c.onFactory=n=>{if(n===2)throw Error('diagnostic second factory failure');};},c=>{assert.equal(c.error,'Error: diagnostic second factory failure');assert.equal(c.factoryCalls,2);assert.equal(c.births.length,1);assert(c.w.actors.includes(c.births[0]));assert(!c.parent.dead);assert.equal(c.births[0].summonOffspring,true);});
 course('real-offspring-cannot-reproduce',c=>{const before=c.w.actors.length;c.w.spawnSummonOffspring(c.parent,{...c.action,count:1});assert.equal(c.w.actors.length,before+1);const child=c.births[0];assert(child);c.parent=child;c.births=[];c.factoryCalls=0;c.events=[];},c=>{born(c,0);assert.equal(c.draws,0);assert.equal(c.factoryCalls,0);});
 assert.equal(rows.length,10);writeFileSync(process.argv[2],JSON.stringify({scope:'original-summon-nested/v1',limits:['Real original skeleton parent and child factories with diagnostic action shapes and optional persistent shell configuration.','Direct offspring command execution does not qualify all AI dispatch or death scheduling.','Callback changes and factory exceptions are deliberately injected; this course preserves their observable ordering.'],rows}),{flag:'wx'});
}finally{restore();}
