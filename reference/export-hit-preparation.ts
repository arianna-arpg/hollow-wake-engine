// Original-only hit preparation observer. No SDK implementation or accepted fixture yet.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import {mod,type DamageType} from '../src/engine/stats';
import type {ActiveStatus} from '../src/engine/status';
import {makeSkillInstance,type SkillInstance,type SkillEffect,type SkillDef} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {DEFENSE_CFG} from '../src/engine/defense';

bootSimEngine();
const originalRandom=Math.random,rows:any[]=[];
let origins=new WeakMap<object,string>();
function pack(value:any,seen=new WeakMap<object,string>(),at='$'):any {
  if(value===undefined)return {$undefined:true};
  if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return {$number:Object.is(value,-0)?'-0':String(value)};
  if(typeof value==='function')return {$function:value.name};if(value===null||typeof value!=='object')return value;
  if(value instanceof Actor)return {$actor:value.id};const prior=seen.get(value);if(prior)return {$ref:prior};seen.set(value,at);
  if(value instanceof Set)return {$set:[...value].map((v,i)=>pack(v,seen,at+'/'+i))};
  if(value instanceof Map)return {$map:[...value].map(([k,v],i)=>[pack(k,seen,at+'/'+i+'/key'),pack(v,seen,at+'/'+i+'/value')])};
  if(Array.isArray(value))return value.map((v,i)=>pack(v,seen,at+'/'+i));
  if(value.def&&Array.isArray(value.sockets))return {skill:value.def.id,definition:origins.get(value.def),instance:origins.get(value),level:value.level,tags:value.def.tags,extraMods:pack(value.extraMods,seen,at+'/extraMods')};
  return Object.assign(origins.has(value)?{$origin:origins.get(value)}:{},Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v,seen,at+'/'+k)])));
}
type Rig={w:World;p:Actor;target:Actor;other:Actor;events:any[];step:(label:string,fn:()=>unknown)=>void;status:(a:Actor,id:string,fields?:Partial<ActiveStatus>)=>ActiveStatus};
function course(name:string,run:(r:Rig)=>void){
  origins=new WeakMap();const restore=seedGlobalRandom(0x2c91);const w=makeSimWorld('guardian',0x2c91),p=w.player;
  w.actors=[p];w.zone.level=10;w.time=4;p.skills.fill(null);p.statuses=[];p.buffs.clear();
  p.sheet.setSource('prep-observer',[mod('life','override',10000),mod('lifeRegen','override',0),mod('mana','override',10000),mod('manaRegen','override',0),mod('critChance','override',0),mod('accuracy','override',100000),mod('ambushBonus','override',0)]);p.fillResources();
  const make=(i:number)=>{const a=w.createMonster('zombie',1,'enemy');a.id=70+i;a.noBounty=true;a.skills=[];a.pos={x:p.pos.x+40+i*35,y:p.pos.y};a.tier=p.tier;a.stationary=true;a.facing=0;
    a.sheet.setSource('prep-observer',[mod('life','override',10000),mod('lifeRegen','override',0),mod('evasion','override',0),mod('blockChance','override',0),mod('moveSpeed','override',0),mod('armor','override',0),mod('poise','override',0)]);a.fillResources();w.actors.push(a);return a;};
  const target=make(0),other=make(1),actors=[p,target,other],events:any[]=[],steps:any[]=[],draws:number[]=[],retained:ActiveStatus[]=[],ids=new WeakMap<ActiveStatus,number>();let observing=false;
  const identity=(s:ActiveStatus)=>{let n=ids.get(s);if(!n){n=retained.length+1;ids.set(s,n);retained.push(s);}return n;};
  const state=()=>{for(const a of actors)for(const s of a.statuses)identity(s);return pack({time:w.time,lastCombatAt:w.lastCombatAt,pendingFuses:w.pendingFuses,
    actors:actors.map(a=>({id:a.id,life:a.life,es:a.es,ward:a.ward,dead:a.dead,pos:{...a.pos},tier:a.tier,team:a.team,grudgeMark:a.grudgeMark,possession:a.possession,segHitPending:a.segHitPending,shell:a.shellGuard,casting:a.casting,alertUntil:a.alertUntil,aiTargetId:a.aiTargetId,tone:a.tone,
      statuses:a.statuses.map(s=>({ref:identity(s),state:{...s}})),sources:a.sheet.sourceNames().filter(k=>k.startsWith('status:')).map(k=>[k,a.sheet.getSourceMods(k)])})),
    retained:retained.map(s=>({ref:identity(s),state:{...s}})),flashes:w.flashes,texts:w.texts,kills:w.kills});};
  const world=w as unknown as Record<string,any>;
  for(const name of ['text','noiseAt','seatOf','tryGuardBlock','tryShellBlock','knockFixtures','kill']){const fn=world[name];assert.equal(typeof fn,'function',name);world[name]=function(...args:unknown[]){if(observing)events.push({kind:name,args:pack(args),before:state()});try{const result=Reflect.apply(fn,w,args);if(observing)events.push({kind:name+'-return',result:pack(result)});return result;}finally{if(observing)events.push({kind:name+'-end',after:state()});}};}
  for(const [object,name,label] of [[w['attackSequences'],'forTarget','sequence-target'],[w['assaults'],'packet','packet'],[w['challenges'],'beforeEffects','before-effects']] as const){const fn=(object as any)[name].bind(object);(object as any)[name]=(...args:any[])=>{if(observing)events.push({kind:label,args:pack(args),before:state()});const result=fn(...args);if(observing)events.push({kind:label+'-end',result:pack(result),after:state()});return result;};}
  for(const a of actors){const get=a.sheet.get.bind(a.sheet),remove=a.sheet.removeSource.bind(a.sheet);
    a.sheet.get=(...args)=>{const value=get(...args);if(observing)events.push({kind:'get',actor:a.id,args:pack([args[0],args[1],args[2]]),value});return value;};
    a.sheet.removeSource=id=>{if(observing)events.push({kind:'remove',actor:a.id,id,before:state()});return remove(id);};
  }
  const random=mulberry32(0x2c91);Math.random=()=>{const n=random();if(observing){draws.push(n);events.push({kind:'random',value:n});}return n;};
  const step=(label:string,fn:()=>unknown)=>{observing=true;let result:unknown,error:unknown;try{result=fn();}catch(e){error=e instanceof Error?{name:e.name,message:e.message}:String(e);}finally{observing=false;}steps.push({label,result:pack(result),error:pack(error),state:state()});};
  const r:Rig={w,p,target,other,events,step,status:(a,id,fields={})=>{a.applyStatus(id,10,1,'original-source',{casterId:p.id});const s=a.statuses.find(s=>s.id===id);assert(s,id);Object.assign(s,fields);identity(s);return s;}};
  try{run(r);rows.push({name,steps,events,draws});}finally{restore();Math.random=originalRandom;}
}
function strike(patch:Partial<SkillDef>={}):SkillInstance {
  const inst=makeSkillInstance({...SKILLS.firebolt,id:'observed-preparation',name:'Observed preparation',tree:undefined,leveling:undefined,baseDamage:{physical:[100,100],fire:[20,20]},effects:[{type:'damage'}],...patch},1);
  origins.set(inst,'primary');origins.set(inst.def,'primary-definition');return inst;
}
type Options={caster?:Actor;target?:Actor;mult?:number;depth?:number;flat?:Partial<Record<DamageType,number>>;force?:boolean;fromFuse?:boolean;effects?:SkillEffect[];origin?:{x:number;y:number};tier?:number};
function hit(r:Rig,inst:SkillInstance,options:Options={}){r.step('hit',()=>r.w['resolveHit'](options.caster??r.p,inst,options.target??r.target,options.mult??1,options.depth??0,options.flat,options.force??false,options.fromFuse??false,options.effects,options.origin,options.tier));}
function tune(r:Rig,mods:Parameters<typeof mod>[]){r.p.sheet.setSource('prep-tuning',mods.map(args=>mod(...args)));}
function guise(r:Rig,broken=false){r.p.possession={seatId:'observer',kind:'possess',prevTeam:'enemy',prevKind:'monster',guiseFaction:'undead',guiseBroken:broken,huskLifeAt:10000,huskLostFrac:0,huskMode:'stands',guestSlot:0,gemId:'observe'};}
function shell(r:Rig,pool:number){r.target.shellGuard={side:'all',arcDeg:360,max:pool,pool,regenDelay:10,regenRate:0,lastHitAt:0,broken:false,color:'#cccccc'};}

