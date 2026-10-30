// Observe the full native resolver before extracting its remaining hit aftermath.
// SIM_TAP is read-only. Only explicitly named callback courses mutate live state.
import fs from 'node:fs';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import type {DamagePacket,HitResult} from '../src/engine/damage';
import {SIM_TAP} from '../src/engine/tap';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,type SkillInstance,type SkillDef} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {CONTAGION_CFG,type SupportDef} from '../src/engine/skills';
import {MONSTERS} from '../src/data/monsters';
import {ORB_CAP,ORB_DEFS} from '../src/data/orbs';

bootSimEngine();
const rows:any[]=[];let origins=new WeakMap<object,string>(),instanceId=0;
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
  if(Array.isArray(v)){const a=v.map((x,i)=>pack(x,seen,at+'/'+i));return origins.has(v)?{...origin,$array:a}:a;}
  if(v.def&&Array.isArray(v.sockets))return {...origin,skill:v.def.id,definition:origins.get(v.def),level:v.level,state:pack(v.state,seen,at+'/state'),extraMods:pack(v.extraMods,seen,at+'/extraMods'),sockets:pack(v.sockets,seen,at+'/sockets')};
  return {...origin,...Object.fromEntries(Object.entries(v).map(([k,x])=>[k,pack(x,seen,at+'/'+k)]))};
}
type Rig={w:World;p:Actor;target:Actor;first:Actor;second:Actor;third:Actor;events:any[];results:HitResult[];packets:DamagePacket[];
  random?:()=>number;onCall?:(name:string,args:any[],phase:'before'|'after')=>void;cleanup:(()=>void)[];add:()=>Actor;step:(name:string,fn:()=>unknown)=>void};
