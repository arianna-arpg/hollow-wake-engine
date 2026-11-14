import {QuestMemoryPublication} from 'candidate/quest-memory-publication';
import {prepareQuestMemories} from 'candidate/quest-memory-mint';
import {Random} from '../../src/random.js';
import {DurableMintedVocationQuestOwner} from 'candidate/minted-vocation-quest-owner';
import {createCharacterDeliveryCodec} from 'candidate/delivery-codec';
import {SqliteCharacterGroupStore as QuestOwnerStore} from '../character-composition/sqlite-character-group-store.mjs';
import questOwnerPath from 'node:path';
import {vocationQuestDefs} from 'host/quest-content';
import {questDoneKey} from 'host/quest-content';
{
 const quests=vocationQuestDefs().filter(q=>q.reward.grantVocation).map(q=>({id:q.id,offerLabel:q.offerLabel,vocation:q.vocation,reward:copy(q.reward)})),seed=setup().all(),results=[];
 const startRun={schemaVersion:1,capability:'run-character-checkpoint/diagnostic',run:copy(seed.run),group:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:copy(seed.account.save),characters:seed.saves.map((r,n)=>({key:'character-'+(n+1),save:copy(r.save)})),outbox:{nextId:1,rows:[]},deliveryState:{seed:1}}};
 const scenarios=[...quests.map(quest=>({quest,mode:'committed'})),...['refused','conflict','lost-ack','publication-failure'].map(mode=>({quest:quests[0],mode}))];
 for(const {quest,mode} of scenarios){
  const store=new QuestOwnerStore(questOwnerPath.join(process.argv[2],process.argv[3]+'-quest-owner-'+results.length+'.sqlite'));
  try{
   const initial={schemaVersion:2,capability:'minted-vocation-quest-checkpoint/diagnostic',mint:new Random(0x773211).snapshot(),contentId:'authored-vocations',run:copy(startRun),quests:{active:[{questId:quest.id,zoneId:'quest-zone',fieldDone:true,directionsKnown:true}],completed:[]}};
   assert.equal(store.commit('quest',0,initial).status,'committed');
   const mintFactory=({random})=>({worldKey:'quest-zone',at:{x:100,y:200},tier:1,services:{clamp:point=>point,floor:()=>undefined,level:()=>1,tileset:()=>undefined,config:()=>({skillShare:.75,memoryShare:1,preformedShare:.16,foundProvenance:'found'}),rollSkill:()=>{random();random();return{};},rollSupport:()=>{random();return{};},presentation:(at,kind)=>({pos:{x:at.x-10+random()*20,y:at.y-16},kind:'drop',memoryKind:kind})}});
   const expectedMint=copy(prepareQuestMemories(initial.mint,quest.reward.gems??0,mintFactory)),drops=expectedMint.drops;let mintCalls=0;

   let release,commits=0,publishes=0,authorizations=0,recoveries=0;const observers=[],liveMemories=[],leases=[];
   const options={contentId:'authored-vocations',characterKey:'character-1',quests,questKey:questDoneKey,mint:scope=>{mintCalls++;return mintFactory(scope);},accountWrites:()=>true,authorize:()=>{authorizations++;return true;},
    run:{groupKey:'quest',accountKey:'account-a',characters:[{key:'character-1',handle:1},{key:'character-2',handle:2}],activeCharacterKey:null,
     createOwner:ports=>new RunCharacterSession({account,character,experience:rules},{conditions:request=>request.command.op==='character-pickup'?{drop:ports.resolveDelivery({accountKey:request.accountKey,profile:request.profile,deliveryId:request.command.command.deliveryId})}:{refundRefusal:null,openAllRealms:false},experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true}),vocation:()=>({maxPerCharacter:2,accountWrites:true})}),
     admitDrop:createCharacterDeliveryCodec(workshop,MEMORY_KINDS),delivery:{admitState:copy,admitPlacement:copy,prepare:({rows,state})=>({state,placements:rows.map(row=>({id:row.id,placement:{worldKey:'quest-zone',x:row.id,y:0}}))}),authorizePickup:()=>true}},
    storage:{read:key=>store.read(key),commit:async(key,revision,body)=>{commits++;await new Promise(resolve=>{release=resolve;});if(mode==='refused')return{status:'refused'};if(mode==='conflict'){assert.equal(store.commit(key,revision,initial).status,'committed');return store.commit(key,revision,body);}const result=store.commit(key,revision,body);if(mode==='lost-ack')throw Error('quest-owner-ack-lost');return result;}},
    live:{prepare:packet=>{assert.deepEqual(copy(packet.quests.current),initial.quests,'Quest preparation exposed pending completion');assert.equal(packet.quests.candidate.active.length,0,'Quest preparation retained active entry');assert.deepEqual(packet.quests.candidate.completed,[quest.id],'Quest preparation omitted completion stamp');assert.deepEqual(copy(packet.quests.presentations),expectedMint.presentations,'Quest preparation lost Memory label plans');const lease=new QuestMemoryPublication({drops:packet.deliveries.map(row=>row.drop),placements:packet.deliveries.map(row=>row.placement),presentations:packet.quests.presentations},{drop:(drop,placement)=>{liveMemories.push(['drop',copy(drop),copy(placement)]);if(mode==='publication-failure')throw Error('quest-owner-publication-failed');},presentation:value=>{liveMemories.push(['presentation',copy(value)]);}});leases.push(lease);packet.quests.candidate.completed.push('host-mutated-copy');packet.quests.presentations.push({hostMutated:true});return lease;},publish:(lease,packet)=>{publishes++;assert.deepEqual(copy(packet.quests.presentations),expectedMint.presentations,'Quest publication lost prepared Memory labels');lease.play();queueMicrotask(()=>observers.push(copy(owner.read())));},discard:lease=>{lease.discard();},recoverRequired:({lease})=>{recoveries++;if(lease?.state==='ready')lease.discard();}}
   };
   const owner=await DurableMintedVocationQuestOwner.open(options),before=copy(owner.read()),pending=owner.settleTrusted(quest.id);if(!release)await pending;assert(release,'Quest settlement did not reach storage');
   assert.equal(mintCalls,1,'Quest did not prepare exactly one private mint');assert.equal(owner.status,'pending');assert.deepEqual(copy(owner.read()),before,'Pending quest exposed completion');assert.deepEqual(store.read('quest'),before,'Pending quest wrote partial checkpoint');assert.equal(publishes,0);assert.deepEqual(liveMemories,[],'Pending storage published Memory effects');
   await assert.rejects(owner.settleTrusted(quest.id),/quest-owner-not-ready/);await assert.rejects(owner.submit([{kind:'pickup',characterKey:'character-2',deliveryId:1}]),/quest-owner-not-ready/);
   release();if(['lost-ack','publication-failure'].includes(mode)){await assert.rejects(pending,/quest-owner-/);assert.equal(owner.status,'recovery-required');assert.equal(recoveries,1);}else assert.equal((await pending).status,mode);
   const expectedEffects=mode==='committed'?drops.flatMap((drop,i)=>[['drop',drop,expectedMint.placements[i]],['presentation',expectedMint.presentations[i]]]):mode==='publication-failure'?[['drop',drops[0],expectedMint.placements[0]]]:[];
   assert.deepEqual(liveMemories,expectedEffects,'Ack publication changed prepared Memory effects');assert.equal(leases.length,1);assert.equal(leases[0].state,['committed','publication-failure'].includes(mode)?'consumed':'discarded');assert.throws(()=>leases[0].play(),/lease-expired/,'Settled lease could replay Memory effects');
   const committed=!['refused','conflict'].includes(mode),stored=store.read('quest');assert.equal(commits,1,'Quest used multiple commits');assert.deepEqual(stored.body.quests,committed?{active:[],completed:[quest.id]}:initial.quests,'Quest completion split from rewards');
   assert.deepEqual(stored.body.mint,committed?expectedMint.random:initial.mint,'Quest split mint continuation from rewards');
   if(committed)assert.deepEqual(stored.body.run.group.outbox.rows.map(row=>row.placement),expectedMint.placements,'Quest lost prepared Memory placement');
   if(mode==='committed')assert.deepEqual(observers,[stored],'Queued observer saw split quest and reward state');
   assert.equal(stored.body.run.group.outbox.rows.length,committed?drops.length:0,'Quest lost owed Memories');assert.equal(stored.body.run.run.ledger[questDoneKey(quest.id)]??0,committed?1:0,'Quest stamp split from completion');
   if(committed){const hero=stored.body.run.group.characters[0].save.character;assert(hero.passives.vocations.includes(quest.reward.grantVocation),'Quest omitted vocation grant');assert.deepEqual(stored.body.run.group.outbox.rows.map(row=>row.drop),drops);}
   const freshOptions={...options,run:{...options.run,characters:[{key:'character-1',handle:7},{key:'character-2',handle:9}]},storage:{read:key=>store.read(key),commit:(key,revision,body)=>{commits++;return store.commit(key,revision,body);}},live:{prepare:()=>({}),publish:()=>{},discard:()=>{},recoverRequired:()=>{}}};
   const fresh=await DurableMintedVocationQuestOwner.open(freshOptions);assert.deepEqual(copy(fresh.read()),stored,'Quest restore changed settlement');
   if(committed){
    const calls=authorizations,writes=commits,mints=mintCalls;assert.equal((await fresh.settleTrusted(quest.id)).status,'already-completed','Restored quest paid twice');assert.equal(authorizations,calls);assert.equal(commits,writes);assert.equal(mintCalls,mints,'Restored quest rerolled its mint');assert.deepEqual(copy(fresh.read()),stored);
    await fresh.submit([{kind:'pickup',characterKey:'character-2',deliveryId:1}]);const picked=copy(fresh.read());assert.deepEqual(picked,store.read('quest'),'Pickup erased completed quest');assert.deepEqual(picked.body.quests,stored.body.quests,'Pickup erased completed quest');assert.equal(picked.body.run.group.outbox.rows.length,drops.length-1);assert.deepEqual(picked.body.run.group.characters[1].save.workshop.state.items[0].mem,drops[0].units);
   }else{
    const unchanged=copy(fresh.read());
    const failedMint=await DurableMintedVocationQuestOwner.open({...freshOptions,mint:scope=>{scope.random();throw Error('mint-refused-after-draw');}});
    await assert.rejects(failedMint.settleTrusted(quest.id),/mint-refused-after-draw/);assert.deepEqual(copy(failedMint.read()),unchanged,'Failed mint advanced checkpoint');assert.deepEqual(store.read('quest'),unchanged);

    const denied=await DurableMintedVocationQuestOwner.open({...freshOptions,authorize:()=>false});await assert.rejects(denied.settleTrusted(quest.id),/quest-not-authorized/);assert.deepEqual(copy(denied.read()),unchanged);
    assert.equal((await fresh.settleTrusted(quest.id)).status,'committed','Refused quest could not retry');assert.deepEqual(copy(fresh.read()).body.quests.completed,[quest.id]);
   }
   await assert.rejects(DurableMintedVocationQuestOwner.open({...freshOptions,contentId:'foreign-content'}),/unsupported-vocation-quest-checkpoint/);
   const malformed=copy(store.read('quest'));malformed.body.quests.completed.push(quest.id);await assert.rejects(DurableMintedVocationQuestOwner.open({...freshOptions,storage:{...freshOptions.storage,read:()=>malformed}}),/invalid-quest-book-id/);
   const unstamped=copy(store.read('quest'));delete unstamped.body.run.run.ledger[questDoneKey(quest.id)];await assert.rejects(DurableMintedVocationQuestOwner.open({...freshOptions,storage:{...freshOptions.storage,read:()=>unstamped}}),/quest-book-run-mismatch/,'Restored quest book disagrees with run stamp');
   const resurrected=copy(store.read('quest'));resurrected.body.quests=copy(initial.quests);await assert.rejects(DurableMintedVocationQuestOwner.open({...freshOptions,storage:{...freshOptions.storage,read:()=>resurrected}}),/quest-book-run-mismatch/,'Restored active quest already paid');
   results.push({quest:quest.id,mode,committed});
  }finally{store.close();}
 }
 console.log(JSON.stringify({passed:true,authoredVocations:quests.length,questOwnerScenarios:results.length,results,storage:'Node SQLite',sealedMemoryInputs:false,privateMintStream:true,hostRollServices:true,acknowledgedMemoryEffects:true,generalQuestSettlement:false,devicePerformanceQualified:false}));
}