course('plain',r=>hit(r,strike()));
for(const depth of [-2,0,1,3])for(const chain of [undefined,0,2])course('depth-'+depth+'-'+chain,r=>{const inst=strike();inst.procChainDepth=chain;hit(r,inst,{depth});});
for(const delay of [0,.5,2])for(const scale of [0,.5,2])course('fuse-'+delay+'-'+scale,r=>{const inst=strike({fuse:{delay}});tune(r,[['fuseDelay','override',scale]]);r.target.segHitPending=3;hit(r,inst,{depth:1,mult:1.5});});
for(const tell of [undefined,'','later'])course('fuse-tell-'+String(tell),r=>hit(r,strike({fuse:{delay:1,tell}})));
course('fuse-explicit-borrow-and-copy',r=>{
 const inst=strike({fuse:{delay:1}}),flat={cold:13},effects:SkillEffect[]=[{type:'status',status:'chill',chance:1}],origin={x:17,y:23};origins.set(flat,'flat');origins.set(effects,'delivery');origins.set(origin,'origin');inst.procChainDepth=3;r.p.tier=2;r.target.segHitPending=8;
 hit(r,inst,{depth:1,mult:1.5,flat,effects,origin,tier:0,force:true});
 r.step('mutate-after-bank',()=>{flat.cold=29;effects.push({type:'ward',amount:7});origin.x=99;inst.level=2;r.p.pos.x+=30;const f=r.w.pendingFuses[0];assert(f.kind==='hit');return {instance:f.inst===inst,flat:f.flat===flat,effects:f.hitEffects===effects,position:f.hitOrigin===origin};});
});
course('fuse-default-origin-copy',r=>{r.p.tier=2;hit(r,strike({fuse:{delay:.5}}));r.step('move-source',()=>{r.p.pos.x+=50;r.p.tier=4;});});
course('fuse-socket-precedence',r=>{const inst=strike({fuse:{delay:9}}),support=Object.values(SUPPORTS).find(s=>s.fuse);assert(support);inst.sockets.push({def:support,level:1});hit(r,inst);});
course('fuse-bypass',r=>hit(r,strike({fuse:{delay:1}}),{fromFuse:true}));
course('fuse-callback-failure',r=>{r.target.segHitPending=9;const text=r.w.text.bind(r.w);r.w.text=(...a)=>{text(...a);throw Error('fuse tell observer fault');};hit(r,strike({fuse:{delay:1}}));});
for(const relation of ['incoming','outgoing','enemy-pair','player-pair'] as const)course('combat-stamps-'+relation,r=>{
 if(relation==='enemy-pair')r.p.team='enemy';if(relation==='player-pair')r.target.team='player';
 hit(r,strike(),relation==='incoming'?{caster:r.target,target:r.p}:{});
});
for(const gate of ['active','broken','self','no-faction'] as const)course('guise-'+gate,r=>{guise(r,gate==='broken');if(gate==='no-faction')r.p.possession!.guiseFaction=undefined;hit(r,strike(),gate==='self'?{target:r.p}:{});});
for(const value of [-1,0,31])course('noise-'+value,r=>{tune(r,[['noiseOnHit','override',value]]);hit(r,strike());});
for(const perStack of [false,true])for(const stacks of [0,1,3])course('shatter-'+perStack+'-'+stacks,r=>{r.status(r.target,'chill',{stacks});r.status(r.target,'burn',{stacks:2});r.status(r.target,'frozen',{stacks:2});hit(r,strike({shatterStatus:{statuses:['chill','frozen'],mult:1.4,perStack}}));});
course('shatter-no-match',r=>{r.status(r.target,'burn');hit(r,strike({shatterStatus:{statuses:['chill'],mult:2}}));});
course('shatter-remove-failure',r=>{r.status(r.target,'chill');r.status(r.target,'frozen');const remove=r.target.sheet.removeSource.bind(r.target.sheet);r.target.sheet.removeSource=id=>{remove(id);throw Error('shatter remove observer fault');};hit(r,strike({shatterStatus:{statuses:['chill','frozen'],mult:2}}));});
for(const gate of ['concealed','invisible','exposed','aware','alert','ally','zero','negative','clock-edge'] as const)course('ambush-'+gate,r=>{
 tune(r,[['concealment','override',gate==='invisible'?0:1],['invisible','override',gate==='invisible'?1:0],['ambushBonus','override',gate==='zero'?0:gate==='negative'?-.5:.5]]);
 if(gate==='exposed')r.p.concealmentExposedUntil=r.w.time+1;if(gate==='aware')r.target.aiTargetId=r.p.id;if(gate==='alert')r.target.alertUntil=r.w.time+1;if(gate==='ally')r.target.team=r.p.team;if(gate==='clock-edge')r.target.alertUntil=r.w.time;
 hit(r,strike());
});
for(const mult of [undefined,0,1,1.5])for(const facing of [0,Math.PI,Math.PI-2,Math.PI-2.001])course('rear-'+String(mult)+'-'+facing,r=>{r.target.facing=facing;hit(r,strike({backstabMult:mult}));});
for(const radius of [0,160,320,321])for(const value of [0,.6])course('proximity-'+radius+'-'+value,r=>{r.target.pos={x:r.p.pos.x+radius,y:r.p.pos.y};tune(r,[['proximityDamage','override',value]]);hit(r,strike());});
for(const match of ['absent','matched','unmatched','explicit','not-owner'] as const)course('breakable-'+match,r=>{
 r.target.construct={kind:'totem',range:1,timer:0,breakable:{ownerMult:3,affinityTags:match==='absent'?undefined:match==='unmatched'?['cold']:['fire'],affinityMult:match==='explicit'?1.5:undefined}};r.target.owner=match==='not-owner'?r.other:r.p;hit(r,strike());
});
for(const source of ['sheet','extra','unarmed'] as const)course('victim-scope-'+source,r=>{r.status(r.target,'burn');const mods=[mod('damage','more',.5,['vs:burn'])];if(source==='sheet')r.p.sheet.setSource('victim-scope',mods);const inst=strike();if(source==='extra')inst.extraMods=mods;hit(r,inst);});
for(const scale of [-1,0,.5,1,2])course('packet-scale-'+scale,r=>hit(r,strike(),{mult:scale,flat:{cold:7,chaos:3}}));
for(const fraction of [-.5,0,.25,1,2])for(const yieldMult of [.5,2])course('affliction-'+fraction+'-'+yieldMult,r=>{tune(r,[['hitToAffliction','override',fraction],['afflictionYield','override',yieldMult]]);r.target.tune={pulse:false};hit(r,strike({effects:[{type:'damage'},{type:'status',status:'burn',chance:1,magnitude:.4}]}),{mult:1.5});});
// The game's StatSheet caps this stat before the local preparation clamp.
// Exercise the local clamp explicitly through an uncapped host query as well.
for(const fraction of [1.25,2])course('affliction-uncapped-'+fraction,r=>{const get=r.p.sheet.get.bind(r.p.sheet);r.p.sheet.get=(...args)=>{const value=get(...args);if(args[0]!=='hitToAffliction')return value;r.events.push({kind:'uncapped-host-query',stat:args[0],value:fraction});return fraction;};hit(r,strike({effects:[{type:'damage'},{type:'status',status:'burn',chance:1,magnitude:.4}]}));});
for(const pool of [20,120,200])course('shell-'+pool,r=>{shell(r,pool);hit(r,strike({effects:[{type:'damage'},{type:'status',status:'chill',chance:1}]}));});
for(const gate of ['block','rear','empty','zero-raw'] as const)course('native-guard-'+gate,r=>{
 const guard=makeSkillInstance(SKILLS.shield_up,1);r.target.skills=[guard];r.target.facing=gate==='rear'?0:Math.PI;
 r.target.casting={inst:guard,mode:'guard',aim:{...r.p.pos},elapsed:1,total:1,held:true,baseMult:1,channelTime:1,shield:gate==='empty'?0:500,maxShield:500};shell(r,200);
 hit(r,strike(gate==='zero-raw'?{baseDamage:{physical:[0,0]}}:{}));
});
course('shell-no-raw',r=>{shell(r,200);hit(r,strike({baseDamage:{physical:[0,0]},effects:[{type:'status',status:'chill',chance:1}]}));});
course('guard-short-circuit',r=>{shell(r,200);r.w['tryGuardBlock']=(...args)=>{r.events.push({kind:'controlled-guard',args:pack(args)});return true;};hit(r,strike());});
course('guard-packet-mutation',r=>{r.w['tryGuardBlock']=(...args)=>{r.events.push({kind:'controlled-guard',args:pack(args)});r.p.pos.x+=10;return false;};hit(r,strike());});
course('shell-callback-failure',r=>{const block=r.w['tryShellBlock'].bind(r.w);shell(r,20);r.w['tryShellBlock']=(...args)=>{block(...args);throw Error('shell observer fault');};hit(r,strike());});
course('replacement-definition-capture',r=>{
 const initial=strike({name:'Initial',tags:['fire'],shatterStatus:{statuses:['chill'],mult:2},backstabMult:1.5}),replacement=strike({id:'replacement',name:'Replacement',tags:['cold'],baseDamage:{cold:[10,10]},effects:[]});origins.set(initial,'initial');origins.set(initial.def,'initial-definition');origins.set(replacement,'replacement');origins.set(replacement.def,'replacement-definition');replacement.extraMods=[mod('noiseOnHit','override',8),mod('damage','more',.25)];r.status(r.target,'chill');
 r.w['attackSequences'].forTarget=(...args)=>{r.events.push({kind:'replace-instance',args:pack(args)});return replacement;};hit(r,initial);
});
course('noise-callback-live-statuses',r=>{tune(r,[['noiseOnHit','override',20]]);const noise=r.w['noiseAt'].bind(r.w);r.w['noiseAt']=(...args)=>{noise(...args);r.status(r.target,'chill',{stacks:4});};hit(r,strike({shatterStatus:{statuses:['chill'],mult:1.2,perStack:true}}));});
course('nested-noise-hit',r=>{tune(r,[['noiseOnHit','override',20]]);const noise=r.w['noiseAt'].bind(r.w);let nested=false;r.w['noiseAt']=(...args)=>{noise(...args);if(!nested){nested=true;r.w['resolveHit'](r.p,strike({id:'nested'}),r.other,.5,1);}};hit(r,strike(),{mult:2});});
course('combined-preparation-order',r=>{guise(r);r.status(r.target,'chill',{stacks:2});tune(r,[['noiseOnHit','override',12],['concealment','override',1],['ambushBonus','override',.3],['proximityDamage','override',.6],['hitToAffliction','override',.25],['afflictionYield','override',2]]);r.target.tune={pulse:false};shell(r,20);hit(r,strike({shatterStatus:{statuses:['chill'],mult:1.2,perStack:true},backstabMult:1.5,effects:[{type:'damage'},{type:'status',status:'burn',chance:1,magnitude:.4}]}),{mult:1.25,flat:{cold:11}});});
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,proximityRadius:DEFENSE_CFG.proximity.radius,rows},null,2)+'\n');console.log('Observed '+rows.length+' original hit-preparation courses');
