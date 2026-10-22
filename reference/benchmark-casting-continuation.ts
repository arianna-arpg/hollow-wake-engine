import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';
import * as skills from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {seedGlobalRandom} from '../src/sim/rng';

const [previous,current,output]=process.argv.slice(2),validationOnly=process.argv.includes('--validate-only');
const load=async(game:string)=>{
  const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);
  return {arena:await get('src/sim/arena.ts'),skills:await get('src/engine/skills.ts'),
    ...await get('src/data/skills.ts'),...await get('src/data/supports.ts'),...await get('src/sim/rng.ts')};
};
const apis:any={original:{arena,skills,SKILLS,SUPPORTS,seedGlobalRandom},previous:await load(previous),current:await load(current)};
const comparisonAt=process.argv.indexOf('--comparison-adapter');
if(comparisonAt>=0)apis.comparison=await load(process.argv[comparisonAt+1]);
const keys=Object.keys(apis),configs:Record<string,any>={},results:any[]=[];
const courses=[
  {id:'firebolt',mode:'cast'}, {id:'lightning_blast',mode:'charge'},
  {id:'infernal_ray',mode:'channel'}, {id:'shield_up',mode:'guard'},
  {id:'firebolt',mode:'overcharge',support:'overcharge'},
  {id:'firebolt',mode:'perfect',variant:{castMode:'perfect'}},
  {id:'firebolt',mode:'timed',variant:{castMode:'timed'}},
  {id:'firebolt',mode:'multitude',variant:{castMode:'multitude'}},
  {id:'firebolt',mode:'concentration',variant:{targeting:{target:'enemy',castRange:400},concentration:{time:1,onBreak:'release',minRelease:.25}}},
];
for(const key of keys){
  const api=apis[key];api.arena.bootSimEngine();const restore=api.seedGlobalRandom(351500);
  try{
    const world=api.arena.makeSimWorld('magician',351500),actor=world.player;
    actor.setAttributes(Object.fromEntries(Object.keys(world.meta.baseAttrs).map(id=>[id,50])));
    world.devIgnoreSkillAttributes=true;world.walk=null;actor.pos={x:500,y:500};
    const foe=world.createMonster('zombie',1,'enemy');foe.pos={x:650,y:500};foe.brain=undefined;
    world.springAmbush(foe,true);foe.untargetable=false;foe.tier=actor.tier;world.actors=[actor,foe];
    for(const body of [actor,foe]){
      body.sheet.setSource('continuation-benchmark',[
        ...['life','mana'].map(stat=>({stat,kind:'override',value:10000})),
        ...['energyShield','critChance','poise','lifeRegen','manaRegen'].map(stat=>({stat,kind:'override',value:0})),
        ...['castSpeed','attackSpeed','manaCost','manaUseCost','effectDuration','cooldownRecovery'].map(stat=>({stat,kind:'override',value:1})),
      ]);body.fillResources();
    }
    const definitions=courses.map(course=>{
      assert(api.SKILLS[course.id]);
      const inst=api.skills.makeSkillInstance(course.variant?{...api.SKILLS[course.id],...course.variant}:api.SKILLS[course.id],1,3);
      if(course.support){assert(api.SUPPORTS[course.support]);inst.sockets[0]={def:api.SUPPORTS[course.support],level:1};}
      return inst;
    });
    actor.skills=definitions;for(const inst of definitions)world.meta.knownSkills.set(inst.def.id,inst);
    configs[key]={world,actor,foe,definitions,aim:{x:650,y:500}};
  }finally{restore();}
}
function reset(c:any){
  const a=c.actor,w=c.world;a.casting=null;a.useLock=0;a.reflexLock=0;a.cooldowns.clear();a.cooldownTotals.clear();
  a.mana=10000;a.life=10000;a.dead=false;a.downed=false;a.statuses.length=0;a.skillChargeState.clear();a.charges.clear();
  c.foe.life=10000;c.foe.dead=false;c.foe.downed=false;c.foe.untargetable=false;c.foe.statuses.length=0;
  w.projectiles.length=0;w.flashes.length=0;w.texts.length=0;w.pendingRepeats.length=0;w.actors=[a,c.foe];
}
function run(key:string,workload:string){
  const c=configs[key],w=c.world,a=c.actor,restore=apis[key].seedGlobalRandom(351501);
  try{
    reset(c);w.time=10;
    if(workload==='idle-updates'){
      for(let i=0;i<65536;i++)w.updateCasting(a,1/60);
      assert.equal(a.casting,null);return {updates:65536,active:false,mana:a.mana,life:a.life};
    }
    if(workload==='ongoing-ordinary-updates'){
      const inst=c.definitions[0];inst.state={};assert(w.useSkill(a,inst,c.aim,true));
      const cast=a.casting;assert.equal(cast.mode,'cast');cast.total=1e9; // Explicit long-running borrowed state.
      for(let i=0;i<32768;i++)w.updateCasting(a,1/60);
      assert.equal(a.casting,cast);assert.equal(w.projectiles.length,0);
      return {updates:32768,elapsed:cast.elapsed,total:cast.total,mana:a.mana,life:a.life,aim:cast.aim};
    }
    const modes:Record<string,number>={};let completed=0,manaSpent=0,projectiles=0,repeats=0,flashes=0;
    for(let i=0;i<576;i++){
      reset(c);w.time=10+i*4;const lane=i%courses.length,inst=c.definitions[lane];inst.state={};
      assert(w.useSkill(a,inst,c.aim,true),'native request refused '+lane);
      const cast=a.casting;assert.equal(cast?.mode,courses[lane].mode,'native cast mode '+lane);
      modes[cast.mode]=(modes[cast.mode]??0)+1;
      if(cast.mode==='channel'||cast.mode==='guard'){
        for(let frame=0;frame<4;frame++){w.time+=.25;w.updateCasting(a,.25);}
        if(a.casting){a.casting.held=false;w.updateCasting(a,0);}
      }else if(cast.mode==='charge'||cast.mode==='overcharge'){
        const dt=cast.total*.5;w.time+=dt;w.updateCasting(a,dt);
        if(a.casting){a.casting.held=false;w.updateCasting(a,0);}
      }else{
        const fraction=cast.mode==='timed' ? cast.indicatorAt : cast.mode==='perfect' ? .8 : .5;
        const dt=cast.total*fraction;w.time+=dt;w.updateCasting(a,dt);
        if(cast.mode==='perfect'||cast.mode==='timed'||cast.mode==='multitude')w.castPress(a);
        const rest=cast.total-cast.elapsed;w.time+=rest;w.updateCasting(a,rest);
      }
      assert.equal(a.casting,null,'native completion '+lane);completed++;
      manaSpent+=10000-a.mana;projectiles+=w.projectiles.length;repeats+=w.pendingRepeats.length;flashes+=w.flashes.length;
    }
    assert.equal(completed,576);assert.equal(Object.keys(modes).length,9);assert(projectiles>0);
    return {cycles:576,modes,completed,manaSpent,projectiles,repeats,flashes,mana:a.mana,life:a.life};
  }finally{restore();}
}
for(const [name,operations]of [['idle-updates',65536],['ongoing-ordinary-updates',32768],['native-nine-mode-cycles',576]] as const){
  const samples:Record<string,number[]>=Object.fromEntries(keys.map(key=>[key,[]]));let expected='';
  for(const key of keys)run(key,name);
  for(let trial=validationOnly?0:-5;trial<(validationOnly?1:25);trial++)for(let offset=0;offset<keys.length;offset++){
    const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length];
    const start=performance.now(),receipt=run(key,name),elapsed=performance.now()-start,actual=JSON.stringify(receipt);
    if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);
    if(trial>=0)samples[key].push(elapsed);
  }
  const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return[key,{samplesMs:samples[key],medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)]}];}));
  results.push({name,operations,derivedSha256:createHash('sha256').update(expected).digest('hex'),receipt:JSON.parse(expected),...timing});
  console.log(validationOnly?name+': receipts validated (not performance evidence)':name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({
  scope:validationOnly?'Validation only: receipt equality after priming; timings are not performance evidence.':'Rotating frozen original/v0.29/candidate; five warmups and 25 samples. Idle updates call the real World method without an active cast. Ongoing ordinary updates use a real admitted firebolt with explicitly lengthened total duration. Native cycles perform 576 real requests and completions across nine modes, including manual timing clicks, channel/guard holds and charged releases. Synthetic mode/focus variants and resources are explicit setup. Real host delivery executes. Resets, assertions, result construction and per-batch RNG seeding are timed; world/content setup is outside timing. This is desktop Node throughput, not allocation, renderer frames or device acceptance.',
  validationOnly,comparisonIncluded:comparisonAt>=0,node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results,
},null,2)+'\n',{flag:'wx'});
