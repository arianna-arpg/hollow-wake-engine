import {livePassiveWorld} from 'diagnostic/live-passive-world';
import {CharacterPassiveEffects as LivePassiveEffects} from 'diagnostic/passive-effects';
async function checkPassiveDurableWorld(){
 const policy=defs.character.passives,realm=policy.pack.realms.find(row=>row.id==='devotion'),roots=new Set(realm.roots);
 const node=policy.pack.nodes.find(row=>row.realm===realm.id&&!roots.has(row.id)&&!row.choice&&!row.vocation&&policy.adjacent(policy.index(row.id),roots));assert(node);
 for(const mode of ['committed','refused','stale-investment','policy-refusal']){
  const actual=livePassiveWorld(),original=livePassiveWorld(),trace=[],conditions={refundRefusal:null,openAllRealms:false,runLedger:copy(actual.w.ledger)};
  let kernel=new CompleteAccountKernel(completeBase,{conditions:()=>conditions,trace:row=>trace.push(row)}),seed=new CompleteOwner({...completeDefs,completeKernel:kernel});
  accountComplete(seed,1,'live-passive-account');const savedAccount=as(seed,1).save;cs(seed,{op:'close-account',account:1});
  Object.assign(savedAccount.progression.account,actual.account());cs(seed,{op:'restore-account',account:1,save:savedAccount});startComplete(seed,1,1,actual.input(defs.character.contentId));
  let stored={revision:1,body:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:as(seed,1).save,
   characters:[{key:'hero',save:ws(seed,1).save}],outbox:{nextId:1,rows:[]},deliveryState:{}}},release,waiting=false,delay=true;
  const lifecycle=[];
  const host=await LocatedOwner.open({groupKey:'passive-'+mode,accountKey:'live-passive-account',characters:[{key:'hero',handle:1}],
   createOwner:()=>{kernel=new CompleteAccountKernel(completeBase,{conditions:()=>conditions});return new CompleteOwner({...completeDefs,completeKernel:kernel});},
   storage:{read:()=>copy(stored),commit:async(_key,revision,body)=>{
    assert.equal(revision,stored.revision);if(delay){waiting=true;await new Promise(resolve=>{release=resolve;});}
    if(mode==='refused')return{status:'refused'};stored={revision:revision+1,body:copy(body)};return{status:'committed',revision:stored.revision};
   }},admitDrop:()=>assert.fail('Unexpected world delivery'),delivery:{admitState:value=>value,admitPlacement:()=>assert.fail('Unexpected placement'),prepare:()=>assert.fail('Unexpected delivery'),authorizePickup:()=>false},
   live:{prepare(packet){lifecycle.push('prepare');const first=packet.journal.flatMap(entry=>entry.transitions)[0];
    const previous=packet.current.body.characters.find(row=>row.key==='hero').save.character.passives;
    assert.deepEqual(actual.passives(),copy(previous));if(first)assert.deepEqual(actual.passives(),copy(kernel.read(first.before).character.passives));return{before:actual.passives()};
   },publish(lease,packet){
    if(JSON.stringify(actual.passives())!==JSON.stringify(lease.before))throw Error('stale-live-passive-investment');
    for(const entry of packet.journal){
     assert.equal(entry.command.command.op,'character-passive');assert(entry.transitions.every(step=>step.profile===1&&step.accountKey==='live-passive-account'));
     const player=new LivePassiveEffects(actual.effectPorts(index=>kernel.read(entry.transitions[index].after).character.passives));player.play(entry.reply.reply.events);
    }
    lifecycle.push('publish');
   },discard(){lifecycle.push('discard');},recoverRequired(){lifecycle.push('recovery');}}
  });
  const before=actual.snapshot(),saved=copy(stored),command=mode==='policy-refusal'?{op:'refund',nodeId:actual.passives().allocated[0]}:{op:'allocate',nodeId:node.id};
  const pending=host.submit([{kind:'character',characterKey:'hero',command:{op:'character-passive',command}}]);assert(waiting);assert.deepEqual(actual.snapshot(),before);assert.deepEqual(stored,saved);
  assert.deepEqual(lifecycle,['prepare']);actual.advance();original.advance();const advanced=actual.snapshot();
  assert(advanced.cooldowns[0][1]<before.cooldowns[0][1]);assert(advanced.time>before.time);assert(advanced.life<before.life);
  if(mode==='stale-investment')actual.m.passivePoints++;
  release();
  if(mode==='stale-investment'){
   await assert.rejects(pending,/stale-live-passive-investment/);assert.equal(host.status,'recovery-required');assert.equal(actual.m.passivePoints,advanced.passives.passivePoints+1);
   assert.equal(actual.events.length,0);assert.deepEqual(lifecycle,['prepare','recovery']);assert.equal(stored.revision,saved.revision+1);
  }else if(mode==='refused'){
   assert.equal((await pending).status,'refused');assert.deepEqual(actual.snapshot(),advanced);assert.deepEqual(stored,saved);assert.deepEqual(lifecycle,['prepare','discard']);
  }else if(mode==='policy-refusal'){
   assert.equal((await pending).status,'committed');assert.equal(original.original(command),false);
   assert.deepEqual(actual.snapshot(),original.snapshot());assert.deepEqual(actual.events,original.events,'effect-only policy refusal matches original');
   assert.equal(actual.events.length,1);assert.equal(actual.events[0].name,'failNote');assert.deepEqual(lifecycle,['prepare','publish']);
   assert.deepEqual(actual.passives(),before.passives);assert.deepEqual(stored.body,saved.body);assert.equal(stored.revision,saved.revision+1);
  }else{
   assert.equal((await pending).status,'committed');assert.equal(original.original(command),true);
   assert.deepEqual(actual.snapshot(),original.snapshot(),'durable original actor publication');assert.deepEqual(actual.events,original.events,'ordered original actor effects');
   assert.equal(actual.m.knownSkills.get('cleave'),actual.skill);assert.equal(actual.p.skills[0],actual.skill);
   assert.deepEqual(actual.passives(),copy(host.read().body.characters[0].save.character.passives));assert.deepEqual(lifecycle,['prepare','publish']);
   actual.events.length=0;original.events.length=0;waiting=false;
   const refund={op:'refund',nodeId:node.id},refundPending=host.submit([{kind:'character',characterKey:'hero',command:{op:'character-passive',command:refund}}]);assert(waiting);
   assert.equal(actual.events.length,0);actual.advance();original.advance();
   const actualNewBody=actual.spawn(),originalNewBody=original.spawn();
   actual.firstBody.dead=true;original.firstBody.dead=true;
   actual.events.length=0;original.events.length=0;release();assert.equal((await refundPending).status,'committed');
   assert.equal(original.original(refund),true);assert.deepEqual(actual.snapshot(),original.snapshot());assert.deepEqual(actual.events,original.events);
   assert(actual.w.actors.includes(actualNewBody));assert(original.w.actors.includes(originalNewBody));
   assert.deepEqual(actual.refreshed,[actualNewBody],'refund refreshes the current surviving body');
  }
 }
 console.log({durableOriginalWorldCourses:4,combatTimersAdvancedWhilePending:true,currentSurvivingSummons:true,ordinarySummonGeometryPreserved:true,effectOnlyRefusal:true,staleInvestmentRequiresRecovery:true,fullActorRecoveryQualified:false});
}
