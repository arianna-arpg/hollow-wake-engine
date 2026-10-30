// Observe native caster-side status delivery, real returning projectiles and
// exact-instance retirement before introducing an SDK implementation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,type SkillInstance,type SkillEffect} from '../src/engine/skills';
import {STATUS_DEFS,type ActiveStatus} from '../src/engine/status';
import {SKILLS} from '../src/data/skills';
import {SIM_TAP} from '../src/engine/tap';

bootSimEngine();
const rows:any[]=[];let origins=new WeakMap<object,string>(),instanceNumber=0,statusNumber=0;
function pack(v:any,seen=new WeakMap<object,string>(),at='$'):any{
 if(v===undefined)return {$undefined:true};
 if(typeof v==='number'&&(!Number.isFinite(v)||Object.is(v,-0)))return {$number:Object.is(v,-0)?'-0':String(v)};
 if(typeof v==='function')return {$function:v.name};
 if(v===null||typeof v!=='object')return v;
 if(v instanceof Actor)return {$actor:v.id};
 if(seen.has(v))return {$ref:seen.get(v)};seen.set(v,at);
 const origin=origins.has(v)?{$origin:origins.get(v)}:{};
 if(v instanceof Set)return {...origin,$set:[...v].map((x,i)=>pack(x,seen,at+'/'+i))};
 if(v instanceof Map)return {...origin,$map:[...v].map(([k,x],i)=>[pack(k,seen,at+'/'+i+'/key'),pack(x,seen,at+'/'+i+'/value')])};
 if(Array.isArray(v))return v.map((x,i)=>pack(x,seen,at+'/'+i));
 if(v.def&&Array.isArray(v.sockets))return {...origin,skill:v.def.id,level:v.level,treeNodes:pack(v.treeNodes,seen,at+'/tree'),state:pack(v.state,seen,at+'/state')};
 return {...origin,...Object.fromEntries(Object.entries(v).map(([k,x])=>[k,pack(x,seen,at+'/'+k)]))};
}
type Rig={w:World;p:Actor;first:Actor;second:Actor;third:Actor;actors:Actor[];cleanup:(()=>void)[];
 step:(name:string,run:()=>unknown,expectedError?:string)=>void;add:()=>Actor;
 onCall?:(name:string,args:any[],phase:'before'|'after')=>void};
