// Original triggered-effect families through complete casting and World frames.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor,resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance,skillContextTags} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {PROC_LIST} from '../src/data/procs';
import {SUPPORTS} from '../src/data/supports';
import {seedGlobalRandom} from '../src/sim/rng';
const chosen=new Map();
for(const p of PROC_LIST){
 if(!['hit','cast','pulse','heal','buffGain','chargeGain'].includes(p.trigger)||p.when||p.unless||p.requireBuff||p.requireStatus)continue;
 if(chosen.has(p.effect.type))continue;
 let skill=p.trigger==='heal'?'benediction':p.trigger==='buffGain'?'antidote_flask':p.trigger==='chargeGain'?'cross_jab':'firebolt';
 const fits=s=>s.effects.some(f=>f.type==='damage')&&(!p.skills||p.skills.includes(s.id))&&(!p.tags||p.tags.every(t=>skillContextTags(s).has(t)));
 if(['hit','cast'].includes(p.trigger)&&!fits(SKILLS[skill]))skill=Object.values(SKILLS).find(fits)?.id;
 if(!skill)continue;
 chosen.set(p.effect.type,{id:p.id,proc:p.id,effect:p.effect.type,trigger:p.trigger,stats:{['proc_'+p.id]:1,accuracy:10000,critChance:1},fraction:1,heroFraction:.2,skills:[skill,skill,skill]});
}
const specs=[...chosen.values(),
 {id:'bulwark_nova',proc:'bulwark_nova',effect:'burst',targetStats:{proc_bulwark_nova:1,blockChance:1},skills:Array(12).fill('firebolt')},
 {id:'bastion_fortify',proc:'bastion_fortify',effect:'fortify',targetStats:{proc_bastion_fortify:1,blockChance:1,endurance:1000},skills:Array(12).fill('firebolt')},
 {id:'unbound',proc:'unbound',effect:'cleanse',targetStats:{proc_unbound:1},environmentStatus:'stun',skills:Array(8).fill('firebolt')},
 {id:'heat_lost',proc:'heat_lost',effect:'removeBuff',originalLimitation:'heating_up is consumed on its granting critical hit',stats:{proc_heating_up:1,proc_heat_lost:1,critChance:.5,accuracy:10000},skills:Array(20).fill('firebolt'),ticks:10},
 {id:'gutterglow',proc:'gutterglow',effect:'kindle',stats:{proc_gutterglow:1,accuracy:10000,damage:100},fraction:.0001,skills:['firebolt'],noBounty:true,tailTicks:0},
 {id:'collision_crush',proc:'collision_crush',effect:'collisionDamage',stats:{proc_collision_crush:1,accuracy:10000},wallAt:460,skills:['showstopper']},
].map(spec=>({heroFraction:.2,stats:{accuracy:10000},...spec}));
const seed=1234,courses=[],restoreBoot=seedGlobalRandom(seed);
try {for(const spec of specs){
 const w=makeSimWorld('warrior',seed);resetActorIdCounter();
 // A supplied physical wall is a host fact. Original combat still decides
 // arrest, collision procs and damage; no combat callback is replaced.
 if(spec.wallAt){const clamp=w.clampPos.bind(w);w.clampPos=(at,radius,from,options)=>{
  const out=clamp(at,radius,from,options);if(out.x>spec.wallAt-radius){out.x=spec.wallAt-radius;if(options?.out)options.out.hit='wall';}return out;
 };}
 const environment=[],environmentFrames=[];let observedDraws=()=>0;
 let inFog=false,environmentFacts=[];
 const fog=(w as any).updateFog.bind(w);
 (w as any).updateFog=dt=>{environmentFacts=[];inFog=true;try{
  if(spec.environmentStatus&&environmentFrames.length<10)w.actors[1]?.applyStatus(spec.environmentStatus,0,1,'fixture-environment');
  return fog(dt);
 }finally{inFog=false;environmentFrames.push(environmentFacts);}};
 const lightwell=w.spawnLightwell.bind(w);
 w.spawnLightwell=(kind,at,options)=>{const out=lightwell(kind,at,options);
  environment.push({service:'lightwell',args:[kind,{...at},{...options,radius:out?.radius}],result:!!out});return out;
 };
 const vent=w.plantVent.bind(w);
 w.plantVent=(fx,at,area,duration,tier=0)=>{
  const before=observedDraws(),out=vent(fx,at,area,duration,tier);
  environment.push({service:'vent',args:[fx.bank,{...at},fx.radius*Math.sqrt(Math.max(.01,area)),fx.duration*Math.max(.1,duration),tier],
    result:out?{reach:out.reach}:null,randomDraws:observedDraws()-before});return out;
 };
 const executed=[],execute=(w as any).executeProc.bind(w);
 (w as any).executeProc=(proc,caster,inst,target,depth=0,aim)=>{
  executed.push({id:proc.id,actor:caster.id,target:target?.id,depth});
  return execute(proc,caster,inst,target,depth,aim);
 };
 const actor=new Actor('Hero','player',spec.heroAt??{x:400,y:400});actor.kind='player';
 actor.sheet.setBase('life',10000);actor.sheet.setBase('mana',10000);actor.fillResources();actor.life*=spec.heroFraction;actor.mana*=spec.heroFraction;
 for(const [id,value] of Object.entries(spec.stats??{}))actor.sheet.setBase(id,value);
 w.actors=[actor];w.localSeat.actor=actor;w.time=0;(w as any).indexSeats();
 w.meta.knownSkills.clear();w.meta.attrs=Object.fromEntries(Object.keys(ATTRIBUTES).map(id=>[id,100])) as any;w.localSeat.lastActedAt=-999;
 actor.skills=[...new Set(spec.skills.map(id=>id.replace('meta:','')))].map(id=>makeSkillInstance(SKILLS[id],1));for(const skill of actor.skills)w.meta.knownSkills.set(skill.def.id,skill);
 for(const [id,support]of Object.entries(spec.supports??{}))w.meta.knownSkills.get(id).sockets[0]={def:SUPPORTS[support],level:1};
 const view=w.viewRectFor(actor),restore=seedGlobalRandom(seed),next=Math.random;let draws=0;Math.random=()=>{draws++;return next();};
 observedDraws=()=>draws;
 const enemy=spec.monster?w.createMonster(spec.monster,1,'enemy'):new Actor('Target','enemy',{x:440,y:400});enemy.pos=spec.targetAt??{x:440,y:400};
 if(!spec.monster){enemy.sheet.setBase('life',10000);enemy.sheet.setBase('mana',10000);}
 for(const [id,value]of Object.entries(spec.targetStats??{}))enemy.sheet.setBase(id,value);
 if(!spec.monster)enemy.fillResources();
 // Campaign rewards are optional. The source's existing no-bounty body flag
 // prevents XP/loot draws from becoming accidental combat dependencies.
 if(spec.noBounty)enemy.noBounty=true;
 enemy.life*=spec.fraction??1;enemy.mana*=spec.fraction??1;w.actors.push(enemy);
 for(const body of [actor,enemy]){const apply=body.applyStatus.bind(body);body.applyStatus=(status,dps,magnitude,source,...rest)=>{
  if(inFog)environmentFacts.push({actor:body.id,status,dps,magnitude,source});
  return apply(status,dps,magnitude,source,...rest);
 };}
    const inspect = () => JSON.parse(JSON.stringify({time: w.time, draws, controlled:w.localSeat.actor.id,worldRequests:environment.length,procExecutions:executed,procs:w.actors.map(a=>({id:a.id,ready:[...a.procReadyAt],fired:[...a.procFiredAt],attempted:[...a.procAttemptAt]})),
      effects: w.actors.map(a => ({id:a.id, owner:a.owner?.id, radius:a.radius, kind:a.kind,
        ward:a.ward, absorb:a.absorb, absorbLayers:[...a.absorbLayers], poise:a.poise, endurance:a.endurance,
        reservedLife:a.reservedLife, reservedMana:a.reservedMana, ironWard:a.ironWard,
        buffs:[...a.buffs].map(([id,b])=>({id,remaining:b.remaining,stacks:b.stacks,mods:b.def.mods})),
        auras:[...a.activeAuras].map(([id,row])=>({id,remaining:row.remaining,radius:row.radius})),
        summons:[...a.summonToggles.keys()], gripping:a.gripping, heldBy:a.heldBy,
        runes:a.runes, mimicBank:a.mimicBank, stance:a.companionStance,
      })),
      actors: w.actors.map(a => ({id: a.id, name: a.name, defId: a.defId ?? null, team: a.team, pos: {...a.pos}, tier: a.tier,
        life: a.life, mana: a.mana, es: a.es, dead: a.dead, downed: a.downed, lifespan: a.lifespan ?? null,
        casting: a.casting ? {id: a.casting.inst.def.id, mode: a.casting.mode, elapsed: a.casting.elapsed, total: a.casting.total} : null,
        cooldowns: [...a.cooldowns], charges: [...a.charges], statuses: a.statuses.map(s => ({id: s.id, remaining: s.remaining, dps: s.dps, stacks: s.stacks}))})),
      projectiles: w.projectiles.map(p => ({skill: p.inst.def.id, pos: {...p.pos}, life: p.life})),
      zones: w.zones.map(z => ({skill: z.inst.def.id, pos: {...z.pos}, delay: z.delay, linger: z.linger, tick: z.tick, exploded: z.exploded})),
      corpses: w.corpses.map(c => ({pos: {...c.pos}, remaining: c.remaining})),
    }));

 try {const steps=[{action:{type:'initial'},state:inspect()}];
  for(const requested of spec.skills){
   const meta=requested.startsWith('meta:'),id=requested.replace('meta:','');
   const hero=w.localSeat.actor,skill=hero.skills.find(s=>s?.def.id===id)??w.meta.knownSkills.get(id);
   assert(skill,'missing lifecycle skill '+id);
   const aim=meta?{x:650,y:400}:{...enemy.pos};hero.aimPos={...aim};
   const accepted=meta?w.useMetaSkill(hero,skill,aim):w.useSkill(hero,skill,aim,true);
   steps.push({action:{type:meta?'meta':'press',id,aim},accepted,state:inspect()});
   for(let i=0;i<(spec.ticks??25);i++){w.update(.1);steps.push({action:{type:'advance',dt:.1},state:inspect()});}
  }
  for(let i=0;i<(spec.tailTicks??130);i++){w.update(.1);steps.push({action:{type:'advance',dt:.1},state:inspect()});}
  const fired=executed.some(row=>row.id===spec.proc);
  if(spec.originalLimitation){assert(!fired);assert(executed.some(row=>row.id==='heating_up'));}
  else assert(fired,'Selected proc must execute: '+spec.proc+'; observed '+JSON.stringify(executed));
  courses.push({...spec,seed,view,steps,fired,environment,environmentFrames});
 }finally{restore();}
}writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));}finally{restoreBoot();}
