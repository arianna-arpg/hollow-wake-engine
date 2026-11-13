import {DurableRunOwner} from 'candidate/durable-run-owner';
{
 const seed=setup(),saved=seed.all();
 const checkpoint={schemaVersion:1,capability:'run-character-checkpoint/diagnostic',run:copy(saved.run),group:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:copy(saved.account.save),
  characters:saved.saves.map((r,n)=>({key:'character-'+(n+1),save:copy(r.save)})),outbox:{nextId:2,rows:[{id:1,characterKey:'character-1',drop:{kind:'marker'},placement:{x:5,y:7}}]},deliveryState:{seed:49}}};
 let courses=0;
 function fixture(mode='commit',stored={revision:1,body:copy(checkpoint)},handles=[1,2]){
  const box={stored,wait:undefined,release:undefined,commits:0,published:[],discarded:0,recovered:0,reads:0};let host;
  const options={groupKey:'run-checkpoint-test',accountKey:'account-a',characters:handles.map((handle,n)=>({handle,key:'character-'+(n+1)})),activeCharacterKey:null,
   createOwner:()=>new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true})}),
   storage:{read:()=>{box.reads++;return copy(box.stored);},commit:async(_key,revision,body)=>{
    box.commits++;assert.equal(revision,box.stored?.revision??0);assert.equal(body.capability,'run-character-checkpoint/diagnostic');assert.equal(body.group.capability,'durable-character-group/located-diagnostic');
    box.wait=copy(body);if(mode==='delayed')await new Promise(resolve=>{box.release=resolve;});
    if(mode==='refused')return{status:'refused'};if(mode==='conflict')return{status:'conflict'};
    box.stored={revision:revision+1,body:copy(body)};if(mode==='lost-ack')throw Error('lost-run-ack');return{status:'committed',revision:box.stored.revision};
   }},
   admitDrop:v=>copy(v),delivery:{admitState:v=>copy(v),admitPlacement:v=>copy(v),prepare:()=>assert.fail('Unexpected delivery'),authorizePickup:()=>false},
   live:{prepare:packet=>{
    assert.equal(packet.run.current.characters[0].xp,host.read().body.run.characters[0].xp);assert.equal(packet.run.journal.length,packet.journal.length);
    assert(Object.isFrozen(packet.run.journal));assert(Object.isFrozen(packet.journal));return{packet,before:host.read()};
   },publish:(lease,packet)=>{
    assert.deepEqual(host.read(),lease.before,'read exposed partially published run state');assert.equal(packet.run,lease.packet.run);box.published.push(packet);
    if(mode==='publication-failure')throw Error('partial-run-publication');
   },discard:()=>{box.discarded++;},recoverRequired:()=>{box.recovered++;}}
  };
  return{box,options,open:async()=>{host=await DurableRunOwner.open(options);return host;}};
 }
 const actions=[{kind:'experience',characterKey:'character-1',amount:45},{kind:'character',characterKey:'character-1',command:{op:'character-passive',command:{op:'allocate',nodeId:node.id}}},{kind:'experience',characterKey:'character-1',amount:3}];
 for(const mode of ['commit','delayed','refused','conflict','lost-ack','publication-failure']){
  const f=fixture(mode),host=await f.open(),before=host.read();assert.equal(host.status,'ready');
  const task=host.submitTrusted(actions);
  if(mode==='delayed'){
   assert.equal(host.status,'pending');assert.deepEqual(host.read(),before);assert(f.box.release);assert.equal(f.box.wait.run.characters[0].xp,3,'checkpoint omitted prepared run XP');
   assert.equal(f.box.wait.group.characters[0].save.character.level,2);assert.equal(f.box.wait.group.characters[0].save.character.passives.passivePoints,0);
   await assert.rejects(()=>host.submitTrusted([{kind:'experience',characterKey:'character-2',amount:3}]),/run-checkpoint-not-ready/);f.box.release();
  }
  if(mode==='lost-ack'||mode==='publication-failure'){
   await assert.rejects(()=>task,mode==='lost-ack'?/lost-run-ack/:/partial-run-publication/);assert.equal(host.status,'recovery-required');assert.throws(()=>host.read(),/character-recovery-required/);assert.equal(f.box.recovered,1);
   assert.equal(f.box.stored.body.run.characters[0].xp,3,'uncertain checkpoint lost run progress');
  }else{
   const result=await task;assert.equal(result.status,mode==='refused'||mode==='conflict'?mode:'committed');
   if(mode==='conflict'){assert.equal(host.status,'recovery-required');assert.equal(f.box.recovered,1);}
   else if(mode==='refused'){assert.deepEqual(host.read(),before);assert.equal(f.box.discarded,1);assert.equal(f.box.published.length,0);}
   else{assert.equal(host.read().body.run.characters[0].xp,3);assert.equal(f.box.stored.body.run.characters[0].xp,3,'checkpoint omitted prepared run XP');assert.equal(host.read().revision,2);assert.equal(f.box.published.length,1);assert.deepEqual(host.read().body.group.outbox,before.body.group.outbox);}
  }
  if(!['refused','conflict'].includes(mode)){
   // Fresh handles prove that only stable character keys enter run persistence.
   const next=fixture('commit',copy(f.box.stored),[7,9]),restored=await next.open();assert.equal(next.box.published.length,0,'cold reconnect replayed an earned award');
   assert.equal(restored.read().body.run.characters[0].xp,3);assert.equal(restored.read().body.group.characters[0].save.character.level,2);
   const r=await restored.submitTrusted([{kind:'experience',characterKey:'character-1',amount:2}]);assert.equal(r.status,'committed');assert.equal(restored.read().body.run.characters[0].xp,5);
  }
  courses++;
 }
 {
  const f=fixture(),host=await f.open(),before=host.read();
  await assert.rejects(()=>host.submit([{kind:'character',characterKey:'character-1',command:{op:'trusted-run-experience',grant:1}}]),/unowned-checkpoint-experience/);
  await assert.rejects(()=>host.submitTrusted([{kind:'character',characterKey:'character-1',command:{op:'trusted-run-experience',grant:1}},{kind:'experience',characterKey:'character-1',amount:5}]),/unowned-checkpoint-experience/);
  await assert.rejects(()=>host.submitTrusted([...actions,{kind:'character',characterKey:'character-1',command:{op:'character-passive',command:{op:'allocate',nodeId:node.id,ledger:{forged:1}}}}]),/unknown-field/);
  assert.equal(host.status,'ready');assert.deepEqual(host.read(),before);assert.equal(f.box.commits,0);courses++;
 }
 {
  const f=fixture('commit',null);f.options.initialRun=copy(saved.run);
  f.options.initial={account:{key:'account-a',seed:51,state:copy(saved.account.save.progression.account),craftLore:copy(saved.account.save.craftLore),extra:copy(saved.account.save.extra)},
   characters:saved.saves.map((r,n)=>({key:'character-'+(n+1),start:{seed:71+n,state:copy(r.save.workshop.state),nextUid:r.save.workshop.nextUid,character:copy(r.save.character),progression:r.save.progression}})),deliveryState:{seed:49}};
  const host=await f.open();assert.equal(f.box.commits,1);assert.equal(host.read().revision,1);assert.deepEqual(copy(host.read().body.run),copy(saved.run));assert.equal(f.box.published.length,0);courses++;
 }
 for(const mutate of [s=>{delete s.body.run;},s=>{s.body.run.characters[0].key='foreign';},s=>{s.body.schemaVersion=999;}]){
  const stored={revision:1,body:copy(checkpoint)};mutate(stored);const f=fixture('commit',stored);await assert.rejects(()=>f.open());assert.equal(f.box.commits,0);courses++;
 }
 {
  const codec=new AccountRelicItems(workshop),relic=new ItemRules(items,85,500).forge({baseId:'relic_charm',ilvl:1,rarity:'magic',quality:1,affixes:[]});assert(relic);
  Object.assign(relic,{relicKey:'checkpoint-relic',x:0,y:0});const value=copy(checkpoint),a=value.group.account,typed=codec.decode(a.progression.account.reliquary);
  typed.items=[relic];typed.seated=[relic.relicKey];a.schemaVersion=2;a.capability='account-workshop-account/v2';a.relicItems=copy(codec.content);a.progression.account.reliquary=codec.encode(typed);
  for(const c of value.group.characters)c.save.workshop.nextUid=1000;
  const f=fixture('commit',{revision:1,body:value},[7,9]);f.options.activeCharacterKey='character-2';
  f.options.createOwner=()=>new RunCharacterSession({account:{...account,relicItems:codec,relicBuilds:true},character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true})});
  const host=await f.open(),factor=reliquaryExperience([relic],true);
  await host.submitTrusted([{kind:'experience',characterKey:'character-1',amount:1},{kind:'experience',characterKey:'character-2',amount:1}]);
  assert.equal(host.read().body.run.characters[0].xp,1);assert.equal(host.read().body.run.characters[1].xp,factor,'cold checkpoint chose the wrong active character');
  await host.submitTrusted([{kind:'activate',characterKey:'character-1'},{kind:'experience',characterKey:'character-1',amount:1}]);assert.equal(host.read().body.run.characters[0].xp,1+factor);courses++;
 }
 {
  const f=fixture(),opening=f.open();f.options.storage.commit=()=>assert.fail('Checkpoint storage changed after binding');f.options.live.publish=()=>assert.fail('Live port changed after binding');
  const host=await opening;await host.submitTrusted([{kind:'experience',characterKey:'character-1',amount:3}]);assert.equal(f.box.commits,1);assert.equal(f.box.published.length,1);assert.equal(host.read().body.run.characters[0].xp,3);courses++;
 }
 console.log({passed:true,durableRunCourses:courses,stableKeys:true,oneAtomicEnvelope:true,checkpointOnly:true,physicalStorageQualified:false,fullActorRecovery:false});
}
