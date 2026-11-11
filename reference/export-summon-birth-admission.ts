// Original-only admission observer. The factory deliberately stops at the body
// boundary; diagnostic kill/presentation hooks isolate admission order. This is
// not evidence for monster construction, death effects or a complete birth.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {StatSheet,mod} from '../src/engine/stats';
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
 course('non-summon-refuses-before-host-operations',c=>{c.inst.def=SKILLS.grit_stance;},c=>{refused(c);assert.equal(c.events.length,0);assert.equal(c.draws,0);});
 course('explicit-delivery-admits-non-summon-host',c=>{const d=c.inst.def.delivery;assert(d.type==='summon');c.overrides={delivery:d};c.inst.def=SKILLS.grit_stance;},c=>{entered(c);assert.equal(c.events[0].id,'skeleton_warrior');});
 course('authored-fixed-form-reaches-original-factory-boundary',()=>{},c=>{entered(c);assert.deepEqual(c.events,[{kind:'factory',id:'skeleton_warrior',level:7,team:'player',ownerIdentity:true,ownerReserved:0}]);assert.equal(c.draws,0);});
 course('authored-capacity-equality-retires-oldest',c=>{for(const n of ['first','second','third'])existing(c,n);},c=>{entered(c);assert.deepEqual(kills(c),['first']);});
 course('capacity-below-limit-keeps-bodies',c=>{existing(c,'first');existing(c,'second');},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('capacity-rounds-half-up',c=>{patch(c,{maxActive:1.5});existing(c,'first');},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('capacity-rounds-below-half-down',c=>{patch(c,{maxActive:1.49});existing(c,'first');},c=>{entered(c);assert.deepEqual(kills(c),['first']);});
 course('capacity-never-below-one',c=>{patch(c,{maxActive:0});},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('tagged-capacity-investment-applies',c=>{patch(c,{maxActive:1});c.caster.sheet.setSource('diagnostic',[mod('minionMaxCount','flat',1,['summon'])]);existing(c,'first');},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('ordinary-capacity-excludes-offspring',c=>{patch(c,{maxActive:1});existing(c,'heir',{summonOffspring:true});},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('offspring-equality-refuses-without-retirement',c=>{patch(c,{maxActive:1});existing(c,'parent');existing(c,'heir',{summonOffspring:true});c.overrides={offspring:{maxActive:1,size:.5,life:.5,damage:.5}};},c=>{refused(c);assert.deepEqual(c.events,[]);});
 course('offspring-admission-keeps-parent-and-siblings',c=>{patch(c,{maxActive:1});existing(c,'parent');existing(c,'heir',{summonOffspring:true});c.overrides={offspring:{maxActive:2,size:.5,life:.5,damage:.5},noReplace:true};},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('companion-grant-does-not-use-manual-capacity',c=>{patch(c,{maxActive:1});existing(c,'manual',{summonInst:makeSkillInstance(c.inst.def,1)});c.inst.companionGrant=true;},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('manual-capacity-excludes-companion-grants',c=>{patch(c,{maxActive:1});const grant=makeSkillInstance(c.inst.def,1);grant.companionGrant=true;existing(c,'grant',{summonInst:grant});},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('capacity-excludes-dead-foreign-and-other-skills',c=>{patch(c,{maxActive:1});existing(c,'dead',{dead:true});existing(c,'foreign',{owner:actor('foreign-owner')});existing(c,'other',{sourceSkillId:'other'});},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('shared-group-retires-other-skill-body',c=>{patch(c,{maxActive:1,poolGroup:'diagnostic-group'});existing(c,'other',{sourceSkillId:'other',sourcePoolGroup:'diagnostic-group'});},c=>{entered(c);assert.deepEqual(kills(c),['other']);});
 course('shared-group-keeps-body-outside-group',c=>{patch(c,{maxActive:1,poolGroup:'diagnostic-group'});existing(c,'same-skill-other-group',{sourcePoolGroup:'other'});},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('no-replace-refuses-at-capacity-before-release',c=>{patch(c,{maxActive:1});existing(c,'first',{manaReserved:20});c.caster.reservedMana=20;c.overrides={noReplace:true};},c=>{refused(c);assert.deepEqual(c.events,[]);assert.equal(c.caster.reservedMana,20);});
 course('no-replace-admits-below-capacity',c=>{existing(c,'first');c.overrides={noReplace:true};},c=>{entered(c);assert.deepEqual(kills(c),[]);});
 course('eviction-releases-contract-before-silent-kill',c=>{patch(c,{maxActive:1});existing(c,'first',{manaReserved:20});c.caster.reservedMana=20;},c=>{entered(c);assert.deepEqual(c.events.slice(0,2),[{kind:'release',name:'first',respawn:false,ownerReserved:20,bodyReserved:20},{kind:'kill',name:'first',silent:true,ownerReserved:0,bodyReserved:0}]);assert.equal(c.caster.reservedMana,0);});
 course('over-capacity-retires-all-captured-bodies-oldest-first',c=>{patch(c,{maxActive:1});for(const n of ['first','second','third'])existing(c,n);},c=>{entered(c);assert.deepEqual(kills(c),['first','second','third']);});
 course('eviction-does-not-rescan-new-live-bodies',c=>{patch(c,{maxActive:1});existing(c,'first');c.onKill=()=>{existing(c,'late');};},c=>{entered(c);assert.deepEqual(kills(c),['first']);assert.equal(c.w.actors.find(a=>a.name==='late')?.dead,false);});
 course('eviction-precedes-reservation-refusal',c=>{patch(c,{maxActive:1,persistent:{reserve:101,respawnTime:2}});existing(c,'first');},c=>{refused(c);assert.deepEqual(kills(c),['first']);assert.equal(c.events.at(-1)?.text,'cannot sustain');});
 course('reservation-at-exact-maximum-is-admitted',c=>{patch(c,{persistent:{reserve:80,respawnTime:2}});c.caster.reservedMana=20;},c=>{entered(c);assert.equal(c.caster.reservedMana,20);assert.equal(c.caster.mana,100);});
 course('reservation-over-maximum-is-refused',c=>{patch(c,{persistent:{reserve:81,respawnTime:2}});c.caster.reservedMana=20;},c=>{refused(c);assert.equal(c.caster.reservedMana,20);assert.deepEqual(c.events,[{kind:'text',text:'cannot sustain'}]);});
 course('toggle-contract-skips-body-reservation-price',c=>{patch(c,{persistent:{reserve:1000,respawnTime:2,toggle:true}});c.caster.reservedMana=100;},c=>{entered(c);assert.equal(c.caster.reservedMana,100);});
 course('reservation-uses-tagged-mana-cost',c=>{patch(c,{persistent:{reserve:60,respawnTime:2}});c.caster.sheet.setSource('diagnostic',[mod('manaCost','more',1,['summon'])]);},c=>{refused(c);assert.equal(c.events[0].text,'cannot sustain');});
 course('reservation-uses-skill-specific-price',c=>{patch(c,{persistent:{reserve:60,respawnTime:2}});c.caster.sheet.setSource('diagnostic',[mod('summonReservation_'+c.inst.def.id,'more',1)]);},c=>{refused(c);});
 course('released-reservation-frees-admission-space',c=>{patch(c,{maxActive:1,persistent:{reserve:90,respawnTime:2}});existing(c,'first',{manaReserved:20});c.caster.reservedMana=30;},c=>{entered(c);assert.equal(c.caster.reservedMana,10);});
 course('throwing-release-keeps-body-and-reservation',c=>{patch(c,{maxActive:1});existing(c,'first',{manaReserved:20});c.caster.reservedMana=20;c.onRelease=()=>{throw Error('release failure');};},c=>{assert.equal(c.error,'Error: release failure');assert.deepEqual(kills(c),[]);assert.equal(c.caster.reservedMana,20);assert.equal(c.w.actors[1].dead,false);});
 course('throwing-kill-keeps-earlier-contract-release',c=>{patch(c,{maxActive:1});existing(c,'first',{manaReserved:20});c.caster.reservedMana=20;c.onKill=()=>{throw Error('kill failure');};},c=>{assert.equal(c.error,'Error: kill failure');assert.equal(c.caster.reservedMana,0);assert.equal(c.w.actors[1].manaReserved,0);assert.equal(c.w.actors[1].dead,false);});
 course('throwing-refusal-text-does-not-restore-retired-body',c=>{patch(c,{maxActive:1,persistent:{reserve:101,respawnTime:2}});existing(c,'first');c.onText=()=>{throw Error('text failure');};},c=>{assert.equal(c.error,'Error: text failure');assert.equal(c.w.actors[1].dead,true);});
 course('weighted-pool-consumes-one-draw-before-factory',c=>{patch(c,{pool:[{id:'skeleton_archer',weight:1}]});},c=>{entered(c);assert.equal(c.draws,1);assert.equal(c.events[0].id,'skeleton_archer');});
 course('explicit-form-skips-weighted-pool-draw',c=>{patch(c,{pool:[{id:'skeleton_archer',weight:1}]});c.overrides={monsterId:'skeleton_warrior'};},c=>{entered(c);assert.equal(c.draws,0);assert.equal(c.events[0].id,'skeleton_warrior');});
 assert.equal(rows.length,34);writeFileSync(process.argv[2],JSON.stringify({scope:'original-summon-birth-admission/v1',limits:['Factory stop and diagnostic kill hooks isolate admission; complete factory and death behavior need separate contact courses.'],rows}),{flag:'wx'});
}finally{restore();}
