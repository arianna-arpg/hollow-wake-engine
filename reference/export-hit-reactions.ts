// Observe the full native resolver before extracting its landed-contact reactions.
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
  if(v.def&&Array.isArray(v.sockets))return {...origin,skill:v.def.id,definition:origins.get(v.def),level:v.level,state:pack(v.state,seen,at+'/state'),extraMods:pack(v.extraMods,seen,at+'/extraMods')};
  return {...origin,...Object.fromEntries(Object.entries(v).map(([k,x])=>[k,pack(x,seen,at+'/'+k)]))};
}
type Rig={w:World;p:Actor;target:Actor;first:Actor;second:Actor;third:Actor;events:any[];results:HitResult[];packets:DamagePacket[];
  random?:()=>number;onCall?:(name:string,args:any[],phase:'before'|'after')=>void;cleanup:(()=>void)[];add:()=>Actor;step:(name:string,fn:()=>unknown)=>void};
function course(name:string,run:(r:Rig)=>void){
  origins=new WeakMap();instanceId=0;const restore=seedGlobalRandom(0x71b3),priorTap=SIM_TAP.current;
  const w=makeSimWorld('guardian',0x71b3),p=w.player,actors:Actor[]=[p],events:any[]=[],steps:any[]=[],draws:number[]=[],results:HitResult[]=[],packets:DamagePacket[]=[];
  let observing=false,r:Rig,extraId=0;p.id=1;w.actors=[p];w.zone.level=10;w.time=4;w.metaProgressionActive=()=>false;
  const state=()=>pack({time:w.time,order:w.actors.map(a=>a.id),actors:actors.map(a=>({id:a.id,life:a.life,dead:a.dead,downed:a.downed,pos:a.pos,tier:a.tier,team:a.team,
    lastCombatAt:a.lastCombatAt,aiHitAt:a.aiHitAt,aiHitById:a.aiHitById,lastFoeAt:a.lastFoeAt,lastFoeId:a.lastFoeId,recentHurt:a.recentHurt,
    alertUntil:a.alertUntil,alertFrom:a.alertFrom,alertTier:a.alertTier,aggroed:a.aggroed,drives:a.drives,threat:a.threat,
    lootSack:a.lootSack,lastSpillAt:a.lastSpillAt,spillBank:a.spillBank,essenceSpilled:a.essenceSpilled,lastEssenceSpillAt:a.lastEssenceSpillAt,
    buffs:a.buffs,charges:a.charges,skills:a.skills,casting:a.casting,primedPours:a.primedPours,ward:a.ward,ambushArmed:a.ambushArmed,untargetable:a.untargetable,aiAwakened:a.aiAwakened,
    watchS:a.watchS,watchFedAt:a.watchFedAt,watchRung:a.watchRung,watchAt:a.watchAt,es:a.es,esBroke:a.esBroke,poise:a.poise,poiseBroken:a.poiseBroken,
  })),drops:w.drops,orbs:w.orbs,texts:w.texts,flashes:w.flashes,lowLifeHitFlash:w.lowLifeHitFlash,results,packets});
  function wrap(object:any,key:string,label=key){const native=object[key].bind(object);object[key]=(...args:any[])=>{
    if(observing){events.push({kind:label,phase:'before',args:pack(args),state:state()});r.onCall?.(label,args,'before');}
    try{const value=native(...args);if(observing){events.push({kind:label,phase:'after',value:pack(value),state:state()});r.onCall?.(label,args,'after');}return value;}
    catch(e){if(observing)events.push({kind:label,phase:'throw',error:e instanceof Error?e.message:String(e),state:state()});throw e;}
  };}
  const configure=(a:Actor)=>{
    a.skills.fill(null);a.statuses=[];a.buffs.clear();a.noBounty=true;a.stationary=true;a.facing=0;a.brain=undefined;
    a.sheet.setSource('reaction-observation',[
      mod('life','override',10000),mod('mana','override',10000),mod('energyShield','override',0),mod('poise','override',0),
      mod('critChance','override',0),mod('accuracy','override',100000),mod('ambushBonus','override',0),mod('evasion','override',0),mod('blockChance','override',0),mod('armor','override',0),
      mod('lifeOnHit','override',0),mod('lifeLeech','override',0),mod('vampiricShare','override',0),mod('bondShare','override',0),
    ]);a.fillResources();a.life=9000;
    for(const key of ['removeBuff','addThreat'])wrap(a,key,'actor-'+a.id+'-'+key);
    const get=a.sheet.get.bind(a.sheet);a.sheet.get=(...args)=>{const value=get(...args);if(observing&&(args[0]==='threatGen'||args[0].startsWith('orbOnHurt_')||args[0]==='orbShedRate')){
      if(args[2]&&!origins.has(args[2]))origins.set(args[2],'query-extra-'+(++extraId));events.push({kind:'get',actor:a.id,args:pack(args),value});}return value;};
  };
  const add=()=>{const i=actors.length-1,a=w.createMonster('zombie',1,'enemy');a.id=70+i;a.pos={x:p.pos.x+30*(i+1),y:p.pos.y};a.tier=p.tier;configure(a);actors.push(a);w.actors.push(a);return a;};
  configure(p);for(let i=0;i<4;i++)add();
  const [target,first,second,third]=actors.slice(1);
  for(const key of ['hostileTo','bumpDrives','bankEssenceSpill','releasePrimedPours','tapCharges','shedOrb','rouseOnWound','springAmbush','rollOwnProcs','sweepDefenseEvents','rollTriggers','bankDamageTakenTriggers','showCombatOutcome','text','bankPools','knockFixtures'])wrap(w,key);
  const before=w['challenges'].beforeEffects.bind(w['challenges']);w['challenges'].beforeEffects=(...args)=>{if(observing)events.push({kind:'before-effects',args:pack(args),state:state()});return before(...args);};
  SIM_TAP.current={onHit:(caster,victim,result,packet)=>{if(!packets.includes(packet)){packets.push(packet);origins.set(packet,'packet-'+packets.length);origins.set(packet.tags,'packet-tags-'+packets.length);if(packet.extra)origins.set(packet.extra,'packet-extra-'+packets.length);}
    results.push(result);origins.set(result,'result-'+results.length);if(observing)events.push({kind:'applied-hit',args:pack([caster,victim,result,packet])});}};
  const random=mulberry32(0x71b3);Math.random=()=>{const value=r.random?r.random():random();if(observing){draws.push(value);events.push({kind:'random',value});}return value;};
  r={w,p,target,first,second,third,events,results,packets,cleanup:[],add,step:(label,fn)=>{const initial=state();observing=true;let value:unknown,error:unknown;try{value=fn();}catch(e){error=e instanceof Error?{name:e.name,message:e.message}:String(e);}finally{observing=false;}steps.push({label,before:initial,value:pack(value),error:pack(error),state:state()});}};
  try{run(r);rows.push({name,steps,events,draws});}finally{for(const undo of r.cleanup.reverse())undo();SIM_TAP.current=priorTap;restore();}
}
function strike(patch:Partial<SkillDef>={}):SkillInstance{const inst=makeSkillInstance({...SKILLS.firebolt,id:'observed-reactions',name:'Observed reactions',tree:undefined,leveling:undefined,baseDamage:{physical:[100,100]},effects:[{type:'damage'}],...patch},1);const id=++instanceId;origins.set(inst,'instance-'+id);origins.set(inst.def,'definition-'+id);return inst;}
type Options={caster?:Actor;target?:Actor;depth?:number;origin?:{x:number;y:number};tier?:number};
function hit(r:Rig,inst=strike(),o:Options={}){if(o.origin)origins.set(o.origin,'hit-origin');r.step('hit',()=>r.w['resolveHit'](o.caster??r.p,inst,o.target??r.target,1,o.depth??0,undefined,false,false,undefined,o.origin,o.tier));}
function tune(a:Actor,values:Parameters<typeof mod>[]){a.sheet.setSource('reaction-tuning',values.map(args=>mod(...args)));}
function fragile(a:Actor,id='fragile'){a.addBuff({type:'buff',id,duration:10,mods:[],clearOnHit:true});}
function channel(a:Actor,inst:SkillInstance,spool?:number){a.casting={inst,mode:'channel',aim:{...a.pos},elapsed:0,total:1,held:true,baseMult:1,hitSpool:spool};}

