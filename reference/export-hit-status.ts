// Draft original-only hit/status observer. No expected fixture has been accepted.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import {mod} from '../src/engine/stats';
import {STATUS_DEFS,type ActiveStatus} from '../src/engine/status';
import {makeSkillInstance,type SkillInstance,type SkillEffect,type SkillDef,type NextHitRider} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';


bootSimEngine();
const originalRandom=Math.random,rows:unknown[]=[],definitions=JSON.parse(JSON.stringify(STATUS_DEFS));
const examples={stack:'poison',stackMods:'sunscorched',bank:'scalded',doom:'doom',dot:'burn',blessing:'moonlit',plain:'chill',impale:'impaled'};
for(const id of Object.values(examples))assert(STATUS_DEFS[id],id);
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
      hitFlash:a.hitFlash,hitFlashType:a.hitFlashType,buffs:[...a.buffs],statuses:a.statuses.map(s=>({ref:identity(s),state:{...s}})),expired:a.expiredStatuses.map(s=>({ref:identity(s),state:{...s}})),
      sources:a.sheet.sourceNames().filter(k=>k.startsWith('status:')).map(k=>[k,a.sheet.getSourceMods(k)])})),
    retained:retained.map(s=>({ref:identity(s),state:{...s}})),actorIds:w.actors.map(a=>a.id),flashes:w.flashes,kills:w.kills});};
  const world=w as unknown as Record<string,any>;
  for(const name of ['text','kill','recordIndirectDamage','rollStatusProcs','bankPools','executeProc']){const fn=world[name];assert.equal(typeof fn,'function',name);world[name]=function(...args:unknown[]){if(observing)events.push({kind:name,args:pack(args),before:state()});try{return Reflect.apply(fn,w,args);}finally{if(observing)events.push({kind:name+'-end',after:state()});}};}
  for(const a of actors){const get=a.sheet.get.bind(a.sheet),set=a.sheet.setSource.bind(a.sheet),remove=a.sheet.removeSource.bind(a.sheet),apply=a.applyStatus.bind(a),end=a.endStatus.bind(a);
    // The query contract is (id, tags?, extra?). Record all three fields so
    // omitted and explicitly undefined optional arguments have one trace form.
    a.sheet.get=(...args)=>{const value=get(...args);if(observing)events.push({kind:'get',actor:a.id,args:pack([args[0],args[1],args[2]]),value});return value;};
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


function strike(effects:SkillEffect[]=[],patch:Partial<SkillDef>={}):SkillInstance {
  return makeSkillInstance({...SKILLS.firebolt,tree:undefined,leveling:undefined,baseDamage:{physical:[100,100],fire:[20,20]},effects:[{type:'damage'},...effects],...patch},1);
}
function hit(r:Rig,inst:SkillInstance,depth=0,extra?:SkillEffect[]){r.step('hit',()=>r.w['resolveHit'](r.p,inst,r.target,1,depth,undefined,false,false,extra));}
function tune(r:Rig,mods:Parameters<typeof mod>[]){r.p.sheet.setSource('hit-status-tuning',mods.map(args=>mod(...args)));}
for(const id of Object.keys(STATUS_DEFS))course('authored-'+id,r=>hit(r,strike([{type:'status',status:id,chance:1,magnitude:.3}])));
for(const id of Object.keys(STATUS_DEFS))course('stat-'+id,r=>{tune(r,[['apply_'+id,'override',1]]);hit(r,strike());});
for(const status of ['burn','doom','chill','poison'])for(const duration of [.1,.5,1,2])course('duration-'+status+'-'+duration,r=>{tune(r,[['effectDuration','override',duration],['statusMagnitude','override',1.4],['ailmentStacks','override',2.5]]);hit(r,strike([{type:'status',status,chance:1,magnitude:.2,durationOverride:1.5}]));});
for(const status of ['burn','bleed','doom','chill'])for(const lane of ['authored','stat'] as const)for(const bomb of [0,.5,1])course('rupture-'+lane+'-'+status+'-'+bomb,r=>{tune(r,[['igniteToBomb','override',bomb],['dotRupture','override',.4],['curseRupture','override',.6],['doomDot','override',.1],['dotCrit','override',1],['critChance','override',1],['critMulti','override',2],['dotPropagates','override',1],['aoeRadius','override',1.3],['apply_'+status,'override',lane==='stat'?1:0]]);hit(r,strike(lane==='authored'?[{type:'status',status,chance:1,magnitude:.3}]:[]));});
for(const chance of [0,.01,.35,.7,1])for(const resist of [0,1])course('chance-'+chance+'-resist-'+resist,r=>{r.target.sheet.setSource('resist-test',[mod('ailmentResist','override',resist)]);hit(r,strike([{type:'status',status:'burn',chance,magnitude:.3}]));});
for(const wet of [false,true])course('wet-ordered-'+wet,r=>{r.target.rainWet=wet;tune(r,[['apply_burn','override',.55],['applyWet_burn','override',.55],['applyWet_poison','override',1],['apply_chill','override',1]]);hit(r,strike());});
for(const depth of [0,1])for(const resistant of [false,true])course('rider-'+depth+'-'+resistant,r=>{
  const rider:NextHitRider={status:'poison',statusScale:2,addedDamage:{cold:15,physical:10},tags:['spell']};
  r.p.addBuff({type:'buff',id:'observed-rider',duration:8,mods:[],maxStacks:3,stacksOnApply:2,nextHit:rider});r.target.invulnerable=resistant;hit(r,strike(),depth);
});
course('linked-hexes',r=>{r.p.skills[0]=strike([{type:'status',status:'burn',chance:1,magnitude:.2}],{id:'observed-curse-a',name:'Observed A',tags:['curse','fire']});r.p.skills[1]=strike([{type:'status',status:'chill',chance:1}],{id:'observed-curse-b',name:'Observed B',tags:['curse','cold']});hit(r,strike([{type:'status',status:'poison',chance:1,magnitude:.3}],{linkedHexes:{dmgPerHex:.25,durPerHex:.2}}));});
for(const hold of [false,true])for(const depth of [0,1])course('impale-'+hold+'-'+depth,r=>{r.status(r.target,'impaled',{rupture:40,ruptureType:'physical',holdDischarge:hold});tune(r,[['impalePower','override',.25]]);hit(r,strike(),depth);});
course('delivery-status-effect',r=>hit(r,strike([{type:'status',status:'chill',chance:1}]),0,[{type:'status',status:'burn',chance:1,magnitude:.4}]));
course('live-definition-read',r=>{const original=r.target.applyStatus;r.target.applyStatus=(...args)=>{original(...args);if(args[0]==='chill')r.p.sheet.setSource('callback-potency',[mod('statusMagnitude','override',3)]);};hit(r,strike([{type:'status',status:'chill',chance:1},{type:'status',status:'burn',chance:1,magnitude:.4}]));});
course('application-fault',r=>{const original=r.target.applyStatus;r.target.applyStatus=(...args)=>{original(...args);throw new Error('application observer fault');};hit(r,strike([{type:'status',status:'burn',chance:1,magnitude:.4}]));});
course('critical-ailment-observed',r=>{
  tune(r,[['dotCrit','override',1],['critChance','override',1],['critMulti','override',2]]);
  for(let i=0;i<3;i++)hit(r,strike([{type:'status',status:'burn',chance:1,magnitude:.4}]));
  const queries=r.events.filter((e:any)=>e.kind==='get').map((e:any)=>e.args[0]);
  assert(queries.some((id,i)=>id==='dotCrit'&&queries[i+1]==='critChance'&&queries[i+2]==='critMulti'),'Observer must witness an actual ailment critical roll');
});
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,definitions,examples,rows},null,2)+'\n');console.log('Observed '+rows.length+' draft original hit/status courses');