function course(name:string,run:(r:Rig)=>void){
  origins=new WeakMap();instanceId=0;const restore=seedGlobalRandom(0x71b3),priorTap=SIM_TAP.current;
  const w=makeSimWorld('guardian',0x71b3),p=w.player,actors:Actor[]=[p],events:any[]=[],steps:any[]=[],draws:number[]=[],results:HitResult[]=[],packets:DamagePacket[]=[];
  let observing=false,r:Rig,extraId=0;p.id=1;w.actors=[p];w.zone.level=10;w.time=4;w.metaProgressionActive=()=>false;
  const state=()=>pack({time:w.time,order:w.actors.map(a=>a.id),actors:actors.map(a=>({id:a.id,life:a.life,dead:a.dead,downed:a.downed,pos:a.pos,tier:a.tier,team:a.team,
    mana:a.mana,es:a.es,ward:a.ward,owner:a.owner,sourceSkillId:a.sourceSkillId,summonInst:a.summonInst,lifespan:a.lifespan,
    invulnerable:a.invulnerable,untargetable:a.untargetable,construct:a.construct,level:a.level,rarity:a.rarity,defId:a.defId,
    volatile:a.volatile,volatileReadyAt:a.volatileReadyAt,volatileInst:a.volatileInst,onHitByType:a.onHitByType,onHitTypeReadyAt:a.onHitTypeReadyAt,onHitTypeInsts:a.onHitTypeInsts,
    contagionReadyAt:a.contagionReadyAt,statuses:a.statuses,buffs:a.buffs,charges:a.charges,skills:a.skills,hexToggles:a.hexToggles,
    gripping:a.gripping,ironWard:a.ironWard,hitFlash:a.hitFlash,hitFlashType:a.hitFlashType,strideDist:a.strideDist,strideSpent:a.strideSpent,
  })),pendingContagions:w['pendingContagions'],throngLastKill:w['throngLastKill'],drops:w.drops,orbs:w.orbs,remnants:w.remnants,texts:w.texts,flashes:w.flashes,
    projectiles:w.projectiles.map(p=>({pos:p.pos,inst:p.inst,caster:p.caster,tier:p.tier})),results,packets});
  function wrap(object:any,key:string,label=key){const native=object[key].bind(object);object[key]=(...args:any[])=>{
    if(observing){events.push({kind:label,phase:'before',args:pack(args),state:state()});r.onCall?.(label,args,'before');}
    try{const value=native(...args);if(observing){events.push({kind:label,phase:'after',value:pack(value),state:state()});r.onCall?.(label,args,'after');}return value;}
    catch(e){if(observing)events.push({kind:label,phase:'throw',error:e instanceof Error?e.message:String(e),state:state()});throw e;}
  };}
  const configure=(a:Actor)=>{
    a.skills.fill(null);a.statuses=[];a.buffs.clear();a.noBounty=true;a.stationary=true;a.facing=0;a.brain=undefined;
    a.sheet.setSource('aftermath-observation',[
      mod('life','override',10000),mod('mana','override',10000),mod('energyShield','override',0),mod('poise','override',0),
      mod('critChance','override',0),mod('accuracy','override',100000),mod('ambushBonus','override',0),mod('evasion','override',0),mod('blockChance','override',0),mod('armor','override',0),
      mod('lifeOnHit','override',0),mod('lifeLeech','override',0),mod('vampiricShare','override',0),mod('bondShare','override',0),
    ]);a.fillResources();a.life=9000;
    for(const key of ['applyStatus','healBy','spendCharge','gainCharge','addBuff','spendBuffs','noteRecent'])wrap(a,key,'actor-'+a.id+'-'+key);
    const get=a.sheet.get.bind(a.sheet);a.sheet.get=(...args)=>{const value=get(...args);if(observing&&(/^(?:echoMight|minionShare|knockback|knockBuffet|displaceForce|damageTaken|splashRadius|aoeRadius|orbOnHit_|orbShedRate|remnantChance|lifeOnKill|manaOnKill|esOnKill|killProcOnHit)/.test(args[0]))){
      if(args[2]&&!origins.has(args[2]))origins.set(args[2],'query-extra-'+(++extraId));events.push({kind:'get',actor:a.id,args:pack(args),value});}return value;};
  };
  const add=()=>{const i=actors.length-1,a=w.createMonster('zombie',1,'enemy');a.id=70+i;a.pos={x:p.pos.x+30*(i+1),y:p.pos.y};a.tier=p.tier;configure(a);if(!actors.includes(a))actors.push(a);w.actors.push(a);return a;};
  configure(p);for(let i=0;i<4;i++)add();
  const [target,first,second,third]=actors.slice(1);
  const create=w.createMonster.bind(w);w.createMonster=(...args)=>{const a=create(...args);a.id=70+actors.length-1;actors.push(a);if(observing)for(const key of ['applyStatus','healBy','spendCharge','gainCharge','addBuff','spendBuffs','noteRecent'])wrap(a,key,'actor-'+a.id+'-'+key);return a;};
  for(const key of ['executeSkill','showCombatOutcome','text','knockFixtures','transplantStatus','applyThorns','createMonster','pushActor','shedOrb','ringBell','throngOnHit','throngEvolutionBurst','birthAt','executeProc','rollKillOrbs','rollKillRemnants','assaultDoomCull','tapCharges','rollTriggers','kill','bankDamageTakenTriggers','strikeSurfaces'])wrap(w,key);
  for(const [name,keys]of [['assaults',['plant','afterHit']],['challenges',['beforeEffects','afterHit']],['attackSequences',['landed']],['companionBonds',['onHit']]] as const)for(const key of keys)wrap(w[name],key,name+'.'+key);
  SIM_TAP.current={onHit:(caster,victim,result,packet)=>{if(!packets.includes(packet)){packets.push(packet);origins.set(packet,'packet-'+packets.length);origins.set(packet.tags,'packet-tags-'+packets.length);if(packet.extra)origins.set(packet.extra,'packet-extra-'+packets.length);}
    results.push(result);origins.set(result,'result-'+results.length);if(observing)events.push({kind:'applied-hit',args:pack([caster,victim,result,packet])});}};
  const random=mulberry32(0x71b3);Math.random=()=>{const value=r.random?r.random():random();if(observing){draws.push(value);events.push({kind:'random',value});}return value;};
  r={w,p,target,first,second,third,events,results,packets,cleanup:[],add,step:(label,fn)=>{const initial=state();observing=true;let value:unknown,error:unknown;try{value=fn();}catch(e){error=e instanceof Error?{name:e.name,message:e.message}:String(e);}finally{observing=false;}steps.push({label,before:initial,value:pack(value),error:pack(error),state:state()});}};
  try{run(r);rows.push({name,steps,events,draws});}finally{for(const undo of r.cleanup.reverse())undo();SIM_TAP.current=priorTap;restore();}
}
function strike(patch:Partial<SkillDef>={}):SkillInstance{const inst=makeSkillInstance({...SKILLS.firebolt,id:'observed-aftermath',name:'Observed aftermath',tree:undefined,leveling:undefined,baseDamage:{physical:[100,100]},effects:[{type:'damage'}],...patch},1);const id=++instanceId;origins.set(inst,'instance-'+id);origins.set(inst.def,'definition-'+id);return inst;}
type Options={caster?:Actor;target?:Actor;depth?:number;origin?:{x:number;y:number};tier?:number;mult?:number;force?:boolean;effects?:import('../src/engine/skills').SkillEffect[]};
function hit(r:Rig,inst=strike(),o:Options={}){if(o.origin)origins.set(o.origin,'hit-origin');r.step('hit',()=>r.w['resolveHit'](o.caster??r.p,inst,o.target??r.target,o.mult??1,o.depth??0,undefined,o.force??false,false,o.effects,o.origin,o.tier));}
function tune(a:Actor,values:Parameters<typeof mod>[]){a.sheet.setSource('aftermath-tuning',values.map(args=>mod(...args)));}