function course(name:string,run:(r:Rig)=>void){
 origins=new WeakMap();instanceNumber=0;statusNumber=0;
 const restore=seedGlobalRandom(0x7421),priorTap=SIM_TAP.current,w=makeSimWorld('guardian',0x7421),p=w.player;
 const actors:Actor[]=[p],events:any[]=[],steps:any[]=[],draws:number[]=[];let observing=false,r:Rig;
 p.id=1;w.actors=[p];w.zone.level=10;w.time=4;w.metaProgressionActive=()=>false;
 const state=()=>pack({time:w.time,actorOrder:w.actors.map(a=>a.id),actors:actors.map(a=>({id:a.id,life:a.life,dead:a.dead,downed:a.downed,team:a.team,tier:a.tier,pos:a.pos,radius:a.radius,
  invulnerable:a.invulnerable,untargetable:a.untargetable,construct:a.construct,statuses:a.statuses,hitFlash:a.hitFlash,hitFlashType:a.hitFlashType,metaInsts:a.metaInsts})),
  projectiles:w.projectiles.map(q=>({instanceIdentity:origins.get(q.inst),inst:q.inst,caster:q.caster,pos:q.pos,dir:q.dir,flat:q.flat,hits:q.hits,pierce:q.pierce,speed:q.speed})),texts:w.texts,flashes:w.flashes});
 function wrap(object:any,key:string,label=key){const native=object[key].bind(object);object[key]=(...args:any[])=>{
  if(label==='spawnProjectile'&&!origins.has(args[1]))origins.set(args[1],'native-instance-'+(++instanceNumber));
  if(observing){events.push({kind:label,phase:'before',args:pack(args),state:state()});r.onCall?.(label,args,'before');}
  try{const value=native(...args);if(observing){events.push({kind:label,phase:'after',value:pack(value),state:state()});r.onCall?.(label,args,'after');}return value;}
  catch(e){if(observing)events.push({kind:label,phase:'throw',error:e instanceof Error?e.message:String(e),state:state()});throw e;}
 };}
 function configure(a:Actor){
  a.skills.fill(null);a.statuses=[];a.buffs.clear();a.noBounty=true;a.stationary=true;a.facing=0;a.brain=undefined;a.radius=12;
  a.sheet.setSource('status-delivery-observer',[
   mod('life','override',10000),mod('mana','override',10000),mod('energyShield','override',0),mod('poise','override',0),
   mod('armor','override',0),mod('damageTaken','override',1),mod('critChance','override',0),mod('accuracy','override',100000),
   mod('evasion','override',0),mod('blockChance','override',0),mod('aoeRadius','override',1),mod('healPower','override',1),
   mod('effectDuration','override',1),mod('afflictionExpiry','override',1),mod('lifeOnHit','override',0),mod('lifeLeech','override',0),
  ]);a.fillResources();a.life=9000;
  for(const k of ['applyStatus','healBy'])wrap(a,k,'actor-'+a.id+'-'+k);
  wrap(a.sheet,'removeSource','actor-'+a.id+'-removeSource');
 }
 configure(p);
 const add=()=>{const a=w.createMonster('zombie',1,'enemy');a.id=actors.length+1;a.pos={x:p.pos.x+40*actors.length,y:p.pos.y};a.tier=p.tier;configure(a);actors.push(a);w.actors.push(a);return a;};
 for(let i=0;i<3;i++)add();
 for(const k of ['transplantStatus','spawnProjectile','kill','text','failNote','executeSkill','clearTreeFields'])wrap(w,k);
 SIM_TAP.current={onCast:(a,inst,repeat)=>{if(observing)events.push({kind:'cast',args:pack([a,inst,repeat])});},onHit:(a,b,result,packet)=>{if(observing)events.push({kind:'hit',args:pack([a,b,result,packet])});}};
 const random=mulberry32(0x7421);Math.random=()=>{const n=random();if(observing)draws.push(n);return n;};
 r={w,p,first:actors[1],second:actors[2],third:actors[3],actors,cleanup:[],add,step:(label,fn,expectedError)=>{
  observing=true;const start=events.length,drawStart=draws.length,before=state();let value:unknown,error:string|null=null;
  try{value=fn();}catch(e){error=e instanceof Error?e.message:String(e);}finally{observing=false;}
  steps.push({name:label,expectedError:expectedError??null,error,value:pack(value),before,after:state(),events:events.slice(start),draws:draws.slice(drawStart)});
 }};
 try{run(r);rows.push({name,steps});}finally{for(const cleanup of r.cleanup.reverse())cleanup();SIM_TAP.current=priorTap;restore();}
}
function status(a:Actor,id='burn',patch:Partial<ActiveStatus>={}){
 a.applyStatus(id,12,1,'fixture',{casterId:1,rupture:id.startsWith('impaled')?100:undefined,ruptureType:id==='impaled_fire'?'fire':'physical'});
 const s=a.statuses.at(-1);assert(s&&s.id===id,'Inactive native status fixture '+id);Object.assign(s,patch);origins.set(s,'status-'+(++statusNumber));return s;
}
function skill(kind:'siphon'|'recall',fx:Partial<SkillEffect>={},nodes?:string[],level=1){
 const base=kind==='siphon'?SKILLS.draw_corruption:SKILLS.spear_recall;
 const inst=makeSkillInstance({...base,tree:nodes?base.tree:undefined,effects:[{...base.effects[0],...fx} as SkillEffect]},level);if(nodes)inst.treeNodes=nodes;
 origins.set(inst,'source-instance-'+(++instanceNumber));return inst;
}
function cast(r:Rig,inst:SkillInstance,opts:Parameters<World['executeSkill']>[3]={}){r.step('cast',()=>r.w.executeSkill(r.p,inst,{...r.p.pos},{noCooldown:true,noRepeat:true,keepFacing:true,...opts}));}
function tune(a:Actor,id:string,value:number){a.sheet.setSource('observer-'+id,[mod(id,'override',value)]);}

