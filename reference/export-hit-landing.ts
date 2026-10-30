// Original hit landing observer. The sim tap only observes; controlled host
// callbacks are explicit courses and never replace the damage implementation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import {SIM_TAP} from '../src/engine/tap';
import type {DamagePacket,HitResult} from '../src/engine/damage';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,type SkillInstance,type SkillEffect,type SkillDef} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {bestiaryKey} from '../src/data/bestiary';

bootSimEngine();
const originalRandom=Math.random,rows:any[]=[];
let origins=new WeakMap<object,string>();
function pack(value:any,seen=new WeakMap<object,string>(),at='$'):any {
  if(value===undefined)return {$undefined:true};
  if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return {$number:Object.is(value,-0)?'-0':String(value)};
  if(typeof value==='function')return {$function:value.name};if(value===null||typeof value!=='object')return value;
  if(value instanceof Actor)return {$actor:value.id};const prior=seen.get(value);if(prior)return {$ref:prior};seen.set(value,at);
  const origin=origins.has(value)?{$origin:origins.get(value)}:{};
  if(value instanceof Set)return {...origin,$set:[...value].map((v,i)=>pack(v,seen,at+'/'+i))};
  if(value instanceof Map)return {...origin,$map:[...value].map(([k,v],i)=>[pack(k,seen,at+'/'+i+'/key'),pack(v,seen,at+'/'+i+'/value')])};
  if(ArrayBuffer.isView(value))return {$typed:value.constructor.name,values:Array.from(value as any)};
  if(Array.isArray(value)){const array=value.map((v,i)=>pack(v,seen,at+'/'+i));return origins.has(value)?{...origin,$array:array}:array;}
  if(value.def&&Array.isArray(value.sockets))return {skill:value.def.id,definition:origins.get(value.def),instance:origins.get(value),level:value.level,tags:value.def.tags,extraMods:pack(value.extraMods,seen,at+'/extraMods')};
  return {...origin,...Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v,seen,at+'/'+k)]))};
}
type Rig={w:World;p:Actor;target:Actor;other:Actor;events:any[];meta:boolean;
  packets:DamagePacket[];results:HitResult[];random?:()=>number;onPacket?: (caster:Actor,packet:DamagePacket,depth:number)=>void;
  step:(label:string,fn:()=>unknown)=>void};
