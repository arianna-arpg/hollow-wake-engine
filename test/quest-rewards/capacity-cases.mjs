import {Random} from '../../src/random.js';
import {DurableMintedVocationQuestOwner} from 'candidate/minted-vocation-quest-owner';
import {createCharacterDeliveryCodec} from 'candidate/delivery-codec';
import {SqliteCharacterGroupStore as CapacityStore} from '../character-composition/sqlite-character-group-store.mjs';
import capacityPath from 'node:path';
import {vocationQuestDefs} from 'host/quest-content';
import {questDoneKey} from 'host/quest-content';
{
 const source=vocationQuestDefs().find(q=>q.reward.grantVocation),quest={id:source.id,offerLabel:source.offerLabel,vocation:source.vocation,reward:copy(source.reward)},seed=setup().all(),results=[];
 for(const mode of ['xp-milestone','completion-stamp']){
  const store=new CapacityStore(capacityPath.join(process.argv[2],process.argv[3]+'-'+mode+'.sqlite'));
  try{
   const ledger={['vocation_unlocked_'+quest.reward.grantVocation]:0,...Object.fromEntries(Object.keys(quest.reward.ledger??{}).map(key=>[key,0]))};
   if(mode==='xp-milestone')ledger[questDoneKey(quest.id)]=0;
   else for(const row of [...rules.pack.milestones,...rules.classMilestones('warrior')])ledger[row.key]=1;
   for(let i=0;Object.keys(ledger).length<4096;i++)ledger['filler-'+i]=0;
   const initial={schemaVersion:2,capability:'minted-vocation-quest-checkpoint/diagnostic',contentId:'capacity-vocation',mint:new Random(0x773211).snapshot(),quests:{active:[{questId:quest.id,zoneId:'quest-zone',fieldDone:true}],completed:[]},run:{schemaVersion:1,capability:'run-character-checkpoint/diagnostic',run:{...copy(seed.run),ledger},group:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:copy(seed.account.save),characters:seed.saves.map((r,n)=>({key:'character-'+(n+1),save:copy(r.save)})),outbox:{nextId:1,rows:[]},deliveryState:{seed:1}}}};
   assert.equal(store.commit('quest',0,initial).status,'committed');let minted=0,prepared=0,writes=0,published=0;
   const options={contentId:initial.contentId,characterKey:'character-1',quests:[quest],questKey:questDoneKey,accountWrites:()=>true,authorize:()=>true,mint:({random})=>{minted++;return{worldKey:'quest-zone',at:{x:3,y:4},services:{clamp:p=>p,floor:()=>undefined,level:()=>1,tileset:()=>undefined,config:()=>({skillShare:1,memoryShare:1,preformedShare:.16,foundProvenance:'found'}),rollSkill:()=>{random();random();return{};},rollSupport:()=>null,presentation:(at,kind)=>({at,jitter:random(),kind})}};},
    run:{groupKey:'quest',accountKey:'account-a',characters:[{key:'character-1',handle:1},{key:'character-2',handle:2}],activeCharacterKey:null,createOwner:()=>new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true}),vocation:()=>({maxPerCharacter:2,accountWrites:true})}),admitDrop:createCharacterDeliveryCodec(workshop,MEMORY_KINDS),delivery:{admitState:copy,admitPlacement:copy,prepare:()=>assert.fail('Unexpected delivery placement'),authorizePickup:()=>false}},
    storage:{read:key=>store.read(key),commit:()=>{writes++;assert.fail('Rejected quest reached storage');}},live:{prepare:()=>{prepared++;return{};},publish:()=>{published++;},discard:()=>{},recoverRequired:()=>{}}
   };
   const owner=await DurableMintedVocationQuestOwner.open(options),before=copy(owner.read());
   for(let attempt=1;attempt<=2;attempt++){
    await assert.rejects(owner.settleTrusted(quest.id),/run-ledger-limit/,'Quest ignored run capacity');assert.equal(minted,attempt,'Capacity failure did not exercise prepared mint');assert.equal(owner.status,'ready');assert.deepEqual(copy(owner.read()),before,'Rejected quest advanced mint checkpoint');assert.deepEqual(store.read('quest'),before,'Rejected quest wrote a partial checkpoint');
   }
   assert.equal(prepared,0);assert.equal(writes,0);assert.equal(published,0);
   const restored=await DurableMintedVocationQuestOwner.open({...options,run:{...options.run,characters:[{key:'character-1',handle:7},{key:'character-2',handle:9}]}});assert.deepEqual(copy(restored.read()),before);
   results.push({mode,attempts:2,minted,prepared,writes,published,restored:true});
  }finally{store.close();}
 }
 console.log(JSON.stringify({passed:true,questOwnerScenarios:results.length,results,storage:'Node SQLite',postMintFailureAtomic:true,devicePerformanceQualified:false}));
}
