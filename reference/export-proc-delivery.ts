// Observe the original complete proc executor and cast payload, before extraction.
// Every wrapper calls the actual method. A named course can be selected only for
// focused negative controls; normal baseline capture executes every course.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import {StatSheet,mod} from '../src/engine/stats';
import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';
import {PROC_LIST,PROC_RIDER_LIST,procPowerStat,procRiderStat,type ProcDef,type ProcEffect,type ProcCastSpec} from '../src/data/procs';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {STATUS_DEFS} from '../src/engine/status';
bootSimEngine();
assert.equal(PROC_LIST.length,147);
const selected=new Map<string,ProcDef>();for(const proc of PROC_LIST)if(!selected.has(proc.effect.type))selected.set(proc.effect.type,proc);
assert.equal(selected.size,21);
const summon=selected.get('summon')!.effect;assert.equal(summon.type,'summon');
const birth:ProcEffect={type:'birth',birth:{type:'birth',monsterId:(summon as Extract<ProcEffect,{type:'summon'}>).monsterId,count:[1,1],cap:2,duration:5,scatter:0}};
selected.set('birth',{id:'__delivery_birth',name:'Birth boundary',color:'#abcdef',trigger:'hit',effect:birth});
const rows:any[]=[];let origins=new WeakMap<object,string>();
function pack(v:any,seen=new WeakMap<object,string>(),at='$'):any{
 if(v===undefined)return {$undefined:true};
 if(typeof v==='number'&&(!Number.isFinite(v)||Object.is(v,-0)))return {$number:Object.is(v,-0)?'-0':String(v)};
 if(typeof v==='function')return {$function:v.name};
 if(v===null||typeof v!=='object')return v;
 if(v instanceof Actor)return {$actor:v.id};
 if(seen.has(v))return {$ref:seen.get(v)};seen.set(v,at);
 const origin=origins.has(v)?{$origin:origins.get(v)}:{};
 if(v instanceof Set)return {...origin,$set:[...v].map((x,i)=>pack(x,seen,at+'/'+i))};
 if(v instanceof Map)return {...origin,$map:[...v].map(([k,x],i)=>[pack(k,seen,at+'/'+i+'/key'),pack(x,seen,at+'/'+i+'/value')])};
 if(Array.isArray(v))return v.map((x,i)=>pack(x,seen,at+'/'+i));
 if(v.def&&Array.isArray(v.sockets))return {...origin,skill:v.def.id,level:v.level,bonusLevels:pack(v.bonusLevels,seen,at+'/bonus'),treeNodes:pack(v.treeNodes,seen,at+'/tree'),sockets:pack(v.sockets,seen,at+'/sockets'),grafts:pack(v.grafts,seen,at+'/grafts'),extraMods:pack(v.extraMods,seen,at+'/extra'),state:pack(v.state,seen,at+'/state'),procChainDepth:pack(v.procChainDepth,seen,at+'/depth')};
 return {...origin,...Object.fromEntries(Object.entries(v).map(([k,x])=>[k,pack(x,seen,at+'/'+k)]))};
}
type Rig={w:World;p:Actor;target:Actor;near:Actor;ally:Actor;inst:SkillInstance;actors:Actor[];cleanup:(()=>void)[];
 add:()=>Actor;
 step:(name:string,fn:()=>unknown,expectedError?:string)=>void;
 onCall?:(name:string,args:any[],phase:'before'|'after',value?:any)=>void};
