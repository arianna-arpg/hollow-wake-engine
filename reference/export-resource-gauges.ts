import fs from 'node:fs';
import {bootSimEngine} from '../src/sim/arena';
import {SKILLS} from '../src/data/skills';
import {makeSkillInstance} from '../src/engine/skills';
import {GAUGE_CFG,gaugeEffOf,gaugeFill,gaugeLocked,gaugeLockLeft,gaugeFloor,gaugeReady,gaugePowerOf,gaugeFrac,gaugeAdd,gaugeSpend,gaugeTick,gaugeNote,gaugeShaveSec,type GaugeSpec} from '../src/engine/gauge';

bootSimEngine();
const wire=(value:unknown):any=>JSON.parse(JSON.stringify(value));
const authored=Object.values(SKILLS).filter(d=>d.gauge).map(d=>({id:d.id,spec:d.gauge!}));
const specs=[...authored,{id:'synthetic:partial',spec:{need:7,regen:1.25,lockoutSec:.75,bankMult:2,partial:{minFrac:.25,floorPower:.4},cooldownPer:.2}},
 {id:'synthetic:overflow',spec:{need:7,regen:1.25,lockoutSec:.75,bankMult:2,overflow:true}},
 {id:'synthetic:defaults',spec:{need:3}},{id:'synthetic:partial-floor-at-need',spec:{need:3,partial:{minFrac:1,floorPower:.3}}}] as {id:string;spec:GaugeSpec}[];
const courses:any[]=[];
for(const {id,spec} of specs)for(const needMul of [.1,1,1.5])for(const gainMul of [0,1,2])for(const lockMul of [0,1,2]){
 const inst=makeSkillInstance(SKILLS.firebolt),eff=gaugeEffOf(spec,needMul,gainMul,lockMul);
 const view=()=>wire({state:inst.state??null,fill:gaugeFill(inst),locked:gaugeLocked(inst),lockLeft:gaugeLockLeft(inst),floor:gaugeFloor(spec,eff),ready:gaugeReady(inst,eff,spec),fullReady:gaugeReady(inst,eff),power:gaugePowerOf(spec,eff,gaugeFill(inst)),fraction:gaugeFrac(inst,eff),note:gaugeNote(inst,spec,eff)});
 const steps:any[]=[];
 const step=(command:unknown[],action:()=>unknown)=>{const before=view(),result=action();steps.push({command,before,result:result??null,after:view()});};
 step(['add',0],()=>gaugeAdd(inst,0,eff));
 step(['add',-.5],()=>gaugeAdd(inst,-.5,eff));
 step(['add',1.25],()=>gaugeAdd(inst,1.25,eff));
 step(['tick',.25],()=>gaugeTick(inst,spec,eff,.25));
 step(['spend'],()=>gaugeSpend(inst,spec,eff));
 step(['add',2],()=>gaugeAdd(inst,2,eff));
 step(['tick',.25],()=>gaugeTick(inst,spec,eff,.25));
 step(['tick',.5],()=>gaugeTick(inst,spec,eff,.5));
 step(['tick',10],()=>gaugeTick(inst,spec,eff,10));
 step(['add',100],()=>gaugeAdd(inst,100,eff));
 step(['spend'],()=>gaugeSpend(inst,spec,eff));
 step(['shave',1.5],()=>gaugeShaveSec(spec,eff,1.5));
 step(['tick',0],()=>gaugeTick(inst,spec,eff,0));
 courses.push({id,spec:wire(spec),factors:{needMul,gainMul,lockMul},eff,steps});
}
const edgeCases:any[]=[];
for(const fill of [-.5,0,.5,1,2.5,7,9,14])for(const {id,spec} of specs.slice(-4)){
 const eff=gaugeEffOf(spec,1,1,1),inst=makeSkillInstance(SKILLS.firebolt);inst.state={gauge:fill};
 const before=wire(inst.state),power=gaugePowerOf(spec,eff,fill),added=gaugeAdd(inst,1,eff),afterAdd=wire(inst.state),spent=gaugeSpend(inst,spec,eff);
 edgeCases.push({id,spec,eff,fill,before,power,added,afterAdd,spent,afterSpend:wire(inst.state)});
}
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Original skill-gauge primitives; event eligibility and world delivery are separate',tuning:GAUGE_CFG,authored:wire(authored),courses,edgeCases})+'\n',{flag:'wx'});
console.log(JSON.stringify({authored:authored.length,courses:courses.length,transitions:courses.reduce((n,c)=>n+c.steps.length,0),edgeCases:edgeCases.length}));
