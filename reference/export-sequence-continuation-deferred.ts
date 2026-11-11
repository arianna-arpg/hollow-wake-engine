// Diagnostic calls to real private hit/fuse methods. Collision routing and the
// complete World frame are deliberately outside this component observation.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';import {makeSkillInstance} from '../src/engine/skills';import {mod} from '../src/engine/stats';
bootSimEngine();const restore=seedGlobalRandom(0x7744),rows:unknown[]=[];const observe=(name:string,value:unknown)=>rows.push({name,value});
function setup(fuse=true){
 const w=makeSimWorld('warrior',0x7744),p=w.player;w.actors=[p];w.walk=null;
 const host=makeSkillInstance(SKILLS.cleave,20);host.treeNodes=fuse?['unbound_cleave']:['unbound_cleave','heavy_wave','razor_horizon'];if(fuse)host.sockets[0]={def:SUPPORTS.time_fuse,level:1};p.skills=[host];
 p.sheet.setSource('deferred-observer',[mod('accuracy','override',100000),mod('critChance','override',0)]);
 const target=w.createMonster('zombie',1,'enemy');target.skills=[];target.brain=undefined;target.tier=p.tier;target.pos={x:p.pos.x+(fuse?180:40),y:p.pos.y};
 target.sheet.setSource('deferred-observer',[mod('life','flat',100000),mod('evasion','override',0),mod('blockChance','override',0),mod('ailmentResist','override',0)]);target.fillResources();w.actors.push(target);
 return{w,p,target,host,c:w.attackSequences as any};
}
try{
 {
  const {w,p,target,host,c}=setup();w.executeSkill(p,host,target.pos);const main=w.projectiles[0],life=target.life;w.attackSequences.beforeContact(main);(w as any).resolveHit(p,main.inst,target,main.mult,0,undefined,false,false,undefined,main.origin,main.tier);assert.equal(w.pendingFuses.length,1);assert.equal(target.life,life);assert(w.attackSequences.contact(main,target));w.projectiles=[];
  const cast=c.casts.get(main.inst),fuse=w.pendingFuses[0];assert.equal(cast.receipt,undefined);assert.equal(c.deferredContacts.length,1);assert.equal(c.deferredContacts[0].projectile,main);assert.equal(c.deferredContacts[0].target,target);assert.equal(fuse.inst,main.inst);assert.equal(fuse.caster,p);
  observe('fused-contact-retains-original-carrier-and-target',{deferred:1,fuses:1,lifeUnchanged:true,receiptUndefined:true,carrierAlias:true,skillAlias:true,targetAlias:true,due:fuse.due});
  w.time=fuse.due-1e-6;(w as any).updatePendingPersists(0);w.attackSequences.update(0);assert.equal(c.deferredContacts.length,1);assert.equal(w.pendingFuses.length,1);assert.equal(target.life,life);assert(c.active.has(cast)&&p.skillRecoveryLocks.has('cleave'));
  observe('pending-fuse-keeps-deferred-recovery-locked',{deferred:1,fuses:1,lifeUnchanged:true,active:true,locked:true});
  w.time=fuse.due;(w as any).updatePendingPersists(0);assert.equal(w.pendingFuses.length,0);assert.equal(c.deferredContacts.length,0);assert.equal(c.recoveries.length,1);assert.equal(c.recoveries[0].target,target);assert.equal(c.recoveries[0].projectile,main);assert.equal(c.recoveries[0].cast,cast);assert.equal(cast.receipt.target,target);assert(target.life<life&&cast.connected);
  observe('due-hit-reconnects-original-recovery-identities',{deferred:0,fuses:0,recoveries:1,targetAlias:true,carrierAlias:true,castAlias:true,receiptAlias:true,damageLanded:true});
  w.actors=w.actors.filter(a=>a!==target);w.attackSequences.update(0);assert.equal(c.recoveries.length,0);assert.equal(c.active.size,0);assert(!p.skillRecoveryLocks.has('cleave'));
  observe('missing-target-releases-deferred-origin-recovery',{recoveries:0,active:0,locked:false});
 }
 {
  const {w,p,target,host,c}=setup();w.executeSkill(p,host,target.pos);const main=w.projectiles[0];w.attackSequences.beforeContact(main);(w as any).resolveHit(p,main.inst,target);assert(w.attackSequences.contact(main,target));w.projectiles=[];w.attackSequences.clear(p,host);assert.equal(w.pendingFuses.length,0);assert.equal(c.deferredContacts.length,0);assert.equal(c.active.size,0);assert(!p.skillRecoveryLocks.has('cleave'));
  observe('retirement-removes-fuse-and-deferred-contact',{fuses:0,deferred:0,active:0,locked:false});
 }
 {
  const {w,p,target,host,c}=setup(false),life=target.life;w.attackSequences.opening(p,host,target.pos,1);assert.equal(c.scheduled.length,1);const job=c.scheduled[0];assert.equal(job.inst.sequenceHost,host);assert.equal(job.inst.sequenceRole,'payload');assert.notEqual(job.aim,target.pos);assert.equal(c.casts.has(job.inst),false);
  observe('delayed-opening-owns-aim-and-retains-host',{jobs:1,ownedAim:true,hostAlias:true,role:'payload',castAbsent:true,due:job.due});
  w.time=job.due-1e-6;w.attackSequences.update(0);assert.equal(c.scheduled.length,1);assert.equal(target.life,life);
  observe('delayed-opening-waits',{jobs:1,lifeUnchanged:true});
  w.time=job.due;w.attackSequences.update(0);assert.equal(c.scheduled.length,0);assert(target.life<life);assert.equal(c.casts.has(job.inst),false);assert(!p.skillRecoveryLocks.has('cleave'));
  observe('delayed-opening-delivers-without-primary-capture',{jobs:0,damageLanded:true,castAbsent:true,locked:false});
 }
 assert.equal(rows.length,8);writeFileSync(process.argv[2],JSON.stringify({scope:'original-sequence-deferred-ownership/v1',notes:'Real private hit/fuse entry points with explicit controller stepping; no whole World scheduler or private graph acceptance.',observations:rows},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({scope:'original-sequence-deferred-ownership/v1',observations:rows.length}));
}finally{restore();}
