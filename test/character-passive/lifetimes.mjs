import {livePassiveWorld as nextLivePassiveWorld} from 'diagnostic/live-passive-world';
import {CharacterPassiveEffects as NextPassiveEffects} from 'diagnostic/passive-effects';

// Qualification course: real World actors through the maintained scene adapter.
// Recovery here deliberately qualifies only the passive investment fixture;
// it is not full inventory/actor/combat restoration.
async function checkPassiveLifetimes(){
 const policy=defs.character.passives,realm=policy.pack.realms.find(row=>row.id==='devotion'),roots=new Set(realm.roots);
 const node=policy.pack.nodes.find(row=>row.realm===realm.id&&!roots.has(row.id)&&!row.choice&&!row.vocation&&policy.adjacent(policy.index(row.id),roots));assert(node);
 const modes=['committed','refused','retired','replaced-seat-body','uncertain-commit','partial-publication'];
 for(const mode of modes){
  const initial=nextLivePassiveWorld(),conditions={refundRefusal:null,openAllRealms:false,runLedger:copy(initial.w.ledger)};
  let kernel=new CompleteAccountKernel(completeBase,{conditions:()=>conditions}),seed=new CompleteOwner({...completeDefs,completeKernel:kernel});
  accountComplete(seed,1,'lifetime-passive-account');const savedAccount=as(seed,1).save;cs(seed,{op:'close-account',account:1});
  Object.assign(savedAccount.progression.account,initial.account());cs(seed,{op:'restore-account',account:1,save:savedAccount});startComplete(seed,1,1,initial.input(defs.character.contentId));
  let stored={revision:1,body:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:as(seed,1).save,
   characters:[{key:'hero',save:ws(seed,1).save}],outbox:{nextId:1,rows:[]},deliveryState:{}}};
  const control={delay:true,refuse:mode==='refused',loseAck:mode==='uncertain-commit',failAfterRebuild:mode==='partial-publication'};
  let release,waiting=false;
  const storage={read:()=>copy(stored),commit:async(_key,revision,body)=>{
   assert.equal(revision,stored.revision);if(control.delay){waiting=true;await new Promise(resolve=>{release=resolve;});waiting=false;}
   if(control.refuse)return{status:'refused'};stored={revision:revision+1,body:copy(body)};
   if(control.loseAck)throw Error('passive-acknowledgement-lost');return{status:'committed',revision:stored.revision};
  }};
  const open=async(fixture)=>{
   const scene={},lifetime={current:scene},log=[];let ownedKernel;
   const adapter=await CharacterWorldAdapter.open({
    world:{groupKey:'passive-life-'+mode,worldKey:'same-saved-world-key',admitDrop:()=>assert.fail('Unexpected drop'),admitPlacement:()=>assert.fail('Unexpected placement'),
     world:{list:()=>[],inspect:()=>undefined,create:()=>assert.fail('Unexpected delivery'),remove:()=>assert.fail('Unexpected retirement')}},
    characterOf:seat=>seat===fixture.s?'hero':undefined,
    isCurrent:()=>lifetime.current===scene&&fixture.w.localSeat===fixture.s&&fixture.s.actor===fixture.p,
    restore(snapshot){
     const saved=snapshot.body.characters[0].save.character.passives;
     if(JSON.stringify(fixture.passives())!==JSON.stringify(saved))fixture.effectPorts(()=>saved).rebuild(0);
     assert.deepEqual(fixture.passives(),copy(saved));log.push('restore');
    },
    createOwner:({live})=>LocatedOwner.open({groupKey:'passive-life-'+mode,accountKey:'lifetime-passive-account',characters:[{key:'hero',handle:1}],storage,live,
     createOwner:()=>{ownedKernel=new CompleteAccountKernel(completeBase,{conditions:()=>({...conditions,runLedger:copy(fixture.w.ledger)})});return new CompleteOwner({...completeDefs,completeKernel:ownedKernel});},
     admitDrop:()=>assert.fail('Unexpected drop'),delivery:{admitState:value=>value,admitPlacement:()=>assert.fail('Unexpected placement'),prepare:()=>assert.fail('Unexpected delivery'),authorizePickup:()=>false}}),
    live:{prepare(packet){
     assert.deepEqual(fixture.passives(),copy(packet.current.body.characters[0].save.character.passives));log.push('prepare');
     return{before:fixture.passives()};
    },publish(lease,packet){
     assert.deepEqual(fixture.passives(),lease.before,'competing passive investment');
     for(const entry of packet.journal){
      assert.equal(entry.command.command.op,'character-passive');assert(entry.transitions.every(step=>step.profile===1&&step.accountKey==='lifetime-passive-account'));
      const ports=fixture.effectPorts(index=>ownedKernel.read(entry.transitions[index].after).character.passives),rebuild=ports.rebuild;
      ports.rebuild=index=>{rebuild(index);if(control.failAfterRebuild)throw Error('passive-publication-after-first-rebuild');};
      new NextPassiveEffects(ports).play(entry.reply.reply.events);
     }
     log.push('publish');
    },discard(){log.push('discard');},recoverRequired(){log.push('recovery');}}
   });
   return{adapter,log,lifetime,fixture};
  };
  const run=await open(initial),before=initial.snapshot(),saved=copy(stored),original=nextLivePassiveWorld();
  const command={op:'allocate',nodeId:node.id};
  const pending=run.adapter.submit([{kind:'character',characterKey:'hero',command:{op:'character-passive',command}}]);
  assert(waiting);assert.deepEqual(initial.snapshot(),before);initial.advance();original.advance();const advanced=initial.snapshot();
  if(mode==='retired')run.lifetime.current={};
  if(mode==='replaced-seat-body')initial.s.actor=original.p;
  release();
  if(mode==='committed'){
   assert.equal((await pending).status,'committed');assert.equal(original.original(command),true);
   assert.deepEqual(initial.snapshot(),original.snapshot());assert.deepEqual(initial.events,original.events);assert.deepEqual(run.log,['restore','prepare','publish']);
  }else if(mode==='refused'){
   assert.equal((await pending).status,'refused');assert.deepEqual(initial.snapshot(),advanced);assert.deepEqual(stored,saved);assert.equal(run.adapter.status,'ready');
   assert.deepEqual(run.log,['restore','prepare','discard']);
  }else{
   const expected=mode==='uncertain-commit'?/passive-acknowledgement-lost/:mode==='partial-publication'?/passive-publication-after-first-rebuild/:/world-adapter-expired/;
   await assert.rejects(pending,expected);assert.deepEqual(run.log,['restore','prepare','recovery']);assert.equal(stored.revision,saved.revision+1);
   assert(stored.body.characters[0].save.character.passives.allocated.includes(node.id));
   if(mode==='partial-publication'){
    assert(initial.passives().allocated.some(id=>roots.has(id)));assert(!initial.passives().allocated.includes(node.id),'fault must interrupt the intermediate path');
    assert.equal(initial.events.filter(e=>e.name==='recalcSeat').length,1);assert.equal(run.adapter.status,'recovery-required');
   }else{assert.deepEqual(initial.snapshot(),advanced);assert.equal(initial.events.length,0);}
   assert.throws(()=>run.adapter.read(),/world-adapter-disposed|character-recovery-required/);
   run.adapter.dispose();control.delay=false;control.loseAck=false;control.failAfterRebuild=false;
   const fresh=nextLivePassiveWorld(),recovered=await open(fresh);
   assert.deepEqual(copy(recovered.adapter.read()),stored);assert.deepEqual(fresh.passives(),copy(stored.body.characters[0].save.character.passives));
   assert.deepEqual(recovered.log,['restore']);assert(fresh.events.every(event=>event.name==='recalcSeat'),'cold reconnect replayed command effects');
   fresh.events.length=0;const refund={op:'refund',nodeId:node.id};
   assert.equal((await recovered.adapter.submit([{kind:'character',characterKey:'hero',command:{op:'character-passive',command:refund}}])).status,'committed');
   assert(!fresh.passives().allocated.includes(node.id));assert.equal(fresh.passives().realmPoints.devotion,2);assert.equal(stored.revision,saved.revision+2);
   assert.deepEqual(fresh.passives(),copy(stored.body.characters[0].save.character.passives));assert.equal(recovered.adapter.status,'ready');recovered.adapter.dispose();
  }
  run.adapter.dispose();
 }
 console.log({realPassiveSceneCourses:modes.length,exactSceneAndSeatIdentity:true,unknownAcknowledgementRecovery:true,partialPublicationRecovery:true,passiveInvestmentOnly:true,fullActorRecoveryQualified:false});
}