function socket(inst:SkillInstance,patch:Partial<SupportDef>,id='aftermath-support'){
  const s={def:{id,name:id,description:'Observer fixture',color:'#abcdef',weight:1,mods:[],...patch},level:1};inst.sockets.push(s);origins.set(s,id);return s;
}
function registered(r:Rig,id:string,patch:Partial<SkillDef>={}){
  const inst=strike({id,...patch}),old=SKILLS[id];SKILLS[id]=inst.def;r.cleanup.push(()=>{if(old)SKILLS[id]=old;else delete SKILLS[id];});return inst;
}
function response(r:Rig,id='aftermath-response'){
  return registered(r,id,{tags:['spell','buff'],delivery:{type:'self'},manaCost:0,useTime:0,cooldown:0,effects:[{type:'ward',amount:17}]});
}
function volatile(r:Rig){const skill=response(r);r.target.volatile={skillId:skill.def.id,chance:1};return skill;}
function contagious(r:Rig,patch:NonNullable<SkillDef['contagion']>={chance:1}){const inst=registered(r,'aftermath-contagion',{contagion:patch});return inst;}
function carry(r:Rig){const inst=strike({id:'aftermath-summon',tags:['spell','summon','minion'],chargeGain:[{on:'kill',charge:'frenzy',amount:2,max:5}]});r.first.team='player';r.first.owner=r.p;r.first.summonInst=inst;r.p.skills[0]=inst;return inst;}

course('plain',r=>hit(r));
for(const kind of ['zero','ward','shield','immune','evade','block','no-damage','forced'] as const)course('admission-'+kind,r=>{
  if(kind==='ward')r.target.ward=1000;if(kind==='shield'){tune(r.target,[['energyShield','override',1000]]);r.target.es=1000;}if(kind==='immune')r.target.invulnerable=true;
  if(kind==='evade')tune(r.target,[['hitImmune','override',1]]);if(kind==='block'){r.random=()=>.25;tune(r.target,[['blockChance','override',1],['blockValue','override',1000]]);}
  hit(r,strike(kind==='zero'?{baseDamage:{physical:[0,0]}}:kind==='no-damage'||kind==='forced'?{effects:[]}:{}),{force:kind==='forced'});
});
for(const depth of [-1,0,1,3])course('depth-'+depth,r=>{hit(r,strike(),{depth});});
for(const kind of ['self','friendly','incoming'] as const)course('relation-'+kind,r=>{if(kind==='friendly')r.target.team='player';hit(r,strike(),kind==='self'?{target:r.p}:kind==='incoming'?{caster:r.target,target:r.p}:{});});

for(const gate of ['active','zero-damage','lethal','dead','hidden','cooling','exact-ready','missing-skill','chance-fail','quiet','zero-icd','scaled','rounded-level'] as const)course('volatile-'+gate,r=>{
  volatile(r);r.random=()=>.25;if(gate==='lethal')r.target.life=10;if(gate==='dead')r.target.dead=true;if(gate==='hidden')r.onCall=(k,_a,p)=>{if(k==='bankDamageTakenTriggers'&&p==='after')r.target.untargetable=true;};
  if(gate==='cooling')r.target.volatileReadyAt=4.01;if(gate==='exact-ready')r.target.volatileReadyAt=4;if(gate==='missing-skill')r.target.volatile!.skillId='absent-aftermath-skill';if(gate==='chance-fail')r.target.volatile!.chance=.2;
  if(gate==='quiet')r.target.volatile!.cue=false;if(gate==='zero-icd')r.target.volatile!.icd=0;if(gate==='scaled')r.target.volatile!.dmgMult=.25;if(gate==='rounded-level')r.target.level=2.6;
  hit(r,strike(gate==='zero-damage'?{baseDamage:{physical:[0,0]}}:{}));
});
course('volatile-reuses-instance',r=>{volatile(r);hit(r);const first=r.target.volatileInst!;origins.set(first,'cached-volatile');r.w.time=10;r.target.level=9;hit(r);});
course('volatile-live-cue-callback',r=>{const other=response(r,'aftermath-other');volatile(r);r.onCall=(k,a,p)=>{if(k==='showCombatOutcome'&&a[1]==='volatile_release'&&p==='after'){r.target.volatileInst=other;r.p.pos={x:r.p.pos.x+12,y:r.p.pos.y+7};r.target.volatile!.dmgMult=0;}};hit(r);});

