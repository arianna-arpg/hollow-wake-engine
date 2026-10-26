// Private native discovery. Authored definitions, real admission/execution/timers.
// Rig resource/defense values isolate buff observations; no SDK acceptance yet.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {StatSheet,mod} from '../src/engine/stats';
import {SKILLS} from '../src/data/skills';
import {makeSkillInstance} from '../src/engine/skills';
bootSimEngine();const rows:unknown[]=[];
function course(name:string,enemy:boolean,run:(s:ReturnType<typeof setup>)=>void){const s=setup(enemy);try{run(s);rows.push({name,stages:s.stages,events:s.events,draws:s.draws()});}finally{s.restore();}}
function setup(enemy:boolean){
 const restore=seedGlobalRandom(0xc041),w=makeSimWorld('warrior',0xc041),p=w.player;
 w.devIgnoreSkillAttributes=true;w.walk=null;w.actors=[p];w.time=0;p.pos={x:500,y:500};p.aimPos={x:535,y:500};p.skills=[];p.statuses=[];p.charges.clear();p.buffs.clear();p.gainEvents=[];p.cooldowns.clear();p.useLock=0;
 p.sheet=new StatSheet();p.sheet.setSource('discovery-rig',[
  ...['life','mana'].map(id=>mod(id,'override',100000)),
  ...['lifeRegen','manaRegen','energyShield','poise','critChance'].map(id=>mod(id,'override',0)),
  ...['attackSpeed','castSpeed','effectDuration','cooldownRecovery'].map(id=>mod(id,'override',1)),
 ]);p.fillResources();
 let target:Actor|undefined;if(enemy){target=new Actor('buff-target','enemy',{x:535,y:500});target.sheet=new StatSheet();target.sheet.setBase('life',100000);target.life=100000;target.level=1;target.tier=p.tier;w.actors.push(target);}
 const stages:unknown[]=[],events:unknown[]=[];let frame=0,phase='setup',count=0;const random=Math.random;Math.random=()=>{count++;return random();};
 const buffs=()=>[...p.buffs].map(([id,b])=>({id,stacks:b.stacks,remaining:b.remaining,expiries:b.expiries?[...b.expiries]:null}));
 const snapshot=()=>structuredClone({frame,phase,time:w.time,life:p.life,mana:p.mana,targetLife:target?.life??null,buffs:buffs(),casting:p.casting?{id:p.casting.inst.def.id,mode:p.casting.mode}:null,useLock:p.useLock,gains:p.gainEvents.map(e=>({kind:e.kind,id:e.id,depth:e.depth,tags:e.tags})),attackDamage:p.sheet.get('damage',new Set(['attack'])),attackFire:p.sheet.get('addedFire',new Set(['attack'])),projectileChaos:p.sheet.get('addedChaos',new Set(['projectile'])),draws:count});
 const take=(label:string)=>stages.push({label,...snapshot()});
 const add=p.addBuff.bind(p);p.addBuff=(...args)=>{const before=buffs();add(...args);events.push(structuredClone({kind:'gain',frame,phase,time:w.time,id:args[0].id,before,after:buffs()}));};
 const spend=p.consumeBuffStacks.bind(p);p.consumeBuffStacks=(...args)=>{const before=buffs();spend(...args);events.push(structuredClone({kind:'spend',frame,phase,time:w.time,id:args[0],count:args[1],before,after:buffs()}));};
 const remove=p.removeBuff.bind(p);p.removeBuff=(...args)=>{const before=buffs();remove(...args);events.push(structuredClone({kind:'remove',frame,phase,time:w.time,id:args[0],before,after:buffs()}));};
 const set=p.sheet.setSource.bind(p.sheet);p.sheet.setSource=(...args)=>{const watched=args[0].startsWith('buff:');if(watched)events.push(structuredClone({kind:'source-set-before',frame,phase,time:w.time,key:args[0],mods:args[1],buffs:buffs(),gains:p.gainEvents.length}));set(...args);if(watched)events.push({kind:'source-set-after',frame,phase,time:w.time,key:args[0]});};
 const clear=p.sheet.removeSource.bind(p.sheet);p.sheet.removeSource=(...args)=>{const watched=args[0].startsWith('buff:');if(watched)events.push(structuredClone({kind:'source-remove-before',frame,phase,time:w.time,key:args[0],buffs:buffs(),gains:p.gainEvents.length}));clear(...args);if(watched)events.push({kind:'source-remove-after',frame,phase,time:w.time,key:args[0]});};
 const advance=(n:number)=>{phase='world';for(let i=0;i<n;i++){frame++;w.update(.125);}take('advance:'+n);};
 const cast=(id:string,self=false)=>{
  const inst=makeSkillInstance(SKILLS[id],1,1);p.skills=[inst];w.meta.knownSkills.set(id,inst);
  for(let i=0;p.useLock>0||((p.cooldowns.get(id)??0)>0);i++){assert(i<300,'admission wait: '+id);phase='ready';frame++;w.update(.125);}
  phase='press:'+id;const aim=self?p.pos:p.aimPos!;assert(w.useSkill(p,inst,aim),nameFor(id));take('pressed:'+id);
  for(let i=0;p.casting;i++){assert(i<100,'cast completion: '+id);phase='casting:'+id;frame++;w.update(.125);}take('completed:'+id);
 };
 take('initial');return{w,p,target,stages,events,cast,advance,take,restore,draws:()=>count};
}
function nameFor(id:string){return 'native admission refused '+id;}
course('war-cry-grant-and-expiry',false,({cast,advance})=>{cast('war_cry');advance(48);});
course('frenzy-authored-shared-stacking',true,({cast,advance})=>{for(let i=0;i<6;i++)cast('frenzy');advance(48);});
course('deep-carve-authored-independent-clocks',true,({cast,advance})=>{cast('deep_carve');advance(8);cast('deep_carve');advance(28);advance(8);});
course('deep-carve-missed-swing',false,({cast,advance})=>{cast('deep_carve');advance(36);});
course('flame-imbuement-matching-and-nonmatching-uses',false,({cast})=>{cast('flame_imbuement');cast('war_cry');for(let i=0;i<6;i++)cast('cleave');});
course('blessing-of-might-fallback-spent-only-on-landed-hits',true,({p,cast,events})=>{cast('blessing_of_might',true);let attempts=0;while(p.buffs.has('blessing_of_might')){assert(attempts++<10);cast('cleave');}const spends=events.filter((e:any)=>e.kind==='spend'&&e.id==='blessing_of_might');assert.equal(spends.length,3);assert(attempts>3,'seeded course includes a native miss');});
course('venom-ammunition-projectile-use',false,({cast})=>{cast('venom_ammunition');cast('cleave');cast('firebolt');});
course('war-cry-world-pause-and-slow-motion',false,({w,cast,advance,take})=>{cast('war_cry');assert(w.timeflow.hold({id:'buff-pause',kind:'skill',scale:0}));advance(8);w.timeflow.release('buff-pause');assert(w.timeflow.hold({id:'buff-slow',kind:'skill',scale:.5}));advance(8);w.timeflow.release('buff-slow');take('released');advance(48);});
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Private discovery of eight authored native World flows, using controlled resources/defenses and seeded randomness. Native methods call through. No accepted SDK contract, repair, renderer or device claim.',courses:rows.length,rows},null,2)+'\n');
