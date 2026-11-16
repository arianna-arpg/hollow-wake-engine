// Original combat lifecycles with active bodies and released effects.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor,resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {seedGlobalRandom} from '../src/sim/rng';
const specs=[
 {id:'status-transfer',ticks:10,allies:[{x:410,y:430}],statusSetup:[{actor:3,status:'poison',dps:8,magnitude:3,source:'hazard'}],skills:['draw_corruption','transfusion']},
 {id:'status-spread',ticks:10,targets:[{x:475,y:430}],statusSetup:[{actor:2,status:'poison',dps:8,magnitude:3,source:'hazard'}],skills:['epidemic']},
 {id:'status-cleanse',ticks:10,statusSetup:[{actor:1,status:'poison',dps:8,magnitude:3,source:'hazard'}],skills:['flask_clean_company']},
 {id:'impale-recall',ticks:10,stats:{accuracy:10000},skills:['skewer','spear_recall']},
 {id:'projectile-detonation',ticks:20,skills:['frozen_orb','cold_snap']},
 {id:'minion-cast',skills:['summon_harvester','meta:summon_harvester']},
 {id:'charge-spend',ticks:20,stats:{accuracy:10000},skills:['frenzy','frenzy','frenzy','bloodlust']},
 {id:'corpse-drag',skills:['exhume','gather_the_dead']},
];
const seed=1234,courses=[],restoreBoot=seedGlobalRandom(seed);
try {for(const spec of specs){
 const w=makeSimWorld('warrior',seed);resetActorIdCounter();
 const environmentFrames=[];let frameIndex=0;const fog=(w as any).updateFog.bind(w);
 (w as any).updateFog=dt=>{const facts=frameIndex++===0?(spec.statusSetup??[]):[];environmentFrames.push(facts);
  for(const fact of facts)w.actors.find(a=>a.id===fact.actor).applyStatus(fact.status,fact.dps,fact.magnitude,fact.source);
  return fog(dt);
 };
 const actor=new Actor('Hero','player',{x:400,y:400});actor.kind='player';
 actor.sheet.setBase('life',10000);actor.sheet.setBase('mana',10000);actor.fillResources();
 for(const [id,value] of Object.entries(spec.stats??{}))actor.sheet.setBase(id,value);
 w.actors=[actor];w.localSeat.actor=actor;w.time=0;(w as any).indexSeats();
 w.meta.knownSkills.clear();w.meta.attrs=Object.fromEntries(Object.keys(ATTRIBUTES).map(id=>[id,100])) as any;w.localSeat.lastActedAt=-999;
 actor.skills=[...new Set(spec.skills.map(id=>id.replace('meta:','')))].map(id=>makeSkillInstance(SKILLS[id],1));for(const skill of actor.skills)w.meta.knownSkills.set(skill.def.id,skill);
 for(const [id,support]of Object.entries(spec.supports??{}))w.meta.knownSkills.get(id).sockets[0]={def:SUPPORTS[support],level:1};
 const view=w.viewRectFor(actor),restore=seedGlobalRandom(seed),next=Math.random;let draws=0;Math.random=()=>{draws++;return next();};
 const enemy=spec.monster?w.createMonster(spec.monster,1,'enemy'):new Actor('Target','enemy',{x:440,y:400});enemy.pos={x:440,y:400};
 if(!spec.monster){enemy.sheet.setBase('life',10000);enemy.sheet.setBase('mana',10000);enemy.fillResources();}
 enemy.life*=spec.fraction??1;enemy.mana*=spec.fraction??1;w.actors.push(enemy);
 for(const [team,positions]of [['player',spec.allies??[]],['enemy',spec.targets??[]]] as const)for(const at of positions){const body=new Actor(team==='player'?'Ally':'Other',team,{...at});body.sheet.setBase('life',10000);body.sheet.setBase('mana',10000);body.fillResources();w.actors.push(body);}
    const inspect = () => JSON.parse(JSON.stringify({time: w.time, draws, controlled:w.localSeat.actor.id,
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
  w.update(.1);steps.push({action:{type:'advance',dt:.1},state:inspect()});
  for(const requested of spec.skills){
   const meta=requested.startsWith('meta:'),id=requested.replace('meta:','');
   const hero=w.localSeat.actor,skill=hero.skills.find(s=>s?.def.id===id)??w.meta.knownSkills.get(id);
   assert(skill,'missing lifecycle skill '+id);
   const aim=meta?{x:650,y:400}:{...enemy.pos};hero.aimPos={...aim};
   const accepted=meta?w.useMetaSkill(hero,skill,aim):w.useSkill(hero,skill,aim,true);
   steps.push({action:{type:meta?'meta':'press',id,aim},accepted,state:inspect()});
   for(let i=0;i<(spec.ticks??25);i++){w.update(.1);steps.push({action:{type:'advance',dt:.1},state:inspect()});}
  }
  for(let i=0;i<130;i++){w.update(.1);steps.push({action:{type:'advance',dt:.1},state:inspect()});}
  for(const step of steps)if(step.action.type==='press'||step.action.type==='meta')assert(step.accepted,spec.id+': '+step.action.id);
  const states=steps.map(s=>s.state);
  if(spec.id==='status-transfer')assert(states.some(s=>s.actors.find(a=>a.id===1)?.statuses.length)&&states.some(s=>s.actors.find(a=>a.id===2)?.statuses.length),'affliction must transfer ally to hero to enemy');
  if(spec.id==='status-spread')assert(states.some(s=>s.actors.find(a=>a.id===3)?.statuses.length),'affliction must spread to second enemy');
  if(spec.id==='status-cleanse')assert(steps[1].state.actors[0].statuses.length&&!states.at(12).actors[0].statuses.length,'cleanse must remove active poison');
  if(spec.id==='minion-cast'){const first=states.find(s=>s.actors.some(a=>a.id>2))?.actors.find(a=>a.id>2);assert(first&&states.some(s=>s.actors.some(a=>a.id===first.id&&(a.pos.x!==first.pos.x||a.pos.y!==first.pos.y))),'commanded minion must move');}
  if(spec.id==='charge-spend')assert(states.some(s=>s.actors[0].charges.length),'charges must be gained before spending');
  courses.push({...spec,seed,view,steps,environmentFrames});
 }finally{restore();}
}writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));}finally{restoreBoot();}
