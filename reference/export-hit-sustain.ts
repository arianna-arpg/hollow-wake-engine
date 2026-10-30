// Original full-resolver observations. Damage and healing always run natively;
// SIM_TAP is read-only. Named callback courses deliberately mutate live state.
import fs from 'node:fs';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import {SIM_TAP} from '../src/engine/tap';
import type {DamagePacket,HitResult} from '../src/engine/damage';
import {mod,type Modifier} from '../src/engine/stats';
import {makeSkillInstance,type SkillInstance,type SkillDef} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';

bootSimEngine();
const rows:any[]=[];
let origins=new WeakMap<object,string>();
function pack(value:any,seen=new WeakMap<object,string>(),at='$'):any {
  if(value===undefined)return {$undefined:true};
  if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return {$number:Object.is(value,-0)?'-0':String(value)};
  if(typeof value==='function')return {$function:value.name};
  if(value===null||typeof value!=='object')return value;
  if(value instanceof Actor)return {$actor:value.id};
  const prior=seen.get(value);if(prior)return {$ref:prior};seen.set(value,at);
  const origin=origins.has(value)?{$origin:origins.get(value)}:{};
  if(value instanceof Set)return {...origin,$set:[...value].map((v,i)=>pack(v,seen,at+'/'+i))};
  if(value instanceof Map)return {...origin,$map:[...value].map(([k,v],i)=>[pack(k,seen,at+'/'+i+'/key'),pack(v,seen,at+'/'+i+'/value')])};
  if(Array.isArray(value)){const array=value.map((v,i)=>pack(v,seen,at+'/'+i));return origins.has(value)?{...origin,$array:array}:array;}
  if(value.def&&Array.isArray(value.sockets))return {skill:value.def.id,definition:origins.get(value.def),instance:origins.get(value),level:value.level,tags:value.def.tags,extraMods:pack(value.extraMods,seen,at+'/extraMods')};
  return {...origin,...Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v,seen,at+'/'+k)]))};
}
type Rig={w:World;p:Actor;target:Actor;first:Actor;second:Actor;third:Actor;events:any[];
  results:HitResult[];packets:DamagePacket[];preparedExtra:(readonly Modifier[])[];add:()=>Actor;
  onHealed?:(actor:Actor,amount:number,silent:boolean)=>void;
  afterHeal?:(actor:Actor,amount:number,landed:number)=>void;
  onBank?:()=>void;step:(label:string,fn:()=>unknown)=>void};
