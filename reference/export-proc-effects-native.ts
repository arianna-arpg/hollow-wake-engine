// Original execution discovery only. Real World/Actor effects run through native
// implementations; wrappers observe calls and always invoke the original method.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {StatSheet,mod} from '../src/engine/stats';import {makeSkillInstance} from '../src/engine/skills';
import {PROC_LIST,procPowerStat,type ProcDef,type ProcEffect} from '../src/data/procs';import {SKILLS} from '../src/data/skills';import {STATUS_DEFS} from '../src/engine/status';
bootSimEngine();assert.equal(PROC_LIST.length,147);const selected=new Map<string,ProcDef>();for(const p of PROC_LIST)if(!selected.has(p.effect.type))selected.set(p.effect.type,p);assert.equal(selected.size,21);
const summon=selected.get('summon')!.effect;assert(summon.type==='summon');selected.set('birth',{id:'__m39_birth',name:'Birth boundary',color:'#abcdef',trigger:'hit',effect:{type:'birth',birth:{type:'birth',monsterId:summon.monsterId,count:[1,1],cap:2,duration:5,scatter:0}}});
const rows:unknown[]=[];
for(const[type,proc]of selected){
 const restore=seedGlobalRandom(0xc039),w=makeSimWorld('warrior',0xc039),p=w.player;
 try{
  const body=(name:string,team:'player'|'enemy',x:number)=>{const a=new Actor(name,team,{x,y:700});a.sheet=new StatSheet();a.sheet.setBase('life',1000);a.sheet.setBase('mana',100);a.sheet.setBase('energyShield',100);a.sheet.setBase('poise',100);a.sheet.setBase('endurance',100);a.life=500;a.mana=2;a.es=3;a.poise=4;a.endurance=5;a.ward=6;a.tier=0;return a;};
  p.sheet=new StatSheet();for(const[id,value]of Object.entries({life:1000,mana:100,energyShield:100,poise:100,endurance:100,critChance:0}))p.sheet.setBase(id,value);
  p.life=500;p.mana=2;p.es=3;p.poise=4;p.endurance=5;p.ward=6;p.dead=false;p.pos={x:700,y:700};p.tier=0;p.level=5;p.buffs.clear();p.charges.clear();p.statuses=[];p.gainEvents=[];p.condRose=[];p.healedSince=0;p.gasped=false;p.procCues=undefined;
  const target=body('target','enemy',730),near=body('near','enemy',760),ally=body('ally','player',710);w.actors=[p,target,near,ally];w.time=10;
  const inst=makeSkillInstance({...SKILLS.cleave,id:'__m39_strike',tags:['attack','melee','physical'],baseDamage:{physical:[10,10]},requirements:undefined},1);p.skills=[inst,makeSkillInstance(SKILLS.firebolt)];p.cooldowns=new Map([[inst.def.id,10],['firebolt',5],['unslotted',1]]);p.sheet.setBase(procPowerStat(proc.id),2);assert.equal(p.sheet.get(procPowerStat(proc.id)),2);
  const fx:ProcEffect=proc.effect;
  if(fx.type==='removeBuff')for(const id of Array.isArray(fx.buff)?fx.buff:[fx.buff])p.addBuff({type:'buff',id,duration:10,mods:[mod('moveSpeed','increased',.1)]});
  if(fx.type==='cleanse'){const ids=[...new Set([...(fx.statuses??[]),...Object.entries(STATUS_DEFS).filter(([,s])=>(fx.hardCC&&s.hardCC)||(fx.afflictions&&s.dotType)).slice(0,2).map(([id])=>id)])];for(const id of ids)p.applyStatus(id,4,1,'setup');assert(p.statuses.length>0);}
  const labels=new Map<Actor,string>([[p,'owner'],[target,'target'],[near,'near'],[ally,'ally']]);let nextActor=0;
  const label=(a:Actor)=>{if(!labels.has(a))labels.set(a,'created-'+nextActor++);return labels.get(a)!;};
  const clean=(value:any,seen=new Set<object>()):any=>{if(value===undefined)return{$undefined:true};if(typeof value==='number'&&!Number.isFinite(value))return{$number:String(value)};if(value===null||typeof value!=='object')return value;if(value instanceof Actor)return{actor:label(value)};if(value.def?.delivery&&typeof value.def.id==='string')return{skill:value.def.id,level:value.level,procChainDepth:value.procChainDepth??null,sameTriggerInstance:value===inst};if(seen.has(value))return{$cycle:true};seen.add(value);let result;if(value instanceof Map)result=[...value].map(([k,v])=>[clean(k,seen),clean(v,seen)]);else if(value instanceof Set)result=[...value].map(v=>clean(v,seen));else if(Array.isArray(value))result=value.map(v=>clean(v,seen));else result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v,seen)]));seen.delete(value);return result;};
  const state=()=>clean({time:w.time,actors:w.actors.map(a=>({id:label(a),name:a.name,team:a.team,dead:a.dead,life:a.life,mana:a.mana,es:a.es,esDelay:a.esDelay,poise:a.poise,endurance:a.endurance,ward:a.ward,pos:a.pos,owner:a.owner,sourceSkillId:a.sourceSkillId,lifespan:a.lifespan,bornOf:a.bornOf,charges:a.charges,buffs:a.buffs,statuses:a.statuses,cooldowns:a.cooldowns,gainEvents:a.gainEvents,healedSince:a.healedSince,procCues:a.procCues})),pending:w['pendingBursts'],flashes:w.flashes,projectiles:w.projectiles.map(q=>({pos:q.pos,inst:q.inst,hits:q.hits})),doodads:w.doodads,fog:w['fog']});
  const calls:unknown[]=[];let recording=false;
  const wrap=(object:any,name:string,owner:string)=>{const original=object[name];assert.equal(typeof original,'function',name);object[name]=function(...args:any[]){if(recording)calls.push({owner,method:name,args:clean(args)});return original.apply(this,args);};};
  for(const name of ['fireProcRiders','resolveHit','sweepDefenseEvents','rollOwnProcs','strikeSurfaces','castProcPayload','pushActor','spawnLightwell','plantVent','createMonster','birthAt','spawnProjectile','executeSkill','kill'])wrap(w,name,'world');
  for(const a of [p,target,near,ally])for(const name of ['gainCharge','addBuff','healBy','gainWard','gainEndurance','gainPoise','gainEs','removeBuff','endStatus','applyStatus'])wrap(a,name,label(a));
  const random=Math.random,draws:number[]=[];Math.random=()=>{const v=random();if(recording)draws.push(v);return v;};const before=state();recording=true;
  w['executeProc'](proc,p,inst,target,0,{x:740,y:700});recording=false;const after=state(),stages:unknown[]=[];
  if(fx.type==='delayedBurst'){assert.equal(w['pendingBursts'].length,1);const due=w['pendingBursts'][0].when;for(const time of [due-.001,due,due+.001]){w.time=time;recording=true;w['updatePendingBursts']();recording=false;stages.push(state());}assert.equal(w['pendingBursts'].length,0);}
  assert(calls.some((c:any)=>c.method==='fireProcRiders'),'Rider tail must execute for '+type);
  rows.push({type,proc:clean(proc),power:2,before,after,delayedStages:stages,calls,draws});
 }finally{restore();}
}
assert.equal(rows.length,22);assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Unaccepted original effect execution discovery: 21 catalogue representatives and a synthetic birth branch; native methods called through, no effects mocked.',courses:rows.length,rows},null,2)+'\n');
