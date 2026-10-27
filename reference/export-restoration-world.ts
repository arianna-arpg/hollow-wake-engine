// Native gameplay observations; never substitutes for an accepted fixture.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet,mod} from '../src/engine/stats';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {procStat} from '../src/data/procs';
const destination=process.argv[2];
type Trace={kind:string;id?:string;after:{esJustFilled:boolean};[key:string]:unknown};
type Course={world:ReturnType<typeof makeSimWorld>;actor:Actor;events:Trace[];take:(name:string)=>void;advance:(count:number)=>void;rig:(actor:Actor)=>void};
bootSimEngine();const rows:unknown[]=[];
function course(name:string,run:(context:Course)=>void){
  const restore=seedGlobalRandom(0xc143),world=makeSimWorld('warrior',0xc143),actor=world.player,stages:unknown[]=[],events:Trace[]=[];
  try{
    world.devIgnoreSkillAttributes=true;world.walk=null;world.actors=[actor];world.time=0;
    actor.pos={x:500,y:500};actor.aimPos={x:535,y:500};actor.skills=[];actor.cooldowns.clear();actor.useLock=0;
    const rig=(a:Actor)=>{
      a.sheet=new StatSheet();a.sheet.setSource('restoration-observation',[
        mod('life','override',1000),...['mana','energyShield','poise'].map(id=>mod(id,'override',100)),
        ...['lifeRegen','lifeRegenPct','manaRegen','esRechargeRate','poiseRegenPct','critChance'].map(id=>mod(id,'override',0)),
        ...['attackSpeed','castSpeed','effectDuration','cooldownRecovery','healTaken'].map(id=>mod(id,'override',1)),
      ]);
      a.life=1000;a.mana=a.es=a.poise=40;a.dead=false;a.esDelay=1000;a.esRecharging=false;
      a.gainEvents=[];a.restoreGains=[];a.procCuePulses=[];a.procPopEvents=[];
      a.statuses=[];a.buffs.clear();a.charges.clear();
    };
    rig(actor);let frame=0;
    const state=()=>structuredClone({frame,time:world.time,life:actor.life,mana:actor.mana,es:actor.es,poise:actor.poise,
      reservedMana:actor.reservedMana,esJustFilled:actor.esJustFilled,esDelay:actor.esDelay,esRecharging:actor.esRecharging,
      poiseBroken:actor.poiseBroken,poiseDelay:actor.poiseDelay,streams:actor.restoreStreams,
      gains:actor.gainEvents,restoreGains:actor.restoreGains,procCues:actor.procCuePulses,procReadyAt:[...actor.procReadyAt],
      casting:actor.casting?{id:actor.casting.inst.def.id,mode:actor.casting.mode}:null});
    for(const method of ['gainEs','gainPoise'] as const){
      const original=actor[method].bind(actor);
      actor[method]=amount=>{const before=state(),result=original(amount);events.push({kind:method,amount,result,before,after:state()});return result;};
    }
    const execute=world['executeProc'].bind(world);
    world['executeProc']=(proc,...args)=>{const before=state();const result=execute(proc,...args);
      events.push({kind:'proc',id:proc.id,before,after:state()});return result;};
    const take=(name:string)=>stages.push({name,...state()});
    const advance=(count:number)=>{for(let i=0;i<count;i++){frame++;world.update(.125);}take('advanced:'+count);};
    let error:string|null=null;take('initial');
    try{run({world,actor,events,take,advance,rig});}catch(e){error=String(e);}
    rows.push({name,error,stages,events});
  }finally{restore();}
}
course('shield-stream',({actor,advance})=>{actor.restoreStreams.push({resource:'es',remaining:30,perSec:15});advance(8);advance(8);assert.equal(actor.es,70);assert.equal(actor.restoreStreams.length,0);});
course('shield-stream-fills',({actor,advance,events})=>{actor.es=95;actor.restoreStreams.push({resource:'es',remaining:30,perSec:15});advance(16);assert.equal(actor.es,100);assert(events.some(e=>e.kind==='gainEs'&&e.after.esJustFilled));});
course('natural-recharge-bypasses-gain',({actor,advance,events})=>{actor.esDelay=0;actor.sheet.setSource('recharge',[mod('esRechargeRate','override',.2)]);advance(8);assert.equal(actor.es,60);assert(!events.some(e=>e.kind==='gainEs'));});
course('life-regen-converted-to-shield',({actor,advance,events})=>{actor.sheet.setSource('conversion',[mod('lifeRegen','override',20),mod('lifeRegenToEs','override',1)]);advance(8);assert.equal(actor.es,60);assert(events.some(e=>e.kind==='gainEs'));});
course('mana-stream-reservation',({actor,advance})=>{actor.reservedMana=30;actor.restoreStreams.push({resource:'mana',remaining:50,perSec:25});advance(16);assert.equal(actor.mana,70);});
course('shield-stream-stasis',({actor,advance})=>{actor.restoreStreams.push({resource:'es',remaining:30,perSec:15});actor.applyStatus('stasis',0,1,'restoration-observation');advance(4);assert.equal(actor.es,40);advance(24);assert.equal(actor.es,70);});
course('shield-stream-slow',({actor,advance})=>{actor.restoreStreams.push({resource:'es',remaining:30,perSec:15});actor.applyStatus('temporal_drag',0,1,'restoration-observation');advance(4);assert(actor.es>40&&actor.es<47.5);advance(24);assert.equal(actor.es,70);});
course('fed-broken-poise-rearms-on-update',({world,actor,take,advance})=>{actor.poiseBroken=true;actor.poiseDelay=5;world['applyRestore'](actor,{resource:'poise',amount:60});assert.equal(actor.poise,100);assert(actor.poiseBroken);take('fed-still-broken');advance(1);assert(!actor.poiseBroken);});
course('earned-desperate-reserves-spell',({world,actor,events,take,advance})=>{
  actor.mana=20;actor.sheet.setBase(procStat('desperate_reserves'),1);actor['refreshConditions']();
  const inst=makeSkillInstance(SKILLS.mend,1,1);actor.skills=[inst];world.meta.knownSkills.set(inst.def.id,inst);
  assert(world.useSkill(actor,inst,actor.pos));take('pressed-mend');
  for(let i=0;actor.casting;i++){assert(i<100);advance(1);}
  assert(events.some(e=>e.kind==='proc'&&e.id==='desperate_reserves'));take('completed');
});
course('earned-block-restores-poise',({world,actor,events,take,rig})=>{
  const other=new Actor('restoration-attacker','enemy',{x:535,y:500});rig(other);other.tier=actor.tier;
  world.actors.push(other);actor.sheet.setBase(procStat('relic_guard_refrain'),1);
  actor.sheet.setBase('blockChance',1);
  const inst=makeSkillInstance(SKILLS.cleave,1,1);
  for(let i=0;!events.some(e=>e.kind==='proc'&&e.id==='relic_guard_refrain');i++){
    assert(i<30);world['resolveHit'](other,inst,actor,1,0);take('resolved-contact:'+i);
  }
  assert(actor.poise>40);
});
fs.writeFileSync(destination,JSON.stringify({schemaVersion:1,stage:'Exploratory only; not accepted fixtures',
  scope:'Ten native World courses: real timer updates, streams, recharge, conversion, reservation, stasis/slow, poise rearm, an authored spell cast and a host-resolved attack contact earning restoration procs. Controlled actor/stat setup; no physical-input or renderer claim.',
  courses:rows.length,rows},(_k,v)=>v===undefined?{$undefined:true}:typeof v==='number'&&!Number.isFinite(v)?{$number:String(v)}:v,2)+'\n',{flag:'wx'});
