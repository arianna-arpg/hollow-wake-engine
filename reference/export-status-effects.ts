// Capture the pinned World implementation before extracting these status verbs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import {mod} from '../src/engine/stats';
import {STATUS_DEFS,type ActiveStatus} from '../src/engine/status';
import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import type {ProcDef} from '../src/data/procs';


bootSimEngine();
const originalRandom=Math.random,rows:unknown[]=[],definitions=JSON.parse(JSON.stringify(STATUS_DEFS));
const examples={stack:'poison',stackMods:'sunscorched',bank:'scalded',doom:'doom',dot:'burn',blessing:'moonlit',plain:'chill',impale:'impaled'};
for(const id of Object.values(examples))assert(STATUS_DEFS[id],id);
const pick=(key:'zapNearby'|'lashOut')=>{const id=Object.keys(STATUS_DEFS).find(id=>STATUS_DEFS[id][key]);assert(id,key);return id;};
const periodic={zap:pick('zapNearby'),lash:pick('lashOut')};
function pack(value:any,seen=new WeakMap<object,string>(),at='$'):any {
  if(value===undefined)return {$undefined:true};if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return {$number:Object.is(value,-0)?'-0':String(value)};
  if(typeof value==='function')return {$function:value.name};if(value===null||typeof value!=='object')return value;
  if(value instanceof Actor)return {$actor:value.id};const prior=seen.get(value);if(prior)return {$ref:prior};seen.set(value,at);
  if(value instanceof Set)return {$set:[...value].map((v,i)=>pack(v,seen,at+'/'+i))};
  if(value instanceof Map)return {$map:[...value].map(([k,v],i)=>[pack(k,seen,at+'/'+i+'/key'),pack(v,seen,at+'/'+i+'/value')])};
  if(Array.isArray(value))return value.map((v,i)=>pack(v,seen,at+'/'+i));
  if(value.def&&Array.isArray(value.sockets))return {skill:value.def.id,level:value.level,tags:value.def.tags,extraMods:pack(value.extraMods,seen,at+'/extraMods')};
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v,seen,at+'/'+k)]));
}
type Rig={w:World;p:Actor;target:Actor;kin:Actor[];events:unknown[];step:(label:string,fn:()=>unknown)=>void;status:(a:Actor,id:string,fields?:Partial<ActiveStatus>)=>ActiveStatus;tick:(dt:number)=>void;skill:(id?:string)=>SkillInstance};
function course(name:string,run:(r:Rig)=>void){
  const restore=seedGlobalRandom(0x51a8);const w=makeSimWorld('guardian',0x51a8),p=w.player;
  w.actors=[p];w.zone.level=10;w.time=0;p.skills.fill(null);p.statuses=[];p.buffs.clear();
  p.sheet.setSource('status-observer',[mod('life','override',10000),mod('lifeRegen','override',0),mod('mana','override',10000),mod('manaRegen','override',0),mod('effectDuration','override',1),mod('critChance','override',0),mod('accuracy','override',100000)]);p.fillResources();
  const make=(i:number)=>{const a=w.createMonster('zombie',1,'enemy');a.id=70+i;a.noBounty=true;a.skills=[];a.pos={x:p.pos.x+40+i*35,y:p.pos.y};a.tier=p.tier;a.stationary=true;
    a.sheet.setSource('status-observer',[mod('life','override',10000),mod('lifeRegen','override',0),mod('evasion','override',0),mod('blockChance','override',0),mod('moveSpeed','override',0),mod('afflictionExpiry','override',1),mod('armor','override',0),mod('poise','override',0)]);a.fillResources();w.actors.push(a);return a;};
  const target=make(0),kin=[make(1),make(2),make(3)],actors=[p,target,...kin],events:unknown[]=[],steps:unknown[]=[],draws:number[]=[],retained:ActiveStatus[]=[],ids=new WeakMap<ActiveStatus,number>();let observing=false;
  const identity=(s:ActiveStatus)=>{let n=ids.get(s);if(!n){n=retained.length+1;ids.set(s,n);retained.push(s);}return n;};
  const state=()=>{for(const a of actors)for(const s of [...a.statuses,...a.expiredStatuses])identity(s);return pack({time:w.time,
    actors:actors.map(a=>({id:a.id,life:a.life,es:a.es,mana:a.mana,ward:a.ward,absorb:a.absorb,poise:a.poise,dead:a.dead,pos:{...a.pos},tier:a.tier,
      hitFlash:a.hitFlash,hitFlashType:a.hitFlashType,statuses:a.statuses.map(s=>({ref:identity(s),state:{...s}})),expired:a.expiredStatuses.map(s=>({ref:identity(s),state:{...s}})),
      sources:a.sheet.sourceNames().filter(k=>k.startsWith('status:')).map(k=>[k,a.sheet.getSourceMods(k)])})),
    retained:retained.map(s=>({ref:identity(s),state:{...s}})),actorIds:w.actors.map(a=>a.id),flashes:w.flashes,kills:w.kills});};
  const world=w as unknown as Record<string,any>;
  for(const name of ['text','kill','recordIndirectDamage']){const fn=world[name];assert.equal(typeof fn,'function',name);world[name]=function(...args:unknown[]){if(observing)events.push({kind:name,args:pack(args),before:state()});try{return Reflect.apply(fn,w,args);}finally{if(observing)events.push({kind:name+'-end',after:state()});}};}
  for(const a of actors){const get=a.sheet.get.bind(a.sheet),set=a.sheet.setSource.bind(a.sheet),remove=a.sheet.removeSource.bind(a.sheet),apply=a.applyStatus.bind(a),end=a.endStatus.bind(a);
    a.sheet.get=(...args)=>{const value=get(...args);if(observing)events.push({kind:'get',actor:a.id,args:pack(args),value});return value;};
    a.sheet.setSource=(id,mods)=>{if(observing)events.push({kind:'source',actor:a.id,id,mods:pack(mods),before:state()});return set(id,mods);};
    a.sheet.removeSource=id=>{if(observing)events.push({kind:'remove',actor:a.id,id,before:state()});return remove(id);};
    a.applyStatus=(...args)=>{if(observing)events.push({kind:'apply',actor:a.id,args:pack(args),before:state()});try{return apply(...args);}finally{for(const s of a.statuses)identity(s);if(observing)events.push({kind:'apply-end',actor:a.id,after:state()});}};
    a.endStatus=id=>{if(observing)events.push({kind:'end',actor:a.id,id,before:state()});return end(id);};
  }
  const random=mulberry32(0x51a8);Math.random=()=>{const n=random();if(observing){draws.push(n);events.push({kind:'random',value:n});}return n;};
  const step=(label:string,fn:()=>unknown)=>{observing=true;let result:unknown,error:unknown;try{result=fn();}catch(e){error=e instanceof Error?{name:e.name,message:e.message}:String(e);}finally{observing=false;}steps.push({label,result:pack(result),error:pack(error),state:state()});};
  const r:Rig={w,p,target,kin,events,step,status:(a,id,fields={})=>{a.applyStatus(id,10,1,'original-source',{casterId:p.id});const s=a.statuses.find(s=>s.id===id);assert(s,id);Object.assign(s,fields);identity(s);return s;},tick:dt=>step('world-tick',()=>w.update(dt)),skill:(id='firebolt')=>makeSkillInstance(SKILLS[id],5)};
  try{run(r);rows.push({name,steps,events,draws});}finally{restore();Math.random=originalRandom;}
}

