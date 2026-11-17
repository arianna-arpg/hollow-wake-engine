// Independent original-game device relocation and retained-command identity.
// Optional loot production and its XP toast stay outside the combat recording.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';
import {Actor,resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {seedGlobalRandom} from '../src/sim/rng';

const seed=7331,restoreBoot=seedGlobalRandom(seed),courses:any[]=[];
try{for(const skillId of ['flame_totem','ballista_sentry']){
 const w=makeSimWorld('warrior',seed);resetActorIdCounter();
 const text=w.text.bind(w);w.text=((...args:any[])=>args[4]==='xp'?undefined:(text as any)(...args)) as any;
 (w as any).rollDrops=()=>{};
 const config={name:'Hero',team:'player',position:{x:400,y:400},controlled:true,
  stats:{life:10000,mana:100000,accuracy:100000,critChance:0,knockback:0},
  attributes:Object.fromEntries(Object.keys(ATTRIBUTES).map(id=>[id,100])),
  skills:[{id:skillId,level:20,treeNodes:[],sockets:[{id:'packed_workshop',level:1}]}]};
 const target={team:'enemy',position:{x:500,y:400},level:1,resourceFraction:.01};
 const make=(c:any)=>{const a=new Actor(c.name,c.team,c.position);if(c.controlled)a.kind='player';
  for(const[id,value]of Object.entries(c.stats))a.sheet.setBase(id,value as number);a.fillResources();
  a.skills=(c.skills??[]).map((s:any)=>{const i=makeSkillInstance(SKILLS[s.id],s.level);i.treeNodes=[...s.treeNodes];i.sockets=s.sockets.map((b:any)=>({def:SUPPORTS[b.id],level:b.level}));return i;});return a;};
 const actor=make(config);w.actors=[actor];w.localSeat.actor=actor;w.time=0;(w as any).indexSeats();
 w.meta.knownSkills=new Map(actor.skills.map(i=>[i!.def.id,i!]));w.meta.attrs=config.attributes as any;w.localSeat.lastActedAt=-999;
 const restore=seedGlobalRandom(seed),random=Math.random;let draws=0;Math.random=()=>{draws++;return random();};
 try{
  const inspect=()=>JSON.parse(JSON.stringify({time:w.time,draws,
   actors:w.actors.map(a=>({id:a.id,name:a.name,defId:a.defId??null,team:a.team,pos:{...a.pos},tier:a.tier,life:a.life,mana:a.mana,es:a.es,dead:a.dead,downed:a.downed,lifespan:a.lifespan??null,
    casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,elapsed:a.casting.elapsed,total:a.casting.total}:null,
    cooldowns:[...a.cooldowns],charges:[...a.charges],statuses:a.statuses.map(s=>({id:s.id,remaining:s.remaining,dps:s.dps,stacks:s.stacks}))})),
   projectiles:w.projectiles.map(p=>({skill:p.inst.def.id,pos:{...p.pos},life:(p as any).life})),
   zones:w.zones.map(z=>({skill:z.inst.def.id,pos:{...z.pos},delay:z.delay,linger:z.linger,tick:z.tick,exploded:z.exploded})),
   corpses:w.corpses.map(c=>({pos:{...c.pos},remaining:c.remaining}))}));
  const steps:any[]=[],aim={...target.position};
  const act=(action:any)=>{let accepted:boolean|undefined;
   if(action.type==='spawn'){const c=action.config,a=w.createMonster(action.monster,c.level,c.team);a.pos={...c.position};a.fillResources();a.life*=c.resourceFraction;a.mana*=c.resourceFraction;w.actors.push(a);}
   else if(action.type==='meta')accepted=w.useMetaSkill(actor,actor.skills[0]!,action.aim);
   else if(action.type==='press')accepted=w.useSkill(actor,actor.skills.find(i=>i?.def.id===action.skill)!,action.aim,true);
   else w.update(action.seconds);
   steps.push({action,...(accepted===undefined?{}:{accepted}),state:inspect()});
  };
  const advance=(count:number)=>{for(let n=0;n<count;n++)act({type:'advance',seconds:1/60});};
  act({type:'press',skill:skillId,aim});advance(120);
  const body=w.actors.find(a=>a.owner===actor&&a.construct);assert(body,'Device did not deploy');
  const relocate=(aim:{x:number,y:number})=>{
   const before={id:body.id,life:body.life,lifespan:body.lifespan,cooldowns:[...body.cooldowns]},old={...body.pos};
   act({type:'meta',skill:skillId,aim});assert.equal(steps.at(-1).accepted,true);
   assert.deepEqual({id:body.id,life:body.life,lifespan:body.lifespan,cooldowns:[...body.cooldowns]},before,'Relocation reset device state');
   assert.notDeepEqual(body.pos,old,'Device did not move');
  };
  relocate({x:400,y:500});advance(300);
  relocate({x:300,y:400});advance(60);
  courses.push({id:'workshop-relocation-'+skillId,config,steps});
 }finally{restore();}
}}finally{restoreBoot();}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,originalOnly:true,seed,courses})+'\n',{flag:'wx'});
