import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance,instanceChargeGain,hostSockets,supportFitsInst,type SkillInstance,type ChargeGainSpec} from '../src/engine/skills';
import {treeGraph} from '../src/engine/skilltree';
import {mod} from '../src/engine/stats';

bootSimEngine();
const wire=(v:unknown):any=>JSON.parse(JSON.stringify(v));
const timed=(s:ChargeGainSpec)=>s.on==='second'||s.on==='move'||s.on==='channelSecond';
const inputs:{name:string;make:()=>SkillInstance}[]=[];
for(const def of Object.values(SKILLS)){
 if(def.chargeGain?.some(timed))inputs.push({name:'innate:'+def.id,make:()=>makeSkillInstance(def,20,4)});
 const graph=treeGraph(def);
 if(graph)for(const id of graph.order){
  const i=makeSkillInstance(def,20,4);i.treeNodes=[id];
  if(instanceChargeGain(i).some(s=>timed(s)&&!(def.chargeGain??[]).includes(s)))
   inputs.push({name:'tree:'+def.id+':'+id,make:()=>{const i=makeSkillInstance(def,20,4);i.treeNodes=[id];return i;}});
 }
}
for(const support of Object.values(SUPPORTS).filter(d=>d.chargeGain?.some(timed))){
 const def=Object.values(SKILLS).find(d=>supportFitsInst(support,makeSkillInstance(d)));
 assert(def,`No eligible host: ${support.id}`);
 inputs.push({name:'support:'+support.id+':'+def.id,make:()=>{const i=makeSkillInstance(def,20,4);i.sockets[0]={def:support,level:3};return i;}});
}
// Controlled composite input covers key sharing, simultaneous odometers, and
// toggle clocks even when the current catalogue has no such combination.
inputs.push({name:'synthetic:simultaneous-clocks',make:()=>makeSkillInstance({...SKILLS.firebolt,chargeGain:[
 {charge:'fury',on:'second',amount:1,max:12,everySeconds:.75},
 {charge:'fury',on:'second',amount:.5,max:12,everySeconds:1.25},
 {charge:'fury',on:'move',amount:1,max:12,perDistance:30},
 {charge:'frenzy',on:'channelSecond',amount:1,max:9,everySeconds:.5},
 {charge:'bloodlust',on:'second',amount:1,max:9,everySeconds:.5,whileToggled:true},
 ]},20,4)});
const courses:any[]=[];
for(const input of inputs){
 const restore=seedGlobalRandom(221000+courses.length);
 try{
  const w=makeSimWorld('swashbuckler',221000+courses.length),a:any=w.player,inst=input.make();
  a.skills=[inst];a.charges.clear();a.chargeState.clear();a.chargeModCount.clear();a.gainEvents=[];
  a.activeAuras.clear();a.summonToggles.clear();a.moveAcc=0;a.casting=undefined;
  const taps=instanceChargeGain(inst);assert(taps.some(timed));
  const description=wire({skill:inst.def.id,tags:inst.def.tags,treeNodes:inst.treeNodes??[],sockets:inst.sockets.map(s=>s?{id:s.def.id,level:s.level}:null),taps,
   origins:taps.map(s=>(inst.def.chargeGain??[]).includes(s)?'innate':hostSockets(inst).some(x=>x.def.chargeGain?.includes(s))?'support':'tree')});
  const snapshot=()=>wire({charges:[...a.charges],state:[...a.chargeState],modCount:[...a.chargeModCount],events:a.gainEvents,moveAcc:a.moveAcc,skillState:inst.state??null,sources:a.sheet.sourceNames().filter((s:string)=>s.startsWith('charge:'))});
  const steps:any[]=[];
  const step=(label:string,action:()=>unknown)=>{const before=snapshot(),result=action();steps.push({label,before,result:result??null,after:snapshot()});};
  step('idle-quarter-second',()=>a.updateCharges(.25));
  step('walk-short',()=>{a.moveAcc=29;a.updateCharges(.5);});
  step('walk-cross-threshold',()=>{a.moveAcc=125;a.updateCharges(.75);});
  step('held-other-skill',()=>{a.casting={mode:'channel',held:true,inst:makeSkillInstance(SKILLS.fireball)};a.updateCharges(2);});
  step('held-same-def-new-instance',()=>{a.casting={mode:'channel',held:true,inst:makeSkillInstance(inst.def)};a.updateCharges(2);});
  step('released-hold',()=>{a.casting.held=false;a.updateCharges(1);});
  step('activate-aura-presence',()=>{a.activeAuras.set(inst.def.id,{inst});a.updateCharges(1.5);});
  step('swap-to-summon-toggle-presence',()=>{a.activeAuras.clear();a.summonToggles.set(inst.def.id,{inst,reserved:0});a.updateCharges(1.5);});
  step('deactivate-toggles',()=>{a.summonToggles.clear();a.updateCharges(.1);});
  step('scoped-capacity-and-drain',()=>{a.sheet.setSource('clock-investigation',[mod('chargeCap','flat',2,inst.def.tags)]);for(const s of taps)a.startChargeDrain(s.charge,2);a.moveAcc=300;a.updateCharges(1);});
  step('unslot-keeps-nontree-clocks',()=>{a.skills=[];a.updateCharges(.25);});
  step('reslot-and-resume',()=>{a.skills=[inst];a.casting={mode:'channel',held:true,inst};a.moveAcc=120;a.updateCharges(3);});
  step('clear-tree-clocks',()=>a.clearTreeChargeClocks(inst));
  courses.push({name:input.name,input:description,steps});
 }finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'M22 investigation only; actual Actor timed taps and state, no full world execution claim',courses})+'\n',{flag:'wx'});
console.log(JSON.stringify({courses:courses.length,transitions:courses.reduce((n,c)=>n+c.steps.length,0),names:courses.map(c=>c.name)}));
