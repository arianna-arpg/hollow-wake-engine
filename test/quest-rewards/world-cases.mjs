import questRewardContent from 'candidate/quest-reward-data';
import memoryRollRows from 'candidate/roll-rows';
import {DurableMintedVocationQuestOwner} from 'candidate/minted-vocation-quest-owner';
import {createCharacterDeliveryCodec} from 'candidate/delivery-codec';
import {SqliteCharacterGroupStore as MintedWorldStore} from '../character-composition/sqlite-character-group-store.mjs';
import mintedWorldPath from 'node:path';
import {planVocationQuestProgression} from 'candidate/vocation-quest-plan';
import {createHash} from 'node:crypto';
import {durableMintedVocationWorld} from 'candidate/durable-minted-vocation-world';
import {installQuestRewards} from 'candidate/vocation-quest-adapter';
import {ExperiencePlanEffects} from 'candidate/experience-plan';
{
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),arm=process.argv[3]==='original'?'original':'actual',results=[],ids=policy.pack.vocations.map(v=>v.id),id=ids[0];
 for(const scenario of [...ids.map(id=>({id})),{id,enabled:false},{id,repeat:true},{id,prior:id},{id,prior:ids[1]},{id,seed:1},{id,seed:2}]){
  const actual=durableMintedVocationWorld(memoryRollRows,scenario.id,scenario.enabled!==false,scenario.prior,scenario.seed),key='vocation-quest-account';
  assert.deepEqual(questRewardContent.quests.find(q=>q.id===actual.quest.id),{id:actual.quest.id,offerLabel:actual.quest.offerLabel,vocation:actual.quest.vocation,reward:copy(actual.quest.reward)},'Compiled quest reward differs from the original definition');
  const make=()=>new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true}),vocation:()=>({maxPerCharacter:actual.cap(),accountWrites:actual.w.metaProgressionActive()})}),engine=make();
  ok(engine.command({op:'open-account',account:1,key,seed:42}));const a=ok(engine.command({op:'account-save',account:1})).save;ok(engine.command({op:'close-account',account:1}));Object.assign(a.progression.account,actual.account());ok(engine.command({op:'restore-account',account:1,save:a}));
  const input=actual.input(character.character.contentId);ok(engine.command({op:'open-workshop',profile:1,account:1,seed:43,nextUid:input.nextUid,state:input.state,character:input.character}));engine.attach({schemaVersion:1,capability:'run-progression/diagnostic',key:'vocation-quest-run',ledger:copy(actual.w.ledger),characters:[{key:'hero',accountKey:key,xp:actual.m.xp,xpNeeded:actual.m.xpNeeded}]},[{key:'hero',profile:1}]);
  const plan=planVocationQuestProgression(actual.quest,'hero',actual.w.metaProgressionActive(),actual.questKey);
  const actions=plan.actions.map(({characterKey,kind,...rest})=>kind==='experience'?{kind:'award',profile:1,...rest}:kind==='run-ledger'?{kind,...rest}:{kind,profile:1,...rest});
  let batch,index=0,host,readBuild=handle=>engine.build(handle),memories=[],mintDrops=[],gemIndex=0;
  const prepared=received=>{assert.equal(received.length,1);assert.deepEqual(received[0],actions[index],'Quest callback order diverged from saved batch');const row=batch.journal[index++];return{state:row.after,journal:[row]};};
  if(arm==='actual'){
   installQuestRewards(actual.w,{
    points:(currency,amount)=>{const packet=prepared([{kind:'points',profile:1,currency,amount}]),event=packet.journal[0].character.reply.reply.events[0],field=currency==='passive'?'passivePoints':'vocationPoints';assert.equal(actual.m[field],event.before);actual.m[field]=event.after;},
    runCounter:(key,amount)=>{const packet=prepared([{kind:'run-ledger',key,amount}]);actual.w.ledger[key]=packet.state.ledger[key];},
    accountCounter:(key,amount)=>{const packet=prepared([{kind:'account-counter',profile:1,key,amount,mode:'add'}]),counter=packet.journal[0].character.reply.accountCounter;assert.equal(actual.w.account.ledger[key]??0,counter.before);actual.w.account.ledger[key]=counter.after;},
    vocation:id=>{const packet=prepared([{kind:'vocation',profile:1,id}]);actual.publish(id,packet.journal[0],handle=>readBuild(handle));}
   });
   actual.w.grantXp=amount=>{
    actual.trace.push({name:'grantXp',phase:'before',state:actual.snapshot()});const packet=prepared([{kind:'award',profile:1,amount}]);
    for(const row of packet.journal){let rebuild=0;new ExperiencePlanEffects(actual.experiencePorts(()=>{const build=readBuild(row.character.transitions[rebuild++].after);assert.deepEqual(build.projection.attrs,actual.m.attrs);})).play(row.experience);assert.equal(rebuild,row.character.transitions.length);}
    actual.trace.push({name:'grantXp',phase:'after',state:actual.snapshot()});
   };
   actual.installDrop(()=>{if(gemIndex===0)prepared([{kind:'deliveries',profile:1,drops:mintDrops}]);assert(gemIndex<memories.length,'Extra quest Memory callback');memories[gemIndex++].play();});
  }
  const play=()=>{actual.phase();if(scenario.repeat){const first=actual.observed();actual.phase();assert.deepEqual(actual.observed(),first,'Original live quest paid twice');}};
  let mintState;
  if(arm==='original'){play();mintState=actual.mintState();}
  else{
   const store=new MintedWorldStore(mintedWorldPath.join(process.argv[2],process.argv[3]+'-minted-world-'+results.length+'.sqlite'));let release,commits=0,publishes=0;
   try{
    const run={schemaVersion:1,capability:'run-character-checkpoint/diagnostic',run:copy(engine.read()),group:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:copy(ok(engine.command({op:'account-save',account:1})).save),characters:[{key:'hero',save:copy(ok(engine.command({op:'workshop-save',profile:1})).save)}],outbox:{nextId:1,rows:[]},deliveryState:{seed:1}}};
    const body={schemaVersion:2,capability:'minted-vocation-quest-checkpoint/diagnostic',contentId:questRewardContent.contentId,mint:actual.initialMint,run,quests:{active:[copy(actual.entry)],completed:[]}};
    assert.equal(store.commit('quest',0,body).status,'committed');
    const options={contentId:body.contentId,characterKey:'hero',quests:questRewardContent.quests,questKey:actual.questKey,accountWrites:()=>actual.w.metaProgressionActive(),authorize:()=>true,mint:actual.factory,
     run:{groupKey:'quest',accountKey:key,characters:[{key:'hero',handle:1}],activeCharacterKey:null,createOwner:make,admitDrop:createCharacterDeliveryCodec(workshop,MEMORY_KINDS),delivery:{admitState:copy,admitPlacement:copy,prepare:()=>assert.fail('Quest escaped private mint placement'),authorizePickup:()=>false}},
     storage:{read:key=>store.read(key),commit:async(key,revision,candidate)=>{commits++;await new Promise(resolve=>{release=resolve;});return store.commit(key,revision,candidate);}},
     live:{prepare:packet=>{mintDrops=packet.deliveries.map(row=>copy(row.drop));const at=actions[0]?.kind==='award'?1:0;actions.splice(at,0,{kind:'deliveries',profile:1,drops:mintDrops});memories=actual.prepareMemories({drops:mintDrops,placements:packet.deliveries.map(row=>row.placement),presentations:packet.quests.presentations});return{packet,before:host.read()};},
      publish:(lease,packet)=>{assert.deepEqual(host.read(),lease.before,'Quest checkpoint exposed partial publication');assert.equal(packet.run,lease.packet.run);batch=packet.run;readBuild=packet.run.readBuild;play();publishes++;assert.deepEqual(host.read(),lease.before,'Quest checkpoint exposed intermediate reward state');},discard:()=>{for(const lease of memories)lease.discard();},recoverRequired:()=>{}}
    };
    host=await DurableMintedVocationQuestOwner.open(options);const before=copy(host.read()),liveBefore=actual.observed(),pending=host.settleTrusted(actual.quest.id);
    if(!release)await pending;assert(release);assert.equal(host.status,'pending');assert.deepEqual(copy(host.read()),before);assert.deepEqual(store.read('quest'),before);assert.deepEqual(actual.observed(),liveBefore,'Unacknowledged quest changed live World');assert.equal(publishes,0);
    release();assert.equal((await pending).status,'committed');assert.equal(commits,1,'Quest used multiple commits');assert.equal(publishes,1);assert.deepEqual(copy(host.read()),store.read('quest'));assert.throws(()=>readBuild({}),/run-build-view-expired/);
    assert.equal(gemIndex,memories.length);for(const lease of memories)assert.throws(()=>lease.play(),/lease-expired/);
    assert.deepEqual(copy(host.read().body.quests),{active:copy(actual.w.activeQuests),completed:[...actual.w.completedQuests]},'Saved and live quest books differ');
    const after=actual.observed(),restored=await DurableMintedVocationQuestOwner.open({...options,run:{...options.run,characters:[{key:'hero',handle:7}]},storage:{read:key=>store.read(key),commit:(key,revision,candidate)=>{commits++;return store.commit(key,revision,candidate);}},live:{prepare:()=>assert.fail('Restore replayed quest preparation'),publish:()=>assert.fail('Restore replayed quest publication'),discard:()=>{},recoverRequired:()=>{}}});
    assert.deepEqual(copy(restored.read()),store.read('quest'));assert.equal((await restored.settleTrusted(actual.quest.id)).status,'already-completed');assert.equal(commits,1);assert.deepEqual(actual.observed(),after,'Restore replayed live quest');
    const saved=host.read().body,held=saved.run.group.characters[0].save.character,ownedAccount=saved.run.group.account.progression.account,ownedRun=saved.run.run;
    assert.deepEqual(copy(held.passives),actual.passives());assert.equal(held.level,actual.p.level);assert.equal(ownedRun.characters[0].xp,actual.m.xp);assert.equal(ownedRun.characters[0].xpNeeded,actual.m.xpNeeded);assert.deepEqual(copy(ownedRun.ledger),copy(actual.w.ledger));assert.deepEqual(copy(ownedAccount.ledger),copy(actual.w.account.ledger));
    assert.deepEqual(copy(saved.quests),{active:copy(actual.w.activeQuests),completed:[...actual.w.completedQuests]},'Saved and live quest books differ');assert.deepEqual(copy(saved.run.group.outbox.rows.map(row=>row.drop)),mintDrops);mintState=saved.mint;
   }finally{store.close();}
  }
  if(arm==='actual')assert.equal(index,actions.length,'Quest omitted a saved reward');const observed=actual.observed();results.push({scenario,quest:actual.quest.id,observed:digest(observed),final:digest(observed.final),mintState,...(results.length?{}:{detail:observed})});
 }
 console.log(JSON.stringify({arm,authoredVocations:ids.length,scenarios:results.length,results,storage:'Node SQLite',originalWorldAdapter:true,ownedRewardRandomStream:true,wholeWorldSave:false,originalSharedRandomInterleaving:false,devicePerformanceQualified:false}));
}
