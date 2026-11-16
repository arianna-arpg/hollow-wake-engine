import assert from 'node:assert/strict';import {Projectiles} from '../dist/projectiles.js';
export function projectileHost(){
  const state={projectiles:[],zones:[]},events=[],stats={projectileSpeed:1,projectileSize:1,effectDuration:1,aoeRadius:1,damage:1},actors=[];let now=0;
  const make=(id,team,pos)=>({id,team,pos:{...pos},radius:5,tier:0,dead:false,color:'red',life:1000,hitFlash:0,
    sheet:{get:(k,_t,_m,base)=>stats[k]??base??0},gainCharge:(...args)=>events.push(['charge',id,...args]),applyStatus:(...args)=>events.push(['status',id,...args])});
  const actor=make(1,'ally',{x:100,y:100});actors.push(actor);
  const base={type:'projectile',speed:100,radius:5,range:1000},skill={level:1,def:{id:'test',color:'red',tags:['spell'],delivery:{...base}}},definitions=new Map([[skill.def.id,skill.def]]);
  const fail=(name)=>(..._args)=>assert.fail('Unbound '+name);
  const ports={time:()=>now,random:()=>.5,actors:()=>actors,actorById:id=>actors.find(a=>a.id===id),enemiesOf:a=>actors.filter(b=>b!==a&&!b.dead&&b.team!==a.team&&b.tier===a.tier),arena:()=>({w:2000,h:2000}),actorScale:()=>1,
    cosmetic:()=>({}),skillContextTags:def=>new Set(def.tags),instanceMods:()=>[],applyConversion(){},effectiveSkillLevel:i=>i.level,skill:id=>definitions.get(id),makeSkill:(def,level)=>({def,level}),
    instanceTrail:i=>i.def.delivery.trail,instanceFissureTrail:i=>i.def.delivery.fissureTrail,instanceSequel:i=>i.def.delivery.sequel,instanceBirth:()=>undefined,instanceEffects:()=>[],grantedTags:()=>[],socketSpec:()=>undefined,
    skillOcclusion:()=> 'blocked',flash:cue=>events.push(['flash',cue]),noteLightningTravel(){},segsHittable:a=>!!a.worm&&!a.dead,segR:()=>3,noteBodyHit:(a,seg)=>events.push(['segment',a.id,seg]),
    viewRectFor:()=>({x:0,y:0,w:2000,h:2000}),doodadsAt:()=>[],doodadRuleOf:()=>({}),popBrittle:fail('brittle'),blocksProjectiles:()=>false,hitSurfaceOf:fail('obstacle shape'),shapeContains:fail('collision'),pushOutOfShape:fail('collision push'),
    shotGrid:()=>undefined,shotElev:()=>0,castGridRay:()=>null,occluded:kind=>events.push(['occluded',kind]),lineOfFire:()=>true,clampPos:p=>p,groundAt:()=>undefined,hitVoiceOf:()=>undefined,skillBaseTypeOf:()=>undefined,
    guardiansActive:()=>false,satellitesCount:()=>0,carriedEffectContext:()=>({}),reflectSatellites:()=>undefined,interceptGuardians:()=>undefined,reflectParriedProjectile:fail('parry reflection'),
    sequenceFlight(){},sequenceBeforeContact(){},sequenceContact:()=>false,tryGuardBlock:()=>false,resolveParryDamage:(...args)=>events.push(['parry',...args]),rollSkillDamage:()=>({amounts:{physical:1},tags:new Set(),crit:false,sourceName:'test'}),
    resolveHit:(a,i,b,m,d,flat)=>events.push(['hit',a.id,i.def.id,b.id,m,d,flat]),mitigateTyped:(_a,amounts)=>Object.values(amounts).reduce((a,b)=>a+b,0),dominantTypeOf:()=> 'physical',accumulateDotText(){},kill:a=>{a.dead=true;},
    spawnConstruct:(a,i,d,aim,_payload,at)=>{events.push(['construct',a.id,i.def.id,d,aim,at]);return null;},ringBell:()=>false,frontSplash(){},strikeSurfaces(){},liteCount:()=>0,liteProjectileSweep:()=>false,
    executeSkill:(...args)=>{events.push(['cast',...args]);return true;},litePourAt:fail('pour'),setLure:fail('lure'),birthAt:fail('birth'),noiseAt:fail('noise')};
  const rules={childDepthMax:2,auraTick:.3,shrapnelSkill:'shrapnel_shard',catchSpotLook:'construct_axe_catch',headSegment:-1,frameEdgePad:2,frameFlashPad:6,sequelMaxDepth:3,elementColors:{fire:'red',cold:'blue',lightning:'yellow',chaos:'green'}};
  const runtime=new Projectiles(state,rules,ports);
  return{state,events,stats,actors,actor,skill,ports,rules,definitions,runtime,make,base,spawn:(options)=>{runtime.spawnProjectile(actor,skill,actor.pos,0,options);return state.projectiles.at(-1);},step:dt=>{now+=dt;runtime.updateProjectiles(dt);}};
}