function course(name:string,run:(r:Rig)=>void){
  origins=new WeakMap();const previousRandom=Math.random,restore=seedGlobalRandom(0x71b3),previousTap=SIM_TAP.current;
  const w=makeSimWorld('guardian',0x71b3),p=w.player,actors:Actor[]=[p],events:any[]=[],steps:any[]=[],draws:number[]=[],packets:DamagePacket[]=[],results:HitResult[]=[];
  const preparedExtra:(readonly Modifier[])[]=[];
  let observing=false,r:Rig,nextId=70;
  w.actors=[p];w.zone.level=10;w.time=4;p.skills.fill(null);p.statuses=[];p.buffs.clear();w.metaProgressionActive=()=>false;
  const state=()=>pack({time:w.time,order:w.actors.map(a=>a.id),actors:actors.map(a=>({id:a.id,life:a.life,dead:a.dead,downed:a.downed,pos:{...a.pos},tier:a.tier,team:a.team,
    radius:a.radius,bond:a.bond,construct:a.construct,buffs:a.buffs,restoreGains:a.restoreGains,resourceFlows:a.resourceFlows,
    healedSince:a.healedSince,lastCombatAt:a.lastCombatAt,aiHitAt:a.aiHitAt,aiHitById:a.aiHitById,
  })),packets,results,texts:w.texts});
  const configure=(a:Actor)=>{
    a.sheet.setSource('sustain-observer',[
      mod('life','override',10000),mod('lifeRegen','override',0),mod('mana','override',10000),mod('manaRegen','override',0),
      mod('critChance','override',0),mod('accuracy','override',100000),mod('ambushBonus','override',0),
      mod('evasion','override',0),mod('blockChance','override',0),mod('armor','override',0),mod('poise','override',0),mod('energyShield','override',0),
      mod('fireRes','override',0),mod('coldRes','override',0),mod('lightningRes','override',0),mod('chaosRes','override',0),
      mod('healPower','override',1),mod('healTaken','override',1),mod('vampiricShare','override',0),mod('bondShare','override',0),
    ]);a.fillResources();a.life=9000;
    const get=a.sheet.get.bind(a.sheet);a.sheet.get=(...args)=>{
      if(observing&&a===p&&args[0]==='noiseOnHit'&&args[2]){preparedExtra.push(args[2]);origins.set(args[2],'prepared-extra-'+preparedExtra.length);}
      const value=get(...args);if(observing)events.push({kind:'get',actor:a.id,args:pack([args[0],args[1],args[2]]),value:pack(value)});return value;
    };
    const heal=a.healBy.bind(a);a.healBy=(amount,silent)=>{
      if(observing)events.push({kind:'heal',actor:a.id,amount:pack(amount),silent:pack(silent),before:state()});
      try{const got=heal(amount,silent);if(observing)events.push({kind:'heal-return',actor:a.id,landed:pack(got)});r.afterHeal?.(a,amount,got);return got;}
      finally{if(observing)events.push({kind:'heal-end',actor:a.id,after:state()});}
    };
    const prior=a.onLifeHealed;a.onLifeHealed=(amount,silent)=>{prior?.(amount,silent);if(observing)events.push({kind:'on-healed',actor:a.id,amount,silent});r.onHealed?.(a,amount,silent);};
  };
  const add=()=>{const a=w.createMonster('zombie',1,'enemy');a.id=nextId++;a.noBounty=true;a.skills=[];a.team='player';a.pos={x:p.pos.x+30*(a.id-69),y:p.pos.y};a.tier=p.tier;a.stationary=true;a.facing=0;configure(a);actors.push(a);w.actors.push(a);return a;};
  configure(p);const target=add();target.team='enemy';const first=add(),second=add(),third=add();
  const text=w.text.bind(w);w.text=(...args)=>{if(observing)events.push({kind:'text',args:pack(args),before:state()});return text(...args);};
  const bank=w['bankPools'].bind(w);w['bankPools']=(...args)=>{bank(...args);r.onBank?.();};
  const before=w['challenges'].beforeEffects.bind(w['challenges']);w['challenges'].beforeEffects=(...args)=>{if(observing)events.push({kind:'before-effects',args:pack(args),state:state()});return before(...args);};
  const remember=(packet:DamagePacket)=>{if(packets.includes(packet))return;const id=packets.length+1;packets.push(packet);origins.set(packet,'packet-'+id);origins.set(packet.amounts,'amounts-'+id);origins.set(packet.tags,'tags-'+id);if(packet.extra)origins.set(packet.extra,'extra-'+id);};
  SIM_TAP.current={onHit:(caster,victim,result,packet)=>{remember(packet);results.push(result);origins.set(result,'result-'+results.length);if(result.receivedAmounts)origins.set(result.receivedAmounts,'received-'+results.length);if(observing)events.push({kind:'applied-hit',args:pack([caster,victim,result,packet])});},onHeal:(a,amount)=>{if(observing)events.push({kind:'tap-heal',actor:a.id,amount});}};
  const random=mulberry32(0x71b3);Math.random=()=>{const n=random();if(observing){draws.push(n);events.push({kind:'random',value:n});}return n;};
  r={w,p,target,first,second,third,events,results,packets,preparedExtra,add,step:(label,fn)=>{const initial=state();observing=true;let result:unknown,error:unknown;try{result=fn();}catch(e){error=e instanceof Error?{name:e.name,message:e.message}:String(e);}finally{observing=false;}steps.push({label,before:initial,result:pack(result),error:pack(error),state:state()});}};
  try{run(r);rows.push({name,steps,events,draws});}finally{SIM_TAP.current=previousTap;restore();Math.random=previousRandom;}
}
function strike(patch:Partial<SkillDef>={}):SkillInstance {
  const inst=makeSkillInstance({...SKILLS.firebolt,id:'observed-sustain',name:'Observed sustain',tree:undefined,leveling:undefined,baseDamage:{physical:[100,100]},effects:[{type:'damage'}],...patch},1);
  origins.set(inst,'primary');origins.set(inst.def,'primary-definition');return inst;
}
function hit(r:Rig,inst:SkillInstance=strike(),depth=0){r.step('hit',()=>r.w['resolveHit'](r.p,inst,r.target,1,depth));}
function tune(a:Actor,mods:Parameters<typeof mod>[]){a.sheet.setSource('sustain-tuning',mods.map(args=>mod(...args)));}
function share(r:Rig,value=.25){tune(r.p,[['vampiricShare','override',value],['bondShare','override',.5]]);}
function bond(r:Rig,a=r.first){a.addBuff({type:'buff',id:'observed-bond',duration:10,mods:[]});r.p.bond={targetId:a.id,buffId:'observed-bond'};}
function tree(a:Actor,patch:Partial<NonNullable<Actor['construct']>>={}){a.radius=12;a.construct={kind:'tree',range:150,timer:0,healBurst:{ratio:.2,cap:300,radius:100},stored:40,baseRadius:12,...patch};}