for(const gate of ['active','zero-damage','lethal','dead','hidden','cooling','exact-ready','zero-icd','missing-skill','chance-zero','chance-fail','chance-one','status-only','skill-only','multiple-types','no-matching-type','null-row'] as const)course('element-'+gate,r=>{
  const skill=response(r);r.target.onHitByType={physical:{status:'brittle',skillId:skill.def.id}};r.random=()=>.25;
  if(gate==='lethal')r.target.life=10;if(gate==='dead')r.target.dead=true;if(gate==='hidden')r.onCall=(k,_a,p)=>{if(k==='bankDamageTakenTriggers'&&p==='after')r.target.untargetable=true;};
  if(gate==='cooling')r.target.onHitTypeReadyAt=4.01;if(gate==='exact-ready')r.target.onHitTypeReadyAt=4;if(gate==='zero-icd')r.target.onHitTypeIcd=0;
  const row=r.target.onHitByType.physical!;if(gate==='missing-skill')row.skillId='absent-aftermath-skill';if(gate==='chance-zero')row.chance=0;if(gate==='chance-fail')row.chance=.2;if(gate==='chance-one')row.chance=1;
  if(gate==='status-only')delete row.skillId;if(gate==='skill-only')delete row.status;if(gate==='multiple-types')r.target.onHitByType={cold:{status:'chill'},physical:row};
  if(gate==='no-matching-type')r.target.onHitByType={lightning:row};if(gate==='null-row')r.target.onHitByType={physical:undefined,cold:row};
  hit(r,strike({baseDamage:gate==='zero-damage'?{physical:[0,0]}:{physical:[100,100],cold:[50,50]}}));
});
course('element-reuses-instance',r=>{const skill=response(r);r.target.onHitByType={physical:{skillId:skill.def.id}};hit(r);origins.set(r.target.onHitTypeInsts!.get(skill.def.id)!,'cached-element');r.w.time=10;r.target.level=9;hit(r);});
course('element-first-failed-chance',r=>{r.random=()=>.25;r.target.onHitByType={physical:{chance:0,status:'brittle'},cold:{status:'chill'}};hit(r,strike({baseDamage:{physical:[100,100],cold:[50,50]}}));});
course('element-live-row',r=>{const skill=response(r);r.target.onHitByType={physical:{status:'brittle'}};r.onCall=(k,_a,p)=>{if(k==='actor-70-applyStatus'&&p==='after'){r.target.onHitByType!.physical!.skillId=skill.def.id;r.target.onHitByType!.physical!.dmgMult=.3;r.target.pos={...r.first.pos};}};hit(r);});

for(const kind of ['active','zero-damage','dead-caster','seen','cooling','exact-ready','missing-skill','max-zero','max-global','max-local','generation','decay-zero','chance-zero','delay-zero','custom'] as const)course('contagion-'+kind,r=>{
  const inst=contagious(r);r.random=()=>.25;if(kind==='dead-caster')r.p.dead=true;if(kind==='cooling')r.target.contagionReadyAt=4.01;if(kind==='exact-ready')r.target.contagionReadyAt=4;
  if(kind==='missing-skill')inst.def.contagion!.skillId='absent-aftermath-skill';if(kind==='max-zero')inst.def.contagion!.maxGenerations=0;
  if(['seen','max-global','max-local','generation','decay-zero'].includes(kind)){const seen=new Set<number>(kind==='seen'?[70]:[]);origins.set(seen,'chain-seen');inst.state={contagion:{gen:kind==='max-global'?CONTAGION_CFG.maxGenerations:1,seen}};}
  if(kind==='max-local')inst.def.contagion!.maxGenerations=1;if(kind==='decay-zero')inst.def.contagion!.decay=0;if(kind==='chance-zero')inst.def.contagion!.chance=0;if(kind==='delay-zero')inst.def.contagion!.delay=0;
  if(kind==='custom')inst.def.contagion={chance:1,delay:2,damageScale:.3,decay:.7,maxGenerations:2};hit(r,strikeOr(inst,kind==='zero-damage'));
});
function strikeOr(inst:SkillInstance,zero:boolean){if(zero)inst.def.baseDamage={physical:[0,0]};return inst;}
course('contagion-shared-set',r=>{r.random=()=>.25;const inst=contagious(r);const seen=new Set<number>();origins.set(seen,'chain-seen');inst.state={contagion:{gen:1,seen}};hit(r,inst);hit(r,inst,{target:r.first});});
course('contagion-support-precedence',r=>{const inst=contagious(r,{chance:0});socket(inst,{contagion:{chance:1,delay:0,damageScale:0}});hit(r,inst);});