function course(name:string,run:(r:Rig)=>void){
  origins=new WeakMap();const restore=seedGlobalRandom(0x71b3),previousTap=SIM_TAP.current,w=makeSimWorld('guardian',0x71b3),p=w.player;
  w.actors=[p];w.zone.level=10;w.time=4;p.skills.fill(null);p.statuses=[];p.buffs.clear();
  const configure=(a:Actor)=>{a.sheet.setSource('landing-observer',[
    mod('life','override',10000),mod('lifeRegen','override',0),mod('mana','override',10000),mod('manaRegen','override',0),
    mod('critChance','override',0),mod('accuracy','override',100000),mod('ambushBonus','override',0),
    mod('evasion','override',0),mod('blockChance','override',0),mod('armor','override',0),mod('poise','override',0),mod('energyShield','override',0),
    mod('fireRes','override',0),mod('coldRes','override',0),mod('lightningRes','override',0),mod('chaosRes','override',0),
  ]);a.fillResources();a.life=9000;};configure(p);
  const make=(i:number)=>{const a=w.createMonster('zombie',1,'enemy');a.id=70+i;a.noBounty=true;a.skills=[];a.pos={x:p.pos.x+40+i*35,y:p.pos.y};a.tier=p.tier;a.stationary=true;a.facing=0;configure(a);w.actors.push(a);return a;};
  const target=make(0),other=make(1),actors=[p,target,other],events:any[]=[],steps:any[]=[],draws:number[]=[],packets:DamagePacket[]=[],results:HitResult[]=[];let observing=false;
  const state=()=>pack({time:w.time,player:w.player,ledger:w.account.ledger,accountDirty:w.accountDirty,
    actors:actors.map(a=>({id:a.id,life:a.life,es:a.es,ward:a.ward,dead:a.dead,pos:{...a.pos},tier:a.tier,team:a.team,kind:a.kind,
      since:a.since,charges:a.charges,pools:a.pools,buffs:a.buffs,statuses:a.statuses,segHitPending:a.segHitPending,plies:a.plies,
      lastCombatAt:a.lastCombatAt,aiHitAt:a.aiHitAt,aiHitById:a.aiHitById,recentHurt:a.recentHurt,
      mimicWatchAt:a.mimicWatchAt,mimicWatch:a.mimicWatch,mimicBank:a.mimicBank,mimicSel:a.mimicSel,
    })),packets,results,flashes:w.flashes,texts:w.texts,kills:w.kills});
  const world=w as unknown as Record<string,any>;
  for(const method of ['bindCombatDeeds','recordSelfDamage','recordDeed','deedEnemy','deedOwned','text','notice','applyThorns','tapCharges','rollOwnProcs','rollTriggers','kill','knockFixtures','bankPools']){
    const fn=world[method];assert.equal(typeof fn,'function',method);world[method]=function(...args:any[]){if(observing)events.push({kind:method,args:pack(args),before:state()});
      try{const result=Reflect.apply(fn,w,args);if(observing)events.push({kind:method+'-return',result:pack(result)});return result;}
      finally{if(observing)events.push({kind:method+'-end',after:state()});}};
  }
  for(const a of actors){
    const get=a.sheet.get.bind(a.sheet);a.sheet.get=(...args)=>{const value=get(...args);if(observing)events.push({kind:'get',actor:a.id,args:pack([args[0],args[1],args[2]]),value});return value;};
    const actor=a as unknown as Record<string,any>;
    for(const method of ['healBy','noteRecent','spendBuffs','isPanicked']){const fn=actor[method];actor[method]=function(...args:any[]){if(observing)events.push({kind:method,actor:a.id,args:pack(args),before:state()});
      try{const result=Reflect.apply(fn,a,args);if(observing)events.push({kind:method+'-return',actor:a.id,result:pack(result)});return result;}
      finally{if(observing)events.push({kind:method+'-end',actor:a.id,after:state()});}};
    }
  }
  const step=(label:string,fn:()=>unknown)=>{observing=true;let result:unknown,error:unknown;try{result=fn();}catch(e){error=e instanceof Error?{name:e.name,message:e.message}:String(e);}finally{observing=false;}steps.push({label,result:pack(result),error:pack(error),state:state()});};
  const r:Rig={w,p,target,other,events,meta:false,packets,results,step};
  w.metaProgressionActive=()=>{if(observing)events.push({kind:'meta-active',value:r.meta});return r.meta;};
  // Retain observed packets independently of whether the assault hook ran.
  // The tap only registers identities; it never changes gameplay objects.
  const rememberPacket=(packet:DamagePacket)=>{if(packets.includes(packet))return;const id=packets.length+1;packets.push(packet);origins.set(packet,'packet-'+id);origins.set(packet.amounts,'amounts-'+id);origins.set(packet.tags,'tags-'+id);if(packet.extra)origins.set(packet.extra,'extra-'+id);};
  const assault=w['assaults'].packet.bind(w['assaults']);w['assaults'].packet=(caster,packet,depth)=>{
    rememberPacket(packet);
    if(observing)events.push({kind:'assault-packet',args:pack([caster,packet,depth]),before:state()});assault(caster,packet,depth);r.onPacket?.(caster,packet,depth);
    if(observing)events.push({kind:'assault-packet-end',after:state()});
  };
  const beforeEffects=w['challenges'].beforeEffects.bind(w['challenges']);w['challenges'].beforeEffects=(...args)=>{if(observing)events.push({kind:'before-effects',args:pack(args)});return beforeEffects(...args);};
  SIM_TAP.current={onHit:(caster,victim,result,packet)=>{rememberPacket(packet);const id=results.length+1;results.push(result);origins.set(result,'result-'+id);if(result.receivedAmounts)origins.set(result.receivedAmounts,'received-'+id);
    if(observing)events.push({kind:'applied-hit',args:pack([caster,victim,result,packet]),after:state()});}};
  const random=mulberry32(0x71b3);Math.random=()=>{const n=r.random?r.random():random();if(observing){draws.push(n);events.push({kind:'random',value:n});}return n;};
  try{run(r);rows.push({name,steps,events,draws});}finally{SIM_TAP.current=previousTap;restore();Math.random=originalRandom;}
}
function strike(patch:Partial<SkillDef>={}):SkillInstance {
  const inst=makeSkillInstance({...SKILLS.firebolt,id:'observed-landing',name:'Observed landing',tree:undefined,leveling:undefined,baseDamage:{physical:[100,100],fire:[20,20]},effects:[{type:'damage'}],...patch},1);
  origins.set(inst,'primary');origins.set(inst.def,'primary-definition');return inst;
}
type Options={caster?:Actor;target?:Actor;mult?:number;depth?:number;force?:boolean;effects?:SkillEffect[]};
function hit(r:Rig,inst:SkillInstance,options:Options={}){r.step('hit',()=>r.w['resolveHit'](options.caster??r.p,inst,options.target??r.target,options.mult??1,options.depth??0,undefined,options.force??false,false,options.effects));}
function tune(actor:Actor,mods:Parameters<typeof mod>[]){actor.sheet.setSource('landing-tuning',mods.map(args=>mod(...args)));}
function qualifying(r:Rig){r.meta=true;r.target.noBounty=false;r.other.noBounty=false;}
function block(r:Rig,value=10000){r.random=()=>.25;tune(r.target,[['blockChance','override',1],['blockValue','override',value]]);}

