import {liveRunWorld} from 'candidate/live-run-world';
import {ExperiencePlanEffects} from 'candidate/experience-plan';
import {CharacterPassiveEffects} from '../../dist/character-passive-effects.js';
{
 let builds=0;
 for(const mode of ['acknowledged','refused','downed-during-delay','revived-during-delay','stale-investment']){
  const actual=liveRunWorld(),original=liveRunWorld(),owner=new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true})});
  if(mode==='revived-during-delay'){actual.p.downed=true;actual.p.life=0;original.p.downed=true;original.p.life=0;}
  ok(owner.command({op:'open-account',account:1,key:'world-run-account',seed:17}));const a=ok(owner.command({op:'account-save',account:1})).save;
  ok(owner.command({op:'close-account',account:1}));Object.assign(a.progression.account,actual.account());ok(owner.command({op:'restore-account',account:1,save:a}));
  const input=actual.input(character.character.contentId);ok(owner.command({op:'open-workshop',profile:1,account:1,seed:19,nextUid:input.nextUid,state:input.state,character:input.character}));
  owner.attach({schemaVersion:1,capability:'run-progression/diagnostic',key:'world-run',ledger:copy(actual.w.ledger),characters:[{key:'hero',accountKey:'world-run-account',xp:actual.m.xp,xpNeeded:actual.m.xpNeeded}]},[{key:'hero',profile:1}]);
  const before=actual.snapshot(),amount=[1,2,3,4].reduce((sum,l)=>sum+rules.experienceForLevel(l),0),actions=[award(amount),command(1,{op:'allocate',nodeId:node.id}),award(3)];
  const pending=ok(owner.prepareTrusted(actions)),journal=owner.prepared(pending.token).journal;assert.deepEqual(actual.snapshot(),before,'private run preparation touched the live actor');
  actual.advance();original.advance();
  if(mode==='downed-during-delay'){actual.p.downed=true;actual.p.life=0;original.p.downed=true;original.p.life=0;}
  if(mode==='revived-during-delay'){actual.p.downed=false;actual.p.life=10;original.p.downed=false;original.p.life=10;}
  if(mode==='stale-investment'){actual.m.passivePoints++;original.m.passivePoints++;}
  const delayed=actual.snapshot();actual.events.length=0;original.events.length=0;
  if(mode==='refused'){ok(owner.command({op:'abort-prepared',token:pending.token}));assert.deepEqual(actual.snapshot(),delayed);assert.deepEqual(actual.snapshot(),original.snapshot());continue;}
  const checkBuild=step=>{
   const held=owner.build(step.after);assert.equal(held.character.level,actual.p.level);assert.equal(held.character.passives.passivePoints,actual.m.passivePoints);
   assert.deepEqual(held.projection.attrs,actual.m.attrs,'private XP builder disagrees with original attributes');
   // The private projection uses the established JSON boundary: absent optional
   // fields and explicitly undefined source fields have the same wire shape.
   for(const name of ['level','passives'])assert.deepEqual(held.projection.sources.find(([id])=>id===name)?.[1]??[],copy(actual.p.sheet.getSourceMods(name)??[]),'private XP builder disagrees with original '+name+' modifiers');builds++;
  };
  if(mode==='stale-investment'){
   assert.throws(()=>new ExperiencePlanEffects(actual.experiencePorts(()=>assert.fail('Unexpected rebuild'))).play(journal[0].experience),/Stale experience investment/);
   assert.deepEqual(actual.snapshot(),delayed);assert.equal(actual.events.length,0);ok(owner.command({op:'abort-prepared',token:pending.token}));continue;
  }
  // This course explicitly acknowledges the in-memory group. A durable run
  // storage adapter and recovery fence are separate, still unqualified work.
  ok(owner.command({op:'commit-prepared',token:pending.token}));
  original.w.grantXp(amount);assert.equal(original.original({op:'allocate',nodeId:node.id}),true);original.w.grantXp(3);
  for(const entry of journal){
   if(entry.experience){let at=0;new ExperiencePlanEffects(actual.experiencePorts(()=>checkBuild(entry.character.transitions[at++]))).play(entry.experience);assert.equal(at,entry.character.transitions.length);}
   else{
    const ports=actual.effectPorts(index=>owner.build(entry.character.transitions[index].after).character.passives),rebuild=ports.rebuild;
    ports.rebuild=index=>{rebuild(index);checkBuild(entry.character.transitions[index]);};new CharacterPassiveEffects(ports).play(entry.character.reply.reply.events);
   }
  }
  assert.deepEqual(actual.events,original.events,'original live XP/passive publication trace mismatch: '+mode);assert.deepEqual(actual.snapshot(),original.snapshot(),'original live XP/passive state mismatch: '+mode);
  assert.deepEqual(copy(owner.read().ledger),actual.w.ledger);assert.equal(owner.read().characters[0].xp,actual.m.xp);
 }
 console.log({passed:true,liveRunCourses:5,privateBuildsCompared:builds,durableRunStore:false,fullActorRecovery:false});
}