for(const kind of ['active','none','zero','depth','same-status','other-tier','cross-story','tie','outside','refresh'] as const)course('spread-'+kind,r=>{
  const inst=strike();socket(inst,{spreadOnHit:{chance:1,radius:100,duration:kind==='refresh'?'refresh':'remaining',strengthScale:.5}});if(kind!=='none')r.target.applyStatus('burn',12,2,'aftermath-fixture');
  r.random=()=>.25;if(kind==='same-status')r.first.applyStatus('burn',1,1,'existing');if(kind==='other-tier')r.first.tier+=1;if(kind==='cross-story'){r.p.tier=1;r.first.tier=1;}if(kind==='outside')for(const a of [r.first,r.second,r.third])a.pos.x=r.target.pos.x+1000;
  if(kind==='tie'){r.first.pos={x:r.target.pos.x+50,y:r.target.pos.y};r.second.pos={x:r.target.pos.x-50,y:r.target.pos.y};r.third.pos.x+=1000;}
  hit(r,strikeOr(inst,kind==='zero'),{depth:kind==='depth'?1:0});
});
for(const kind of ['active','same-instance','absent-graft','dead','lethal','depth','zero','two'] as const)course('curse-'+kind,r=>{
  const inst=strike(),hex=strike({id:'aftermath-hex',tags:['spell','curse'],baseDamage:{physical:[10,10]}});if(kind!=='absent-graft')socket(hex,{curseOnHit:{damageScale:.3,reservePct:.25}});
  if(kind==='same-instance')socket(inst,{curseOnHit:{damageScale:.3,reservePct:0}});r.p.hexToggles.set('hex',{inst:kind==='same-instance'?inst:hex,reserved:0});if(kind==='two')r.p.hexToggles.set('hex2',{inst:hex,reserved:0});if(kind==='dead')r.target.dead=true;if(kind==='lethal')r.target.life=1;
  hit(r,strikeOr(inst,kind==='zero'),{depth:kind==='depth'?1:0});
});
course('impale-composition',r=>{tune(r.p,[['impalePower','override',.5],['echoMight','override',.2]]);hit(r);hit(r);});
for(const kind of ['positive','zero','negative','depth','zero-damage'] as const)course('echo-'+kind,r=>{tune(r.p,[['echoMight','override',kind==='zero'?0:kind==='negative'?-.5:.25]]);hit(r,strikeOr(strike(),kind==='zero-damage'),{depth:kind==='depth'?1:0});});

for(const kind of ['active','alive','depth','boss','missing','minion','cap','chance-fail','zero-max'] as const)course('dominate-'+kind,r=>{
  const inst=strike({tags:['attack','melee']});socket(inst,{dominate:{chance:kind==='chance-fail'?0:1,duration:3,max:kind==='zero-max'?0:1}});r.random=()=>.25;if(kind!=='alive')r.target.life=1;
  if(kind==='boss')r.target.defId=Object.values(MONSTERS).find(m=>m.boss)!.id;if(kind==='missing')r.target.defId='absent-aftermath-monster';if(kind==='minion')r.target.owner=r.first;
  if(kind==='cap'){r.first.owner=r.p;r.first.sourceSkillId='__dominate:'+inst.def.id;}
  hit(r,inst,{depth:kind==='depth'?1:0});
});
for(const kind of ['other','self','zero'] as const)course('grip-sever-'+kind,r=>{r.target.gripping={id:kind==='self'?r.p.id:r.first.id,verb:'carry',until:20,spec:{verb:'carry'},struggle:0,severed:.1,statusAt:0,dotAcc:0,bearing:0};hit(r,strikeOr(strike(),kind==='zero'));});
for(const kind of ['reflect','kills-caster','dead-caster','invulnerable-caster','self'] as const)course('thorns-'+kind,r=>{tune(r.target,[['thornsReflect','override',.5],['thorns','override',20]]);if(kind==='kills-caster')r.p.life=1;if(kind==='dead-caster')r.p.dead=true;if(kind==='invulnerable-caster')r.p.invulnerable=true;hit(r,strike(),kind==='self'?{caster:r.target}:{});});
for(const kind of ['active','cap','exact-expiry','expired','zero'] as const)course('iron-ward-'+kind,r=>{r.target.ironWard={stored:kind==='cap'?499:10,cap:500,until:kind==='exact-expiry'?4:kind==='expired'?3:5,ratio:1,radius:30};hit(r,strikeOr(strike(),kind==='zero'));});
for(const kind of ['active','zero-share','depth','no-pack','dead-member','construct-member','hidden-member','kill-member','ceiling','zero-damage'] as const)course('minion-share-'+kind,r=>{
  tune(r.target,[['minionShare','override',kind==='zero-share'?0:.5]]);if(kind!=='no-pack')for(const a of [r.first,r.second]){a.owner=r.target;a.team=r.target.team;}
  if(kind==='dead-member')r.first.dead=true;if(kind==='construct-member')r.first.construct={kind:'tree',range:10,timer:0};if(kind==='hidden-member')r.first.untargetable=true;if(kind==='kill-member')r.first.life=1;
  if(kind==='ceiling'){
    // Sharing is capped at 0.8 by StatSheet, so an oversized override cannot
    // reach this ceiling. A real self-healing retaliation fills the life pool
    // before the native sharing phase adds its separately captured refund.
    r.target.life=10000;
    const heal=response(r,'aftermath-share-heal');heal.def.tags=['spell','heal'];heal.def.effects=[{type:'heal',amount:1000}];
    r.target.volatile={skillId:heal.def.id,chance:1,cue:false};
  }
  hit(r,strikeOr(strike(),kind==='zero-damage'),{depth:kind==='depth'?1:0});
});
for(const kind of ['active','no-charge','cap','depth','zero-damage','two','first-ineligible'] as const)course('retaliate-'+kind,r=>{
  const inst=makeSkillInstance(SKILLS.pain_hounds,1);r.target.skills[0]=inst;r.target.charges.set('shard',kind==='no-charge'?0:2);if(kind==='cap')for(let i=0;i<3;i++){const a=r.add();a.owner=r.target;a.sourceSkillId=inst.def.id;}
  if(kind==='two')r.target.skills[1]=makeSkillInstance(SKILLS.pain_hounds,1);if(kind==='first-ineligible'){r.target.skills[1]=inst;r.target.skills[0]=strike();}
  hit(r,strikeOr(strike(),kind==='zero-damage'),{depth:kind==='depth'?1:0});
});

