import fs from 'node:fs';import assert from 'node:assert/strict';import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';import {CHARGE_DEFS} from '../src/engine/charges';import {mod} from '../src/engine/stats';import {SKILLS} from '../src/data/skills';import {makeSkillGem} from '../src/engine/skills';
bootSimEngine();const wire=(v:unknown):any=>JSON.parse(JSON.stringify(v)),courses:any[]=[];
function course(name:string,body:(a:any,step:(label:string,action:()=>unknown)=>void)=>void){const restore=seedGlobalRandom(220000+courses.length);try{const w=makeSimWorld('swashbuckler',220000+courses.length),a:any=w.player;a.skills=[];a.charges.clear();a.chargeState.clear();a.chargeModCount.clear();a.gainEvents=[];
 const snapshot=()=>wire({charges:[...a.charges],state:[...a.chargeState],modCount:[...a.chargeModCount],events:a.gainEvents,sources:a.sheet.sourceNames().filter((s:string)=>s.startsWith('charge:')),stats:{attackSpeed:a.sheet.get('attackSpeed'),castSpeed:a.sheet.get('castSpeed'),moveSpeed:a.sheet.get('moveSpeed'),damage:a.sheet.get('damage',new Set(['attack']))}}),steps:any[]=[];
 body(a,(label,action)=>{const before=snapshot(),result=action();steps.push({label,result:result??null,before,after:snapshot()});});courses.push({name,steps});}finally{restore();}}
for(const id of [...Object.keys(CHARGE_DEFS),'unregistered-counter'])course('bank:'+id,(a,step)=>{
 step('gain-fractional',()=>a.gainCharge(id,3.5,5));step('hit-cap',()=>a.gainCharge(id,99,5));step('age-before-capped-refresh',()=>a.updateCharges(2.5));step('capped-gain-does-not-refresh-idle',()=>a.gainCharge(id,1,5));step('spend-fractional',()=>a.spendCharge(id,2.25));
 step('start-drain',()=>a.startChargeDrain(id,1.5));step('gain-refused-while-draining',()=>a.gainCharge(id,2,5));step('quarter-second-drain',()=>a.updateCharges(.25));step('three-quarter-second-drain',()=>a.updateCharges(.75));step('drain-to-empty',()=>a.updateCharges(8));step('gain-after-drain',()=>a.gainCharge(id,2,5));
 a.sheet.setSource('capacity-investigation',[mod('chargeCap','flat',1.5),mod('chargeCap_'+id,'flat',.75)]);step('rounded-combined-cap',()=>{a.gainCharge(id,99,5);return a.chargeCapFor(id);});step('spend-beyond-bank',()=>a.spendCharge(id,99));
});
for(const ticks of [[10],Array(10).fill(1),Array(100).fill(.1)])course('partition:'+ticks.length,(a,step)=>{a.sheet.setSource('regen-investigation',[mod('chargeRegen_fury','flat',10)]);a.gainCharge('verse',10,12);step('elapsed-ten-seconds',()=>{for(const dt of ticks)a.updateCharges(dt);});});
course('event-budget-and-live-content',(a,step)=>{
 step('gain-events-cap-at-64',()=>{for(let n=0;n<70;n++)a.gainCharge('fury',1,100,undefined,n);assert.equal(a.gainEvents.length,64);});
 a.gainCharge('rage',2,5);const def=CHARGE_DEFS.rage,original=def.perCharge!;try{def.perCharge=[mod('attackSpeed','increased',.9)];step('same-count-does-not-refresh-changed-registry',()=>a.gainCharge('rage',0,5));step('changed-count-refreshes-registry',()=>a.gainCharge('rage',1,5));}finally{def.perCharge=original;}
});
course('spender-gates-regeneration',(a,step)=>{
 step('no-spender-four-seconds',()=>{for(let n=0;n<4;n++)a.updateCharges(1);});
 const def=Object.values(SKILLS).find(s=>s.chargeCost?.charge==='wisp');assert(def);const inst=makeSkillGem(def,1,'rare');a.skills=[inst];
 step('slotted-spender-four-seconds',()=>{for(let n=0;n<4;n++)a.updateCharges(1);});a.skills=[];step('remove-spender-four-seconds',()=>{for(let n=0;n<4;n++)a.updateCharges(1);});
});
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'M22 investigation only: actual Actor charge methods and private update boundary, no extraction or complete World/trigger claim',definitions:CHARGE_DEFS,courses})+'\n',{flag:'wx'});console.log(JSON.stringify({definitions:Object.keys(CHARGE_DEFS).length,courses:courses.length,transitions:courses.reduce((n,c)=>n+c.steps.length,0),partitions:courses.filter(c=>c.name.startsWith('partition:')).map(c=>({name:c.name,charges:c.steps[0].after.charges,state:c.steps[0].after.state}))}));