course('plain',r=>hit(r,strike()));
for(const nativeDamage of [false,true])for(const force of [false,true])for(const deliveryDamage of [false,true])course('admission-'+nativeDamage+'-'+force+'-'+deliveryDamage,r=>{
  hit(r,strike({effects:nativeDamage?[{type:'damage'}]:[{type:'ward',amount:3}]}),{force,effects:deliveryDamage?[{type:'damage'}]:undefined});
});
course('empty-authored-effects',r=>hit(r,strike({effects:[]})));
course('replacement-definition-admission',r=>{const original=strike(),replacement=strike({id:'replacement',effects:[],baseDamage:{cold:[30,30]}});origins.set(replacement,'replacement');origins.set(replacement.def,'replacement-definition');r.w['attackSequences'].forTarget=()=>replacement;hit(r,original);});
course('replacement-definition-refusal',r=>{const original=strike({effects:[]}),replacement=strike({id:'replacement',effects:[{type:'damage'}]});origins.set(replacement,'replacement');r.w['attackSequences'].forTarget=()=>replacement;hit(r,original);});
for(const depth of [-1,0,1,3])for(const outcome of ['land','evade','block','immune'] as const)course('outcome-'+outcome+'-depth-'+depth,r=>{
  if(outcome==='evade')tune(r.target,[['hitImmune','override',1],['lifeOnEvade','override',25]]);
  if(outcome==='block')block(r);if(outcome==='immune'){r.target.invulnerable=true;r.target.tune={pulse:false};}
  if(outcome==='evade'||outcome==='block')r.target.addBuff({type:'buff',id:'landing-consumable',duration:10,mods:[mod('moveSpeed','flat',1)],consumeOn:{on:outcome}});
  const inst=strike({effects:[{type:'damage'},{type:'status',status:'chill',chance:1}]});if(depth<0)inst.procChainDepth=-2;hit(r,inst,{depth});
});
for(const gain of [-1,0,25])course('evade-heal-'+gain,r=>{tune(r.target,[['hitImmune','override',1],['lifeOnEvade','override',gain]]);hit(r,strike());});
course('native-attack-evade',r=>{tune(r.target,[['evasion','override',1000000]]);r.target.evadeWindow=1;r.target.evadeEntropy=0;hit(r,strike({tags:['attack','melee','physical']}));});
course('native-area-evade',r=>{tune(r.target,[['areaAvoidance','override',1]]);hit(r,strike({tags:['spell','aoe','fire']}));});
for(const value of [0,20,10000])for(const gain of [-1,0,30])course('block-value-'+value+'-heal-'+gain,r=>{r.random=()=>.25;tune(r.target,[['blockChance','override',1],['blockValue','override',value],['lifeOnBlock','override',gain]]);hit(r,strike());});
for(const heal of [0,200])course('block-lethal-seep-heal-'+heal,r=>{r.random=()=>.25;r.target.life=10;tune(r.target,[['blockChance','override',1],['blockValue','override',0],['lifeOnBlock','override',heal]]);hit(r,strike());});
course('block-seep-already-dead',r=>{r.target.life=10;r.target.dead=true;block(r,0);hit(r,strike());});
for(const kind of ['zero','negative','ward','shield','ply'] as const)course('zero-land-'+kind,r=>{
  const inst=strike(kind==='zero'?{baseDamage:{physical:[0,0]}}:{});
  if(kind==='ward')r.target.ward=1000;if(kind==='shield'){tune(r.target,[['energyShield','override',1000]]);r.target.es=1000;}
  if(kind==='ply'){r.target.plies=1;r.target.pliesMax=1;r.target.plySpec={count:1};}
  hit(r,inst,{mult:kind==='negative'?-1:1});
});
for(const relation of ['outgoing','incoming','self','enemy-pair','owned','friendly'] as const)for(const meta of [false,true])course('deeds-'+relation+'-'+meta,r=>{
  qualifying(r);r.meta=meta;if(relation==='owned')r.other.owner=r.p;if(relation==='friendly')r.target.team='player';
  hit(r,strike(),relation==='incoming'?{caster:r.target,target:r.p}:relation==='self'?{target:r.p}:relation==='enemy-pair'?{caster:r.other}:relation==='owned'?{caster:r.other}:{});
});
for(const kind of ['invisible','concealed','quiet','panicked','critical','lethal','poise','no-bounty','passive'] as const)course('deed-flags-'+kind,r=>{
  qualifying(r);if(kind==='invisible')tune(r.p,[['invisible','override',1]]);if(kind==='concealed')tune(r.p,[['concealment','override',1]]);if(kind==='quiet')tune(r.p,[['detectability','override',.5]]);
  if(kind==='panicked')r.target.isPanicked=()=>true;if(kind==='critical')tune(r.p,[['critChance','override',1]]);if(kind==='lethal')r.target.life=1;
  if(kind==='poise'){tune(r.target,[['poise','override',100]]);r.target.poise=1;}if(kind==='no-bounty')r.target.noBounty=true;if(kind==='passive')r.target.passive=true;
  hit(r,strike({baseDamage:{physical:[50,50],fire:[20,20],cold:[10,10],lightning:[5,5],chaos:[3,3]}}));
});
for(const outcome of ['evade','block','seep','immune'] as const)course('deed-incoming-'+outcome,r=>{
  qualifying(r);if(outcome==='evade')tune(r.p,[['hitImmune','override',1]]);if(outcome==='block'||outcome==='seep'){r.random=()=>.25;}if(outcome==='block'||outcome==='seep')tune(r.p,[['blockChance','override',1],['blockValue','override',outcome==='block'?10000:0]]);if(outcome==='immune')r.p.invulnerable=true;
  hit(r,strike(),{caster:r.target,target:r.p});
});
for(const life of [1,50,200,9000])course('self-damage-life-'+life,r=>{qualifying(r);r.p.life=life;hit(r,strike(),{target:r.p});});
course('self-damage-fully-soaked',r=>{qualifying(r);r.p.ward=1000;hit(r,strike(),{target:r.p});});
course('hidden-panicked-captured-before-packet',r=>{qualifying(r);tune(r.p,[['invisible','override',1]]);let panic=true;r.target.isPanicked=()=>panic;
  r.onPacket=()=>{tune(r.p,[['invisible','override',0],['detectability','override',1],['concealment','override',0]]);panic=false;};hit(r,strike());
});
course('life-captured-before-packet',r=>{qualifying(r);r.onPacket=()=>{r.p.life=8000;};hit(r,strike(),{target:r.p});});
course('received-elements-after-conversion',r=>{qualifying(r);tune(r.target,[['takenAs_physical_cold','override',1]]);hit(r,strike({baseDamage:{physical:[100,100]}}));});
course('deed-block-stopped-zero',r=>{qualifying(r);r.random=()=>.25;tune(r.p,[['blockChance','override',1],['blockPower','override',0]]);hit(r,strike(),{caster:r.target,target:r.p});});
course('deed-target-already-zero-life',r=>{qualifying(r);r.target.life=0;hit(r,strike());});
course('deed-meta-changes-during-record',r=>{qualifying(r);r.random=()=>.25;tune(r.p,[['blockChance','override',1],['blockValue','override',0]]);const record=r.w['recordDeed'].bind(r.w);
  r.w['recordDeed']=(...args)=>{record(...args);r.meta=false;};hit(r,strike(),{caster:r.target,target:r.p});
});
course('player-changes-during-deed-binding',r=>{qualifying(r);r.other.team='player';r.other.kind='player';const bind=r.w['bindCombatDeeds'].bind(r.w);r.w['bindCombatDeeds']=()=>{bind();r.w.localSeat.actor=r.other;};hit(r,strike(),{caster:r.target,target:r.p});});
for(const cue of [undefined,false,'rear_hit',''] as const)course('rear-cue-'+String(cue),r=>hit(r,strike({backstabMult:2,backstabCue:cue})));
course('rear-without-damage',r=>{r.target.ward=1000;hit(r,strike({backstabMult:2}));});
course('crit-downgraded',r=>{tune(r.p,[['critChance','override',1]]);tune(r.target,[['critAvoid','override',1]]);hit(r,strike());});
for(const gate of ['watching','no-slot','unstudied','forbidden','friendly','non-player','cool-watch'] as const)course('mimic-'+gate,r=>{
  if(gate!=='no-slot')r.p.skills[0]=makeSkillInstance(SKILLS.mimicry,1);if(gate!=='unstudied')r.w.account.ledger[bestiaryKey('zombie')]=100000;
  if(gate==='friendly')r.target.team='player';if(gate==='non-player')r.p.kind='monster';if(gate==='cool-watch'){r.p.mimicWatchAt=r.w.time;r.p.mimicWatch=false;}
  hit(r,strike({mimicable:gate==='forbidden'?false:undefined}),{caster:r.target,target:r.p});
});
course('mimic-known-refresh',r=>{r.p.skills[0]=makeSkillInstance(SKILLS.mimicry,1);r.w.account.ledger[bestiaryKey('zombie')]=100000;const inst=strike();hit(r,inst,{caster:r.target,target:r.p});r.w.time+=2;hit(r,inst,{caster:r.target,target:r.p});});
course('pool-bank-real-skill',r=>{const pool=Object.values(SKILLS).find(d=>d.pool?.fromDamage?.fire);assert(pool);r.p.skills[0]=makeSkillInstance(pool,1);hit(r,strike());});
course('pool-bank-ordered-snapshot',r=>{r.onPacket=(_c,p)=>{p.amounts={fire:20,cold:0,physical:100,chaos:0};origins.set(p.amounts,'replacement-amounts');};
  const proc=r.w['rollOwnProcs'].bind(r.w);r.w['rollOwnProcs']=(...args)=>{proc(...args);if(args[1]==='hurt')r.packets[0].amounts.chaos=undefined;};
  const bank=r.w['bankPools'].bind(r.w);let changed=false;r.w['bankPools']=(...args)=>{bank(...args);if(!changed){changed=true;r.packets[0].amounts.lightning=99;r.packets[0].amounts.physical=777;}};hit(r,strike());
});
course('hurt-hook-changes-pool-input',r=>{const proc=r.w['rollOwnProcs'].bind(r.w);r.w['rollOwnProcs']=(...args)=>{proc(...args);if(args[1]==='hurt'){r.packets[0].amounts.cold=13;delete r.packets[0].amounts.fire;}};hit(r,strike());});
course('struck-hook-changes-received-packet',r=>{const proc=r.w['rollOwnProcs'].bind(r.w);r.w['rollOwnProcs']=(...args)=>{proc(...args);if(args[1]==='struck')r.packets[0].tags.add('cold');};hit(r,strike());});
course('nested-struck-hit',r=>{const proc=r.w['rollOwnProcs'].bind(r.w);let nested=false;r.w['rollOwnProcs']=(...args)=>{proc(...args);if(args[1]==='struck'&&!nested){nested=true;r.w['resolveHit'](r.target,strike({id:'nested'}),r.other,.5,1);}};hit(r,strike(),{mult:2});});
course('nested-block-hit',r=>{block(r);const proc=r.w['rollOwnProcs'].bind(r.w);let nested=false;r.w['rollOwnProcs']=(...args)=>{proc(...args);if(args[1]==='block'&&!nested){nested=true;r.w['resolveHit'](r.target,strike({id:'nested'}),r.other,.5,1);}};hit(r,strike());});
course('packet-callback-failure',r=>{r.onPacket=()=>{r.target.life-=7;throw Error('packet observer fault');};hit(r,strike());});
course('deed-callback-failure',r=>{qualifying(r);const record=r.w['recordDeed'].bind(r.w);r.w['recordDeed']=(...args)=>{record(...args);throw Error('deed observer fault');};hit(r,strike());});
course('evade-heal-failure',r=>{tune(r.target,[['hitImmune','override',1],['lifeOnEvade','override',25]]);const heal=r.target.healBy.bind(r.target);r.target.healBy=(...args)=>{heal(...args);throw Error('evade heal observer fault');};hit(r,strike());});
course('block-proc-failure',r=>{block(r);const proc=r.w['rollOwnProcs'].bind(r.w);r.w['rollOwnProcs']=(...args)=>{proc(...args);if(args[1]==='block')throw Error('block proc observer fault');};hit(r,strike());});
course('pool-bank-failure',r=>{const bank=r.w['bankPools'].bind(r.w);r.w['bankPools']=(...args)=>{bank(...args);throw Error('pool observer fault');};hit(r,strike());});
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows},null,2)+'\n');console.log('Observed '+rows.length+' original hit-landing courses');
