import {livePassiveWorld as mixedWorld} from 'diagnostic/live-passive-world';
import {CharacterPassiveEffects as MixedPassiveEffects} from 'diagnostic/passive-effects';

// Explicit host account observations are composed with original passive actions.
// This does not qualify vocation earning, arbitrary unlocks, or relic activation.
async function checkMixedAccountPublication(){
 {
  const selected=cs(canonicalOwner,{op:'active-workshop',account:21}).profile,target=selected===60?61:60;
  const pending=cs(canonicalOwner,{op:'prepare',commands:[{op:'activate-workshop',account:21,profile:target}]}),entry=canonicalOwner.preparedJournal(pending.token)[0];
  assert.equal(entry.accounts.length,1);const change=entry.accounts[0];assert.equal(change.account,21);assert.equal(change.accountKey,'complete-21');
  assert.equal(change.before.activeProfile,selected);assert.equal(change.after.activeProfile,target);
  assert.deepEqual(copy(change.before.save),copy(change.after.save),'ephemeral selection must not enter the save');assert.equal(change.before.version,change.after.version);
  cs(canonicalOwner,{op:'abort-prepared',token:pending.token});assert.equal(cs(canonicalOwner,{op:'active-workshop',account:21}).profile,selected);
 }
 const policy=defs.character.passives,realm=policy.pack.realms.find(r=>r.id==='devotion'),roots=new Set(realm.roots);
 const node=policy.pack.nodes.find(r=>r.realm===realm.id&&!roots.has(r.id)&&!r.choice&&!r.vocation&&policy.adjacent(policy.index(r.id),roots));assert(node);
 const instrument=()=>{
  const fixtures=[mixedWorld(),mixedWorld()],timeline=[];
  fixtures.forEach((f,n)=>{const old=f.w.recalcSeat;f.w.recalcSeat=function(...args){timeline.push({profile:n+1,attuned:this.ledger.devotion_attuned??0,accountAttuned:this.account.ledger.devotion_attuned??0,credits:this.account.credits});return old.apply(this,args);};});
  return{fixtures,timeline};
 };
 const applyAccount=(group,view)=>{
  const a=view.save.progression.account;
  for(const f of group.fixtures){
   assert.deepEqual([...f.w.account.features],copy(a.features));
   f.w.account.ledger=copy(a.ledger);f.w.account.credits=a.credits;f.w.account.level=a.level;
  }
 };
 for(const mode of ['committed','refused']){
  const actual=instrument(),original=instrument(),conditions={refundRefusal:null,openAllRealms:false};
  let kernel=new CompleteAccountKernel(completeBase,{conditions:({profile})=>({...conditions,runLedger:copy(actual.fixtures[profile-1].w.ledger)})}),owner=new CompleteOwner({...completeDefs,completeKernel:kernel});
  accountComplete(owner,1,'mixed-account');const account=as(owner,1).save;cs(owner,{op:'close-account',account:1});
  Object.assign(account.progression.account,actual.fixtures[0].account());cs(owner,{op:'restore-account',account:1,save:account});
  for(let n=0;n<2;n++)startComplete(owner,n+1,1,actual.fixtures[n].input(defs.character.contentId));
  let stored={revision:1,body:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:as(owner,1).save,
   characters:[1,2].map(n=>({key:'hero-'+n,save:ws(owner,n).save})),outbox:{nextId:1,rows:[]},deliveryState:{}}};
  const initialAccount=stored.body.account.progression.account;
  const observe=(credits,attuned)=>({kind:'account',command:{op:'observe',level:initialAccount.level,credits,
   ledger:{...copy(initialAccount.ledger),devotion_attuned:attuned},roster:copy(initialAccount.roster)}});
  const passive=(n,op)=>({kind:'character',characterKey:'hero-'+n,command:{op:'character-passive',command:{op,nodeId:node.id}}});
  const actions=[passive(1,'allocate'),observe(7,0),passive(2,'allocate'),observe(11,1),passive(2,'refund'),passive(1,'refund')];
  let release,waiting=false;const log=[],accountSteps=[];
  const host=await LocatedOwner.open({groupKey:'mixed-'+mode,accountKey:'mixed-account',characters:[1,2].map(n=>({key:'hero-'+n,handle:n})),
   createOwner:()=>{kernel=new CompleteAccountKernel(completeBase,{conditions:({profile})=>({...conditions,runLedger:copy(actual.fixtures[profile-1].w.ledger)})});return new CompleteOwner({...completeDefs,completeKernel:kernel});},
   storage:{read:()=>copy(stored),commit:async(_key,revision,body)=>{assert.equal(revision,stored.revision);waiting=true;await new Promise(resolve=>{release=resolve;});
    if(mode==='refused')return{status:'refused'};stored={revision:revision+1,body:copy(body)};return{status:'committed',revision:stored.revision};}},
   admitDrop:()=>assert.fail('Unexpected drop'),delivery:{admitState:v=>v,admitPlacement:()=>assert.fail('Unexpected placement'),prepare:()=>assert.fail('Unexpected delivery'),authorizePickup:()=>false},
   live:{prepare(packet){
    assert.equal(packet.journal.length,actions.length);assert.deepEqual(packet.journal.map(e=>e.accounts.length),[0,1,0,1,0,0]);
    const first=packet.journal[1].accounts[0],second=packet.journal[3].accounts[0];assert.equal(first.after,second.before,'intermediate account view sharing');
    assert.equal(first.after.save.progression.account.credits,7);assert.equal(first.after.save.progression.account.ledger.devotion_attuned,0);
    assert.equal(second.after.save.progression.account.credits,11);assert.equal(second.after.save.progression.account.ledger.devotion_attuned,1);
    assert.deepEqual(packet.journal[1].transitions.map(t=>t.profile),[1,2]);assert.deepEqual(packet.journal[3].transitions.map(t=>t.profile),[1,2]);
    assert.equal(packet.journal[2].reply.reply.accepted,true,'account observation must not lock an open run realm');
    log.push('prepare');return{before:actual.fixtures.map(f=>f.passives())};
   },publish(lease,packet){
    assert.deepEqual(actual.fixtures.map(f=>f.passives()),lease.before);
    for(const entry of packet.journal){
     for(const change of entry.accounts){assert.equal(change.account,1);assert.equal(change.accountKey,'mixed-account');applyAccount(actual,change.after);accountSteps.push(copy(change.after.save));}
     if(entry.command.op==='account'){
      for(const step of entry.transitions){assert.equal(step.accountKey,'mixed-account');const f=actual.fixtures[step.profile-1];f.effectPorts(()=>kernel.read(step.after).character.passives).rebuild(0);}
     }else{
      const f=actual.fixtures[entry.command.profile-1];assert(entry.transitions.every(t=>t.profile===entry.command.profile&&t.accountKey==='mixed-account'));
      assert.equal(entry.reply.reply.events.filter(e=>e.kind==='recalculate').length,entry.transitions.length,'unexpected mixed normalization path');
      new MixedPassiveEffects(f.effectPorts(index=>kernel.read(entry.transitions[index].after).character.passives)).play(entry.reply.reply.events);
     }
    }
    log.push('publish');
   },discard(){log.push('discard');},recoverRequired(){log.push('recovery');}}
  });
  const before=actual.fixtures.map(f=>f.snapshot()),saved=copy(stored),pending=host.submit(actions);assert(waiting);
  assert.deepEqual(actual.fixtures.map(f=>f.snapshot()),before);assert.deepEqual(stored,saved);
  actual.fixtures.forEach(f=>f.advance());original.fixtures.forEach(f=>f.advance());const advanced=actual.fixtures.map(f=>f.snapshot());release();
  if(mode==='refused'){
   assert.equal((await pending).status,'refused');assert.deepEqual(actual.fixtures.map(f=>f.snapshot()),advanced);assert.deepEqual(stored,saved);
   assert.deepEqual(actual.timeline,[]);assert.deepEqual(log,['prepare','discard']);assert.deepEqual(accountSteps,[]);
  }else{
   const result=await pending;assert.equal(result.status,'committed');assert.equal(stored.revision,2);
   let accountIndex=0;const decisions=[],expectedAccount=copy(saved.body.account);
   for(const action of actions){
    if(action.kind==='account'){
     const {op,...observation}=action.command;assert.equal(op,'observe');Object.assign(expectedAccount.progression.account,copy(observation));
     assert.deepEqual(accountSteps[accountIndex++],expectedAccount,'account publication must match the independent observation');
     applyAccount(original,{save:expectedAccount});for(const f of original.fixtures)f.w.recalcSeat(f.s);
    }else decisions.push(original.fixtures[Number(action.characterKey.slice(-1))-1].original(action.command.command));
   }
   assert.deepEqual(decisions,[true,true,true,true]);assert.deepEqual(actual.timeline,original.timeline,'mixed account context ordering');
   assert(actual.timeline.every(t=>t.attuned===1),'account changes cannot rewrite the run ledger');
   assert(actual.timeline.some(t=>t.accountAttuned===0&&t.credits===7));assert(actual.timeline.some(t=>t.accountAttuned===1&&t.credits===11));
   assert.deepEqual(actual.fixtures.map(f=>f.snapshot()),original.fixtures.map(f=>f.snapshot()));
   assert.deepEqual(actual.fixtures.map(f=>f.events),original.fixtures.map(f=>f.events));assert.deepEqual(log,['prepare','publish']);
   for(let n=0;n<2;n++)assert.deepEqual(actual.fixtures[n].passives(),copy(stored.body.characters[n].save.character.passives));
   assert.equal(stored.body.account.progression.account.credits,11);
  }
 }
 console.log({mixedActualWorldCourses:2,characters:2,orderedCommands:6,accountViewsAtCallbackTime:true,combatContinuesWhilePending:true,investmentAwardsQualified:false,canonicalRelicPublicationQualified:false});
}
