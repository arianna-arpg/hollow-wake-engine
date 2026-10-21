import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';
import {mod} from '../src/engine/stats';

bootSimEngine();const courses:any[]=[],wire=(v:unknown):any=>JSON.parse(JSON.stringify(v));
type World=ReturnType<typeof makeSimWorld>;
type Step=(label:string,action:()=>unknown,expected?:boolean)=>void;
const frames=(w:World,n:number,dt=1/60)=>{for(let i=0;i<n;i++)w.update(dt);};
function course(name:string,body:(w:World,step:Step,slot:(id:string)=>SkillInstance)=>void){
 const restore=seedGlobalRandom(222000+courses.length);
 try{
  const w=makeSimWorld('swashbuckler',222000+courses.length),a:any=w.player,aw:any=w;
  a.skills=[];a.charges.clear();a.chargeState.clear();a.chargeModCount.clear();a.gainEvents=[];
  // Controlled authorized build input: qualify the learned resource skills so
  // their real cast-time attribute gate does not mask the resource gate.
  for(const key of Object.keys(w.localSeat.meta.attrs))(w.localSeat.meta.attrs as any)[key]=50;
  a.setAttributes(w.localSeat.meta.attrs);a.sheet.setBase('mana',1000);a.fillResources();
  const slot=(id:string)=>{const inst=makeSkillInstance(SKILLS[id],1,4);a.skills.push(inst);w.localSeat.meta.knownSkills.set(id,inst);return inst;};
  const snapshot=()=>wire({time:w.time,pos:{...a.pos},attrs:w.localSeat.meta.attrs,life:a.life,mana:a.mana,charges:[...a.charges],clocks:[...a.chargeState],modCount:[...a.chargeModCount],gainEvents:a.gainEvents,
   skills:a.skills.map((i:SkillInstance|null)=>i?{id:i.def.id,treeNodes:i.treeNodes??[],state:i.state??null}:null),cooldowns:[...a.cooldowns],casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,held:a.casting.held}:null,
   buffs:[...a.buffs].map(([id,b]:any)=>({id,remaining:b.remaining,stacks:b.stacks})),statuses:a.statuses.map((s:any)=>({id:s.id,remaining:s.remaining})),sources:a.sheet.sourceNames().filter((s:string)=>s.startsWith('charge:')),
   stats:{attackSpeed:a.sheet.get('attackSpeed'),castSpeed:a.sheet.get('castSpeed'),moveSpeed:a.sheet.get('moveSpeed'),damage:a.sheet.get('damage')}});
  let recording=false,events:any[]=[];const steps:any[]=[];
  // Observe the actual event consumer and public phase states. Internal calls
  // between Actor helper methods are not a cross-implementation contract.
  const proc=aw.rollGainProcs;aw.rollGainProcs=function(owner:any,event:any){if(recording&&owner===a)events.push({kind:'proc-consumer',event:wire(event)});return proc.call(this,owner,event);};
  body(w,(label,action,expected)=>{events=[];const before=snapshot();recording=true;let result;try{result=action();}finally{recording=false;}if(expected!==undefined&&result!==expected)console.log(JSON.stringify({label,canAct:a.canAct(),dead:a.dead,before,after:snapshot(),gates:a.skills.map((i:SkillInstance)=>({id:i.def.id,gate:a.unmetGate(i),usable:w.skillUsable(a,i)}))}));if(expected!==undefined)assert.equal(result,expected,label);steps.push(wire({label,result:result??null,before,after:snapshot(),events}));},slot);
  courses.push({name,steps});
 }finally{restore();}
}
course('wisp-spender-and-payment',(w,step,slot)=>{
 const a=w.player;step('no-spender-five-seconds',()=>frames(w,300));assert.equal(a.charges.get('wisp')??0,0);
 const hush=slot('hush_of_the_wake');step('empty-bank-refuses',()=>w.useSkill(a,hush,{...a.pos}),false);
 step('spender-opens-clock',()=>frames(w,300));assert.equal(a.charges.get('wisp'),1);
 step('short-bank-refuses',()=>w.useSkill(a,hush,{...a.pos}),false);
 step('bank-reaches-cap',()=>frames(w,1200));assert.equal(a.charges.get('wisp'),5);
 a.life=a.maxLife()*.5;step('press-spends-whole-bank',()=>w.useSkill(a,hush,{...a.pos}),true);assert.equal(a.charges.get('wisp'),0);
 step('payload-mends-and-shelters',()=>frames(w,2));assert(a.buffs.has('hushed'));
 step('invested-clock',()=>{a.addBuff({type:'buff',id:'resource_clock_invest',duration:99,mods:[mod('chargeRegen_wisp','flat',2.5)]});frames(w,300);});assert((a.charges.get('wisp')??0)>=2);
});
course('bloodlust-drain-and-gain-lock',(w,step,slot)=>{
 const a=w.player,inst=slot('bloodlust');step('minimum-refuses',()=>w.useSkill(a,inst,{...a.pos}),false);
 step('equipped-tap-builds-bank',()=>frames(w,420));assert((a.charges.get('bloodlust')??0)>=5);
 step('unleash-opens-drain',()=>w.useSkill(a,inst,{...a.pos}),true);assert(a.isChargeDraining('bloodlust'));
 step('gain-refused-during-drain',()=>a.gainCharge('bloodlust',10,20,inst));
 step('first-draining-frame',()=>frames(w,1));step('bank-burns',()=>frames(w,90));
 step('empty-bank-reopens-and-tap-resumes',()=>frames(w,240));assert(!a.isChargeDraining('bloodlust'));assert((a.charges.get('bloodlust')??0)>0);
});
course('movement-bank-and-discharge',(w,step,slot)=>{
 const a=w.player,inst=slot('galvanic_reserve');step('empty-battery-refuses',()=>w.useSkill(a,inst,{...a.pos}),false);
 for(const [name,dx,dy] of [['east',1,0],['south',0,1],['west',-1,0],['north',0,-1]] as const)
  step('walk-'+name,()=>{for(let i=0;i<60;i++){w.moveActor(a,dx,dy,1/30);w.update(1/30);}});
 assert((a.charges.get('static')??0)>0);step('press-spends-battery',()=>w.useSkill(a,inst,{x:a.pos.x+100,y:a.pos.y}),true);assert.equal(a.charges.get('static'),0);
 step('complete-cast',()=>frames(w,90));
});
course('tree-flask-clock-and-drink',(w,step,slot)=>{
 const a=w.player,inst=slot('life_flask');inst.treeNodes=['red_ferment'];
 step('tree-clock-feeds-fount',()=>frames(w,1200));assert((a.charges.get('flask_life')??0)>0);
 a.life=a.maxLife()*.25;step('drink-from-fount',()=>w.useSkill(a,inst,{...a.pos}),true);
 step('pour-and-rebank',()=>frames(w,300));
 step('refund-clears-tree-meter',()=>{inst.treeNodes=[];a.clearTreeChargeClocks(inst);frames(w,120);});
});
course('owner-time-stasis-and-slow',(w,step,slot)=>{
 const a=w.player;slot('bloodlust');
 step('normal-clock',()=>frames(w,90));
 step('stasis-application',()=>a.applyStatus('stasis',0,1,'resource-capture'));
 const before=a.charges.get('bloodlust');step('stasis-suspends-resource-clock',()=>frames(w,30));assert.equal(a.charges.get('bloodlust'),before);
 step('unbent-status-clock-releases',()=>frames(w,120));
 step('slow-application',()=>a.applyStatus('temporal_drag',0,1,'resource-capture'));
 step('slow-owner-clock',()=>frames(w,120));step('normal-owner-clock-resumes',()=>frames(w,180));
});
course('gain-events-feed-real-proc-consumer',(w,step)=>{
 const a=w.player;a.sheet.setSource('resource-event-invest',[mod('proc_kindled_rage','flat',1),mod('proc_crimson_thirst','flat',1),mod('proc_surging_frenzy','flat',1),mod('procDepth','flat',3)]);
 step('queue-real-charge-gains',()=>{for(let i=0;i<12;i++)a.gainCharge('fury',1,20);});
 for(let n=0;n<5;n++)step('consumer-frame-'+n,()=>frames(w,1));
 assert((a.charges.get('rage')??0)>0);assert((a.charges.get('bloodlust')??0)>0);
 step('drain-refuses-followup-gains',()=>{a.startChargeDrain('rage',2);a.gainCharge('fury',1,20);frames(w,3);});
});
course('kill-fed-gauge-press-and-lockout',(w,step,slot)=>{
 const a=w.player,toll=slot('reapers_toll'),bolt=makeSkillInstance(SKILLS.firebolt,1,2);
 a.sheet.setBase('accuracy',5000);
 const kill=()=>{
  const z=w.createMonster('zombie',1,'enemy');z.pos={x:a.pos.x+100,y:a.pos.y};z.xpValue=0;
  z.sheet.setBase('life',1);z.fillResources();z.sheet.setBase('moveSpeed',0);w.actors.push(z);
  assert.equal(w.useSkill(a,bolt,{...z.pos}),true);frames(w,90);assert(z.dead);return z.dead;
 };
 step('empty-gauge-refuses',()=>w.useSkill(a,toll,{...a.pos}),false);
 for(let n=0;n<8;n++)step('credited-kill-'+n,kill,true);
 assert.equal(toll.state?.gauge,8);
 step('press-pays-gauge-and-arms-lockout',()=>w.useSkill(a,toll,{...a.pos}),true);assert.equal(toll.state?.gauge,0);assert.equal(toll.state?.gaugeLock,4);
 step('complete-cast',()=>frames(w,45));
 step('kill-during-silence-does-not-bank',kill,true);assert.equal(toll.state?.gauge,0);
 step('silence-expires',()=>frames(w,180));
 step('kill-after-silence-banks',kill,true);assert.equal(toll.state?.gauge,1);
});
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Complete World resource use/update paths; event delivery remains the actual game implementation',courses})+'\n',{flag:'wx'});
console.log(JSON.stringify({courses:courses.length,transitions:courses.reduce((n,c)=>n+c.steps.length,0),events:courses.reduce((n,c)=>n+c.steps.reduce((m:number,s:any)=>m+s.events.length,0),0)}));
