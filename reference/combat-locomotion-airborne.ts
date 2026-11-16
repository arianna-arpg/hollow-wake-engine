// Raw original mover plus full original World frames. Geography is a quiet,
// flat arena; no SDK runtime or substituted combat rule participates.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor,resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {MONSTERS} from '../src/data/monsters';
import {seedGlobalRandom} from '../src/sim/rng';

const restoreBoot=seedGlobalRandom(1234),courses:any[]=[];
try {
 const charge=Object.values(SKILLS).find(s=>s.castMode==='charge'&&s.chargeUp)!;
 assert(charge);
 const flying=Object.values(MONSTERS).find(d=>d.flier&&!d.passive)!;assert(flying);
 const specs:any[]=[{id:'levitating',stats:{levitation:1}},{id:'flying',monster:flying.id}];
 for(const spec of specs){
  const seed=1234,w=makeSimWorld('warrior',seed);resetActorIdCounter();
  const restore=seedGlobalRandom(seed),next=Math.random;let draws=0;Math.random=()=>{draws++;return next();};
  try {
   const hero=spec.monster?w.createMonster(spec.monster,1,'player'):new Actor('Hero','player',spec.start??{x:400,y:400});
   hero.pos={...(spec.start??{x:400,y:400})};
   if(!spec.monster){hero.kind='player';hero.sheet.setBase('life',10000);hero.sheet.setBase('mana',10000);}
   for(const[id,n]of Object.entries(spec.stats??{}))hero.sheet.setBase(id,n as number);
   hero.fillResources();w.actors=[hero];w.localSeat.actor=hero;w.time=0;
   if(spec.monster)w.seats=[];
   (w as any).indexSeats();w.meta.knownSkills.clear();w.meta.attrs=Object.fromEntries(Object.keys(ATTRIBUTES).map(id=>[id,100])) as any;
   w.localSeat.lastActedAt=-999;
   if(!spec.monster)hero.skills=spec.skill?[makeSkillInstance(SKILLS[spec.skill],1)]:[];
   for(const s of hero.skills)if(s)w.meta.knownSkills.set(s.def.id,s);
   const enemy=new Actor('Target','enemy',spec.enemySkill?{x:370,y:400}:{x:900,y:400});
   enemy.sheet.setBase('life',10000);enemy.sheet.setBase('mana',10000);enemy.fillResources();w.actors.push(enemy);
   if(spec.enemySkill)enemy.skills=[makeSkillInstance(SKILLS[spec.enemySkill],1)];
   let frame=0;const fog=(w as any).updateFog.bind(w);
   (w as any).updateFog=(dt:number)=>{if(frame++===0&&spec.status)hero.applyStatus(spec.status,0,1,'reference-ground');return fog(dt);};
   const inspect=()=>JSON.parse(JSON.stringify({time:w.time,draws,
    actors:w.actors.map(a=>({id:a.id,name:a.name,defId:a.defId??null,team:a.team,pos:{...a.pos},tier:a.tier,
     life:a.life,mana:a.mana,es:a.es,dead:a.dead,downed:a.downed,lifespan:a.lifespan??null,
     casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,elapsed:a.casting.elapsed,total:a.casting.total}:null,
     cooldowns:[...a.cooldowns],charges:[...a.charges],statuses:a.statuses.map(s=>({id:s.id,remaining:s.remaining,dps:s.dps,stacks:s.stacks}))})),
    projectiles:w.projectiles.map(p=>({skill:p.inst.def.id,pos:{...p.pos},life:p.life})),
    zones:w.zones.map(z=>({skill:z.inst.def.id,pos:{...z.pos},delay:z.delay,linger:z.linger,tick:z.tick,exploded:z.exploded})),
    corpses:w.corpses.map(c=>({pos:{...c.pos},remaining:c.remaining})),
    pose:{id:hero.id,pos:{...hero.pos},tier:hero.tier,radius:hero.radius,facing:hero.facing,velocity:{...hero.vel},
     moveAccumulator:hero.moveAcc,strideDistance:hero.strideDist,idleFor:hero.idleFor,plantFor:hero.plantFor},
   }));
   const steps:any[]=[{action:{type:'initial'},state:inspect()}];
   w.update(.1);steps.push({action:{type:'advance',dt:.1},state:inspect()});
   if(spec.skill||spec.enemySkill){const caster=spec.enemySkill?enemy:hero,id=spec.enemySkill??spec.skill,aim={...(spec.enemySkill?hero.pos:enemy.pos)};
    const accepted=w.useSkill(caster,caster.skills.find(s=>s?.def.id===id)!,aim,true);assert.equal(accepted,spec.id!=='move-charge',spec.id);
    steps.push({action:{type:'press',actor:caster.id,id,aim},accepted,state:inspect()});}
   for(let tick=0;tick<50;tick++){
    const direction=spec.direction??[1,0],dt=.1;
    if(tick===10&&hero.casting){hero.casting.held=false;steps.push({action:{type:'release'},state:inspect()});}
    w.moveActor(hero,direction[0],direction[1],dt*w.timeflow.scaleFor(hero));
    steps.push({action:{type:'move',direction,dt},state:inspect()});
    w.update(dt);steps.push({action:{type:'advance',dt},state:inspect()});
   }
   if(spec.id==='walk')assert(hero.pos.x>400);
   if(spec.id==='idle')assert.equal(hero.pos.x,400);
   if(spec.id==='wall')assert(hero.pos.x<=1600-hero.radius);
   if(spec.id==='physical-tether')assert(hero.movementTether&&Math.abs(hero.pos.x-400)<=190.001);
   if(spec.id==='move-charge')assert(steps.some(s=>s.state.actors[0].charges.some(([id,n]:[string,number])=>id==='static'&&n>0)),'walking must build the authored charge');
   courses.push({...spec,seed,steps});
  }finally{restore();}
 }
 writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));
}finally{restoreBoot();}
