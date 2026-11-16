import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance,TAME_CFG,instanceTameMod,type SkillInstance,type SkillEffect} from '../src/engine/skills';
import {companionBondOf} from '../src/engine/companionSpec';
import {MONSTERS} from '../src/data/monsters';
import {COMPANION_STANCES} from '../src/data/companionStances';
import {COMPANION_STANCE_CFG,companionStanceIdOf,nextStanceId,standingOrderFor,stanceOfOrder} from '../src/engine/companionStances';

const restore=seedGlobalRandom(0x4d3310),courses:unknown[]=[],stanceCourses:unknown[]=[];
try{
  for(const spec of[{},{life:.65},{life:1},{life:.65,wildChance:0},{rarity:'rare'},{rarity:'rare',allowRares:true},
    {tier:1},{owned:true},{friendly:true},{full:true},{tags:['impossible']}]){
    const cfg=spec as {life?:number;wildChance?:number;rarity?:'rare';allowRares?:boolean;tier?:number;owned?:boolean;friendly?:boolean;full?:boolean;tags?:string[]};
    const w=makeSimWorld('warrior',0x4d3310),keeper=new Actor('keeper','ally',{x:800,y:600}),beast=new Actor('beast','enemy',{x:830,y:600});
    w.walk=null;w.meta.modeId='immortal';w.actors=[keeper,beast];beast.defId='skeleton_warrior';beast.life=beast.maxLife()*(cfg.life??.2);
    beast.rarity=cfg.rarity??'normal';beast.tier=cfg.tier??0;if(cfg.owned)beast.owner=keeper;if(cfg.friendly)beast.team=keeper.team;
    beast.threat.set(999,10);beast.aggroed=true;beast.aiFleeing=true;beast.squadId=9;beast.squadLeader=true;beast.tag='guard';beast.lifelineId=99;
    const effect={type:'tame',tags:cfg.tags??MONSTERS.skeleton_warrior.tags??[],sureBelow:.3,wildChance:cfg.wildChance??.2,allowRares:cfg.allowRares} as Extract<SkillEffect,{type:'tame'}>;
    const skill=makeSkillInstance({id:'m3-claim',name:'Claim',description:'',color:'#fff',tags:['spell'],manaCost:0,useTime:0,cooldown:0,delivery:{type:'target',range:100},effects:[effect]},1);
    // Deliberately no matching host bar: claim conversion is measured separately
    // from CompanionBonds' already-qualified inheritance and recovery lifecycle.
    if(cfg.full){const held=new Actor('held','ally',{x:800,y:600});held.owner=keeper;held.companion=true;held.downed=true;held.sourceSkillId='__companion:m3-claim';w.actors.push(held);}
    const inspect=()=>({id:beast.id,owner:beast.owner?.id,team:beast.team,kind:beast.kind,companion:beast.companion,life:beast.life,
      sourceSkillId:beast.sourceSkillId,bondGroup:beast.bondGroup,noBounty:beast.noBounty,lifelineId:beast.lifelineId,squadId:beast.squadId,
      squadLeader:beast.squadLeader,tag:beast.tag,threat:[...beast.threat],aggroed:beast.aggroed,aiFleeing:beast.aiFleeing,extraParts:beast.extraParts});
    const initial=inspect(),random=mulberry32(42),draws:number[]=[],old=Math.random;Math.random=()=>{const n=random();draws.push(n);return n;};
    try{
      (w as unknown as {tryTame(a:Actor,s:SkillInstance,b:Actor,f:typeof effect):void}).tryTame(keeper,skill,beast,effect);
      courses.push({spec,effect,keeperId:keeper.id,initial,maximum:beast.maxLife(),adjustments:instanceTameMod(skill),bond:companionBondOf(skill),draws,expected:inspect()});
    }finally{Math.random=old;}
  }
  const w=makeSimWorld('warrior',0x4d3310),seat=w.localSeat;
  const skill=makeSkillInstance({id:'m3-bond',name:'Bond',description:'',color:'#fff',tags:['spell'],manaCost:0,useTime:0,cooldown:0,delivery:{type:'self'},effects:[{type:'tame',tags:['beast']}]},1);
  seat.actor.skills=[skill,skill];seat.meta.stances={};
  for(const [id,stance]of[['m3-bond','defensive'],['m3-bond','passive'],['m3-bond','unknown'],['unknown','aggressive'],['m3-bond','aggressive']] as const){
    const changed=w.setCompanionStance(seat,id,stance);stanceCourses.push({id,stance,changed,choices:{...seat.meta.stances}});
  }
  const cycled=w.cycleCompanionStance(seat);assert(cycled);stanceCourses.push({cycle:true,changed:cycled,choices:{...seat.meta.stances}});
  const stances=Object.values(COMPANION_STANCES),pure=['aggressive','defensive','passive','unknown'].map(id=>({id,next:nextStanceId(id),
    held:companionStanceIdOf({bond:id},'bond'),order:standingOrderFor(id),decoded:stanceOfOrder(standingOrderFor(id))}));
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,parts:TAME_CFG.claimParts,monster:MONSTERS.skeleton_warrior,courses,stances,stanceConfig:COMPANION_STANCE_CFG,stanceCourses,pure}));
}finally{restore();}