course('plain',r=>hit(r));
for(const kind of ['zero','ward','shield','evade','block','immune','no-damage'] as const)course('admission-'+kind,r=>{
  fragile(r.target);if(kind==='ward')r.target.ward=1000;if(kind==='shield'){tune(r.target,[['energyShield','override',1000]]);r.target.es=1000;}
  if(kind==='evade')tune(r.target,[['hitImmune','override',1]]);if(kind==='block'){r.random=()=>.25;tune(r.target,[['blockChance','override',1],['blockValue','override',1000]]);}if(kind==='immune')r.target.invulnerable=true;
  hit(r,strike(kind==='zero'?{baseDamage:{physical:[0,0]}}:kind==='no-damage'?{effects:[]}:{}));
});
for(const depth of [-1,0,1,3])course('depth-'+depth,r=>{const inst=strike();if(depth<0)inst.procChainDepth=-2;channel(r.p,inst,4);fragile(r.target);hit(r,inst,{depth});});
for(const kind of ['self','friendly','incoming','enemy-pair'] as const)course('relation-'+kind,r=>{if(kind==='friendly')r.target.team='player';hit(r,strike(),kind==='self'?{target:r.p}:kind==='incoming'?{caster:r.target,target:r.p}:kind==='enemy-pair'?{caster:r.first}:{});});
for(const depth of [0,1])for(const tier of [undefined,0,7])course('origin-'+depth+'-'+String(tier),r=>{r.p.tier=2;r.target.tier=2;hit(r,strike(),{depth,tier,origin:{x:17,y:29}});});
for(const factor of [0,.5,2])course('alert-scale-'+factor,r=>{r.target.brain={perception:{alertMul:factor}};hit(r);});
course('existing-alert',r=>{r.target.alertUntil=100;r.target.alertFrom={x:7,y:9};hit(r);});
for(const tw of [undefined,0,-1,.5,2])for(const gen of [0,1,2])course('threat-'+String(tw)+'-'+gen,r=>{r.target.brain={target:{threat:{damage:tw}}};tune(r.p,[['threatGen','override',gen]]);hit(r);});
for(const override of [null,0,3])course('threat-tuning-'+String(override),r=>{r.target.brain={target:{threat:{damage:2}}};r.target.aiTuning={target:{threat:{damage:override as unknown as number}}};hit(r);});
course('threat-context-and-live-mods',r=>{r.target.brain={};const inst=strike();inst.extraMods=[mod('threatGen','more',.5,['fire'])];r.onCall=(name,_args,phase)=>{if(name==='releasePrimedPours'&&phase==='after')inst.extraMods=[mod('threatGen','more',1,['fire'])];};hit(r,inst);});
course('drive-jumps',r=>{r.p.brain={drives:{wrath:{onDealt:.25}}};r.target.brain={drives:{wrath:{onHurt:.5}}};hit(r);});
for(const depth of [0,1])course('charge-banks-'+depth,r=>{r.p.skills[0]=strike({id:'author-tap',chargeGain:[{on:'hit',charge:'frenzy',amount:2,max:5}]});r.target.skills[0]=strike({id:'victim-tap',chargeGain:[{on:'takeHit',charge:'endurance',amount:3,max:5}]});hit(r,strike(),{depth});});
for(const kind of ['land','zero','dead'] as const)course('primed-pour-'+kind,r=>{const stored=strike({id:'primed-ward',effects:[{type:'ward',amount:17}]});r.target.skills[0]=stored;r.target.primedPours=[{skillId:stored.def.id,chargesSpent:2}];if(kind==='dead')r.target.dead=true;hit(r,strike(kind==='zero'?{baseDamage:{physical:[0,0]}}:{}));});
for(const off of [false,true])course('damage-trigger-bank-'+off,r=>{r.target.skills[0]=strike({id:'banked-trigger',trigger:{on:'damageTaken',lifeFrac:1,...(off?{startsOff:true}:{})}});hit(r);});
for(const elapsed of [.39,.4,.41,1])course('loot-spill-'+elapsed,r=>{r.w.time=elapsed;r.target.lastSpillAt=0;r.target.lootSack=[{kind:'abilityEssence',tier:1,count:3},{kind:'abilityEssence',tier:2,count:7}];origins.set(r.target.lootSack[1],'last-loot');hit(r);});
course('loot-spill-empty',r=>{r.target.lootSack=[];hit(r);});
for(const kind of ['native','zero','missing-definition','missing-spill'] as const)course('essence-'+kind,r=>{r.target.defId=kind==='missing-definition'?'missing-reaction-def':kind==='missing-spill'?'zombie':'gilded_scamp';r.target.spillBank=10000;hit(r,strike(kind==='zero'?{baseDamage:{physical:[0,0]}}:{}));});
course('fragile-mixed-order',r=>{fragile(r.target,'first');r.target.addBuff({type:'buff',id:'kept',duration:10,mods:[]});fragile(r.target,'last');hit(r);});
for(const change of ['append','remove-next','replace-map'] as const)course('fragile-callback-'+change,r=>{fragile(r.target,'first');fragile(r.target,'last');let once=false;r.onCall=(name,_args,phase)=>{if(name==='actor-70-removeBuff'&&phase==='after'&&!once){once=true;if(change==='append')fragile(r.target,'appended');if(change==='remove-next')r.target.buffs.delete('last');if(change==='replace-map')r.target.buffs=new Map();}};hit(r);});
for(const initial of [undefined,0,4])course('channel-spool-'+String(initial),r=>{const inst=strike();channel(r.p,inst,initial);hit(r,inst);});
for(const kind of ['cancel','replace','change-mode'] as const)course('channel-callback-'+kind,r=>{const inst=strike();channel(r.p,inst,4);r.onCall=(name,args,phase)=>{if(name==='tapCharges'&&args[0]===r.target&&phase==='after'){if(kind==='cancel')r.p.casting=null;if(kind==='replace')channel(r.p,inst,8);if(kind==='change-mode')r.p.casting!.mode='cast';}};hit(r,inst);});
for(const roll of [.49,.5,.51])course('orb-chance-cap-'+roll,r=>{r.random=()=>roll;tune(r.target,Object.keys(ORB_DEFS).map(id=>['orbOnHurt_'+id,'override',1]));hit(r);});
for(const kind of ['cap','construct','zero-rate','zero-damage','depth'] as const)course('orb-gate-'+kind,r=>{tune(r.target,[['orbOnHurt_life','override',1],['orbShedRate','override',kind==='zero-rate'?0:1]]);r.random=()=>.25;if(kind==='cap')for(let i=0;i<ORB_CAP;i++)r.w.shedOrb('life',r.target.pos);if(kind==='construct')r.target.construct={kind:'tree',range:10,timer:0};hit(r,strike(kind==='zero-damage'?{baseDamage:{physical:[0,0]}}:{}),{depth:kind==='depth'?1:0});});
course('orb-near-cap',r=>{r.random=()=>.25;for(let i=0;i<ORB_CAP-1;i++)r.w.shedOrb('life',r.target.pos);tune(r.target,Object.keys(ORB_DEFS).map(id=>['orbOnHurt_'+id,'override',1]));hit(r);});
course('orb-registry-live-between-hits',r=>{r.random=()=>.25;tune(r.target,[['orbOnHurt_life','override',1],['orbOnHurt_reaction_extra','override',1]]);let once=false;r.onCall=(name,_args,phase)=>{if(name==='shedOrb'&&phase==='after'&&!once){once=true;ORB_DEFS.reaction_extra={...ORB_DEFS.life,id:'reaction_extra'};r.cleanup.push(()=>{delete ORB_DEFS.reaction_extra;});}};hit(r);hit(r);});
course('rouse-native',r=>{r.target.tag='reaction-rouse';r.first.tag=r.target.tag;r.w['rouseRules'][r.target.tag]=()=>({woundFrac:1,radius:100,toast:'roused',color:'#123456',size:10});hit(r);});
course('ambush-native',r=>{r.target.ambushSpec={radius:100,visible:true,pack:100};r.first.ambushSpec={radius:100,visible:true};r.w.armAmbush(r.target,r.target.ambushSpec);r.w.armAmbush(r.first,r.first.ambushSpec);hit(r);});
for(const gate of ['eligible','dead','other-team','exact-radius','outside','other-tier','existing-origin','existing-alert'] as const)course('stealth-peer-'+gate,r=>{tune(r.p,[['invisible','override',1]]);if(gate==='dead')r.first.dead=true;if(gate==='other-team')r.first.team='player';if(gate==='exact-radius'||gate==='outside')r.first.pos.x=r.target.pos.x+(gate==='outside'?320.01:320);if(gate==='other-tier')r.first.tier=9;if(gate==='existing-origin'){r.first.alertFrom={x:1,y:2};r.first.alertTier=6;}if(gate==='existing-alert')r.first.alertUntil=100;hit(r);});
for(const change of ['move-next','team-next','replace-list','remove-next','append-new'] as const)course('stealth-write-'+change,r=>{tune(r.p,[['invisible','override',1]]);let value=0,changed=false;Object.defineProperty(r.first,'alertUntil',{configurable:true,get:()=>value,set:n=>{value=n;if(changed)return;changed=true;if(change==='move-next')r.second.pos.x+=1000;if(change==='team-next')r.second.team='player';if(change==='replace-list')r.w.actors=[r.p,r.target,r.third];if(change==='remove-next')r.w.actors.splice(r.w.actors.indexOf(r.second),1);if(change==='append-new')r.add();}});hit(r);});
for(const gate of ['fresh','existing-point','high-rung','aggroed','friendly','self','zero-damage'] as const)course('watch-'+gate,r=>{r.target.watch={};if(gate==='existing-point'){r.target.watchAt={x:1,y:2};origins.set(r.target.watchAt,'watch-point');}if(gate==='high-rung'){r.target.watchS=.9;r.target.watchFedAt=4;r.target.watchRung=8;}if(gate==='aggroed')r.target.aggroed=true;if(gate==='friendly')r.target.team='player';if(gate==='self')r.p.watch={};hit(r,strike(gate==='zero-damage'?{baseDamage:{physical:[0,0]}}:{}),gate==='self'?{target:r.p}:{});});
for(const life of [1,1000,4000,9000])course('incoming-life-'+life,r=>{r.p.life=life;hit(r,strike(),{caster:r.target,target:r.p});});
for(const kind of ['crit','shield-break','poise-break','hit-cap','cull'] as const)course('outcome-'+kind,r=>{if(kind==='crit'){r.random=()=>.25;tune(r.p,[['critChance','override',1]]);}if(kind==='shield-break'){tune(r.target,[['energyShield','override',20]]);r.target.es=20;}if(kind==='poise-break'){tune(r.target,[['poise','override',100]]);r.target.poise=1;}if(kind==='hit-cap')tune(r.target,[['hitCap','override',.001]]);if(kind==='cull'){r.target.life=300;tune(r.p,[['cullThreshold','override',.5]]);}hit(r);});
for(const depth of [undefined,0,3])course('trigger-depth-'+String(depth),r=>{tune(r.p,[['critChance','override',1]]);r.random=()=>.25;const inst=strike({baseDamage:{physical:[100,200]}});if(depth!==undefined)inst.state={trigDepth:depth};hit(r,inst);});
for(const change of ['crit-flag','roll-undefined','roll-zero','move-target','trigger-depth','poise-flag','cull-flag','clamp-flag','dealt'] as const)course('captured-and-live-'+change,r=>{tune(r.p,[['critChance','override',1]]);r.random=()=>.25;r.target.brain={};const inst=strike({baseDamage:{physical:[100,200]}});r.onCall=(name,_args,phase)=>{if(name==='bankPools'&&phase==='after'){if(change==='crit-flag')r.results.at(-1)!.crit=false;if(change==='roll-undefined')r.packets.at(-1)!.rollT=undefined;if(change==='roll-zero')r.packets.at(-1)!.rollT=0;if(change==='move-target')r.target.pos={x:17,y:29};if(change==='trigger-depth')inst.state={trigDepth:5};if(change==='poise-flag')r.results.at(-1)!.poiseBroke=true;if(change==='cull-flag')r.results.at(-1)!.culled=true;if(change==='clamp-flag')r.results.at(-1)!.clamped=true;if(change==='dealt')r.results.at(-1)!.total=9999;}};hit(r,inst);});
for(const seam of ['bumpDrives','releasePrimedPours','tapCharges','rouseOnWound','sweepDefenseEvents','bankDamageTakenTriggers'])course('callback-error-'+seam,r=>{fragile(r.target);r.onCall=(name,_args,phase)=>{if(name===seam&&phase==='before')throw Error('reaction fault: '+seam);};hit(r);});
course('callback-error-fragile',r=>{fragile(r.target);r.onCall=(name,_args,phase)=>{if(name==='actor-70-removeBuff'&&phase==='before')throw Error('reaction fault: fragile');};hit(r);});
course('callback-error-es-break',r=>{tune(r.target,[['energyShield','override',20]]);r.target.es=20;r.onCall=(name,args,phase)=>{if(name==='rollOwnProcs'&&args[1]==='esBreak'&&phase==='before')throw Error('reaction fault: es-break');};hit(r);});
course('nested-reaction-hit',r=>{let nested=false;const inst=strike();r.onCall=(name,_args,phase)=>{if(name==='releasePrimedPours'&&phase==='after'&&!nested){nested=true;r.w['resolveHit'](r.first,inst,r.second,1,1);}};hit(r,inst);});
course('live-clock-between-stamps',r=>{let stamp=r.p.lastCombatAt;Object.defineProperty(r.p,'lastCombatAt',{configurable:true,get:()=>stamp,set:n=>{stamp=n;r.w.time=5;}});hit(r);});
course('live-threat-brain',r=>{r.target.brain={target:{threat:{damage:1}}};r.onCall=(name,_args,phase)=>{if(name==='releasePrimedPours'&&phase==='after')r.target.brain={target:{threat:{damage:3}}};};hit(r);});

fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows},null,2)+'\n');
console.log({courses:rows.length});
