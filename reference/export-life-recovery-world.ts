// Authored delivery through native World/Actor methods with controlled resources.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {StatSheet,mod} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';import {SKILLS} from '../src/data/skills';
import {PROC_LIST} from '../src/data/procs';import {SIM_TAP} from '../src/engine/tap';

bootSimEngine();const rows:unknown[]=[];
function course(name:string,team:'alone'|'ally'|'enemy',run:(s:ReturnType<typeof setup>)=>void){
  const s=setup(team);try{run(s);rows.push({name,team,stages:s.stages,events:s.events,draws:s.draws()});}
  finally{s.restore();}
}
function setup(team:'alone'|'ally'|'enemy'){
  const restoreRandom=seedGlobalRandom(0xc142),oldTap=SIM_TAP.current,w=makeSimWorld('warrior',0xc142),p=w.player;
  w.devIgnoreSkillAttributes=true;w.walk=null;w.actors=[p];w.time=0;
  p.pos={x:500,y:500};p.aimPos={x:535,y:500};p.skills=[];p.cooldowns.clear();p.useLock=0;
  const rig=(a:Actor)=>{a.sheet=new StatSheet();a.sheet.setSource('life-recovery-rig',[
    ...['life','mana'].map(id=>mod(id,'override',1000)),
    ...['lifeRegen','lifeRegenPct','manaRegen','energyShield','poise','critChance'].map(id=>mod(id,'override',0)),
    ...['attackSpeed','castSpeed','effectDuration','cooldownRecovery'].map(id=>mod(id,'override',1)),
  ]);a.life=250;a.mana=1000;a.healedSince=0;a.condRose=[];a.gasped=false;a.dead=false;
    a.buffs.clear();a.charges.clear();a.statuses=[];a.gainEvents=[];a.sheet.setBase('healTaken',1.5);};
  rig(p);let other:Actor|undefined;
  if(team!=='alone'){other=new Actor('recovery-other',team==='ally'?'player':'enemy',{x:535,y:500});rig(other);
    other.tier=p.tier;other.life=team==='enemy'?1000:250;w.actors.push(other);}
  const label=(a:Actor)=>a===p?'owner':a===other?'other':'external';
  const stages:unknown[]=[],events:unknown[]=[];let frame=0,phase='setup',draws=0;
  const state=()=>structuredClone({frame,phase,time:w.time,actors:w.actors.map(a=>({label:label(a),life:a.life,mana:a.mana,
    dead:a.dead,healedSince:a.healedSince,since:[...a.since],seal:a.lifeSealAt,reserved:a.reservedLife,
    absorb:a.absorb,absorbTimer:a.absorbTimer,streams:a.restoreStreams,
    gains:a.gainEvents,casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,held:a.casting.held}:null}))});
  const record=(kind:string,details?:unknown)=>events.push({kind,details,state:state()});
  for(const a of w.actors){const heal=a.healBy.bind(a),observer=a.onLifeHealed;
    a.healBy=(amount,silent)=>{record('heal-before',{actor:label(a),amount,silent});const landed=heal(amount,silent);
      record('heal-return',{actor:label(a),landed});return landed;};
    a.onLifeHealed=function(amount,silent){assert.equal(this,a);record('observer',{actor:label(a),amount,silent});observer?.call(this,amount,silent);};
  }
  SIM_TAP.current={onHeal:(a,amount)=>record('tap',{actor:label(a),amount})};
  const random=Math.random;Math.random=()=>{draws++;return random();};
  const take=(name:string)=>stages.push({name,...state()});
  const advance=(count:number)=>{phase='world';for(let i=0;i<count;i++){frame++;w.update(.125);}take('advance:'+count);};
  const press=(id:string,syntheticChannel=false)=>{
    const def=syntheticChannel?{...SKILLS[id],castMode:'channel' as const}:SKILLS[id];
    const inst=makeSkillInstance(def,1,1);p.skills=[inst];w.meta.knownSkills.set(id,inst);
    for(let i=0;p.useLock>0||(p.cooldowns.get(id)??0)>0;i++){assert(i<500);advance(1);}
    phase=(syntheticChannel?'synthetic-channel:':'press:')+id;assert(w.useSkill(p,inst,other?.pos??p.pos),'Native admission: '+id);take('pressed:'+id);
    if(p.casting?.mode==='channel')p.casting.held=true;
    else for(let i=0;p.casting;i++){assert(i<100);advance(1);}
    take('ready:'+id);
  };
  take('initial');return{w,p,other,stages,events,press,advance,take,draws:()=>draws,
    restore:()=>{SIM_TAP.current=oldTap;restoreRandom();}};
}
course('mend-self-fallback','alone',({p,press})=>{press('mend');assert(p.life>250);});
course('mend-ally','ally',({p,other,press})=>{press('mend');assert.equal(p.life,250);assert(other!.life>250);});
course('mend-sealed','alone',({p,press})=>{p.lifeSealAt=270;press('mend');assert.equal(p.life,270);});
course('mend-overheal','alone',({p,press})=>{p.life=990;p.sheet.setBase('overheal',1);press('mend');assert.equal(p.life,1000);assert(p.absorb>0);});
course('lay-on-hands-ally','ally',({other,press})=>{press('lay_on_hands');assert(other!.life>500);});
course('choir-authored-instant','ally',({p,other,press})=>{
  assert.equal(SKILLS.choir_of_light.castMode,undefined);press('choir_of_light');
  assert.equal(p.casting,null);assert(p.life>250&&other!.life>250);
});
course('synthetic-channel-choir','ally',({p,other,press,advance,take})=>{
  press('choir_of_light',true);assert.equal(p.casting?.mode,'channel');advance(16);assert(p.life>250&&other!.life>250);
  assert(p.casting);p.casting.held=false;advance(1);assert.equal(p.casting,null);take('released');
});
course('silent-regeneration','alone',({p,advance})=>{p.sheet.setSource('life-recovery-rig',[mod('life','override',1000),mod('mana','override',1000),mod('lifeRegen','override',20)]);advance(8);assert(p.life>250);assert.equal(p.healedSince,0);});
course('restore-stream','alone',({p,advance})=>{p.restoreStreams.push({resource:'life',remaining:80,perSec:40});advance(16);assert.equal(p.restoreStreams.length,0);assert(p.life>250);});
course('stream-overheal','alone',({p,advance})=>{p.life=990;p.sheet.setBase('overheal',1);p.restoreStreams.push({resource:'life',remaining:80,perSec:40});advance(16);assert.equal(p.restoreStreams.length,0);assert(p.absorb>0);});
course('leech-and-life-on-hit','enemy',({p,press,advance})=>{
  p.sheet.setBase('lifeOnHit',5);p.sheet.setBase('lifeLeech',.1);
  for(let i=0;p.life===250;i++){assert(i<8);press('cleave');advance(4);}assert(p.life>250);
});
course('delayed-bloom','ally',({w,p,other,advance})=>{
  const proc=PROC_LIST.find(p=>p.effect.type==='delayedBurst'&&p.effect.healAllies)!;assert(proc);
  w['executeProc'](proc,p,null,other!,0);advance(8);assert(p.life>250&&other!.life>250);
});
course('full-resource-refill','alone',({p,take})=>{
  p.lifeSealAt=300;p.reservedLife=600;p.sheet.setBase('healTaken',0);p.mana=1;
  p.fillResources();assert.equal(p.life,1000);assert.equal(p.mana,1000);assert.equal(p.healedSince,0);take('refilled');
});
assert.equal(rows.length,13);
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,
  scope:'Thirteen delivery courses using native World/Actor methods, authored skills, actual updates, damage sustain, streams, a delayed proc and full resource refill. The original Choir remains instant; one separately named synthetic castMode override exercises channel healing. Controlled resources/defenses and seeded randomness; no physical-input, renderer or device claim.',
  courses:rows.length,rows},(_key,value)=>value===undefined?{$undefined:true}:typeof value==='number'&&!Number.isFinite(value)?{$number:String(value)}:value,2)+'\n');