for(const id of Object.keys(STATUS_DEFS))course('transplant-authored-'+id,r=>{
  const s=r.status(r.target,id,{remaining:2,stacks:2,dps:12,power:1.5,leech:.2,rupture:4,ruptureType:'fire',ruptureRadius:37,sourceKey:'lane',holdDischarge:true});
  r.step('transplant',()=>r.w['transplantStatus'](r.kin[0],s,'transplanted'));
});
for(const duration of [undefined,'remaining','refresh'] as const)for(const remaining of [-2,0,.01,4])course(`transplant-clock-${duration}-${remaining}`,r=>{const s=r.status(r.target,examples.dot,{remaining,stacks:2.5,dps:10});r.step('transplant',()=>r.w['transplantStatus'](r.kin[0],s,'moved',{duration,strengthScale:.5,durationScale:2}));});
for(const gate of ['field','dead','unknown'] as const)course('transplant-gate-'+gate,r=>{const s=r.status(r.target,examples.dot);if(gate==='field')s.challengeField=1;if(gate==='dead')r.kin[0].dead=true;if(gate==='unknown')s.id='missing';r.step('transplant',()=>r.w['transplantStatus'](r.kin[0],s,'moved'));});
for(const portion of [-1,0,.1,.5,1,2])course('ring-'+portion,r=>{r.status(r.target,examples.stackMods,{stacks:4,power:2});r.status(r.target,examples.dot,{remaining:3});r.status(r.target,examples.blessing);r.step('ring',()=>r.w['ringAfflictions'](r.target,portion));});
for(const n of [1,2,3])course('shed-'+n,r=>{const s=r.status(r.target,examples.stackMods,{stacks:n,power:2});r.step('shed',()=>r.w['shedStatusStack'](r.target,s));});
course('shed-absent-reference',r=>{r.status(r.target,examples.dot);const s={id:examples.stackMods,remaining:3,stacks:1,dps:0,sourceName:'external'};r.step('shed',()=>r.w['shedStatusStack'](r.target,s));});
for(const n of [-1,0,.5,2,100])course('cleanse-'+n,r=>{r.status(r.target,examples.dot);r.status(r.target,examples.plain);r.status(r.target,examples.blessing);r.step('cleanse',()=>r.w['cleanseActor'](r.target,n));});
for(const fraction of [-1,0,.25,1,2])for(const multiplier of [0,1,2])course(`bank-${fraction}-${multiplier}`,r=>{r.status(r.target,examples.bank,{dps:20,stacks:3,remaining:4,bankPeak:30});r.target.ward=15;r.step('rupture',()=>r.w.ruptureBank(r.p,r.target,examples.bank,fraction,multiplier,new Set(['spell']),[]));});
for(const gate of ['missing','unknown','dead','immune','expired','tiny','lethal'] as const)course('bank-gate-'+gate,r=>{if(gate!=='missing')r.status(r.target,examples.bank,{dps:gate==='tiny'?.06:20,remaining:gate==='expired'?-1:4,bankPeak:30});if(gate==='dead')r.target.dead=true;if(gate==='immune')r.target.invulnerable=true;if(gate==='lethal')r.target.life=1;r.step('rupture',()=>r.w.ruptureBank(r.p,r.target,gate==='unknown'?'unknown':examples.bank,.5,1));});
for(const id of [examples.dot,examples.doom,examples.impale])for(const radius of [0,35,90])course(`rupture-${id}-${radius}`,r=>{const s=r.status(r.target,id,{rupture:30,ruptureRadius:radius,ruptureType:'fire'});r.target.es=100;r.target.ward=100;r.kin[0].sheet.setSource('resistance',[mod('fireRes','override',.5)]);r.kin[1].tier++;r.kin[2].invulnerable=true;r.step('rupture',()=>r.w['ruptureStatus'](r.target,s));});
for(const life of [0,1,20,21])course('doom-cull-'+life,r=>{r.status(r.target,examples.doom,{rupture:20});r.target.life=life;r.step('cull',()=>r.w.assaultDoomCull(r.target));});
for(const id of [examples.dot,examples.plain,examples.doom,examples.bank,'missing'])for(const withSkill of [false,true])course(`proc-${id}-${withSkill}`,r=>{
  r.p.sheet.setSource('status-investment',[mod('statusMagnitude','override',2),mod('effectDuration','override',1.5),mod('dotLeech_'+id,'override',.2),mod('popPower_'+id,'override',.3)]);
  const proc={id:'observed_status',name:'Observed status',trigger:'hit',chance:1,color:'#123456',effect:{type:'status',status:id,magnitude:1.5}} as ProcDef;
  r.step('proc',()=>r.w['executeProc'](proc,r.p,withSkill?r.skill():null,r.target));
});
for(const silent of [false,true])course('death-statuses-'+silent,r=>{r.status(r.target,examples.dot,{dps:10,stacks:3,remaining:2,total:4,propagates:true,rupture:3,leech:.2,brood:{monsterId:'zombie',perDamage:1,duration:2,max:3},power:2});r.status(r.target,examples.impale,{rupture:20});r.kin[1].tier++;r.kin[2].pos.x=r.target.pos.x+171;r.step('kill',()=>r.w.kill(r.target,silent,r.p));});
course('expiry-rupture',r=>{r.status(r.target,examples.dot,{dps:0,remaining:.01,rupture:30});r.tick(.1);});
course('expiry-matching-type-discarded',r=>{const id=Object.keys(STATUS_DEFS).find(id=>STATUS_DEFS[id].dischargeMatchingType);assert(id);r.status(r.target,id,{dps:0,remaining:.01,rupture:30});r.tick(.1);});
for(const id of [periodic.zap,periodic.lash])course('periodic-'+id,r=>{const s=r.status(r.target,id,{dps:0,remaining:100});r.tick(.01);r.step('advance-beat',()=>{wTime(r.w,10);s.zapAt=0;s.lashAt=0;});r.tick(.01);});
for(const id of [periodic.zap,periodic.lash])for(const gate of ['dead','immune','untargetable','passive','construct','other-team','other-story','outside','tie','stunned','zero-damage'] as const)course(`periodic-${id}-${gate}`,r=>{
  r.status(r.target,id,{dps:0,remaining:100,zapAt:0,lashAt:0});
  r.p.pos.x=r.target.pos.x-1000;
  for(const a of r.kin){a.pos.x=r.target.pos.x+30;if(gate==='dead')a.dead=true;if(gate==='immune')a.invulnerable=true;if(gate==='untargetable')a.untargetable=true;if(gate==='passive')a.passive=true;if(gate==='construct')a.construct={kind:'totem',range:0,timer:100};if(gate==='other-team')a.team='player';if(gate==='other-story')a.tier++;if(gate==='outside')a.pos.x+=10000;if(gate==='zero-damage')a.sheet.setSource('no-damage',[mod('damageTaken','override',0)]);}
  if(gate==='stunned')r.target.isStunned=()=>true;
  r.tick(.01);r.tick(.01);
});
for(const id of [periodic.zap,periodic.lash])course(`periodic-${id}-large-time-jump`,r=>{r.status(r.target,id,{dps:0,remaining:100,zapAt:0,lashAt:0});r.step('advance-clock',()=>{r.w.time=50;});r.tick(.01);r.tick(.01);});
course('death-propagation-cap',r=>{r.status(r.target,examples.dot,{propagates:true,dps:10,total:9,stacks:4,ruptureRadius:88,sourceKey:'discard',holdDischarge:true});for(let i=0;i<8;i++){const a=r.w.createMonster('zombie',1,'enemy');a.id=90+i;a.noBounty=true;a.pos={...r.target.pos};r.w.actors.push(a);r.kin.push(a);}r.step('kill',()=>r.w.kill(r.target,false,r.p));});
course('ring-duplicate-source',r=>{const s=r.status(r.target,examples.stackMods,{stacks:2});r.target.statuses.push({...s,sourceKey:'duplicate'});r.step('ring',()=>r.w['ringAfflictions'](r.target,1));});
course('rupture-reentry',r=>{const s=r.status(r.target,examples.dot,{rupture:10,ruptureRadius:90});const text=r.w.text.bind(r.w);let nested=false;r.w.text=(...args)=>{text(...args);if(!nested){nested=true;r.w['ruptureStatus'](r.kin[0],s);}};r.step('rupture',()=>r.w['ruptureStatus'](r.target,s));});
function wTime(w:World,t:number){w.time=t;}
course('transplant-application-throw',r=>{const s=r.status(r.target,examples.dot,{stacks:3});const apply=r.kin[0].applyStatus.bind(r.kin[0]);let n=0;r.kin[0].applyStatus=(...args)=>{if(++n===2)throw Error('application fault');apply(...args);};r.step('transplant',()=>r.w['transplantStatus'](r.kin[0],s,'moved'));});
course('bank-text-throw',r=>{r.status(r.target,examples.bank,{dps:20,remaining:4});r.w.text=()=>{throw Error('text fault');};r.step('rupture',()=>r.w.ruptureBank(r.p,r.target,examples.bank,.5,1));});
course('ring-source-throw',r=>{r.status(r.target,examples.stackMods,{stacks:4});r.target.sheet.setSource=()=>{throw Error('source fault');};r.step('ring',()=>r.w['ringAfflictions'](r.target,.5));});
assert(rows.length>210);fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,definitions,examples,periodic,courses:rows.length,rows},null,2)+'\n');
console.log(`World status effects: ${rows.length} observed courses`);