for(const kind of ['melee','ranged','buffet','pull','push','zero','zero-damage'] as const)course('displacement-'+kind,r=>{r.random=()=>.25;tune(r.p,[['knockback','override',kind==='zero'?0:20],['knockBuffet','override',kind==='buffet'?1:0],['displaceForce','override',kind==='pull'?-25:kind==='push'?25:0]]);hit(r,strike({tags:kind==='melee'?['attack','melee']:['spell'],baseDamage:{physical:kind==='zero-damage'?[0,0]:[100,100]}}));});
for(const kind of ['active','invulnerable','one-life','negative','zero','resisted','cap','element-fallback','multiple-elements'] as const)course('current-life-'+kind,r=>{
  const inst=strike({effects:[],currentLifeDamage:kind==='negative'?-.5:kind==='zero'?0:kind==='cap'?2:.2,tags:kind==='element-fallback'?['spell']:kind==='multiple-elements'?['spell','fire','cold','lightning']:['spell','fire']});
  if(kind==='invulnerable')r.target.invulnerable=true;if(kind==='one-life')r.target.life=1;if(kind==='resisted')tune(r.target,[['fireRes','override',.5]]);hit(r,inst);
});
course('composed-effects-and-riders',r=>{r.p.addBuff({type:'buff',id:'aftermath-rider',duration:10,mods:[],nextHit:{status:'chill',statusScale:1}});hit(r,strike({effects:[{type:'damage'},{type:'status',status:'burn',chance:1,durationOverride:2,magnitude:10}]}));});
for(const kind of ['active','zero','depth','other-tier','cross-story','radius-edge','radius-outside','dead-peer'] as const)course('splash-'+kind,r=>{tune(r.p,[['splashRadius','override',40],['aoeRadius','override',1]]);if(kind==='other-tier')r.first.tier+=1;if(kind==='cross-story'){r.p.tier=1;r.first.tier=1;}if(kind==='dead-peer')r.first.dead=true;if(kind.startsWith('radius-'))r.first.pos.x=r.target.pos.x+40+r.first.radius+(kind==='radius-outside'?.01:0);hit(r,strikeOr(strike(),kind==='zero'),{depth:kind==='depth'?1:0});});
for(const kind of ['active','cap','near-cap','zero','depth','zero-rate','failed-chance'] as const)course('hit-orbs-'+kind,r=>{r.random=()=>kind==='failed-chance'?.99:.25;tune(r.p,[...Object.keys(ORB_DEFS).map(id=>['orbOnHit_'+id,'override',1] as Parameters<typeof mod>),['orbShedRate','override',kind==='zero-rate'?0:1]]);if(kind==='cap'||kind==='near-cap')for(let i=0;i<ORB_CAP-(kind==='near-cap'?1:0);i++)r.w.shedOrb('life',r.target.pos);hit(r,strikeOr(strike(),kind==='zero'),{depth:kind==='depth'?1:0});});
for(const kind of ['active','cap','zero','depth','chance-edge','chance-below','no-element','rolled-element','two-elements'] as const)course('remnant-'+kind,r=>{r.random=()=>kind==='chance-edge'?.4:kind==='chance-below'?.399:.25;tune(r.p,[['remnantChance','override',1]]);if(kind==='cap')r.w.remnants=Array.from({length:14},()=>({pos:{...r.target.pos},element:'fire',bob:0,life:14}));hit(r,strike({tags:kind==='no-element'||kind==='rolled-element'?['spell']:kind==='two-elements'?['fire','cold']:['fire'],baseDamage:kind==='zero'?{physical:[0,0]}:kind==='rolled-element'?{cold:[100,100]}:{physical:[100,100]}}),{depth:kind==='depth'?1:0});});
for(const kind of ['active','cooling','dead','zero'] as const)course('bell-'+kind,r=>{const inst=response(r);r.target.construct={kind:'totem',range:10,timer:0,castOnStruck:true,castInst:inst,bellReadyAt:kind==='cooling'?5:4};if(kind==='dead')r.target.life=1;hit(r,strikeOr(strike(),kind==='zero'));});