function course(name:string,run:(r:Rig)=>void,drawSeed=0xc047){
 if(process.argv[3]&&process.argv[3]!==name)return;
 const restore=seedGlobalRandom(0xc047),w=makeSimWorld('warrior',0xc047),p=w.player;
 origins=new WeakMap();let born=100,instanceNumber=0,observing=false;const events:any[]=[],draws:number[]=[],steps:any[]=[];
 const actors:Actor[]=[];let r:Rig;
 const state=()=>pack({time:w.time,actorOrder:w.actors.map(a=>a.id),actors:[...new Set([...actors,...w.actors])].map(a=>({id:a.id,team:a.team,tier:a.tier,level:a.level,dead:a.dead,life:a.life,mana:a.mana,es:a.es,esDelay:a.esDelay,esBroke:a.esBroke,poise:a.poise,poiseBroken:a.poiseBroken,endurance:a.endurance,ward:a.ward,pos:a.pos,radius:a.radius,hitFlash:a.hitFlash,hitFlashType:a.hitFlashType,invulnerable:a.invulnerable,untargetable:a.untargetable,owner:a.owner,sourceSkillId:a.sourceSkillId,lifelineId:a.lifelineId,lifespan:a.lifespan,bornOf:a.bornOf,summonInst:a.summonInst,skills:a.skills,charges:a.charges,buffs:a.buffs,statuses:a.statuses,cooldowns:a.cooldowns,gainEvents:a.gainEvents,procCues:a.procCues,procCuePulses:a.procCuePulses,procPopEvents:a.procPopEvents})),pending:w['pendingBursts'],projectiles:w.projectiles.map(q=>({inst:q.inst,caster:q.caster,pos:q.pos,dir:q.dir,hits:q.hits,flat:q.flat,speed:q.speed,pierce:q.pierce})),flashes:w.flashes,texts:w.texts,doodads:w.doodads,fog:w['fog']});
 function wrap(object:any,key:string,label=key){const native=object[key];assert.equal(typeof native,'function',label);object[key]=function(...args:any[]){
  if(key==='spawnProjectile'&&!origins.has(args[1]))origins.set(args[1],'payload-'+(++instanceNumber));
  if(observing){events.push({kind:label,phase:'before',args:pack(args),state:state()});r.onCall?.(label,args,'before');}
  try{const value=native.apply(this,args);if(key==='createMonster'){value.id=born++;value.noBounty=true;}
   if(observing){events.push({kind:label,phase:'after',value:pack(value),state:state()});r.onCall?.(label,args,'after',value);}return value;
  }catch(error){if(observing)events.push({kind:label,phase:'throw',error:error instanceof Error?error.message:String(error),state:state()});throw error;}
 };}
 function configure(a:Actor,id:number){
  a.id=id;a.sheet=new StatSheet();for(const[k,v]of Object.entries({life:1000,mana:100,energyShield:100,poise:100,endurance:100,critChance:0,accuracy:100000,evasion:0,blockChance:0,armor:0}))a.sheet.setBase(k,v);
  a.life=500;a.mana=2;a.es=3;a.poise=4;a.endurance=5;a.ward=6;a.dead=false;a.tier=0;a.level=5;a.radius=12;a.skills.fill(null);a.buffs.clear();a.charges.clear();a.statuses=[];a.cooldowns.clear();a.gainEvents=[];a.condRose=[];a.healedSince=0;a.gasped=false;a.procCues=undefined;a.procCuePulses=[];a.procPopEvents=[];a.noBounty=true;a.stationary=true;a.brain=undefined;
  actors.push(a);for(const key of ['gainCharge','addBuff','healBy','gainWard','gainEndurance','gainPoise','gainEs','removeBuff','endStatus','applyStatus'])wrap(a,key,'actor-'+id+'-'+key);
 }
 configure(p,1);p.pos={x:700,y:700};p.facing=.4;
 const target=new Actor('target','enemy',{x:730,y:700}),near=new Actor('near','enemy',{x:760,y:700}),ally=new Actor('ally','player',{x:710,y:700});
 configure(target,2);configure(near,3);configure(ally,4);w.actors=[...actors];w.time=10;w.zone.level=8;w.metaProgressionActive=()=>false;
 const inst=makeSkillInstance({...SKILLS.cleave,id:'__delivery_strike',tags:['attack','melee','physical'],baseDamage:{physical:[10,10]},requirements:undefined},1);origins.set(inst,'trigger');p.skills=[inst,makeSkillInstance(SKILLS.firebolt)];origins.set(p.skills[1]!,'bar-firebolt');
 p.cooldowns=new Map([[inst.def.id,10],['firebolt',5],['unslotted',1]]);
 for(const key of ['executeProc','fireProcRiders','resolveHit','sweepDefenseEvents','rollOwnProcs','strikeSurfaces','castProcPayload','pushActor','spawnLightwell','plantVent','createMonster','conjurationLifeline','forwardSummonSockets','birthAt','spawnProjectile','executeSkill','kill','text','heldSkillInst','enemiesOf','clampPos'])wrap(w,key);
 const random=mulberry32(drawSeed);Math.random=()=>{const value=random();if(observing)draws.push(value);return value;};
 r={w,p,target,near,ally,inst,actors,cleanup:[],add:()=>{const a=new Actor('extra','enemy',{x:790,y:700});configure(a,actors.length+1);w.actors.push(a);return a;},step:(label,fn,expectedError)=>{
  observing=true;const start=events.length,drawStart=draws.length,before=state();let value:unknown,error:string|null=null;
  try{value=fn();}catch(e){error=e instanceof Error?e.message:String(e);}finally{observing=false;}
  steps.push({name:label,expectedError:expectedError??null,error,value:pack(value),before,after:state(),events:events.slice(start),draws:draws.slice(drawStart)});
 }};
 try{run(r);rows.push({name,drawSeed,steps});}finally{for(const cleanup of r.cleanup.reverse())cleanup();restore();}
}
function proc(type:string,patch:any={}):ProcDef{const base=selected.get(type);assert(base,'Unknown branch '+type);return {...base,effect:{...base.effect,...patch}};}
function prepare(r:Rig,p:ProcDef,power=2){
 r.p.sheet.setBase(procPowerStat(p.id),power);assert.equal(r.p.sheet.get(procPowerStat(p.id)),Math.max(0,power));
 const fx=p.effect;if(fx.type==='removeBuff')for(const id of Array.isArray(fx.buff)?fx.buff:[fx.buff])r.p.addBuff({type:'buff',id,duration:10,mods:[mod('moveSpeed','increased',.1)]});
 if(fx.type==='cleanse')for(const id of [...new Set([...(fx.statuses??[]),'burn','stun','chill'])])if(STATUS_DEFS[id])r.p.applyStatus(id,4,1,'fixture');
}
function execute(r:Rig,p:ProcDef,options:{inst?:SkillInstance|null;target?:Actor|null;power?:number;depth?:number;aim?:{x:number;y:number};error?:string}={}){
 prepare(r,p,options.power??2);r.step('execute',()=>r.w['executeProc'](p,r.p,options.inst===undefined?r.inst:options.inst,options.target===undefined?r.target:options.target,options.depth??2,options.aim??{x:740,y:700}),options.error);
}
for(const p of PROC_LIST)course('authored-'+p.id,r=>{execute(r,p);if(p.effect.type==='delayedBurst'){const when=r.w['pendingBursts'][0].when;r.step('due',()=>{r.w.time=when;r.w['updatePendingBursts']();});}});
course('programmatic-birth',r=>execute(r,proc('birth')));
for(const type of selected.keys())for(const missing of ['instance','target'])course(type+'-missing-'+missing,r=>execute(r,proc(type),missing==='instance'?{inst:null}:{target:null}));
for(const type of ['extraHit','heal','burst','cast','ward'])for(const power of [0,-1,.5])course(type+'-power-'+power,r=>execute(r,proc(type),{power}));
for(const type of ['gainCharge','buff','heal','ward'])for(const cue of ['disabled','silent','custom'])course(type+'-cue-'+cue,r=>{const p=proc(type);if(cue==='disabled')p.procCue=false;if(cue==='silent')p.announceName=false;if(cue==='custom')p.procCue={profile:'mend',color:'#123456'};execute(r,p);});
course('buff-stored-cue-disabled',r=>{const p=proc('buff');assert(p.effect.type==='buff');p.effect={...p.effect,buff:{...p.effect.buff,storedCue:false}};execute(r,p);});
course('power-skill-context',r=>{const p=proc('heal',{flat:10,pctMax:0});r.inst.extraMods=[mod(procPowerStat(p.id),'flat',1,['melee'])];execute(r,p,{power:1});});
course('gainCharge-capped',r=>{const p=proc('gainCharge');assert(p.effect.type==='gainCharge');r.p.charges.set(p.effect.charge,p.effect.max);execute(r,p,{power:1});});
course('buff-scaled-duration',r=>{r.p.sheet.setBase('effectDuration',2);execute(r,proc('buff'),{power:1});});
course('summon-forwarded-support',r=>{assert(SUPPORTS.crushing_impact);r.inst.sockets[0]={def:SUPPORTS.crushing_impact,level:3};execute(r,proc('summon'),{power:1});});
for(const gate of ['dead','untargetable','invulnerable','edge','outside','other-story','shield-break','lethal','absorbed'])course('burst-'+gate,r=>{
 const p=proc('burst',{base:50,perLevel:2,radius:100,damage:'physical'});
 if(gate==='dead')r.target.dead=true;if(gate==='untargetable')r.target.untargetable=true;if(gate==='invulnerable')r.target.invulnerable=true;
 if(gate==='edge'||gate==='outside')r.target.pos.x=700+100+r.target.radius+(gate==='outside'?.01:0);
 if(gate==='other-story')r.target.tier=2;if(gate==='shield-break'){r.target.ward=0;r.target.poise=0;r.target.es=2;}if(gate==='lethal'){r.target.ward=0;r.target.poise=0;r.target.es=0;r.target.life=1;}if(gate==='absorbed')r.target.ward=10000;
 execute(r,p,{power:1});
});
course('burst-live-roster-after-surface',r=>{r.onCall=(kind,_a,phase)=>{if(kind==='strikeSurfaces'&&phase==='after')r.near.team='player';};execute(r,proc('burst',{base:50,perLevel:2,radius:100}));});
course('burst-captured-level',r=>{r.onCall=(kind,_a,phase)=>{if(kind==='strikeSurfaces'&&phase==='after')r.p.level=30;};execute(r,proc('burst',{base:50,perLevel:2,radius:100}));});
course('burst-live-position',r=>{let changed=false;r.onCall=(kind,_a,phase)=>{if(kind==='text'&&phase==='after'&&!changed){changed=true;r.p.pos.x+=1000;}};execute(r,proc('burst',{base:50,perLevel:2,radius:100}));});
course('explosion-target-story',r=>{r.onCall=(kind,_args,phase)=>{if(kind==='enemiesOf'&&phase==='after'){r.target.tier=2;r.near.tier=2;}};execute(r,proc('explosion',{radius:100,damageScale:.5}));});
for(const variant of ['tie','reverse-tie','no-repeat','dead-next','live-origin','fractional-hops','zero-range','negative-hops'])course('arc-'+variant,r=>{
 r.target.pos={x:730,y:700};r.near.pos={x:760,y:700};r.ally.team='enemy';r.ally.pos={x:730,y:730};
 if(variant==='fractional-hops')r.add();
 if(variant==='reverse-tie')r.w.actors=[r.p,r.target,r.ally,r.near];
 if(variant==='dead-next'||variant==='live-origin'){let once=false;r.onCall=(kind,a,phase)=>{if(kind==='resolveHit'&&phase==='after'&&!once){once=true;if(variant==='dead-next')r.near.dead=true;else a[2].pos.x+=1000;}};}
 const fx:any={range:100,hops:variant==='fractional-hops'?2.5:variant==='negative-hops'?-1:4,damageScale:.25};if(variant==='zero-range'){fx.range=0;r.near.pos={...r.target.pos};}
 execute(r,proc('arc',fx),{power:1});
});
for(const force of [-80,0,80])course('displace-force-'+force,r=>execute(r,proc('displace',{force}),{power:1}));
for(const cap of ['below','at','dead','other-owner','other-key','resolved-owner'])course('summon-cap-'+cap,r=>{
 const p=proc('summon',{max:1,duration:4});r.ally.owner=r.p;r.ally.sourceSkillId='__proc:'+p.id;
 if(cap==='below')r.ally.sourceSkillId=undefined;if(cap==='dead')r.ally.dead=true;if(cap==='other-owner')r.ally.owner=r.target;if(cap==='other-key')r.ally.sourceSkillId='__proc:other';
 if(cap==='resolved-owner'){r.p.owner=r.ally;r.ally.owner=undefined;r.ally.level=9;r.ally.sheet.setBase('effectDuration',2);}
 execute(r,p,{power:1});
});
for(const at of ['target','self'] as const)for(const relation of ['ordinary','owner','target-owner','missing'])course('birth-'+at+'-'+relation,r=>{
 if(relation==='owner'||relation==='target-owner')r.p.owner=r.ally;
 execute(r,proc('birth',{at}),{target:relation==='missing'?null:relation==='target-owner'?r.ally:r.target,power:1});
});
course('cleanse-live-membership',r=>{let changed=false;r.onCall=(kind,_a,phase)=>{if(kind==='actor-1-endStatus'&&phase==='after'&&!changed){changed=true;r.p.applyStatus('burn',3,1,'nested');}};execute(r,proc('cleanse',{statuses:['stun','burn'],afflictions:true,hardCC:true}));});
course('cleanse-unknown-definition',r=>{r.p.statuses.push({id:'__absent',remaining:5} as any);execute(r,proc('cleanse',{statuses:['__absent'],hardCC:true,afflictions:true}));});
course('remove-buff-duplicates',r=>execute(r,proc('removeBuff',{buff:['__first','__first','__second']})));
course('nested-proc',r=>{let nested=false;r.onCall=(kind,_a,phase)=>{if(kind==='resolveHit'&&phase==='after'&&!nested){nested=true;r.w['executeProc'](proc('ward',{flat:7,pctMaxLife:0}),r.p,null,null,4);}};execute(r,proc('extraHit',{damageScale:.25}),{power:1});});
course('live-rider-proc-record',r=>{const p=proc('heal',{flat:1,pctMax:0});r.onCall=(kind,_a,phase)=>{if(kind==='actor-1-healBy'&&phase==='after')p.color='#fedcba';};execute(r,p,{power:1});});
course('earned-rider',r=>{const rider=PROC_RIDER_LIST[0],id=Array.isArray(rider.proc)?rider.proc[0]:rider.proc,p=PROC_LIST.find(p=>p.id===id)!;assert(p);r.p.sheet.setBase(procRiderStat(rider.id),1);r.p.sheet.setBase('procDepth',4);execute(r,p,{power:1,depth:0});},1);
function cast(r:Rig,spec:ProcCastSpec,options:{target?:Actor|null;inst?:SkillInstance|null;aim?:{x:number;y:number};error?:string}={}){
 r.step('cast',()=>r.w['castProcPayload'](r.p,options.inst===undefined?r.inst:options.inst,options.target===undefined?r.target:options.target,3,spec,options.aim),options.error);
}
for(const delivery of ['projectile','centered'])for(const site of ['target','self','aim','feet','caster-target'])course('cast-'+delivery+'-'+site,r=>{
 cast(r,{skillId:delivery==='projectile'?'firebolt':'gust_burst',count:[2,2],at:site==='self'?'self':'target'},
  {target:site==='aim'||site==='feet'?null:site==='caster-target'?r.p:r.target,aim:site==='aim'?{x:800,y:740}:undefined});
});
for(const spread of ['ring',0,60] as const)for(const count of [0,1,3])course('cast-spread-'+spread+'-'+count,r=>cast(r,{skillId:'firebolt',count:[count,count],spread,mult:.5}));
course('cast-unknown-skill',r=>cast(r,{skillId:'__absent',count:[2,2]}));
course('cast-fallback-level',r=>{r.p.level=7;cast(r,{skillId:'firebolt',count:[1,1]},{inst:null,target:null});});
for(const lane of ['bar','granted','learned','missing','unseated'])course('cast-own-'+lane,r=>{
 const seat=r.w['seatOf'](r.p)!;assert(seat);const granted=makeSkillInstance(SKILLS.firebolt,4),known=makeSkillInstance(SKILLS.firebolt,7);origins.set(granted,'granted');origins.set(known,'learned');seat.grantedInsts=new Map([['firebolt',granted]]);seat.meta.knownSkills.set('firebolt',known);
 if(lane!=='bar')r.p.skills=[r.inst];if(lane==='learned'||lane==='missing')seat.grantedInsts.clear();if(lane==='missing')seat.meta.knownSkills.delete('firebolt');
 if(lane==='unseated'){r.p.team='enemy';seat.actor=r.ally;r.w['indexSeats']();assert.equal(r.w.seatOf(r.p),undefined);}
 cast(r,{skillId:'firebolt',count:[2,2],own:true,mult:0});
});
course('cast-live-held-level',r=>{const held=r.p.skills[1]!;held.level=4;let changed=false;r.onCall=(kind,_a,phase)=>{if(kind==='spawnProjectile'&&phase==='after'&&!changed){changed=true;held.level=9;}};cast(r,{skillId:'firebolt',count:[2,2],own:true});});
course('cast-live-target-position',r=>{let changed=false;r.onCall=(kind,_a,phase)=>{if(kind==='spawnProjectile'&&phase==='after'&&!changed){changed=true;r.target.pos.x+=1000;}};cast(r,{skillId:'firebolt',count:[2,2]});});
course('cast-shared-spawn-position',r=>{let changed=false;r.onCall=(kind,a,phase)=>{if(kind==='spawnProjectile'&&phase==='after'&&!changed){changed=true;a[2].x+=10;}};cast(r,{skillId:'firebolt',count:[2,2]});});
course('cast-captured-synthetic-level',r=>{let changed=false;r.onCall=(kind,_a,phase)=>{if(kind==='spawnProjectile'&&phase==='after'&&!changed){changed=true;r.inst.level=9;}};cast(r,{skillId:'firebolt',count:[2,2]});});
course('cast-captured-multiplier',r=>{const spec:ProcCastSpec={skillId:'firebolt',count:[2,2],mult:.5};r.onCall=(kind,_a,phase)=>{if(kind==='spawnProjectile'&&phase==='after')spec.mult=3;};cast(r,spec);});
course('cast-real-flight',r=>{r.target.ward=0;r.target.es=0;r.target.poise=0;r.near.ward=0;r.near.es=0;r.near.poise=0;cast(r,{skillId:'firebolt',count:[1,1],spread:0,mult:1});r.step('flight',()=>{for(let i=0;i<6;i++){r.w.time+=.05;r.w['updateProjectiles'](.05);}});});
for(const[type,hook]of [['gainCharge','actor-1-gainCharge'],['buff','actor-1-addBuff'],['heal','actor-1-healBy'],['ward','actor-1-gainWard'],['fortify','actor-1-gainEndurance'],['burst','strikeSurfaces'],['extraHit','resolveHit'],['summon','createMonster'],['summon','forwardSummonSockets'],['birth','birthAt'],['removeBuff','actor-1-removeBuff'],['cleanse','actor-1-endStatus'],['cast','spawnProjectile'],['heal','fireProcRiders']] as const)for(const phase of ['before','after'] as const)course(type+'-throw-'+hook+'-'+phase,r=>{
 let thrown=false;const message='intentional:'+hook+':'+phase;r.onCall=(kind,_a,p)=>{if(kind===hook&&p===phase&&!thrown){thrown=true;throw Error(message);}};
 const p=type==='cast'?proc('cast',{cast:{skillId:'firebolt',count:[2,2]}}):proc(type);execute(r,p,{power:1,error:message});assert(thrown,'Missing failure hook '+hook);
});
const authored=pack({procs:PROC_LIST,riders:PROC_RIDER_LIST});assert(rows.length>0,'No matching course');
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,authored,rows},null,2)+'\n');
