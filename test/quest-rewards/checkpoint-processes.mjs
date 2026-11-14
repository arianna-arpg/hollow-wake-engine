import {DurableMintedVocationQuestOwner} from 'candidate/minted-vocation-quest-owner';
import {prepareQuestMemories} from 'candidate/quest-memory-mint';
import {Random} from '../../src/random.js';
import {createCharacterDeliveryCodec} from 'candidate/delivery-codec';
import {SqliteCharacterGroupStore as FreshMintStore} from '../character-composition/sqlite-character-group-store.mjs';
import freshMintPath from 'node:path';
import {vocationQuestDefs} from 'host/quest-content';
import {questDoneKey} from 'host/quest-content';
{
 const stages=['write-lost','resume-pickup','next-quest','final-read'],stage=process.argv[3],index=stages.indexOf(stage);assert(index>=0);
 const quests=vocationQuestDefs().filter(q=>q.reward.grantVocation).slice(0,2).map(q=>({id:q.id,offerLabel:q.offerLabel,vocation:q.vocation,reward:copy(q.reward)}));assert(quests.every(q=>q.reward.gems===6));
 const seed=setup().all(),initial={schemaVersion:2,capability:'minted-vocation-quest-checkpoint/diagnostic',contentId:'fresh-vocations',mint:new Random(0x773211).snapshot(),run:{schemaVersion:1,capability:'run-character-checkpoint/diagnostic',run:copy(seed.run),group:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:copy(seed.account.save),characters:seed.saves.map((r,n)=>({key:'character-'+(n+1),save:copy(r.save)})),outbox:{nextId:1,rows:[]},deliveryState:{seed:1}}},quests:{active:quests.map(q=>({questId:q.id,zoneId:'quest-zone',fieldDone:true})),completed:[]}};
 const factory=({random})=>({worldKey:'quest-zone',at:{x:100,y:200},tier:1,services:{clamp:p=>p,floor:()=>undefined,level:()=>1,tileset:()=>undefined,config:()=>({skillShare:.75,memoryShare:1,preformedShare:.16,foundProvenance:'found'}),rollSkill:()=>{random();random();return{};},rollSupport:()=>{random();return{};},presentation:()=>({jitter:random()})}});
 const first=copy(prepareQuestMemories(initial.mint,6,factory)),second=copy(prepareQuestMemories(first.random,6,factory));
 const store=new FreshMintStore(freshMintPath.join(process.argv[2],'minted-vocation-handoff.sqlite'));let minted=0,published=0;
 try{
  if(stage==='write-lost')assert.equal(store.commit('quest',0,initial).status,'committed');
  const before=store.read('quest'),host=await DurableMintedVocationQuestOwner.open({contentId:'fresh-vocations',characterKey:'character-1',quests,questKey:questDoneKey,accountWrites:()=>true,authorize:()=>true,mint:scope=>{minted++;return factory(scope);},
   run:{groupKey:'quest',accountKey:'account-a',characters:[{key:'character-1',handle:1+index*8},{key:'character-2',handle:2+index*8}],activeCharacterKey:null,
    createOwner:ports=>new RunCharacterSession({account,character,experience:rules},{conditions:request=>request.command.op==='character-pickup'?{drop:ports.resolveDelivery({accountKey:request.accountKey,profile:request.profile,deliveryId:request.command.command.deliveryId})}:{refundRefusal:null,openAllRealms:false},experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true}),vocation:()=>({maxPerCharacter:2,accountWrites:true})}),
    admitDrop:createCharacterDeliveryCodec(workshop,MEMORY_KINDS),delivery:{admitState:copy,admitPlacement:copy,prepare:()=>assert.fail('Mint obligations escaped their prepared placement'),authorizePickup:()=>true}},
   storage:{read:key=>store.read(key),commit:(key,revision,body)=>{const result=store.commit(key,revision,body);if(stage==='write-lost')throw Error('fresh-mint-ack-lost');return result;}},live:{prepare:()=>({}),publish:()=>{published++;},discard:()=>{},recoverRequired:()=>{}}
  });
  assert.deepEqual(copy(host.read()),before,'Fresh process changed restored mint checkpoint');assert.equal(minted,0);assert.equal(published,0);
  if(stage==='write-lost'){
   await assert.rejects(host.settleTrusted(quests[0].id),/fresh-mint-ack-lost/);assert.equal(host.status,'recovery-required');assert.equal(minted,1);assert.equal(published,0);
   const committed=store.read('quest');assert.deepEqual(committed.body.mint,first.random);assert.deepEqual(committed.body.quests.completed,[quests[0].id]);assert.deepEqual(committed.body.run.group.outbox.rows.map(r=>r.drop),first.drops);
  }else{
   assert.equal((await host.settleTrusted(quests[0].id)).status,'already-completed');assert.equal(minted,0,'Fresh process rerolled completed quest');assert.equal(published,0);
   if(stage==='resume-pickup'){
    assert.deepEqual(before.body.mint,first.random);assert.equal((await host.submit([{kind:'pickup',characterKey:'character-2',deliveryId:1}])).status,'committed');
    assert.deepEqual(copy(host.read()).body.mint,first.random,'Pickup advanced mint stream');
   }else if(stage==='next-quest'){
    assert.equal(before.body.run.group.characters[1].save.workshop.state.items[0].uid,1);assert.deepEqual(before.body.run.group.outbox.rows.map(r=>r.drop),first.drops.slice(1));
    assert.equal((await host.settleTrusted(quests[1].id)).status,'committed');assert.equal(minted,1);const committed=copy(host.read());assert.deepEqual(committed.body.mint,second.random,'Next process reset the mint stream');assert.deepEqual(committed.body.run.group.outbox.rows.slice(-6).map(r=>r.drop),second.drops);assert.deepEqual(committed.body.run.group.outbox.rows.slice(-6).map(r=>r.placement),second.placements);
   }else{
    assert.equal((await host.settleTrusted(quests[1].id)).status,'already-completed');assert.equal(minted,0);assert.deepEqual(before.body.quests,{active:[],completed:quests.map(q=>q.id)});assert.deepEqual(before.body.mint,second.random);assert.deepEqual(before.body.run.group.outbox.rows.map(r=>r.drop),[...first.drops.slice(1),...second.drops]);assert.deepEqual(before.body.run.group.characters[1].save.workshop.state.items[0].mem,first.drops[0].units);
   }
   assert.deepEqual(copy(host.read()),store.read('quest'),'Fresh process checkpoint differs from SQLite');
  }
  console.log(JSON.stringify({passed:true,stage,minted,published,revision:store.read('quest').revision,pendingDeliveries:store.read('quest').body.run.group.outbox.rows.length,storage:'Node SQLite',freshProcess:true,devicePerformanceQualified:false}));
 }finally{store.close();}
}
