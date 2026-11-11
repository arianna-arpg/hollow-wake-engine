// Diagnostic invocation of the real private hit resolver and recovery controller.
// This does not claim whole-World scheduling equivalence or a private actor builder.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {makeSkillInstance} from '../src/engine/skills';import {mod} from '../src/engine/stats';
bootSimEngine();const restore=seedGlobalRandom(0x7742),rows:unknown[]=[];
const observe=(name:string,value:unknown)=>rows.push({name,value});
function setup(bounce=false){
 const w=makeSimWorld('warrior',0x7742),p=w.player;w.actors=[p];w.walk=null;
 const host=makeSkillInstance(SKILLS.cleave,20);host.treeNodes=bounce?['unbound_cleave','long_edge','wide_front']:['unbound_cleave'];p.skills=[host];
 p.sheet.setSource('recovery-observer',[mod('accuracy','override',100000),mod('critChance','override',0)]);
 const target=w.createMonster('zombie',1,'enemy');target.skills=[];target.brain=undefined;target.tier=p.tier;target.pos={x:p.pos.x+180,y:p.pos.y};
 target.sheet.setSource('recovery-observer',[mod('life','flat',100000),mod('evasion','override',0),mod('blockChance','override',0),mod('ailmentResist','override',0)]);target.fillResources();w.actors.push(target);
 w.executeSkill(p,host,target.pos);const main=w.projectiles.find(q=>q.inst.sequenceHost===host&&q.inst.sequenceRole==='primary');assert(main);
 w.attackSequences.beforeContact(main);(w as any).resolveHit(p,main.inst,target,main.mult,0,undefined,false,false,undefined,main.origin,main.tier);
 const c=w.attackSequences as any,cast=c.casts.get(main.inst);assert(cast.receipt&&cast.receipt.target===target&&cast.receipt.dealt>0);assert(w.attackSequences.contact(main,target));
 w.projectiles=w.projectiles.filter(q=>q!==main);assert.equal(c.recoveries.length,1);const recovery=c.recoveries[0];assert.equal(recovery.cast,cast);assert.equal(recovery.projectile,main);
 return{w,p,target,host,main,c,cast,recovery};
}
try{
 {
  const h=setup(),{w,p,target,c,cast,recovery}=h;assert.equal(recovery.target,target);assert(!Object.hasOwn(recovery,'marker'));assert.equal(recovery.airborne,false);
  w.time=.1;w.attackSequences.update(.1);assert(cast.done&&c.active.has(cast)&&p.skillRecoveryLocks.has('cleave'));assert.equal(c.recoveries[0],recovery);
  observe('lodged-recovery-retains-target-and-projectile-after-flight',{targetIdentity:true,projectileIdentity:true,receiptIdentity:true,fields:Object.keys(recovery),done:true,active:true,elapsed:recovery.elapsed});
  p.pos={...target.pos};w.time=.2;w.attackSequences.update(.1);assert.equal(c.recoveries.length,0);assert.equal(c.active.size,0);assert(!p.skillRecoveryLocks.has('cleave'));assert(target.statuses.some(s=>s.id==='bleed'&&s.sourceKey===cast.state.key+':throw'));
  observe('nearby-retrieval-applies-owned-bleed-and-releases',{active:0,recoveries:0,locked:false,bleed:true});
 }
 {
  const {w,p,target,host,main,c,cast,recovery}=setup(true),marker=recovery.marker;assert(marker&&marker.owner===p&&w.actors.includes(marker));assert(!Object.hasOwn(recovery,'target'));assert.equal(marker.summonInst,main.inst);assert.equal(marker.summonInst?.sequenceHost,host);assert.equal(marker.construct?.castInst,undefined);assert.equal(recovery.airborne,true);
  w.time=.5;w.attackSequences.update(.5);assert.equal(recovery.elapsed,.5);assert(!cast.done);assert.equal(marker.look,cast.state.spec.bounce.airLook);
  observe('airborne-recovery-holds-marker-owner-and-flight',{markerOwner:true,markerSkillHost:true,fields:Object.keys(recovery),elapsed:.5,duration:2,airborne:true,active:true,projectileMoved:main.pos.x!==recovery.from.x||main.pos.y!==recovery.from.y});
  p.pos={...recovery.at};w.time=.6;w.attackSequences.update(.1);assert(marker.dead);assert.equal(c.recoveries.length,0);assert.equal(c.active.size,0);assert.equal(cast.caught,1);assert.equal(cast.state.caught,1);assert.equal(w.projectiles.length,8);assert(w.projectiles.every(q=>q.inst.sequenceRole==='payload'&&q.inst.sequenceHost===host&&!c.casts.has(q.inst)));assert(!p.skillRecoveryLocks.has('cleave'));
  observe('airborne-catch-retires-marker-and-spawns-untracked-nova',{markerDead:true,castCaught:1,stateCaught:1,children:8,childProvenance:true,locked:false});
  w.projectiles=[];w.executeSkill(p,host,target.pos);assert.equal(c.scheduled.length,1);const job=c.scheduled[0],second=w.projectiles[0];assert.equal(job.inst,second.inst);assert.equal(job.state,cast.state);assert.notEqual(job.aim,target.pos);const due=job.due;
  observe('caught-rhythm-schedules-shared-cast-repeat',{jobs:1,castAlias:c.casts.get(job.inst)===c.casts.get(second.inst),stateAlias:true,ownedAim:true,due,jobFields:Object.keys(job)});
  w.time=due-1e-6;w.attackSequences.update(0);assert.equal(c.scheduled.length,1);assert.equal(w.projectiles.length,1);
  observe('scheduled-repeat-waits-for-due-time',{jobs:1,projectiles:1});
  w.time=due;w.attackSequences.update(0);assert.equal(c.scheduled.length,0);assert.equal(w.projectiles.length,2);assert.equal(w.projectiles[1].inst,second.inst);assert.equal(c.casts.get(w.projectiles[1].inst),c.casts.get(second.inst));
  observe('due-repeat-preserves-primary-skill-and-cast',{jobs:0,projectiles:2,skillAlias:true,castAlias:true});
 }
 {
  const {w,p,c,cast,recovery}=setup(true),marker=recovery.marker;w.time=2;w.attackSequences.update(2);assert.equal(recovery.airborne,false);assert.equal(marker.look,cast.state.spec.recovery.look);assert(cast.done&&c.active.has(cast));assert(p.skillRecoveryLocks.has('cleave'));
  observe('landed-marker-holds-recovery-after-cast-finishes',{airborne:false,done:true,active:true,locked:true,elapsed:2});
  p.pos={...recovery.at};w.time=2.1;w.attackSequences.update(.1);assert(marker.dead);assert.equal(c.recoveries.length,0);assert.equal(c.active.size,0);assert.equal(cast.caught,0);assert.equal(w.projectiles.length,0);assert(!p.skillRecoveryLocks.has('cleave'));
  observe('grounded-retrieval-releases-without-catch-nova',{markerDead:true,recoveries:0,active:0,caught:0,projectiles:0,locked:false});
 }
 assert.equal(rows.length,9);writeFileSync(process.argv[2],JSON.stringify({scope:'original-sequence-recovery-ownership/v1',notes:'Actual hits and host effects; explicit controller stepping. No full World scheduler or private graph acceptance.',observations:rows},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({scope:'original-sequence-recovery-ownership/v1',observations:rows.length}));
}finally{restore();}
