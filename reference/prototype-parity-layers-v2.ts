// Revision 2: original steppedClamp publishes the actor pose; it does not return it.
// Independent original combat over two physical floors. The host transition
// changes only the resolved movement floor, never a hit or effect outcome.
import fs from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor,resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {seedGlobalRandom} from '../src/sim/rng';
const seed=7331,courses:any[]=[],restoreBoot=seedGlobalRandom(seed);
const specs=[
  {id:'layer-projectile-sequel',skill:'firebolt',supports:['parting_gift'],distance:280,stats:{projectileSpeed:.5}},
  {id:'layer-ground-delayed',skill:'meteor',supports:[],distance:180,stats:{}},
  {id:'layer-area-pulses',skill:'frost_nova',supports:[],distance:70,stats:{pulseCount:2,aoeScatter:2}},
  {id:'layer-cursor-salvo',skill:'cold_spot',supports:['rattling_salvo'],distance:260,stats:{projectileCount:8}},
];
try{for(const spec of specs){
  const w=makeSimWorld('warrior',seed);resetActorIdCounter();
  const config={name:'Hero',team:'player',position:{x:400,y:400},layer:1,controlled:true,
    stats:{life:10000,mana:100000,accuracy:100000,critChance:0,knockback:0,...spec.stats},
    attributes:Object.fromEntries(Object.keys(ATTRIBUTES).map(id=>[id,100])),
    skills:[{id:spec.skill,level:20,treeNodes:[],sockets:spec.supports.map(id=>({id,level:1}))}]};
  const targets=[1,0].map(layer=>({name:'Target '+layer,team:'enemy',position:{x:400+spec.distance,y:400},layer,
    stats:{life:100000,mana:10000,evasion:0,armor:0,blockChance:0,lifeRegen:0}}));
  const make=(c:any)=>{const a=new Actor(c.name,c.team,c.position);a.tier=c.layer;if(c.controlled)a.kind='player';
    for(const[id,n]of Object.entries(c.stats))a.sheet.setBase(id,n as number);a.fillResources();
    a.skills=(c.skills??[]).map((s:any)=>{const i=makeSkillInstance(SKILLS[s.id],s.level);i.treeNodes=s.treeNodes;i.sockets=s.sockets.map((g:any)=>({def:SUPPORTS[g.id],level:g.level}));return i;});return a;};
  const hero=make(config);w.actors=[hero,...targets.map(make)];w.localSeat.actor=hero;w.time=0;(w as any).indexSeats();
  w.meta.attrs=config.attributes as any;w.meta.knownSkills=new Map(hero.skills.map(i=>[i!.def.id,i!]));w.localSeat.lastActedAt=-999;
  const restore=seedGlobalRandom(seed),next=Math.random;let draws=0;Math.random=()=>{draws++;return next();};
  try{
    const inspect=()=>JSON.parse(JSON.stringify({time:w.time,draws,actors:w.actors.map(a=>({id:a.id,name:a.name,defId:a.defId??null,team:a.team,pos:{...a.pos},tier:a.tier,
      life:a.life,mana:a.mana,es:a.es,dead:a.dead,downed:a.downed,lifespan:a.lifespan??null,casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,elapsed:a.casting.elapsed,total:a.casting.total}:null,
      cooldowns:[...a.cooldowns],charges:[...a.charges],statuses:a.statuses.map(s=>({id:s.id,remaining:s.remaining,dps:s.dps,stacks:s.stacks}))})),
      projectiles:w.projectiles.map(p=>({skill:p.inst.def.id,pos:{...p.pos},life:(p as any).life})),zones:w.zones.map(z=>({skill:z.inst.def.id,pos:{...z.pos},delay:z.delay,linger:z.linger,tick:z.tick,exploded:z.exploded})),corpses:w.corpses.map(c=>({pos:{...c.pos},remaining:c.remaining}))}));
    const aim={x:spec.skill==='cold_spot'?540:400+spec.distance,y:400},steps:any[]=[];
    const act=(action:any)=>{let accepted;
      if(action.type==='press')accepted=w.useSkill(hero,hero.skills[0]!,aim,true);
      else if(action.type==='move'){
        const clamp=(w as any).steppedClamp;
        (w as any).steppedClamp=(a:Actor,to:any)=>{a.tier=action.layer;a.pos={...to};};
        try{w.moveActor(hero,action.direction.x,action.direction.y,action.seconds);}finally{(w as any).steppedClamp=clamp;}
      }else w.update(action.seconds);
      steps.push({action,...(accepted===undefined?{}:{accepted}),state:inspect()});};
    act({type:'press',skill:spec.skill,aim});
    let guard=0;while(hero.casting&&guard++<300)act({type:'advance',seconds:1/60});
    if(hero.casting)throw Error('Cast did not finish');
    act({type:'move',actor:1,layer:0,direction:{x:-1,y:0},seconds:.05});
    if(hero.tier!==0)throw Error('Physical floor transition was not reached');
    for(let n=0;n<240;n++)act({type:'advance',seconds:1/60});
    courses.push({id:spec.id,config,targets,steps});
  }finally{restore();}
}}finally{restoreBoot();}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,originalOnly:true,seed,courses})+'\n',{flag:'wx'});
