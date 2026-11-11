// Original flight clock and retained-handle diagnostics. Calls on a removed
// projectile are deliberate observer inputs, not an assertion of normal routing.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {makeSkillInstance} from '../src/engine/skills';
bootSimEngine();const restore=seedGlobalRandom(0x7737),rows:unknown[]=[];
try{
 const w=makeSimWorld('warrior',0x7737),p=w.player;w.actors=[p];w.walk=null;
 const host=makeSkillInstance(SKILLS.cleave,20);host.treeNodes=['unbound_cleave','long_edge','driving_front'];p.skills=[host];
 w.executeSkill(p,host,{x:p.pos.x+200,y:p.pos.y});const main=w.projectiles.find(q=>q.inst.sequenceHost===host&&q.inst.sequenceRole==='primary');assert(main);
 const c=w.attackSequences as any,cast=c.casts.get(main.inst);assert(cast&&c.active.has(cast));assert(p.skillRecoveryLocks.has(host.def.id));assert.equal(c.rainAt.has(main),false);
 rows.push({name:'real-thrown-primary-has-active-cast-and-no-flight-clock',value:{projectiles:w.projectiles.length,active:true,recoveryLocked:true,clockAbsent:true,projectileFields:Object.keys(main)}});
 const before=w.projectiles.length;w.attackSequences.flight(main,false);assert.equal(w.projectiles.length,before+1);assert.equal(c.rainAt.get(main),w.time+.25);const child=w.projectiles.at(-1)!;assert.equal(child.inst.sequenceHost,host);assert.equal(child.inst.sequenceRole,'payload');assert.equal(c.casts.has(child.inst),false);assert.equal(child.caster,p);
 rows.push({name:'flight-sheds-child-and-stamps-parent-clock',value:{clock:c.rainAt.get(main),childRole:child.inst.sequenceRole,childHostIdentity:true,childCaptured:false,childOwnerIdentity:true}});
 w.time=.1;w.attackSequences.flight(main,false);assert.equal(w.projectiles.length,before+1);w.time=.25;w.attackSequences.flight(child,false);assert.equal(w.projectiles.length,before+1);assert.equal(c.rainAt.has(child),false);w.attackSequences.flight(main,false);assert.equal(w.projectiles.length,before+2);assert.equal(c.rainAt.get(main),.5);
 rows.push({name:'parent-clock-gates-emission-and-child-cannot-recurse',value:{clock:.5,newChildren:2,childClockAbsent:true}});
 w.projectiles=w.projectiles.filter(q=>q!==main);w.attackSequences.update(0);assert.equal(c.active.has(cast),false);assert.equal(cast.done,true);assert.equal(p.skillRecoveryLocks.has(host.def.id),false);assert.equal(c.casts.get(main.inst),cast);assert.equal(c.rainAt.get(main),.5);
 rows.push({name:'completed-carrier-retains-cast-and-flight-clock',value:{done:true,active:false,lockReleased:true,castIdentityRetained:true,clock:.5}});
 const after=w.projectiles.length;w.time=.4;w.attackSequences.flight(main,false);assert.equal(w.projectiles.length,after);w.time=.5;w.attackSequences.flight(main,false);assert.equal(w.projectiles.length,after+1);assert.equal(c.rainAt.get(main),.75);
 rows.push({name:'diagnostic-retained-flight-handle-still-obeys-its-clock',value:{outsideRoster:true,clock:.75,emittedAtDueTime:true}});
 w.attackSequences.clear(p,host);assert(cast.state.retired);const retiredCount=w.projectiles.length;w.time=1;w.attackSequences.flight(main,false);assert.equal(w.projectiles.length,retiredCount);assert.equal(c.rainAt.get(main),.75);
 rows.push({name:'retired-state-blocks-retained-flight-with-clock-preserved',value:{retired:true,clock:.75,emissionRejected:true}});
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-sequence-flight-ownership/v1',notes:'Real thrown projectile and diagnostic retained-handle calls. No private graph, thrown contact/retrieval or performance acceptance.',observations:rows},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({scope:'original-sequence-flight-ownership/v1',observations:rows.length}));
}finally{restore();}