course('siphon-authored',r=>{r.first.team='player';status(r.first);cast(r,skill('siphon'));});
for(const relation of ['allies','enemies','all'] as const)course('siphon-from-'+relation,r=>{r.first.team='player';status(r.first);status(r.second,'chill');cast(r,skill('siphon',{from:relation}));});
for(const gate of ['self','dead','untargetable','construct','other-story','outside','edge','no-status','empty-filter','matching-filter','missing-filter','invulnerable','challenge-field','unknown-definition','dead-caster'] as const)course('siphon-'+gate,r=>{
 r.first.team='player';const donor=gate==='self'?r.p:r.first;const s=status(donor);const fx:any={};
 if(gate==='dead')donor.dead=true;if(gate==='untargetable')donor.untargetable=true;if(gate==='construct')donor.construct={kind:'totem'} as any;if(gate==='other-story')donor.tier=r.p.tier+2;
 if(gate==='outside'||gate==='edge')donor.pos.x=r.p.pos.x+280+donor.radius+(gate==='outside'?.01:0);
 if(gate==='no-status')donor.statuses=[];if(gate==='empty-filter')fx.statuses=[];if(gate==='matching-filter')fx.statuses=['burn'];if(gate==='missing-filter')fx.statuses=['chill'];
 if(gate==='invulnerable')r.p.invulnerable=true;if(gate==='challenge-field')s.challengeField=99;if(gate==='unknown-definition')s.id='observer-absent-status';if(gate==='dead-caster')r.p.dead=true;
 cast(r,skill('siphon',fx));
});
for(const value of [0,-2,2,20])course('siphon-heal-'+value,r=>{r.first.team='player';status(r.first);tune(r.p,'healPower',2);cast(r,skill('siphon',{healPer:value}));});
course('siphon-heal-capped',r=>{r.first.team='player';status(r.first);r.p.life=9998;cast(r,skill('siphon'));});
course('siphon-reverse-and-actors',r=>{r.first.team='player';r.second.team='player';status(r.first,'burn',{remaining:2});status(r.first,'chill',{remaining:3});status(r.second,'vulnerable',{stacks:2});cast(r,skill('siphon'));});
course('siphon-filtered-survivors',r=>{r.first.team='player';status(r.first,'burn');status(r.first,'chill');status(r.first,'vulnerable');cast(r,skill('siphon',{statuses:['burn','vulnerable']}));});
course('siphon-stacking',r=>{r.first.team='player';status(r.first,'chill',{stacks:3,remaining:2});status(r.p,'chill',{stacks:2});cast(r,skill('siphon'));});
course('siphon-scaled-radius',r=>{r.first.team='player';r.first.pos.x=r.p.pos.x+400;status(r.first);cast(r,skill('siphon'),{aoeMult:2});});
course('siphon-live-actors',r=>{r.first.team='player';status(r.first);let done=false;r.onCall=(k,_a,phase)=>{if(k==='transplantStatus'&&phase==='after'&&!done){done=true;const a=r.add();a.team='player';status(a,'chill');}};cast(r,skill('siphon'));});
course('siphon-live-source-status',r=>{r.first.team='player';status(r.first,'burn');status(r.first,'chill');let done=false;r.onCall=(k,_a,phase)=>{if(k==='transplantStatus'&&phase==='after'&&!done){done=true;r.first.statuses[0].remaining=.5;}};cast(r,skill('siphon'));});
course('siphon-live-filter',r=>{r.first.team='player';status(r.first,'burn');status(r.first,'chill');status(r.first,'vulnerable');const inst=skill('siphon');r.onCall=(k,_a,phase)=>{if(k==='transplantStatus'&&phase==='after')(inst.def.effects[0] as any).statuses=['burn'];};cast(r,inst);});
course('siphon-live-healing',r=>{r.first.team='player';status(r.first);r.onCall=(k,_a,phase)=>{if(k==='transplantStatus'&&phase==='after')tune(r.p,'healPower',2);};cast(r,skill('siphon'));});
course('siphon-live-position',r=>{r.first.team='player';r.second.team='player';status(r.first);status(r.second,'chill');let done=false;r.onCall=(k,_a,phase)=>{if(k==='transplantStatus'&&phase==='after'&&!done){done=true;r.p.pos.x+=1000;}};cast(r,skill('siphon'));});
course('siphon-no-heal-field',r=>{r.first.team='player';status(r.first);cast(r,skill('siphon',{healPer:undefined}));});

