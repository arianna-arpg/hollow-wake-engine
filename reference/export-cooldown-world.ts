// Native frame/contact observations. Setup is explicit; original timer,
// timeflow, casting, hit, proc admission, cue and rider methods execute.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet,mod} from '../src/engine/stats';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {procStat,type ProcDef} from '../src/data/procs';
import {procCueRows} from '../src/engine/procCues';

const S='__cooldown_movement',F='__cooldown_fire',U='__cooldown_unslotted';
const names=['proc-between-ticks','proc-before-ticks','tagged-recovery','unslotted-tag-filter',
  'stasis-clock-and-cue','slowed-clock-unbent-cue','dead-owner','repeated-proc-coalesces',
  'earned-block-and-internal-cooldown','authored-time-dilation'];
bootSimEngine();const rows:unknown[]=[];
for(const name of names){
  const restore=seedGlobalRandom(0xc244),world=makeSimWorld('warrior',0xc244),actor=world.player;
  try{
    world.devIgnoreSkillAttributes=true;world.walk=null;world.actors=[actor];world.time=0;
    actor.pos={x:500,y:500};actor.aimPos={x:535,y:500};actor.useLock=0;
    const rig=(a:Actor)=>{
      a.sheet=new StatSheet();a.sheet.setSource('cooldown-observation',[
        mod('life','override',1000),mod('mana','override',1000),mod('energyShield','override',100),mod('poise','override',100),
        ...['lifeRegen','lifeRegenPct','manaRegen','esRechargeRate','poiseRegenPct','critChance'].map(id=>mod(id,'override',0)),
        ...['attackSpeed','castSpeed','effectDuration','cooldownRecovery','healTaken'].map(id=>mod(id,'override',1))]);
      a.life=500;a.mana=1000;a.es=a.poise=40;a.dead=false;a.esDelay=1000;a.esRecharging=false;
      a.buffs.clear();a.statuses=[];a.charges.clear();a.procCuePulses=[];a.procPopEvents=[];a.procCues=undefined;
      a.procReadyAt.clear();a.procFiredAt.clear();a.cooldowns.clear();
    };rig(actor);
    const movement=makeSkillInstance({...SKILLS.cleave,id:S,tags:['attack','movement']},1),
      fire=makeSkillInstance({...SKILLS.firebolt,id:F},1),dilation=makeSkillInstance(SKILLS.time_dilation,1);
    actor.skills=[movement,fire,dilation];world.meta.knownSkills.set(dilation.def.id,dilation);
    actor.cooldowns=new Map([[S,10],[F,5],[U,1]]);
    const stages:unknown[]=[],events:{kind:string;id?:string;[key:string]:unknown}[]=[];let frame=0;
    const state=()=>({frame,time:world.time,clocks:[...actor.cooldowns],internal:[...actor.procReadyAt],
      pulses:actor.procCuePulses.map(p=>({...p})),rows:procCueRows(actor),dead:actor.dead,
      statuses:actor.statuses.map(s=>({id:s.id,remaining:s.remaining})),casting:actor.casting?.inst.def.id??null});
    const take=(stage:string)=>stages.push({stage,...state()});
    const timers=actor.updateTimers;actor.updateTimers=function(...args){const before=state();
      const result=Reflect.apply(timers,this,args);events.push({kind:'timers',dt:args[0],chronoDt:args[1],before,after:state()});return result;};
    const execute=world['executeProc'];world['executeProc']=function(...args){const before=state();
      const result=Reflect.apply(execute,this,args);events.push({kind:'proc',id:args[0].id,before,after:state()});return result;};
    const advance=(count:number)=>{for(let i=0;i<count;i++){frame++;world.update(.125);}take('advanced:'+count);};
    const proc:ProcDef={id:'__cooldown_phase',name:'Cooldown phase',color:'#abcdef',trigger:'hit',effect:{type:'cooldown',seconds:1.5}};
    const apply=()=>{world['executeProc'](proc,actor,movement,null,0);take('applied');};
    take('initial');
    if(name==='proc-between-ticks'){advance(2);apply();advance(8);}
    if(name==='proc-before-ticks'){apply();advance(8);}
    if(name==='tagged-recovery'){actor.sheet.setSource('movement-recovery',[mod('cooldownRecovery','override',2,['movement'])]);advance(2);apply();advance(8);}
    if(name==='unslotted-tag-filter'){proc.effect={type:'cooldown',seconds:1.5,tags:[]};apply();advance(8);}
    if(name==='stasis-clock-and-cue'||name==='slowed-clock-unbent-cue'){
      actor.applyStatus(name==='stasis-clock-and-cue'?'stasis':'temporal_drag',0,1,'cooldown-observation');apply();advance(4);advance(12);
    }
    if(name==='dead-owner'){actor.dead=true;apply();advance(8);assert.equal(actor.procCuePulses.length,0);}
    if(name==='repeated-proc-coalesces'){apply();advance(1);apply();assert.equal(actor.procCuePulses.length,1);advance(8);}
    if(name==='earned-block-and-internal-cooldown'){
      const other=new Actor('cooldown-attacker','enemy',{x:535,y:500});rig(other);other.tier=actor.tier;world.actors.push(other);
      actor.sheet.setBase(procStat('stalwart_rhythm'),1);actor.sheet.setBase('blockChance',1);actor['refreshConditions']();
      const strike=makeSkillInstance(SKILLS.cleave,1,1),count=()=>events.filter(e=>e.kind==='proc'&&e.id==='stalwart_rhythm').length;
      for(let i=0;count()===0;i++){assert(i<30);world['resolveHit'](other,strike,actor,1,0);take('contact');}
      assert.equal(count(),1);world['resolveHit'](other,strike,actor,1,0);assert.equal(count(),1);take('internal-cooldown');advance(12);
      for(let i=0;count()===1;i++){assert(i<30);world['resolveHit'](other,strike,actor,1,0);take('later-contact');}
      assert.equal(count(),2);
    }
    if(name==='authored-time-dilation'){
      assert(world.useSkill(actor,dilation,actor.pos));take('used-time-dilation');
      for(let i=0;actor.casting;i++){assert(i<100);advance(1);}advance(2);
    }
    rows.push({name,stages,events});
  }finally{restore();}
}
assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,
  scope:'Ten original World courses: elapsed/tagged recovery, timeflow, cues, a host-resolved contact earning a real proc with its internal cooldown, and the distinct authored Time Dilation skill. Controlled setup; no renderer, physical-input, SDK or performance claim.',
  courses:rows.length,rows},(_key,value)=>value===undefined?{$undefined:true}:value,2)+'\n',{flag:'wx'});
