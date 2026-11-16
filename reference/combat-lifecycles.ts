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
 {id:'summon-orders',skills:['summon_skeleton','command_assault','command_skeletal_strike','convocation','command_detonate']},
 {id:'construct-retirement',supports:{flame_totem:'packed_workshop'},skills:['flame_totem','meta:flame_totem','shatter_totem']},
 {id:'mine-detonation',skills:['fire_mine','detonate_mines']},
 {id:'trap-lifetime',skills:['frost_trap']},
 {id:'aura-retirement',skills:['righteous_fire','righteous_fire']},
 {id:'companion',monster:'plains_wolf',fraction:.3,ticks:40,skills:['tame_beast','meta:tame_beast','beast_rallying_whistle','convocation']},
 {id:'grab-throw',monster:'plains_wolf',stats:{weight:10,gripPower:10,accuracy:10000},ticks:9,skills:['seize','heave']},
 {id:'possession-return',monster:'plains_wolf',fraction:.2,skills:['possession','relinquish']},
 {id:'birth-and-expiry',skills:['cinderwisp']},
 {id:'corpse-birth',skills:['exhume','raise_dead','convocation']},
];
const seed=1234,courses=[],restoreBoot=seedGlobalRandom(seed);
try {for(const spec of specs){
 const w=makeSimWorld('warrior',seed);resetActorIdCounter();
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
  const states=steps.map(s=>s.state),last=states.at(-1),maxActors=Math.max(...states.map(s=>s.actors.length));
  if(['summon-orders','construct-retirement','mine-detonation','trap-lifetime','birth-and-expiry'].includes(spec.id))assert(maxActors>2&&last.actors.length===2,'birth and retirement must actually occur');
  if(spec.id==='companion')assert(states.some(s=>s.effects.some(a=>a.owner===1&&a.kind==='companion')),'tame must actually bind');
  if(spec.id==='grab-throw')assert(states.some(s=>s.effects.some(a=>a.gripping))&&!last.effects.some(a=>a.gripping),'grab must hold and release');
  if(spec.id==='possession-return')assert(states.some(s=>s.controlled!==1)&&last.controlled===1,'possession must change and return control');
  if(spec.id==='aura-retirement')assert(states.some(s=>s.effects.some(a=>a.auras.length))&&!last.effects.some(a=>a.auras.length),'aura must activate and retire');
  if(spec.id==='corpse-birth')assert(states.some(s=>s.corpses.length)&&maxActors>2,'corpse and servant must exist');
  courses.push({...spec,seed,view,steps});
 }finally{restore();}
}writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));}finally{restoreBoot();}
