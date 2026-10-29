// Freeze this observer's original-game output before implementing the SDK service.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {StatSheet} from '../src/engine/stats';
import {STATUS_DEFS,bankFracOf,baselineStatusDps,tuneAilmentChance,statusRuptureRadius,type ActiveStatus} from '../src/engine/status';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {mulberry32} from '../src/sim/rng';

bootSimEngine();
const definitions=JSON.parse(JSON.stringify(STATUS_DEFS)),rows:unknown[]=[],originalRandom=Math.random;
const ids=Object.keys(STATUS_DEFS);
const pick=(predicate:(d:typeof STATUS_DEFS[string])=>unknown)=>{const id=ids.find(id=>predicate(STATUS_DEFS[id]));assert(id,'Required authored status');return id;};
const examples={stack:pick(d=>d.stacking&&!d.buildup),buildup:pick(d=>d.buildup),strongest:pick(d=>d.stackPolicy==='strongest'),
  pop:pick(d=>d.pop),bank:pick(d=>d.bank),weak:pick(d=>d.weakSpot),chrono:pick(d=>d.timeScale!==undefined),flight:pick(d=>d.flight),
  blessing:pick(d=>d.beneficial),cc:pick(d=>d.hardCC&&!d.beneficial),forbid:pick(d=>d.forbidsTags?.includes('spell')),refreshCaster:pick(d=>d.refreshCaster),
  ramp:pick(d=>d.dpsCurve==='ramp'),power:pick(d=>d.mods?.length&&!d.beneficial&&!d.stacking)};