for(const kind of ['lethal','alive','caster-dead','zero','capped','negative'] as const)course('kill-recovery-'+kind,r=>{r.target.life=kind==='alive'?9000:1;if(kind==='caster-dead')r.p.dead=true;tune(r.p,[['lifeOnKill','override',kind==='negative'?-20:20],['manaOnKill','override',30],['esOnKill','override',40],['energyShield','override',100]]);r.p.mana=kind==='capped'?9990:5000;r.p.es=kind==='capped'?90:0;if(kind==='capped')r.p.life=9990;hit(r,strikeOr(strike(),kind==='zero'));});
for(const kind of ['every','chance','chance-fail','gauge-due','gauge-wait','inert','zero','depth','dead'] as const)course('spawn-vein-'+kind,r=>{const inst=strike();const trigger=kind==='chance'||kind==='chance-fail'?{pct:kind==='chance'?1:0}:kind.startsWith('gauge')?{hits:2}:{every:true as const};const s=socket(inst,{rollBase:{kind:kind==='inert'?undefined:'spawn',axes:[{id:'trigger',rows:[{id:'one',weight:1,line:'trigger',...trigger}]},{id:'brood',rows:[{id:'one',weight:1,line:'brood',monsterId:'zombie'}]},{id:'clutch',rows:[{id:'one',weight:1,line:'clutch',count:1,cap:2}]}]}});if(kind==='gauge-due')(s as typeof s&{gauge:number}).gauge=1;if(kind==='dead')r.p.dead=true;hit(r,strikeOr(inst,kind==='zero'),{depth:kind==='depth'?1:0});});
for(const kind of ['normal','rare','champion','crowned','boss','missing-definition','lethal','depth'] as const)course('proc-hit-'+kind,r=>{tune(r.p,[['proc_parasite_sip','override',1],['proc_corpsefire','override',1],['killProcOnHit','override',1]]);r.random=()=>.25;if(['rare','champion','crowned'].includes(kind))r.target.rarity=kind as Actor['rarity'];if(kind==='boss')r.target.defId=Object.values(MONSTERS).find(m=>m.boss)!.id;if(kind==='missing-definition')r.target.defId='absent-aftermath-monster';if(kind==='lethal')r.target.life=1;hit(r,strike(),{depth:kind==='depth'?3:0});});
for(const kind of ['active','fallback','missing','owner-dead','kill','kill-chance-zero','kill-zero-amount','zero'] as const)course('owner-carry-'+kind,r=>{const inst=carry(r);if(kind==='fallback'){r.first.summonInst=undefined;r.first.sourceSkillId=inst.def.id;}if(kind==='missing'){r.first.summonInst=undefined;r.p.skills.fill(null);}if(kind==='owner-dead'){r.p.dead=true;r.target.life=1;}if(kind.startsWith('kill')){r.target.life=1;if(kind==='kill-chance-zero')inst.def.chargeGain![0].chance=0;if(kind==='kill-zero-amount')inst.def.chargeGain![0].amount=0;}hit(r,strikeOr(strike(),kind==='zero'),{caster:r.first});});
for(const kind of ['hit','crit','kill','zero','depth','stride','stride-already','no-condition'] as const)course('consumption-'+kind,r=>{r.p.addBuff({type:'buff',id:'spent',duration:10,mods:[],consumeOn:{on:kind==='crit'?'crit':kind==='kill'?'kill':'hit'}});r.target.addBuff({type:'buff',id:'hurt-spent',duration:10,mods:[],consumeOn:{on:'hurt'}});if(kind==='crit'){tune(r.p,[['critChance','override',1]]);r.random=()=>.25;}if(kind==='kill')r.target.life=1;if(kind.startsWith('stride')||kind==='no-condition'){r.p.strideDist=10000;r.p.strideSpent=kind==='stride-already';if(kind!=='no-condition'){tune(r.p,[['strideReach','override',10]]);r.p['refreshConditions']();};}hit(r,strikeOr(strike(),kind==='zero'),{depth:kind==='depth'?1:0});});
for(const kind of ['eligible','depth','stamp','trigger','spell','not-melee','zero'] as const)course('melee-trigger-'+kind,r=>{if(kind==='zero')r.target.ward=1000;const inst=strike({tags:kind==='spell'?['spell','melee']:kind==='not-melee'?['attack']:['attack','melee']});if(kind==='stamp')inst.state={trigDepth:1};if(kind==='trigger')inst.def.trigger={on:'crit'};hit(r,strikeOr(inst,kind==='zero'),{depth:kind==='depth'?1:0});});