course('recall-authored',r=>{status(r.first,'impaled');cast(r,skill('recall'));});
course('recall-fire-resisted',r=>{status(r.first,'impaled_fire');tune(r.first,'fireRes',.5);cast(r,skill('recall'));});
for(const gate of ['none','ordinary-status','zero-bank','negative-bank','missing-bank','outside','edge','breakable','construct','ally','dead','untargetable','invulnerable','other-story','default-type','fire-type','no-spear-definition','zero-damage','zero-share','defaults','negative-damage','negative-share','absorbed','lethal'] as const)course('recall-'+gate,r=>{
 const s=status(r.first,gate==='ordinary-status'?'doom':'impaled',gate==='ordinary-status'?{rupture:100}:{});const fx:any={};
 if(gate==='none')r.first.statuses=[];if(gate==='zero-bank')s.rupture=0;if(gate==='negative-bank')s.rupture=-10;if(gate==='missing-bank')delete s.rupture;
 if(gate==='outside'||gate==='edge')r.first.pos.x=r.p.pos.x+460+r.first.radius+(gate==='outside'?.01:0);
 if(gate==='breakable'||gate==='construct')r.first.construct={kind:'totem',...(gate==='breakable'?{breakable:true}:{})} as any;
 if(gate==='ally')r.first.team='player';if(gate==='dead')r.first.dead=true;if(gate==='untargetable')r.first.untargetable=true;if(gate==='invulnerable')r.first.invulnerable=true;if(gate==='other-story')r.first.tier=r.p.tier+2;
 if(gate==='default-type')delete s.ruptureType;if(gate==='fire-type')s.ruptureType='fire';
 if(gate==='no-spear-definition'){const saved=SKILLS.impale_spear;delete SKILLS.impale_spear;r.cleanup.push(()=>{SKILLS.impale_spear=saved;});}
 if(gate==='zero-damage')fx.damageScale=0;if(gate==='zero-share')fx.spearShare=0;if(gate==='defaults'){fx.damageScale=undefined;fx.spearShare=undefined;}
 if(gate==='negative-damage')fx.damageScale=-1;if(gate==='negative-share')fx.spearShare=-.5;
 if(gate==='absorbed')r.first.ward=1000;if(gate==='lethal')r.first.life=10;
 cast(r,skill('recall',fx));
});
course('recall-reverse-and-actors',r=>{status(r.first,'impaled',{rupture:100});status(r.first,'impaled_fire',{rupture:200});status(r.second,'impaled',{rupture:300});cast(r,skill('recall'));});
course('recall-native-cache-reuse',r=>{const inst=skill('recall');status(r.first,'impaled');cast(r,inst);status(r.second,'impaled');cast(r,inst);});
course('recall-cache-level-replacement',r=>{status(r.first,'impaled');cast(r,skill('recall',{},undefined,1));status(r.second,'impaled');cast(r,skill('recall',{},undefined,4));});
course('recall-cache-shared-between-sources',r=>{status(r.first,'impaled');cast(r,skill('recall'));status(r.second,'impaled');cast(r,skill('recall'));});
course('recall-color-fallback',r=>{const old=STATUS_DEFS.impaled;STATUS_DEFS.impaled={...old,color:undefined} as any;r.cleanup.push(()=>{STATUS_DEFS.impaled=old;});status(r.first,'impaled');cast(r,skill('recall'));});
for(const node of ['rending_extraction','crossing_steel'])course('recall-tree-'+node,r=>{status(r.first,'impaled');status(r.second,'impaled');cast(r,skill('recall',{},[node],20));});
course('recall-tree-selective-retirement',r=>{
 const one=skill('recall',{},['rending_extraction'],20),two=skill('recall',{},['crossing_steel'],20),native=skill('recall');
 status(r.first,'impaled');cast(r,one);status(r.second,'impaled');cast(r,two);status(r.third,'impaled');cast(r,native);
 r.step('retire-first',()=>r.w['clearTreeFields'](r.p,one));r.step('retire-second',()=>r.w['clearTreeFields'](r.p,two));r.step('retire-native-source',()=>r.w['clearTreeFields'](r.p,native));
});
for(const node of ['native','rending_extraction','crossing_steel'])course('recall-flight-'+node,r=>{
 r.first.pos.x=r.p.pos.x+300;r.second.pos.x=r.p.pos.x+150;r.third.pos.y+=200;status(r.first,'impaled');cast(r,skill('recall',{},node==='native'?undefined:[node],20));
 r.step('flight',()=>{for(let i=0;i<6;i++){r.w.time+=.05;r.w['updateProjectiles'](.05);}});
});
course('recall-live-bank-after-removal',r=>{const s=status(r.first,'impaled');r.onCall=(k,_a,phase)=>{if(k==='actor-2-removeSource'&&phase==='after')s.rupture=250;};cast(r,skill('recall'));});
course('recall-live-share-after-text',r=>{status(r.first,'impaled');const inst=skill('recall');r.onCall=(k,a,phase)=>{if(k==='text'&&phase==='after'&&a[0]===r.first.pos)(inst.def.effects[0] as any).spearShare=.9;};cast(r,inst);});
course('recall-captured-bank-after-text',r=>{const s=status(r.first,'impaled');r.onCall=(k,a,phase)=>{if(k==='text'&&phase==='after'&&a[0]===r.first.pos)s.rupture=400;};cast(r,skill('recall'));});
course('recall-live-level-after-kill',r=>{status(r.first,'impaled');r.first.life=10;const inst=skill('recall');r.onCall=(k,_a,phase)=>{if(k==='kill'&&phase==='after')inst.level=4;};cast(r,inst);});
course('recall-live-victims-snapshot',r=>{status(r.first,'impaled');status(r.second,'impaled');let done=false;r.onCall=(k,_a,phase)=>{if(k==='spawnProjectile'&&phase==='after'&&!done){done=true;r.second.team='player';r.w.actors=r.w.actors.filter(a=>a!==r.second);}};cast(r,skill('recall'));});
course('recall-nested-cast',r=>{status(r.first,'impaled');status(r.second,'impaled');let nested=false;const inner=skill('recall',{damageScale:.5});r.onCall=(k,_a,phase)=>{if(k==='spawnProjectile'&&phase==='after'&&!nested){nested=true;r.w.executeSkill(r.p,inner,{...r.p.pos},{noCooldown:true,noRepeat:true,keepFacing:true});}};cast(r,skill('recall'));});
for(const order of ['siphon-recall','recall-siphon'])course('mixed-'+order,r=>{status(r.first,'impaled');status(r.second,'burn');const inst=skill('siphon',{from:'all'}),recall=skill('recall').def.effects[0];inst.def.effects=order==='siphon-recall'?[inst.def.effects[0],recall]:[recall,inst.def.effects[0]];cast(r,inst);});
for(const [kind,hook,phase]of [['siphon','transplantStatus','before'],['siphon','transplantStatus','after'],['siphon','actor-2-removeSource','after'],['siphon','actor-1-healBy','before'],['recall','actor-2-removeSource','after'],['recall','text','before'],['recall','spawnProjectile','before'],['recall','spawnProjectile','after'],['recall','kill','after']] as const)course(kind+'-throw-'+hook+'-'+phase,r=>{
 if(kind==='siphon')r.first.team='player';status(r.first,kind==='siphon'?'burn':'impaled');let thrown=false;
 const message='intentional:'+kind+':'+hook+':'+phase;r.onCall=(k,_a,p)=>{if(k===hook&&p===phase&&!thrown){thrown=true;throw Error(message);}};
 if(hook==='kill')r.first.life=10;const inst=skill(kind);r.step('cast',()=>r.w.executeSkill(r.p,inst,{...r.p.pos},{noCooldown:true,noRepeat:true,keepFacing:true}),message);
});
const authored={skills:[SKILLS.draw_corruption,SKILLS.spear_recall,SKILLS.impale_spear].map(d=>({id:d.id,tags:d.tags,effects:d.effects,delivery:d.delivery,leveling:d.leveling})),tree:SKILLS.spear_recall.tree?.nodes?.filter(n=>n.over?.recallImpales),statuses:Object.fromEntries(Object.entries(STATUS_DEFS).filter(([,d])=>d.dischargeOnHit))};
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,authored:pack(authored),rows},null,2)+'\n');
