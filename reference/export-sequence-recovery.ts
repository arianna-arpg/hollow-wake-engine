// Observe the original controller, including its live ordering and partial writes.
// Queue fixtures isolate settlement; probe_cleave separately exercises real delivery.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {AttackSequences} from '../src/engine/attackSequences';
import type {AttackSequenceSpec} from '../src/engine/attackSequenceSpec';
import type {Projectile} from '../src/engine/world';
import {makeSkillInstance, type SkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';

interface State {owner:Actor;host:SkillInstance;spec:AttackSequenceSpec;key:string;caught:number;retired:boolean}
interface Cast {state:State;inst:SkillInstance;caught:number;connected:boolean;done:boolean}
interface Recovery {cast:Cast;projectile:Projectile;at:{x:number;y:number};from:{x:number;y:number};elapsed:number;duration:number;dealt:number;airborne:boolean}
interface Probe {
  active:Set<Cast>;casts:WeakMap<SkillInstance,Cast>;recoveries:Recovery[];
  scheduled:{state:State;inst:SkillInstance;aim:{x:number;y:number};due:number;power:number}[];
  lock(s:State):void;release(s:State,miss:boolean):void;
}
type Scenario={name:string;mode:'lock'|'release'|'settle'|'clear';miss?:boolean;penalty?:number;fault?:string;hook?:string;queue?:string;connected?:boolean;objects?:'air'|'ground';caught?:number;done?:boolean;second?:'same'|'other';retire?:'dead'|'missing'|'unseated'|'policy';noCatch?:boolean};
const scenarios:Scenario[]=[
  {name:'lock-empty',mode:'lock'},
  {name:'lock-existing',mode:'lock',hook:'existing'},
  {name:'lock-add-fault',mode:'lock',fault:'first.lock.add'},
  {name:'lock-clock-fault',mode:'lock',fault:'first.clock.set'},
  {name:'lock-total-fault',mode:'lock',fault:'first.total.set'},
  {name:'lock-live-id',mode:'lock',hook:'change-id'},
  {name:'lock-live-owner',mode:'lock',hook:'change-owner'},
  {name:'release-connected',mode:'release'},
  {name:'release-miss',mode:'release',miss:true},
  {name:'release-zero-penalty',mode:'release',miss:true,penalty:0},
  {name:'release-negative-penalty',mode:'release',miss:true,penalty:-1},
  {name:'release-live-penalty',mode:'release',miss:true,hook:'live-penalty'},
  {name:'release-no-recovery-connected',mode:'release',hook:'no-recovery'},
  {name:'release-lock-fault',mode:'release',fault:'first.lock.delete'},
  {name:'release-clock-delete-fault',mode:'release',fault:'first.clock.delete'},
  {name:'release-total-delete-fault',mode:'release',fault:'first.total.delete'},
  {name:'release-clock-stamp-fault',mode:'release',miss:true,fault:'first.clock.set'},
  {name:'release-total-stamp-fault',mode:'release',miss:true,fault:'first.total.set'},
  {name:'release-live-id',mode:'release',miss:true,hook:'change-id'},
  {name:'release-live-owner',mode:'release',miss:true,hook:'change-owner'},
  {name:'settle-miss',mode:'settle'},
  {name:'settle-connected',mode:'settle',connected:true},
  {name:'settle-own-flight',mode:'settle',queue:'flight'},
  {name:'settle-foreign-caster',mode:'settle',queue:'foreign-caster'},
  {name:'settle-foreign-instance',mode:'settle',queue:'foreign-instance'},
  {name:'settle-scheduled',mode:'settle',queue:'scheduled'},
  {name:'settle-salvo',mode:'settle',queue:'salvo'},
  {name:'settle-repeat',mode:'settle',queue:'repeat'},
  {name:'settle-fuse',mode:'settle',queue:'fuse'},
  {name:'settle-all-pending',mode:'settle',queue:'all'},
  {name:'settle-airborne',mode:'settle',objects:'air',connected:true},
  {name:'settle-grounded',mode:'settle',objects:'ground',connected:true},
  {name:'settle-grounded-caught',mode:'settle',objects:'ground',caught:1,connected:true},
  {name:'settle-grounded-already-done',mode:'settle',objects:'ground',done:true,connected:true},
  {name:'settle-returned-caught',mode:'settle',caught:1,connected:true},
  {name:'settle-without-catch-policy',mode:'settle',noCatch:true},
  {name:'settle-last-cast-misses',mode:'settle',second:'same',connected:true},
  {name:'settle-other-cast-flying',mode:'settle',second:'same',queue:'second-flight',connected:true},
  {name:'settle-independent-hosts',mode:'settle',second:'other',connected:true},
  {name:'settle-clear-catch-fault',mode:'settle',fault:'first.catch.remove'},
  {name:'settle-active-delete-fault',mode:'settle',fault:'active.delete'},
  {name:'settle-reentrant-add',mode:'settle',hook:'add-cast'},
  {name:'settle-reentrant-remove',mode:'settle',second:'same',hook:'remove-second'},
  {name:'settle-reentrant-retire',mode:'settle',hook:'retire'},
  {name:'retire-dead-owner',mode:'settle',queue:'all',retire:'dead'},
  {name:'retire-missing-owner',mode:'settle',queue:'all',retire:'missing'},
  {name:'retire-unseated-host',mode:'settle',queue:'all',retire:'unseated'},
  {name:'retire-policy-change',mode:'settle',queue:'all',retire:'policy'},
  {name:'clear-connected-with-outstanding',mode:'clear',queue:'all',objects:'air',connected:true},
];

bootSimEngine();
const restore=seedGlobalRandom(0xac5e),world=makeSimWorld('warrior',0xac5e),rows:unknown[]=[];
try { for(const scenario of scenarios){
  const owner=new Actor('recovery-owner','player',{x:500,y:500}),other=new Actor('recovery-other','player',{x:600,y:500});
  const host=makeSkillInstance(SKILLS.cleave,20,3);host.treeNodes=['unbound_cleave','long_edge','wide_front'];
  owner.skills.fill(null);owner.skills[0]=host;world.actors=[owner,other];world.localSeat.actor=owner;world.time=10;
  world.projectiles=[];world.pendingSalvos=[];world.pendingRepeats=[];world.pendingFuses=[];world.flashes=[];
  const controller=new AttackSequences(world),probe=controller as unknown as Probe;
  const inst=controller.prepare(owner,host,{x:900,y:500}),cast=probe.casts.get(inst)!;assert(cast);
  const state=cast.state,all=[cast];
  if(scenario.second){const nextHost=scenario.second==='same'?host:makeSkillInstance({...SKILLS.cleave,id:'other-cleave'},20,3);
    if(nextHost!==host){nextHost.treeNodes=[...host.treeNodes!];owner.skills[1]=nextHost;}
    all.push(probe.casts.get(controller.prepare(owner,nextHost,{x:900,y:500}))!);
  }
  for(const actor of [owner,other]){actor.cooldowns.clear();actor.cooldownTotals.clear();actor.skillRecoveryLocks.clear();
    actor.cooldowns.set('unrelated',7);actor.cooldownTotals.set('unrelated',9);actor.skillRecoveryLocks.add('unrelated');}
  if(scenario.mode!=='lock'||scenario.hook==='existing'){owner.skillRecoveryLocks.add('cleave');owner.cooldowns.set('cleave',6);owner.cooldownTotals.set('cleave',8);}
  cast.connected=!!scenario.connected;cast.caught=scenario.caught??0;cast.done=!!scenario.done;state.caught=2;
  owner.addBuff({type:'buff',id:state.key+':catch',label:'Caught Rhythm',duration:999999,maxStacks:3,mods:[]});
  if(scenario.noCatch)state.spec.catchBuff=undefined;
  if(scenario.penalty!==undefined)state.spec.recovery={...state.spec.recovery!,missCooldown:scenario.penalty};
  if(scenario.hook==='no-recovery')state.spec.recovery=undefined;
  const events:unknown[]=[];let hookUsed=false,penaltyReads=0;
  if(scenario.hook==='live-penalty')state.spec.recovery={...state.spec.recovery!,get missCooldown(){events.push(['penalty',++penaltyReads]);return penaltyReads;}};
  const event=(label:string,...values:unknown[])=>{
    events.push([label,...values]);if(scenario.fault===label)throw new Error('injected:'+label);
    if(hookUsed)return;
    if(label==='first.lock.'+(scenario.mode==='lock'?'add':'delete')){
      if(scenario.hook==='change-id'){hookUsed=true;host.def={...host.def,id:'changed-cleave'};}
      if(scenario.hook==='change-owner'){hookUsed=true;state.owner=other;}
    }
    if(label==='first.catch.remove'){
      if(scenario.hook==='add-cast'){hookUsed=true;const added={...cast,done:false};all.push(added);probe.active.add(added);}
      if(scenario.hook==='remove-second'){hookUsed=true;probe.active.delete(all[1]);}
      if(scenario.hook==='retire'){hookUsed=true;controller.clear(owner,host);}
    }
  };
  for(const [label,actor]of [['first',owner],['second',other]] as const){
    for(const [kind,map]of [['clock',actor.cooldowns],['total',actor.cooldownTotals]] as const){
      map.set=function(id,value){event(label+'.'+kind+'.set',id,value);return Map.prototype.set.call(this,id,value);};
      map.delete=function(id){event(label+'.'+kind+'.delete',id);return Map.prototype.delete.call(this,id);};
    }
    actor.skillRecoveryLocks.add=function(id){event(label+'.lock.add',id);return Set.prototype.add.call(this,id);};
    actor.skillRecoveryLocks.delete=function(id){event(label+'.lock.delete',id);return Set.prototype.delete.call(this,id);};
    const remove=actor.removeBuff.bind(actor);actor.removeBuff=id=>{event(label+'.'+(id===state.key+':catch'?'catch.remove':'buff.remove'),id===state.key+':catch'?'$catch':id.endsWith(':vulnerability')?'$vulnerability':id);return remove(id);};
  }
  const fakeProjectile=(c:Cast,caster=owner)=>({inst:c.inst,caster,tier:owner.tier,mult:1,pos:{x:900,y:500}} as Projectile);
  const queue=scenario.queue;
  if(queue==='flight'||queue==='foreign-caster')world.projectiles.push(fakeProjectile(cast,queue==='foreign-caster'?other:owner));
  if(queue==='foreign-instance')world.projectiles.push({...fakeProjectile(cast),inst:host});
  if(queue==='second-flight')world.projectiles.push(fakeProjectile(all[1]));
  if(queue==='scheduled'||queue==='all')probe.scheduled.push({state,inst,aim:{x:900,y:500},due:20,power:1});
  if(queue==='salvo'||queue==='all')world.pendingSalvos.push({inst,caster:owner} as typeof world.pendingSalvos[number]);
  if(queue==='repeat'||queue==='all')world.pendingRepeats.push({inst,caster:owner} as typeof world.pendingRepeats[number]);
  if(queue==='fuse'||queue==='all')world.pendingFuses.push({inst,caster:owner} as typeof world.pendingFuses[number]);
  if(scenario.objects)probe.recoveries.push({cast,projectile:fakeProjectile(cast),at:{x:900,y:500},from:{x:900,y:500},elapsed:scenario.objects==='air'?0:2,duration:2,dealt:10,airborne:scenario.objects==='air'});
  if(scenario.retire==='dead')owner.dead=true;if(scenario.retire==='missing')world.actors=[other];
  if(scenario.retire==='unseated')owner.skills.fill(null);if(scenario.retire==='policy')host.level++;
  for(const [label,array]of [['flight',world.projectiles],['scheduled',probe.scheduled],['salvo',world.pendingSalvos],['repeat',world.pendingRepeats],['fuse',world.pendingFuses]] as const){
    Object.defineProperty(array,'some',{value:function(this:unknown[],predicate:(value:unknown,index:number,array:unknown[])=>boolean){events.push(['query',label]);return Array.prototype.some.call(this,predicate);},configurable:true});
  }
  probe.active.delete=function(value){event('active.delete',all.indexOf(value));return Set.prototype.delete.call(this,value);};
  let error:string|null=null;
  try{if(scenario.mode==='lock')probe.lock(state);else if(scenario.mode==='release')probe.release(state,!!scenario.miss);else if(scenario.mode==='clear')controller.clear(owner,host);else controller.update(0);}catch(e){error=(e as Error).message;}
  const actorView=(actor:Actor)=>({locks:[...actor.skillRecoveryLocks],clocks:[...actor.cooldowns],totals:[...actor.cooldownTotals],catchBuff:actor.buffs.has(state.key+':catch')});
  rows.push({name:scenario.name,input:scenario,events,error,first:actorView(owner),second:actorView(other),state:{caught:state.caught,retired:state.retired,owner:state.owner===owner?'first':'second',host:state.host.def.id},casts:all.map(c=>({active:probe.active.has(c),caught:c.caught,connected:c.connected,done:c.done})),outstanding:{scheduled:probe.scheduled.length,salvo:world.pendingSalvos.length,repeat:world.pendingRepeats.length,fuse:world.pendingFuses.length,flight:world.projectiles.length,objects:probe.recoveries.map(r=>({airborne:r.airborne,elapsed:r.elapsed}))}});
} }finally{restore();}
const result={schemaVersion:1,courses:rows.length,rows};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(`Sequence recovery: ${rows.length} original courses`);
