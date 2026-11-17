// Revision 5: omit only the optional XP toast (its cosmetic jitter uses RNG).
// Revision 4: the optional loot producer is absent from both combat hosts.
// Death, combat credit, corpses, pact and doctrine callbacks remain original.
// Revision 3: isolate the pact controller's combat-zone input from World scene
// generation. Changing the entire simulation arena objective in revision 2
// enabled unrelated ambient spawning and consumed 22 extra random draws.
// Independent November summon/vocation observation. No SDK imports or general AI.
// The encounter issues explicit casts and asks only the authored cohort/frame
// tactic controllers for movement, as a consuming engine would.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';
import {Actor,resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance,instanceDelivery,treeNodeOf} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {seedGlobalRandom} from '../src/sim/rng';

const specs:any[]=[
 {id:'lich-ritual-crowns',skill:'summon_skeleton_mage',nodes:['lich_ascendant','fused_intellect','winter_crown','storm_crown'],meta:true,crew:true},
 {id:'lich-echo-reconstruction',skill:'summon_skeleton_mage',nodes:['lich_ascendant','deathless_regent','court_of_one','plague_crown'],meta:true,crew:true,hurt:true,seconds:24},
 {id:'conclave-mixed-relay',skill:'summon_skeleton_mage',nodes:['grave_academy','winter_curriculum','deep_winter','plague_curriculum'],schools:['fire','cold'],crew:true,count:2},
 {id:'conclave-same-school',skill:'summon_skeleton_mage',nodes:['grave_academy','winter_curriculum','deep_winter'],schools:['fire'],crew:true,count:2},
 {id:'conclave-signature-siphon',skill:'summon_skeleton_mage',nodes:['grave_academy','storm_curriculum','rolling_thunder','expanded_faculty'],schools:['lightning','chaos'],crew:true,count:2,hurt:true},
 {id:'sentinel-banner',skill:'summon_skeleton',nodes:['grave_phalanx','barbed_lattice','interlocking_shields','oath_banner'],tactics:true,count:3,meta:true},
 {id:'sentinel-relief-heir',skill:'summon_skeleton',nodes:['grave_phalanx','veteran_watch','last_watch','relief_guard'],tactics:true,count:3,hurt:true},
 {id:'duelist-warrant-assassin',skill:'summon_skeleton',nodes:['ossuary_duelists','flensing_edges','open_veins','merciless_measure'],tactics:true,count:3,meta:true},
 {id:'spellsword-pairs',skill:'summon_skeleton',nodes:['ossuary_duelists','line_breakers','relentless_footwork','dueling_pairs'],schools:['fire','cold'],tactics:true,count:4,meta:true},
 {id:'golem-sacrifice-legion',skill:'summon_bone_golem',nodes:['osseous_might','drilled_bones','bone_cohort','assembled_legion'],tactics:true,crew:true},
 {id:'golem-crush-command',skill:'summon_bone_golem',nodes:['osseous_might','great_bones','ossuary_commander','marrow_bruiser'],tactics:true,meta:true},
 {id:'golem-shell-consolidation',skill:'summon_bone_golem',nodes:['keepers_bulwark','close_guard','bone_stand','warding_reach'],tactics:true,meta:true,stats:{minionMaxCount:4}},
 {id:'golem-sanctuary-reliquary',skill:'summon_bone_golem',nodes:['keepers_bulwark','renewing_frame','sheltering_bones','adamant_frame'],tactics:true,hurt:true,repair:true,seconds:22},
 {id:'golem-dismiss-reconstruction',skill:'summon_bone_golem',nodes:['keepers_bulwark','renewing_frame'],dismiss:true,hurt:true},
 {id:'sylvan-inheritance',skill:'summon_skeleton',nodes:['grave_phalanx'],tactics:true,stats:{transmute_sylvan:1,damage:2,life:15000,addedFire:30,minionDamage:3}},
 {id:'pact-invitation',skill:'summon_skeleton_mage',nodes:['grave_academy'],count:2,stats:{summonPact_open_invitation:1,summonPact_undead_resonance:1},crew:true,extra:['summon_skeleton']},
 {id:'pact-last-breath',skill:'pact_echo',stats:{summonPact_last_breath:1,summonPactForm_rime:1},repeatSummon:true,seconds:65},
 {id:'pact-burial',skill:'summon_skeleton',count:3,stats:{summonPact_burial_ground:1},hurt:true,repeatSummon:true,seconds:36},
 {id:'pact-patchwork',skill:'summon_skeleton',stats:{summonPact_patchwork:1},collect:true,seconds:30},
 {id:'doctrine-breach',skill:'doctrine_breach_call',stats:{doctrine_breach:1,addedFire:2000000},doctrine:true,crew:true},
 {id:'doctrine-pack-refusal',skill:'doctrine_pack_signal',stats:{doctrine_pack:1},doctrine:true},
 {id:'doctrine-swarm',skill:'summon_skeleton',count:3,stats:{doctrine_swarm:1,doctrineTrait_swarm_venom:1},doctrine:'doctrine_swarm_order',tactics:true},
 {id:'doctrine-quarry',skill:'doctrine_faultcall',stats:{doctrine_quarry:1,terraform_stone_cairns:1,doctrineTrait_quarry_echo:1},doctrine:true,seconds:16},
 {id:'doctrine-grove',skill:'doctrine_grove_call',stats:{doctrine_grove:1,terraform_sapling_ring:1,terraformFx_sapling_ring:1,doctrineTrait_grove_shelter:1},doctrine:true,seconds:16},
];
const seed=7331,courses:any[]=[],restoreBoot=seedGlobalRandom(seed);
try {for(const spec of specs){
 const w=makeSimWorld('warrior',seed);resetActorIdCounter();
 const text=w.text.bind(w);w.text=((...args:any[])=>args[4]==='xp'?undefined:(text as any)(...args)) as any;
 (w as any).rollDrops=()=>{}; // optional game reward boundary, outside the combat RNG stream
 const updatePacts=w.summonPacts.update.bind(w.summonPacts);
 w.summonPacts.update=(dt:number)=>{const zone=w.zone;(w as any).zone={...zone,objective:{kind:'kill',required:100}};
  try{updatePacts(dt);}finally{(w as any).zone=zone;}};
 assert(SKILLS[spec.skill],spec.skill);
 const skillIds=[spec.skill,'firebolt',...(spec.extra??[]),...(typeof spec.doctrine==='string'?[spec.doctrine]:[])];
 for(const id of skillIds)assert(SKILLS[id],id);
 const config={name:'Hero',team:'player',position:{x:400,y:400},controlled:true,resourceFraction:.65,
  stats:{life:10000,mana:100000,accuracy:100000,critChance:0,knockback:0,...spec.stats},
  attributes:Object.fromEntries(Object.keys(ATTRIBUTES).map(id=>[id,100])),
  skills:skillIds.map((id,n)=>({id,level:20,treeNodes:n===0?spec.nodes??[]:[],sockets:[],...(n===0&&spec.schools?{summonSchools:spec.schools}:{})}))};
 const target={name:'Target',team:'enemy',position:{x:500,y:400},stats:{life:1000000,mana:100000,evasion:0,armor:0,blockChance:0,lifeRegen:0,accuracy:100000,addedFire:spec.id.includes('reconstruction')||spec.id.includes('heir')||spec.id.includes('reliquary')?10000:80},skills:[{id:'firebolt',level:1}]};
 const make=(c:any)=>{const a=new Actor(c.name,c.team,c.position);if(c.controlled)a.kind='player';
  for(const[id,value]of Object.entries(c.stats))a.sheet.setBase(id,value as number);a.fillResources();a.life*=c.resourceFraction??1;a.mana*=c.resourceFraction??1;
  a.skills=(c.skills??[]).map((s:any)=>{const i=makeSkillInstance(SKILLS[s.id],s.level);i.treeNodes=[...(s.treeNodes??[])];
   for(const id of i.treeNodes)assert(treeNodeOf(i.def,id),id);
   if(s.summonSchools)i.summonSchools=[...s.summonSchools];
   if(s.sockets)i.sockets=s.sockets.map((g:any)=>({def:SUPPORTS[g.id],level:g.level}));return i;});return a;};
 const actor=make(config),enemy=make(target);w.actors=[actor,enemy];w.localSeat.actor=actor;w.time=0;(w as any).indexSeats();
 w.meta.knownSkills=new Map(actor.skills.map(i=>[i!.def.id,i!]));w.meta.attrs=config.attributes as any;w.localSeat.lastActedAt=-999;
 const restore=seedGlobalRandom(seed),random=Math.random;let draws=0;Math.random=()=>{draws++;return random();};
 try {
  const details=(a:Actor)=>({skills:a.skills.filter(Boolean).map(s=>({id:s!.def.id,supports:s!.sockets.map(g=>g?.def.id??null)})),
   buffs:[...a.buffs].map(([id,b])=>({id,remaining:b.remaining,stacks:b.stacks,sourceSkill:b.def.sourceSkill})),
   frames:w.frameArts.presentation(a),frame:w.frameArts.bodyPresentation(a),summonArts:w.summonArts.presentation(a),pacts:w.summonPacts.view(a),doctrines:w.battleDoctrines.view(a),
   growths:(w as any).transientDoodads.filter((g:any)=>g.owner===a).map((g:any)=>({kind:g.kind,ttl:g.ttl,maxTtl:g.maxTtl,body:g.d}))});
  const inspect=()=>JSON.parse(JSON.stringify({time:w.time,draws,
   actors:w.actors.map(a=>({id:a.id,name:a.name,defId:a.defId??null,team:a.team,pos:{...a.pos},tier:a.tier,life:a.life,mana:a.mana,es:a.es,dead:a.dead,downed:a.downed,lifespan:a.lifespan??null,
    casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,elapsed:a.casting.elapsed,total:a.casting.total}:null,
    cooldowns:[...a.cooldowns],charges:[...a.charges],statuses:a.statuses.map(s=>({id:s.id,remaining:s.remaining,dps:s.dps,stacks:s.stacks}))})),
   projectiles:w.projectiles.map(p=>({skill:p.inst.def.id,pos:{...p.pos},life:(p as any).life})),
   zones:w.zones.map(z=>({skill:z.inst.def.id,pos:{...z.pos},delay:z.delay,linger:z.linger,tick:z.tick,exploded:z.exploded})),corpses:w.corpses.map(c=>({pos:{...c.pos},remaining:c.remaining}))}));
  const steps:any[]=[],aim={x:480,y:400};
  const act=(action:any)=>{let accepted:any;
   if(action.type==='press'){const a=w.actors.find(a=>a.id===(action.actor??actor.id))!,i=a.skills.find(i=>i?.def.id===action.skill);accepted=i?w.useSkill(a,i,action.aim,a===actor):false;}
   else if(action.type==='meta')accepted=w.useMetaSkill(actor,actor.skills[0]!,action.aim);
   else if(action.type==='release'){const a=w.actors.find(a=>a.id===(action.actor??actor.id))!;if(a.casting)a.casting.held=false;}
   else if(action.type==='dismiss'){const i=actor.skills[0]!;accepted=!!instanceDelivery(i).frame&&!!i.treeNodes?.some(id=>treeNodeOf(i.def,id)?.choiceActions?.some(c=>c.action==='dismissFrame'));if(accepted)w.frameArts.dismissFrame(actor,i);}
   else if(action.type==='move')w.moveActor(w.actors.find(a=>a.id===(action.actor??actor.id))!,action.direction.x,action.direction.y,action.seconds);
   else if(action.type==='tactics'){
    accepted=[];for(const a of w.actors){if(a.owner!==actor||a.dead)continue;let movement:any;const move=(p:any)=>{movement={...p};};
     const blocked=a.dead||a.downed||a.summonReform||a.channelFormation||a.frameCharging||a.frameState?.order||a.frameState?.terminal;
     const handled=!!(blocked||a.frameState&&w.frameArts.act(a,enemy,move)||a.cohortState&&w.cohortArts.act(a,enemy,action.seconds,move));
     accepted.push({id:a.id,handled,...(movement?{movement}:{})});if(movement)w.moveActor(a,movement.x-a.pos.x,movement.y-a.pos.y,action.seconds);
    }
   }else {assert.equal(action.type,'advance');w.update(action.seconds);}
   steps.push(JSON.parse(JSON.stringify({action,...(accepted===undefined?{}:{accepted}),state:inspect(),details:w.actors.map(a=>({id:a.id,...details(a)}))})));
  };
  const advance=(seconds:number)=>{for(let n=0;n<Math.round(seconds*20);n++)act({type:'advance',seconds:.05});};
  for(let n=0;n<(spec.count??1);n++){act({type:'press',skill:spec.skill,aim});advance(9);}
  for(let n=0;n<Math.round((spec.seconds??12)*20);n++){
   if(n%80===0&&spec.meta)act({type:spec.id.startsWith('lich')?'press':'meta',skill:spec.skill,aim});
   if(n%80===0&&spec.doctrine)act({type:'press',skill:typeof spec.doctrine==='string'?spec.doctrine:spec.skill,aim});
   if(n%40===0&&spec.crew)for(const a of [...w.actors])if(a.owner===actor&&!a.dead){const inst=a.skills.filter(Boolean)[Math.floor(n/40)%Math.max(1,a.skills.filter(Boolean).length)];if(inst)act({type:'press',actor:a.id,skill:inst.def.id,aim:enemy.pos});}
   if(n%60===0&&spec.crew)act({type:'press',skill:'firebolt',aim:enemy.pos});
   if(n%60===0&&spec.hurt){const body=w.actors.find(a=>a.owner===actor&&!a.dead);if(body)act({type:'press',actor:enemy.id,skill:'firebolt',aim:{...body.pos}});}
   if(n%200===0&&spec.repeatSummon)act({type:'press',skill:spec.skill,aim});
   if(n===120&&spec.repair)act({type:'press',skill:spec.skill,aim});
   if(n===180&&spec.repair)act({type:'release'});
   if(n===180&&spec.dismiss)act({type:'dismiss',skill:spec.skill});
   if(spec.collect){const part=w.summonPacts.view(actor).flatMap(p=>p.parts)[0];if(part)act({type:'move',direction:{x:part.pos.x-actor.pos.x,y:part.pos.y-actor.pos.y},seconds:.05});}
   if(spec.tactics)act({type:'tactics',seconds:.05});
   if(spec.crew&&spec.skill==='summon_bone_golem')for(const a of [...w.actors])if(a.owner===actor&&!a.dead&&Math.hypot(a.pos.x-enemy.pos.x,a.pos.y-enemy.pos.y)>45)
    act({type:'move',actor:a.id,direction:{x:enemy.pos.x-a.pos.x,y:enemy.pos.y-a.pos.y},seconds:.05});
   act({type:'advance',seconds:.05});
  }
  courses.push({id:spec.id,config,target,steps});
 }finally{restore();}
}}finally{restoreBoot();}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,originalOnly:true,seed,courses})+'\n',{flag:'wx'});