// No authored taper exists in the pinned game. Exercise its supported branch
// with an explicitly identified fixture, outside the authored definition census.
const fixtures={__observed_taper:{...STATUS_DEFS[examples.ramp],id:'__observed_taper',dpsCurve:'taper' as const}};
Object.assign(STATUS_DEFS,fixtures);
const plain=(v:any):any=>{
  if(v===undefined)return {$undefined:true};if(typeof v==='number'&&!Number.isFinite(v))return {$number:String(v)};if(Object.is(v,-0))return {$number:'-0'};
  if(v instanceof Actor)return {$actor:v.name};if(v instanceof Set)return {$set:[...v].map(plain)};
  if(v instanceof Map)return {$map:[...v].map(([k,v])=>[plain(k),plain(v)])};if(Array.isArray(v))return v.map(plain);
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,v])=>[k,plain(v)]));return v;
};
type Harness={actor:Actor;events:unknown[];step:(label:string,fn:()=>unknown)=>void;tick:(dt:number,raw?:number,hook?:(s:ActiveStatus,n:number,type:string)=>void)=>void;apply:(id:string,dps?:number,scale?:number,opts?:Parameters<Actor['applyStatus']>[4])=>void};
function course(name:string,run:(h:Harness)=>void,setup?:(a:Actor)=>void){
  const a=new Actor('status-reference','player',{x:0,y:0});a.id=77;a.sheet=new StatSheet();
  for(const [key,n]of Object.entries({life:200,mana:100,lifeRegen:0,manaRegen:0,afflictionExpiry:1}))a.sheet.setBase(key,n);
  a.life=150;a.mana=100;setup?.(a);const events:unknown[]=[],steps:unknown[]=[],draws:number[]=[],tracked:ActiveStatus[]=[],identity=new WeakMap<ActiveStatus,number>();let phase='setup';
  const identify=(s:ActiveStatus)=>{if(!identity.has(s)){identity.set(s,tracked.length+1);tracked.push(s);}return identity.get(s);};
  const state=()=>{for(const s of [...a.statuses,...a.expiredStatuses])identify(s);return plain({
    statuses:a.statuses.map(s=>({ref:identify(s),state:{...s}})),expired:a.expiredStatuses.map(s=>({ref:identify(s),state:{...s}})),
    retained:tracked.map(s=>({ref:identify(s),state:{...s}})),sources:a.sheet.sourceNames().filter(k=>k.startsWith('status:')).map(k=>[k,a.sheet.getSourceMods(k)]),
    casting:a.casting?{mode:a.casting.mode,skill:a.casting.inst.def.id}:null,flying:a.flying,flyingBase:a.flyingBase,touchdown:a.touchdown,
    procCuePulses:a.procCuePulses,procPopEvents:a.procPopEvents});};
  const push=a.statuses.push.bind(a.statuses);a.statuses.push=(...values)=>{for(const s of values)identify(s);return push(...values);};
  const get=a.sheet.get.bind(a.sheet),set=a.sheet.setSource.bind(a.sheet),remove=a.sheet.removeSource.bind(a.sheet);
  a.sheet.get=(...args)=>{const result=get(...args);if(phase==='apply')events.push({kind:'get',args:plain(args),result});return result;};
  a.sheet.setSource=(key,mods)=>{if(key.startsWith('status:'))events.push({kind:'source',key,mods:plain(mods),before:state()});set(key,mods);};
  a.sheet.removeSource=key=>{if(key.startsWith('status:'))events.push({kind:'remove',key,before:state()});remove(key);};
  const originalApply=a.applyStatus.bind(a);a.applyStatus=(...args)=>{const previous=phase;phase='apply';events.push({kind:'apply',args:plain(args),before:state()});
    try{return originalApply(...args);}finally{events.push({kind:'apply-end',after:state()});phase=previous;}};
  const next=mulberry32(0x51a7);Math.random=()=>{const n=next();draws.push(n);events.push({kind:'random',n});return n;};
  const step=(label:string,fn:()=>unknown)=>{let result:unknown,error:unknown;try{result=fn();}catch(e){error=e instanceof Error?{name:e.name,message:e.message}:String(e);}steps.push({label,result:plain(result),error:plain(error),state:state()});};
  const h:Harness={actor:a,events,step,apply:(id,dps=12,scale=1,opts)=>step('apply-'+id,()=>a.applyStatus(id,dps,scale,'source',opts)),
    tick:(dt,raw=dt,hook)=>step('tick',()=>a.updateTimers(dt,raw,(s,n,type)=>{events.push({kind:'dot',ref:identify(s),amount:n,type,before:state()});hook?.(s,n,type);})),};
  try{run(h);rows.push({name,steps,draws,events});}finally{Math.random=originalRandom;}
}
try{
  // Every initialized authored definition traverses ordinary application, refresh,
  // ticking, queries and explicit removal. Rich definition metadata stays captured.
  for(const id of ids)course('authored-'+id,h=>{
    h.apply(id,12,1,{casterId:3,leech:.1,power:1.25});h.apply(id,8,.5,{casterId:4,leech:.2,power:1.5});h.tick(.1,.2);
    h.step('queries',()=>({stunned:h.actor.isStunned(),panicked:h.actor.isPanicked(),neverRetreats:h.actor.neverRetreats(),
      fickle:h.actor.fickleSpan(),wet:h.actor.isWet(),spellForbidden:h.actor.tagsForbidden(makeSkillInstance(SKILLS.firebolt)),
      attackForbidden:h.actor.tagsForbidden(makeSkillInstance(SKILLS.cleave)),bank:h.actor.statuses.map(s=>bankFracOf(s,STATUS_DEFS[s.id])),baseline:[0,1,10].map(l=>baselineStatusDps(id,l)),chance:[0,.1,.6,.7,1].map(n=>tuneAilmentChance(id,n))}));
    h.step('end',()=>h.actor.endStatus(id));
  });
  course('unknown',h=>{h.apply('unknown-observed');h.tick(1);h.step('queries',()=>({baseline:baselineStatusDps('unknown-observed',10),chance:tuneAilmentChance('unknown-observed',.2),radius:statusRuptureRadius({})}));});
  course('debuff-immunity',h=>{h.apply(examples.power);h.apply(examples.blessing);},a=>a.sheet.setBase('debuffImmunity',1));
  for(const poise of [0,.5,.5001,20])for(const broken of [false,true])course(`cc-${poise}-${broken}`,h=>h.apply(examples.cc),a=>{a.poise=poise;a.poiseBroken=broken;a.sheet.setBase('poiseCcAvoid',1);});
  course('forbidden-cast-cleared-before-source',h=>h.apply(examples.forbid),a=>{a.casting={mode:'cast',inst:makeSkillInstance(SKILLS.firebolt)} as any;});
  for(const expiry of [.5,2,10])course('hostile-expiry-'+expiry,h=>{h.apply(examples.power,20,2);h.apply(examples.blessing,20,2);},a=>a.sheet.setBase('afflictionExpiry',expiry));
  for(const delta of [-4,0,4])course('stack-buildup-cap-'+delta,h=>{for(let i=0;i<8;i++)h.apply(examples.buildup,8+i,.5+i*.1,{stacksBonus:delta,power:1.5,rupture:i===0?2:undefined});});
  course('buildup-recursion',h=>{for(let i=0;i<20;i++)h.apply(examples.buildup,8,1,{power:1.8});});
  for(const magnitude of [4,12,20])course('strongest-'+magnitude,h=>{h.apply(examples.strongest,12,2);h.tick(.2);h.apply(examples.strongest,magnitude,.5);});
  for(const rupture of [undefined,0,10])course('fixed-fuse-'+rupture,h=>{h.apply(examples.strongest,10,1,{rupture,ruptureRadius:30});h.tick(.5);h.apply(examples.strongest,50,3,{rupture:5,ruptureRadius:120});h.apply(examples.strongest,60,4);});
  course('fixed-zero-fuse-clears-on-zero-options',h=>{h.apply(examples.power,10,1,{rupture:0});h.apply(examples.power,20,3,{rupture:0});h.apply(examples.power,30,4);});
  for(const caster of [undefined,1])for(const wet of [false,true])course(`bank-${caster}-${wet}`,h=>{h.apply(examples.bank,10,1,{casterId:caster});h.apply(examples.bank,20,2,{casterId:caster});h.apply(examples.bank,100,1,{casterId:caster});},a=>{a.rainWet=wet;});
  course('bank-casterless-to-authored',h=>{h.apply(examples.bank,10);h.apply(examples.bank,20,1,{casterId:1});});
  course('bank-authored-to-casterless',h=>{h.apply(examples.bank,10,1,{casterId:1});h.apply(examples.bank,20);});
  course('bank-with-armed-fuse',h=>{h.apply(examples.bank,10,1,{casterId:1,rupture:3});h.tick(.5);h.apply(examples.bank,100,3,{casterId:2});});
  course('pop-owed-and-cue',h=>{h.apply(examples.pop,10,2,{leech:.2});h.tick(.5);h.apply(examples.pop,20,.5,{popBonus:.5,leech:.4});h.tick(.25);});
  course('pop-zero-dps-still-pays',h=>{h.apply(examples.pop,10,1);h.apply(examples.pop,0,2);h.tick(.1);});
  for(const curve of [examples.ramp,'__observed_taper'])for(const dt of [0,.25,20])course('curve-'+curve+'-'+dt,h=>{h.apply(curve,10,.25,{leech:.2,brood:{monsterId:'observed',perDamage:1,duration:2,max:3}});h.tick(dt);});
  course('expired-status-still-ticks-full-frame',h=>{h.apply(examples.strongest,10,.01);h.tick(10);});
  course('scoped-source-and-field',h=>{h.apply(examples.power,10,1,{sourceKey:'a',challengeField:1});h.apply(examples.power,20,2,{sourceKey:'b',challengeField:1});h.apply(examples.power,30,3,{sourceKey:'a',challengeField:2});h.tick(100);});
  course('first-applier-and-stronger-power',h=>{h.apply(examples.power,10,1,{casterId:1,power:.5,leech:.3});h.apply(examples.power,20,2,{casterId:2,power:2,leech:.1});});
  course('latest-applier',h=>{h.apply(examples.refreshCaster,0,1,{casterId:1});h.apply(examples.refreshCaster,0,1,{casterId:2});});
  course('weak-window-does-not-refresh',h=>{h.apply(examples.weak);h.actor.life=50;h.apply(examples.weak);});
  course('chrono-raw-clock',h=>{h.apply(examples.chrono,10);h.apply(examples.strongest,20);h.tick(0,100);});
  course('chrono-only',h=>{h.apply(examples.chrono,10);h.apply(examples.strongest,20);h.step('chrono',()=>h.actor.tickChronoStatuses(100));});
  for(const base of [false,true])course('flight-expiry-'+base,h=>{h.apply(examples.flight,0,.01);h.tick(0);h.tick(100);},a=>{a.flyingBase=base;});
  course('cleanse-beneficial-and-scoped',h=>{h.apply(examples.blessing);h.apply(examples.power,10,1,{sourceKey:'one'});h.apply(examples.power,10,1,{sourceKey:'two'});h.step('one',()=>h.actor.cleanseDebuffs(1));h.step('rest',()=>h.actor.cleanseDebuffs());});
  for(const count of [-1,0,.5,1.5])course('cleanse-count-'+count,h=>{h.apply(examples.power,10,1,{sourceKey:'one'});h.apply(examples.power,10,1,{sourceKey:'two'});h.step('cleanse',()=>h.actor.cleanseDebuffs(count));});
  course('dispel-no-expiry',h=>{h.apply(examples.pop,10,1,{rupture:20});h.apply(examples.pop,20,1);h.step('end',()=>h.actor.endStatus(examples.pop));h.tick(100);});
  for(const action of ['consume','nested','throw'] as const)course('relay-'+action,h=>{
    const a=h.actor,armed=a.sheet.armedFamily.bind(a.sheet);a.sheet.armedFamily=(prefix,ids,extra)=>prefix==='relayStatus_'?['observed']:armed(prefix,ids,extra);
    a.statusRelay=(target,args)=>{h.events.push({kind:'relay',same:target===a,args:plain(args)});if(action==='throw')throw Error('relay fault');if(action==='nested')target.applyStatus(args[0],args[1]+1,args[2],args[3],{...args[4],relayed:true});return true;};
    h.apply(examples.power);h.apply(examples.power,3,1,{relayed:true});
  });
  for(const action of ['change-leech','add-pop','remove-current','append','nested','throw'] as const)course('tick-callback-'+action,h=>{
    h.apply(examples.strongest,10,1,{leech:.1});let entered=false;h.tick(.2,.2,(s)=>{if(entered)return;entered=true;
      if(action==='change-leech')s.leech=.5;if(action==='add-pop')s.popAcc=12;if(action==='remove-current')h.actor.endStatus(s.id);
      if(action==='append')h.actor.applyStatus(examples.power,5,1,'nested');if(action==='nested')h.actor.updateTimers(.1);if(action==='throw')throw Error('tick fault');});
  });
  course('source-publication-throw',h=>{const a=h.actor,write=a.sheet.setSource.bind(a.sheet);a.sheet.setSource=(id,mods)=>{if(id.startsWith('status:'))throw Error('publication fault');write(id,mods);};h.apply(examples.power);});
}finally{Math.random=originalRandom;delete STATUS_DEFS.__observed_taper;}
assert(rows.length>ids.length+50);
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,definitions,definitionCount:ids.length,fixtures,examples,courses:rows.length,rows},null,2)+'\n');
console.log(`Status lifecycle: ${rows.length} courses, ${ids.length} authored definitions`);