course('plain',r=>hit(r));
for(const depth of [-1,0,1,3])course('all-lanes-depth-'+depth,r=>{share(r);bond(r);tree(r.second);const inst=strike({siphon:.5});if(depth<0)inst.procChainDepth=-2;hit(r,inst,depth);});
for(const value of [undefined,0,-.5,.5])course('siphon-'+String(value),r=>hit(r,strike({siphon:value})));
for(const kind of ['dead','downed','full','sealed','heal-taken','heal-power','zero-damage','ward','no-damage'] as const)course('siphon-'+kind,r=>{
  if(kind==='dead')r.p.dead=true;if(kind==='downed')r.p.downed=true;if(kind==='full')r.p.life=10000;if(kind==='sealed')r.p.lifeSealAt=9010;
  if(kind==='heal-taken')tune(r.p,[['healTaken','override',.5]]);if(kind==='heal-power')tune(r.p,[['healPower','override',2]]);if(kind==='ward')r.target.ward=10000;
  hit(r,strike({siphon:.5,...(kind==='zero-damage'?{baseDamage:{physical:[0,0]}}:{}),...(kind==='no-damage'?{effects:[]}:{} )}));
});
for(const cue of [undefined,false,{profile:'restoration',color:'#123456'}] as const)course('feeding-cue-'+(cue===false?'disabled':cue?'custom':'default'),r=>{share(r);hit(r,strike({siphon:.5,feedingCue:cue}));});
course('feeding-cue-coalesces',r=>{share(r);const inst=strike({siphon:.5});hit(r,inst);r.target.pos.x+=5;hit(r,inst);});
for(const gate of ['eligible','dead','downed','enemy','other-story','same-zero-story','outside','exact-radius','inside','full','healed-half','healed-below-half','healed-above-half'] as const)course('share-'+gate,r=>{
  share(r);if(gate==='dead')r.first.dead=true;if(gate==='downed')r.first.downed=true;if(gate==='enemy')r.first.team='enemy';if(gate==='other-story')r.first.tier=(r.p.tier??0)+1;
  if(gate==='same-zero-story'){r.p.tier=0;r.first.tier=undefined as any;}
  if(gate==='outside'||gate==='exact-radius'||gate==='inside')r.first.pos={x:r.p.pos.x+(gate==='outside'?180.0001:gate==='inside'?179.9999:180),y:r.p.pos.y};
  if(gate==='full')r.first.life=10000;
  if(gate.startsWith('healed-'))r.first.life=10000-(gate==='healed-half'?.5:gate==='healed-below-half'?.25:.75);
  hit(r);
});
for(const value of [-.5,0,.5])course('share-value-'+value,r=>{share(r,value);hit(r);});
for(const gate of ['valid','missing','dead','no-buff','enemy-far-other-story','zero-feed','negative-feed','null-feed','custom-feed','zero-share','negative-share','full','half','above-half','self','duplicate-id'] as const)course('bond-'+gate,r=>{
  tune(r.p,[['bondShare','override',.5]]);bond(r);
  if(gate==='missing')r.p.bond!.targetId=9999;if(gate==='dead')r.first.dead=true;if(gate==='no-buff')r.first.buffs.clear();
  if(gate==='enemy-far-other-story'){r.first.team='enemy';r.first.tier=(r.p.tier??0)+1;r.first.pos.x+=1000;}
  if(gate==='zero-share'||gate==='negative-share')tune(r.p,[['bondShare','override',gate==='zero-share'?0:-.5]]);
  if(gate==='full')r.first.life=10000;if(gate==='half')r.first.life=9999.5;if(gate==='above-half')r.first.life=9999.25;
  if(gate==='self')bond(r,r.p);if(gate==='duplicate-id'){r.second.id=r.first.id;r.first.buffs.clear();bond(r,r.second);}
  hit(r,strike({bondFeed:gate==='zero-feed'?0:gate==='negative-feed'?-1:gate==='null-feed'?null as any:gate==='custom-feed'?2:undefined}));
});
for(const gate of ['eligible','dead-caster','dead-tree','enemy-tree','other-target-story','other-caster-story','exact-range','outside','missing-burst','zero-stored','missing-stored','negative-stored','capped','over-cap','missing-base','zero-base','zero-cap','negative-cap'] as const)course('tree-'+gate,r=>{
  tree(r.second);const c=r.second.construct!;
  if(gate==='dead-caster')r.p.dead=true;if(gate==='dead-tree')r.second.dead=true;if(gate==='enemy-tree')r.second.team='enemy';
  if(gate==='other-target-story')r.second.tier=(r.target.tier??0)+1;if(gate==='other-caster-story')r.p.tier=(r.target.tier??0)+1;
  if(gate==='exact-range'||gate==='outside')r.second.pos={x:r.target.pos.x+(gate==='exact-range'?150:150.0001),y:r.target.pos.y};
  if(gate==='missing-burst')c.healBurst=undefined;if(gate==='zero-stored')c.stored=0;if(gate==='missing-stored')c.stored=undefined;if(gate==='negative-stored')c.stored=-50;
  if(gate==='capped')c.stored=290;if(gate==='over-cap')c.stored=400;if(gate==='missing-base')c.baseRadius=undefined;if(gate==='zero-base')c.baseRadius=0;
  if(gate==='zero-cap')c.healBurst!.cap=0;if(gate==='negative-cap')c.healBurst!.cap=-10;hit(r);
});
course('context-and-extra',r=>{const inst=strike({siphon:.5});inst.extraMods=[mod('healPower','override',1.5,['spell']),mod('vampiricShare','override',.25,['spell']),mod('bondShare','override',.5,['spell']),mod('healPower','override',8,['melee'])];bond(r);hit(r,inst);});
course('context-tags-change-during-share',r=>{share(r);bond(r);const inst=strike();inst.extraMods=[mod('healPower','override',2,['spell']),mod('healPower','override',3,['melee'])];r.afterHeal=a=>{if(a===r.first)inst.def.tags=['attack','melee'];};hit(r,inst);});
course('siphon-changes-share-and-definition',r=>{const inst=strike({siphon:.5});r.afterHeal=(a,_amount,landed)=>{if(a===r.p&&landed>0){share(r,.4);inst.def.feedingCue=false;}};hit(r,inst);});
course('siphon-kills-caster',r=>{share(r);bond(r);tree(r.second);r.onHealed=a=>{if(a===r.p)r.p.dead=true;};hit(r,strike({siphon:.5}));});
course('share-kills-caster',r=>{share(r);bond(r);tree(r.second);r.onHealed=a=>{if(a===r.first)r.p.dead=true;};hit(r);});
for(const mutation of ['kill','team','story','move','remove','append','replace-list','change-power','change-cue','clear-bond','replace-bond','remove-buff','replace-tree'] as const)course('share-callback-'+mutation,r=>{
  share(r);bond(r,r.third);tree(r.second);const inst=strike();let changed=false;
  r.afterHeal=a=>{if(a!==r.first||changed)return;changed=true;
    if(mutation==='kill')r.second.dead=true;if(mutation==='team')r.second.team='enemy';if(mutation==='story')r.second.tier=(r.p.tier??0)+1;if(mutation==='move')r.second.pos.x+=1000;
    if(mutation==='remove')r.w.actors.splice(r.w.actors.indexOf(r.second),1);
    if(mutation==='append'){const added=r.add();added.pos={...r.first.pos};}
    if(mutation==='replace-list')r.w.actors=[r.p,r.target,r.second];
    if(mutation==='change-power')tune(r.p,[['healPower','override',3],['vampiricShare','override',.8],['bondShare','override',.5]]);
    if(mutation==='change-cue')inst.def.feedingCue={profile:'restoration',color:'#654321'};
    if(mutation==='clear-bond')r.p.bond=undefined;if(mutation==='replace-bond')bond(r,r.second);if(mutation==='remove-buff')r.third.buffs.clear();
    if(mutation==='replace-tree')tree(r.second,{stored:280,baseRadius:20});
  };hit(r,inst);
});
for(const kind of ['packet','prepared'] as const)course('captured-dealt-'+kind+'-extra',r=>{share(r);bond(r);tree(r.second);const inst=strike({siphon:.5});inst.extraMods=[mod('healPower','override',1.25)];let changed=false;
  r.onBank=()=>{if(changed)return;changed=true;r.results[0].total=999;r.packets[0].amounts.physical=888;(kind==='packet'?r.packets[0].extra!:r.preparedExtra[0] as Modifier[]).push(mod('healPower','override',2));};hit(r,inst);
});
course('nested-heal-hit',r=>{share(r);bond(r);tree(r.second);const nested=strike({siphon:.1});origins.set(nested,'nested');origins.set(nested.def,'nested-definition');let done=false;
  r.onHealed=a=>{if(a!==r.first||done)return;done=true;r.w['resolveHit'](r.p,nested,r.target,.5,1);};hit(r,strike({siphon:.5}));
});
for(const lane of ['siphon','share','bond'])course(lane+'-callback-failure',r=>{
  tree(r.second);if(lane==='share')share(r);if(lane==='bond'){tune(r.p,[['bondShare','override',.5]]);bond(r);}
  r.onHealed=()=>{throw Error(lane+' callback fault');};hit(r,strike({siphon:lane==='siphon'?.5:undefined}));
});
course('share-text-failure',r=>{share(r);tree(r.second);const text=r.w.text.bind(r.w);r.w.text=(...args)=>{text(...args);if(args[2]==='#8ae0a8')throw Error('share text fault');};hit(r);});
course('tree-write-failure',r=>{tree(r.first);tree(r.second);let stored=r.second.construct!.stored;Object.defineProperty(r.second.construct!,'stored',{enumerable:true,configurable:true,get:()=>stored,set:value=>{stored=value;throw Error('tree write fault');}});hit(r);});

fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows},null,2)+'\n');
console.log('Observed '+rows.length+' original hit-sustain courses');
