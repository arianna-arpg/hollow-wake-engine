// Test-only observer embedded into the pinned Cleave probe before capture.
// It never imports SDK code or supplies expected outcomes.
import captureFs from 'node:fs';
import captureAssert from 'node:assert/strict';
import {Actor as CaptureActor} from '../src/engine/actor';
import type {World as CaptureWorld} from '../src/engine/world';
import type {SkillInstance as CaptureSkill} from '../src/engine/skills';

let captureGroup=0,captureSerial=0,captureCallSerial=0;
const captureIds=new WeakMap<object,number>();
const captureId=(value:object)=>{let id=captureIds.get(value);if(id===undefined){id=++captureSerial;captureIds.set(value,id);}return id;};
let captureWorlds:{world:CaptureWorld;owner:CaptureActor;host:CaptureSkill;target:CaptureActor}[]=[];
const captureRows:unknown[]=[],captureEvents:unknown[]=[],captureRandom:number[]=[];
const captureActorRef=(actor:CaptureActor)=>({actor:captureId(actor),id:actor.id});
function capturePack(input:unknown):unknown {
  const seen=new WeakMap<object,string>();
  const visit=(value:unknown,at:string):unknown=>{
    if(value===undefined)return {$undefined:true};
    if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return {$number:Object.is(value,-0)?'-0':String(value)};
    if(typeof value==='function')return {$callable:value.name};
    if(value===null||typeof value!=='object')return value;
    if(value instanceof CaptureActor)return captureActorRef(value);
    const prior=seen.get(value);if(prior!==undefined)return {$ref:prior};seen.set(value,at);
    if(value instanceof Set)return {$set:[...value].map((v,i)=>visit(v,at+'/'+i))};
    if(value instanceof Map)return {$map:[...value].map(([k,v],i)=>[visit(k,at+'/'+i+'/key'),visit(v,at+'/'+i+'/value')])};
    if(Array.isArray(value))return value.map((v,i)=>visit(v,at+'/'+i));
    const object=value as Record<string,unknown>;
    if(object.def&&typeof object.def==='object'&&Array.isArray(object.sockets)&&typeof object.level==='number'){
      const inst=value as CaptureSkill,d=inst.def;
      return {skill:captureId(inst),definition:visit({id:d.id,name:d.name,tags:d.tags,delivery:d.delivery,attackSequence:d.attackSequence,
        trigger:d.trigger,innateMods:d.innateMods,leveling:d.leveling,thresholds:d.thresholds,cooldown:d.cooldown,manaCost:d.manaCost,
        useTime:d.useTime,effects:d.effects,followUp:d.followUp,castCycle:d.castCycle,baseDamage:d.baseDamage},at+'/definition'),
        level:inst.level,bonusLevels:inst.bonusLevels,treeNodes:visit(inst.treeNodes,at+'/treeNodes'),sockets:visit(inst.sockets.map(s=>s&&{id:s.def.id,level:s.level,rolled:s.rolled}),at+'/sockets'),
        grafts:visit(inst.grafts?.map(s=>({id:s.def.id,level:s.level,rolled:s.rolled})),at+'/grafts'),extraMods:visit(inst.extraMods,at+'/extraMods'),
        sequenceRole:inst.sequenceRole,sequenceHost:inst.sequenceHost?captureId(inst.sequenceHost):null,procChainDepth:inst.procChainDepth,
        stateIdentity:inst.state?captureId(inst.state):null,state:visit(inst.state,at+'/state')};
    }
    return Object.fromEntries(Object.entries(object).map(([key,v])=>[key,visit(v,at+'/'+key)]));
  };
  return visit(input,'$');
}
function captureActor(actor:CaptureActor){
  return {identity:captureActorRef(actor),owner:actor.owner&&captureActorRef(actor.owner),pos:actor.pos,tier:actor.tier,radius:actor.radius,
    life:actor.life,mana:actor.mana,es:actor.es,poise:actor.poise,dead:actor.dead,facing:actor.facing,useLock:actor.useLock,
    look:actor.look,lifespan:actor.lifespan,untargetable:actor.untargetable,skills:actor.skills,casting:actor.casting,
    buffs:actor.buffs,statuses:actor.statuses,charges:actor.charges,cooldowns:actor.cooldowns,totals:actor.cooldownTotals,locks:actor.skillRecoveryLocks};
}
function captureWorld(rig:typeof captureWorlds[number]){
  const w=rig.world;
  return {time:w.time,owner:captureActorRef(rig.owner),target:captureActorRef(rig.target),host:rig.host,
    actors:w.actors.map(captureActor),projectiles:w.projectiles.map(p=>({caster:p.caster,inst:p.inst,pos:p.pos,dir:p.dir,speed:p.speed,radius:p.radius,
      tier:p.tier,traveled:p.traveled,range:p.range,pierce:p.pierce,chains:p.chains,hits:p.hits,age:p.age,mult:p.mult,depth:p.depth,
      homing:p.homing,erratic:p.erratic,spiral:p.spiral,orbit:p.orbit,spin:p.spin,weave:p.weave,amp:p.amp,orbitR0:p.orbitR0})),
    pending:{salvos:w.pendingSalvos,repeats:w.pendingRepeats,steps:w.pendingSteps,followUps:w.pendingFollowUps,fuses:w.pendingFuses},
    zones:w.zones,flashes:w.flashes};
}
function captureBeginGroup(group:number){captureGroup=group;captureWorlds=[];}
function captureCheck(name:string,ok:boolean){captureRows.push({group:captureGroup,name,ok,randomDraws:captureRandom.length,eventCount:captureEvents.length,worlds:capturePack(captureWorlds.map(captureWorld))});}
function captureCall(name:string,owner:unknown,args:unknown[],run:()=>unknown):unknown {
  const call=++captureCallSerial;captureEvents.push({group:captureGroup,call,phase:'before',name,owner:capturePack(owner),args:capturePack(args),randomDraws:captureRandom.length});
  try{const result=run();captureEvents.push({group:captureGroup,call,phase:'after',name,result:capturePack(result),randomDraws:captureRandom.length});return result;}
  catch(error){captureEvents.push({group:captureGroup,call,phase:'throw',name,error:error instanceof Error?error.message:String(error),randomDraws:captureRandom.length});throw error;}
}
function captureRig(world:CaptureWorld,owner:CaptureActor,host:CaptureSkill,target:CaptureActor){
  const index=captureWorlds.length;captureWorlds.push({world,owner,host,target});
  const controller=world.attackSequences as unknown as Record<string,(...args:unknown[])=>unknown>;
  for(const name of ['stacks','prepare','forTarget','landed','opening','beforeContact','contact','flight','update','clear','clearAll']){
    const original=controller[name];captureAssert.equal(typeof original,'function');
    controller[name]=function(this:unknown,...args:unknown[]){return captureCall('sequence.'+name,index,args,()=>Reflect.apply(original,this,args));};
  }
}
const captureOriginalActorMethods=new Map<string,(...args:unknown[])=>unknown>();
const captureActorPrototype=CaptureActor.prototype as unknown as Record<string,(...args:unknown[])=>unknown>;
for(const name of ['applyStatus','addBuff','removeBuff','gainCharge']){
  const original=captureActorPrototype[name];captureAssert.equal(typeof original,'function');captureOriginalActorMethods.set(name,original);
  captureActorPrototype[name]=function(this:CaptureActor,...args:unknown[]){return captureCall('actor.'+name,this,args,()=>Reflect.apply(original,this,args));};
}
function captureSeed(){const original=Math.random;Math.random=()=>{const value=original();captureRandom.push(value);return value;};}
function captureFinish(failures:number){
  for(const[name,original]of captureOriginalActorMethods)captureActorPrototype[name]=original;
  captureAssert.equal(failures,0);captureAssert.equal(captureRows.length,114);
  captureFs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,checks:captureRows.length,groups:captureGroup,events:captureEvents.length,randomDraws:captureRandom.length,rows:captureRows,trace:captureEvents,random:captureRandom},null,2)+'\n');
  console.log(`Attack sequences: ${captureRows.length} observed checks, ${captureEvents.length} events, ${captureRandom.length} random draws`);
}
