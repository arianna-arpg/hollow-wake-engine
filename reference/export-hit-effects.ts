// Capture original hit-effect dispatch and delivery before implementation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import {mod} from '../src/engine/stats';
import {STATUS_DEFS,type ActiveStatus} from '../src/engine/status';
import {makeSkillInstance,type SkillInstance,type SkillEffect} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';


bootSimEngine();
const originalRandom=Math.random,rows:unknown[]=[],definitions=JSON.parse(JSON.stringify(STATUS_DEFS));
const examples={stack:'poison',stackMods:'sunscorched',bank:'scalded',doom:'doom',dot:'burn',blessing:'moonlit',plain:'chill',impale:'impaled'};
for(const id of Object.values(examples))assert(STATUS_DEFS[id],id);
let effectOrigins=new WeakMap<object,string>();
function pack(value:any,seen=new WeakMap<object,string>(),at='$'):any {
  if(value===undefined)return {$undefined:true};if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return {$number:Object.is(value,-0)?'-0':String(value)};
  if(typeof value==='function')return {$function:value.name};if(value===null||typeof value!=='object')return value;
  if(value instanceof Actor)return {$actor:value.id};const prior=seen.get(value);if(prior)return {$ref:prior};seen.set(value,at);
  if(value instanceof Set)return {$set:[...value].map((v,i)=>pack(v,seen,at+'/'+i))};
  if(value instanceof Map)return {$map:[...value].map(([k,v],i)=>[pack(k,seen,at+'/'+i+'/key'),pack(v,seen,at+'/'+i+'/value')])};
  if(Array.isArray(value))return value.map((v,i)=>pack(v,seen,at+'/'+i));
  if(value.def&&Array.isArray(value.sockets))return {skill:value.def.id,level:value.level,tags:value.def.tags,extraMods:pack(value.extraMods,seen,at+'/extraMods')};
  return Object.assign(effectOrigins.has(value)?{$effectOrigin:effectOrigins.get(value)}:{},Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v,seen,at+'/'+k)])));
}
type Rig={w:World;p:Actor;target:Actor;kin:Actor[];events:unknown[];step:(label:string,fn:()=>unknown)=>void;status:(a:Actor,id:string,fields?:Partial<ActiveStatus>)=>ActiveStatus;tick:(dt:number)=>void;skill:(id?:string)=>SkillInstance};
function course(name:string,run:(r:Rig)=>void){
  effectOrigins=new WeakMap();const restore=seedGlobalRandom(0x51a8);const w=makeSimWorld('guardian',0x51a8),p=w.player;
  w.actors=[p];w.zone.level=10;w.time=0;p.skills.fill(null);p.statuses=[];p.buffs.clear();
  p.sheet.setSource('status-observer',[mod('life','override',10000),mod('lifeRegen','override',0),mod('mana','override',10000),mod('manaRegen','override',0),mod('effectDuration','override',1),mod('critChance','override',0),mod('accuracy','override',100000)]);p.fillResources();
  const make=(i:number)=>{const a=w.createMonster('zombie',1,'enemy');a.id=70+i;a.noBounty=true;a.skills=[];a.pos={x:p.pos.x+40+i*35,y:p.pos.y};a.tier=p.tier;a.stationary=true;
    a.sheet.setSource('status-observer',[mod('life','override',10000),mod('lifeRegen','override',0),mod('evasion','override',0),mod('blockChance','override',0),mod('moveSpeed','override',0),mod('afflictionExpiry','override',1),mod('armor','override',0),mod('poise','override',0)]);a.fillResources();w.actors.push(a);return a;};
  const target=make(0),kin=Array.from({length:10},(_,i)=>make(i+1)),actors=[p,target,...kin],events:unknown[]=[],steps:unknown[]=[],draws:number[]=[],retained:ActiveStatus[]=[],ids=new WeakMap<ActiveStatus,number>();let observing=false;
  const identity=(s:ActiveStatus)=>{let n=ids.get(s);if(!n){n=retained.length+1;ids.set(s,n);retained.push(s);}return n;};
  const state=()=>{for(const a of w.actors)if(!actors.includes(a))actors.push(a);for(const a of actors)for(const s of [...a.statuses,...a.expiredStatuses])identity(s);return pack({time:w.time,
    actors:actors.map(a=>({id:a.id,life:a.life,es:a.es,mana:a.mana,ward:a.ward,absorb:a.absorb,poise:a.poise,dead:a.dead,pos:{...a.pos},tier:a.tier,
      hitFlash:a.hitFlash,hitFlashType:a.hitFlashType,team:a.team,owner:a.owner,push:a.push,bond:a.bond,gripping:a.gripping,heldBy:a.heldBy,grabProofUntil:a.grabProofUntil,possession:a.possession,vacated:a.vacated,sourceSkillId:a.sourceSkillId,bornOf:a.bornOf,lifespan:a.lifespan,buffs:[...a.buffs],statuses:a.statuses.map(s=>({ref:identity(s),state:{...s}})),expired:a.expiredStatuses.map(s=>({ref:identity(s),state:{...s}})),
      sources:a.sheet.sourceNames().filter(k=>k.startsWith('status:')).map(k=>[k,a.sheet.getSourceMods(k)])})),
    retained:retained.map(s=>({ref:identity(s),state:{...s}})),actorIds:w.actors.map(a=>a.id),flashes:w.flashes,texts:w.texts,orbs:w.orbs,tethers:w.tethers,player:w.player,kills:w.kills});};
  const world=w as unknown as Record<string,any>;
  for(const name of ['text','kill','recordIndirectDamage','rollStatusProcs','bankPools','executeProc','applyHealChained','cleanseActor','grantTreeBuff','ruptureBank','pushActor','grabSeize','possessSeize','grantAbsorb','applyRestore','shedOrb','birthAt','transplantStatus','failNote','enemiesOf']){const fn=world[name];assert.equal(typeof fn,'function',name);world[name]=function(...args:unknown[]){if(observing)events.push({kind:name,args:pack(args),before:state()});try{return Reflect.apply(fn,w,args);}finally{if(observing)events.push({kind:name+'-end',after:state()});}};}
  for(const a of actors){const gainWard=a.gainWard.bind(a);a.gainWard=(amount)=>{if(observing)events.push({kind:'ward',actor:a.id,amount,before:state()});const result=gainWard(amount);if(observing)events.push({kind:'ward-end',actor:a.id,result,after:state()});return result;};const get=a.sheet.get.bind(a.sheet),set=a.sheet.setSource.bind(a.sheet),remove=a.sheet.removeSource.bind(a.sheet),apply=a.applyStatus.bind(a),end=a.endStatus.bind(a);
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


function strike(effects:SkillEffect[],damage=true):SkillInstance {
 return makeSkillInstance({...SKILLS.firebolt,id:'observed-hit-effects',name:'Observed effects',tree:undefined,leveling:undefined,
  baseDamage:{physical:[100,100],fire:[20,20]},effects:damage?[{type:'damage'},...effects]:effects},1);
}
function hit(r:Rig,inst:SkillInstance,options:{depth?:number;extra?:SkillEffect[];target?:Actor;mult?:number}={}){
 inst.def.effects.forEach((fx,i)=>effectOrigins.set(fx,'authored:'+i));options.extra?.forEach((fx,i)=>effectOrigins.set(fx,'delivery:'+i));
 r.step('hit',()=>r.w['resolveHit'](r.p,inst,options.target??r.target,options.mult??1,options.depth??0,undefined,false,false,options.extra));
}
function beforeEffects(r:Rig,callback:()=>void){const challenge=r.w['challenges'],original=challenge.beforeEffects.bind(challenge);challenge.beforeEffects=(...args)=>{original(...args);callback();};}
function ready(r:Rig){
 r.target.life=5000;r.target.mana=0;r.target.ward=0;r.p.life=5000;r.p.mana=0;r.p.ward=0;
 for(const [i,a]of r.kin.entries())a.pos={x:r.target.pos.x+20+i*10,y:r.target.pos.y};
 for(const a of [r.p,r.target])for(const id of ['burn','chill','scalded'])r.status(a,id,{dps:12,remaining:2,stacks:2});
}
const sampleEffects:Record<string,SkillEffect>={
 heal:{type:'heal',amount:37,pctMax:.01,chain:1},cleanse:{type:'cleanse'},
 buff:{type:'buff',id:'observed-bond',duration:4,mods:[mod('armor','flat',15)],bond:true},
 rupture:{type:'rupture',status:'scalded',fraction:.4,mul:1.3},status:{type:'status',status:'poison',chance:1,magnitude:.3},
 knockback:{type:'knockback',strength:90},buffet:{type:'knockback',strength:90,mode:'buffet'},
 grabSeize:{type:'grabSeize',grab:{verb:'carry'}},possess:{type:'possess',spec:{lifeFrac:1,duration:3}},
 pull:{type:'pull',stun:.25},absorb:{type:'absorb',amount:40,duration:3},
 restore:{type:'restore',resource:'mana',amount:29},ward:{type:'ward',amount:31},wardHit:{type:'ward',amount:31,onHit:true},
 siphonOrb:{type:'siphonOrb',resource:'life',amount:17},birth:{type:'birth',onHit:true,monsterId:'cinder_sprite',count:[1,1],cap:2,duration:10},
 spreadStatus:{type:'spreadStatus',radius:200,strengthScale:.5},transfuseStatus:{type:'transfuseStatus',splash:140,strengthScale:.8},
};
for(const [name,fx]of Object.entries(sampleEffects))for(const relation of ['enemy','ally','self'] as const)course(name+'-'+relation,r=>{
 ready(r);if(relation==='ally')r.target.team=r.p.team;const target=relation==='self'?r.p:r.target;
 if(name==='possess')target.life=1000;
 hit(r,strike([structuredClone(fx)],!['heal','cleanse','buff','possess'].includes(name)),{target,mult:1.5});
});
for(const name of ['wardHit','siphonOrb','birth'])for(const gate of ['zero','subhit','dead','construct'])course(name+'-gate-'+gate,r=>{
 if(gate==='dead')beforeEffects(r,()=>{r.p.dead=true;});
 if(gate==='construct')beforeEffects(r,()=>{r.p.construct={kind:'totem',range:100,timer:0};});
 hit(r,strike([structuredClone(sampleEffects[name])],gate!=='zero'),{depth:gate==='subhit'?1:0});
});
for(const resource of ['mana','es'] as const)course('siphon-'+resource+'-owner',r=>{r.p.owner=r.kin[0];r.target.tier=2;hit(r,strike([{type:'siphonOrb',resource,amount:13}]));});
for(const resource of ['life','es','poise'] as const)course('restore-'+resource,r=>{ready(r);hit(r,strike([{type:'restore',resource,amount:31,resetEsDelay:true}],false));});
course('birth-not-on-hit',r=>hit(r,strike([{type:'birth',monsterId:'cinder_sprite',count:[1,1],cap:2}])));
for(const gate of ['construct','anchored','leap','dormant','near'])course('pull-'+gate,r=>{
 const inst=strike([{type:'pull',stun:.4}],false);
 if(gate==='construct')r.target.construct={kind:'totem',range:100,timer:0};
 if(gate==='anchored')r.target.anchored=true;
 if(gate==='leap')r.target.leap={from:{...r.target.pos},dest:{...r.p.pos},total:1,timer:0,radius:30,inst,dmgMult:1,wasUntargetable:false};
 if(gate==='dormant'){r.target.tag='ritual_cultist';r.target.aiAwakened=false;}
 if(gate==='near')r.target.pos={...r.p.pos};hit(r,inst);
});
course('knockback-stat-buffet',r=>{r.p.sheet.setSource('hit-effect-tuning',[mod('knockBuffet','override',1)]);hit(r,strike([sampleEffects.knockback]));});
course('captured-duration-live-team',r=>{
 r.p.sheet.setSource('hit-effect-tuning',[mod('effectDuration','override',2)]);
 beforeEffects(r,()=>{r.p.sheet.setSource('hit-effect-tuning',[mod('effectDuration','override',5)]);r.target.team=r.p.team;});
 hit(r,strike([sampleEffects.buff,sampleEffects.absorb,sampleEffects.pull],false));
});
for(const exclude of [false,true])course('heal-self-exclusion-'+exclude,r=>{r.p.life=5000;hit(r,strike([{type:'heal',amount:50,excludeCaster:exclude}],false),{target:r.p});});
for(const count of [0,1,4])course('cleanse-count-'+count,r=>{ready(r);r.target.team=r.p.team;hit(r,strike([{type:'cleanse',count}],false));});
for(const cap of [0,1,8,9])course('spread-cap-'+cap,r=>{ready(r);hit(r,strike([{type:'spreadStatus',radius:200,maxTargets:cap}],false));});
course('spread-selection-edge-story',r=>{
 ready(r);r.kin[0].tier=2;r.kin[1].team=r.p.team;r.kin[2].dead=true;r.kin[3].untargetable=true;
 r.kin[4].pos={x:r.target.pos.x+100+r.kin[4].radius,y:r.target.pos.y};r.kin[5].pos={x:r.target.pos.x+100+r.kin[5].radius+.01,y:r.target.pos.y};
 hit(r,strike([{type:'spreadStatus',radius:100,statuses:['burn'],duration:'refresh',durationScale:.6,maxTargets:9}],false));
});
for(const type of ['spreadStatus','transfuseStatus'] as const)course(type+'-story-rim-duels',r=>{
 ready(r);r.w.zone.tiers={kind:'over',exposure:'open',rimDuels:true};r.kin[0].tier=2;
 r.step('cross-story-native-candidate',()=>{if(!r.w.enemiesOf(r.p).includes(r.kin[0]))throw Error('Cross-story candidate was filtered upstream');});
 hit(r,strike([type==='spreadStatus'?{type,radius:200,maxTargets:9}:{type,splash:200}],false));
});
for(const stocked of [false,true])course('spread-dead-'+stocked,r=>{if(stocked)r.status(r.target,'burn');beforeEffects(r,()=>{r.target.dead=true;});hit(r,strike([{type:'spreadStatus',radius:200}],false));});
course('spread-effect-order',r=>{hit(r,strike([{type:'status',status:'chill',chance:1},{type:'spreadStatus',radius:200,maxTargets:2},{type:'status',status:'burn',chance:1,magnitude:.3},{type:'spreadStatus',radius:200,maxTargets:1}]));});
for(const splash of [undefined,0,100])course('transfuse-splash-'+String(splash),r=>{ready(r);r.kin[0].tier=2;r.kin[1].pos={x:r.target.pos.x+100+r.kin[1].radius,y:r.target.pos.y};hit(r,strike([{type:'transfuseStatus',splash,statuses:['burn'],duration:'remaining'}],false));});
course('transfuse-empty',r=>hit(r,strike([{type:'transfuseStatus'}],false)));
course('transfuse-filter-empty',r=>{ready(r);hit(r,strike([{type:'transfuseStatus',statuses:['poison']}],false));});
course('transfuse-live-donor-records',r=>{
 ready(r);const original=r.w['transplantStatus'].bind(r.w);let count=0;
 r.w['transplantStatus']=(...args)=>{original(...args);if(count++===0){r.p.statuses[1].dps=91;r.p.statuses[1].remaining=.25;}};
 hit(r,strike([{type:'transfuseStatus',splash:120}],false));
});
for(const merged of [false,true])course('effects-append-'+merged,r=>{
 const inst=strike([{type:'restore',resource:'mana',amount:10}],false),original=r.w['applyRestore'].bind(r.w);let changed=false;
 r.w['applyRestore']=(...args)=>{const value=original(...args);if(!changed){changed=true;inst.def.effects.push({type:'ward',amount:23});}return value;};
 r.target.team=r.p.team;hit(r,inst,{extra:merged?[{type:'restore',resource:'mana',amount:7}]:undefined});
});
course('transfuse-partial-failure',r=>{ready(r);const original=r.w['transplantStatus'].bind(r.w);let calls=0;r.w['transplantStatus']=(...args)=>{original(...args);if(++calls===2)throw Error('transplant observer fault');};hit(r,strike([{type:'transfuseStatus',splash:120}],false));});
course('buff-partial-failure',r=>{r.target.team=r.p.team;const original=r.w['grantTreeBuff'].bind(r.w);r.w['grantTreeBuff']=(...args)=>{original(...args);throw Error('buff observer fault');};hit(r,strike([sampleEffects.buff],false));});
course('nested-delivery',r=>{const original=r.w['applyRestore'].bind(r.w);let nested=false;r.w['applyRestore']=(...args)=>{const value=original(...args);if(!nested){nested=true;r.w['resolveHit'](r.p,strike([{type:'ward',amount:11}],false),r.p,1,1);}return value;};r.target.team=r.p.team;hit(r,strike([{type:'restore',resource:'mana',amount:10},{type:'ward',amount:23}],false));});
course('before-effects-replace-array',r=>{r.target.team=r.p.team;const inst=strike([{type:'ward',amount:1}],false);beforeEffects(r,()=>{inst.def.effects=[{type:'restore',resource:'mana',amount:9}];});hit(r,inst);});
course('ignored-non-hit-effects',r=>hit(r,strike([{type:'recallMinions'}],false)));
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,definitions,sampleEffects,rows},null,2)+'\n');console.log('Observed '+rows.length+' original hit-effect courses');