for(const kind of ['revive-after-capture','kill-after-capture','kill-in-attack-sequence','revive-before-final-kill'] as const)course('lethal-capture-'+kind,r=>{if(kind==='revive-after-capture'||kind==='revive-before-final-kill')r.target.life=1;tune(r.p,[['lifeOnKill','override',17]]);r.onCall=(k,_a,p)=>{if(p!=='after')return;if(kind==='revive-after-capture'&&k==='throngOnHit')r.target.life=500;if(kind==='kill-after-capture'&&k==='throngOnHit')r.target.life=0;if(kind==='kill-in-attack-sequence'&&k==='attackSequences.landed')r.target.life=0;if(kind==='revive-before-final-kill'&&k==='actor-70-spendBuffs')r.target.life=500;};hit(r);});
course('composed-stat-status',r=>{r.random=()=>.25;tune(r.p,[['apply_poison','override',1]]);hit(r);});
course('nested-aftermath-hit',r=>{let nested=false;const inst=strike();r.onCall=(k,_a,p)=>{if(k==='knockFixtures'&&p==='after'&&!nested){nested=true;r.w['resolveHit'](r.first,inst,r.second,1,1);}};hit(r,inst);});
for(const seam of ['knockFixtures','assaults.plant','applyThorns','challenges.beforeEffects','throngOnHit','assaults.afterHit','assaultDoomCull','challenges.afterHit','attackSequences.landed','companionBonds.onHit','actor-1-spendBuffs','actor-70-spendBuffs','kill'])course('callback-error-'+seam,r=>{if(seam==='kill')r.target.life=1;r.onCall=(k,_a,p)=>{if(k===seam&&p==='before')throw Error('aftermath fault: '+seam);};hit(r);});
for(const seam of ['executeSkill','pushActor','transplantStatus','birthAt','rollKillRemnants','rollKillOrbs'])course('active-callback-error-'+seam,r=>{const inst=strike();if(seam==='executeSkill')volatile(r);if(seam==='pushActor')tune(r.p,[['knockback','override',20]]);if(seam==='transplantStatus'){r.target.applyStatus('burn',10,2,'fixture');socket(inst,{spreadOnHit:{chance:1,radius:100}});}if(seam==='birthAt'){inst.def.effects.push({type:'birth',onHit:true,monsterId:'zombie',count:[1,1],cap:2,duration:1});}if(seam.startsWith('rollKill'))r.target.life=1;r.onCall=(k,_a,p)=>{if(k===seam&&p==='before')throw Error('aftermath fault: '+seam);};hit(r,inst);});

for(const kind of ['active','not-attack','zero','depth','zero-scale'] as const)course('throng-evolution-'+kind,r=>{
  const summon=strike({id:'aftermath-throng',tags:['spell','summon'],throng:{monsterId:'zombie',cap:4,sources:[]},tree:{level:1,nodes:[{id:'splash',name:'Splash',mods:[],throngEvolution:{splashScale:kind==='zero-scale'?0:.35}}]}});summon.treeNodes=['splash'];
  r.first.owner=r.p;r.first.team='player';r.first.summonInst=summon;r.second.pos={x:r.target.pos.x+20,y:r.target.pos.y};const bite=strike({tags:kind==='not-attack'?['spell']:['attack','melee']});r.first.skills[0]=bite;
  hit(r,strikeOr(bite,kind==='zero'),{caster:r.first,depth:kind==='depth'?1:0});
});
for(const change of ['remove','replace','append'] as const)course('curse-live-'+change,r=>{const inst=strike(),hex=strike({id:'live-hex',tags:['curse','spell'],baseDamage:{physical:[5,5]}});socket(hex,{curseOnHit:{damageScale:.5,reservePct:0}});r.p.hexToggles.set('one',{inst:hex,reserved:0});r.p.hexToggles.set('two',{inst:hex,reserved:0});let calls=0;r.onCall=(k,_a,p)=>{if(k==='knockFixtures'&&p==='after'&&++calls===2){if(change==='remove')r.p.hexToggles.delete('two');if(change==='replace')r.p.hexToggles=new Map();if(change==='append')r.p.hexToggles.set('three',{inst:hex,reserved:0});}};hit(r,inst);});
for(const change of ['remove','change-owner','mark-dead'] as const)course('share-snapshot-'+change,r=>{tune(r.target,[['minionShare','override',.5]]);r.first.owner=r.target;r.second.owner=r.target;r.first.life=1;r.onCall=(k,a,p)=>{if(k==='kill'&&a[0]===r.first&&p==='after'){if(change==='remove')r.w.actors.splice(r.w.actors.indexOf(r.second),1);if(change==='change-owner')r.second.owner=r.p;if(change==='mark-dead')r.second.dead=true;}};hit(r);});
course('live-final-context',r=>{const inst=strike();r.onCall=(k,_a,p)=>{if(k==='challenges.afterHit'&&p==='after')inst.def={...inst.def,id:'changed-at-completion',tags:['attack','melee']};};hit(r,inst);});
course('live-packet-captured-damage',r=>{r.onCall=(k,_a,p)=>{if(k==='knockFixtures'&&p==='after'){r.packets.at(-1)!.amounts.physical=0;r.results.at(-1)!.total=9999;}};hit(r);});

fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows},null,2)+'\n');
console.log({courses:rows.length});
