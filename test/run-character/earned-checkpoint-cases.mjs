import {SqliteCharacterGroupStore as RewardStore} from '../character-composition/sqlite-character-group-store.mjs';import rewardPath from 'node:path';
{
 const seed=setup(),saved=seed.all(),body={schemaVersion:1,capability:'run-character-checkpoint/diagnostic',run:copy(saved.run),group:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:copy(saved.account.save),characters:saved.saves.map((r,n)=>({key:'character-'+(n+1),save:copy(r.save)})),outbox:{nextId:1,rows:[]},deliveryState:{seed:1}}};let courses=0,reconnects=0;
 for(const mode of ['committed','refused','conflict','lost-ack','publication-failure']){
  const store=new RewardStore(rewardPath.join(process.argv[2],process.pid+'-quest-points-'+mode+'.sqlite'));assert.equal(store.commit('rewards',0,body).status,'committed');
  try{
   let release,published=0,recovery=0,discarded=0;
   const make=()=>new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true})});
   const options={groupKey:'rewards',accountKey:'account-a',characters:[{key:'character-1',handle:1},{key:'character-2',handle:2}],activeCharacterKey:null,createOwner:make,
    storage:{read:key=>store.read(key),commit:async(key,revision,candidate)=>{await new Promise(r=>{release=r;});if(mode==='refused'||mode==='conflict')return{status:mode};const committed=store.commit(key,revision,candidate);assert.equal(committed.status,'committed');if(mode==='lost-ack')throw Error('reward-ack-lost');return committed;}},
    admitDrop:v=>copy(v),delivery:{admitState:v=>copy(v),admitPlacement:v=>copy(v),prepare:()=>assert.fail('Unexpected delivery'),authorizePickup:()=>false},
    live:{prepare:packet=>({packet}),publish:()=>{published++;if(mode==='publication-failure')throw Error('reward-publication-failed');},discard:()=>{discarded++;},recoverRequired:()=>{recovery++;}}
   };
   const host=await DurableRunOwner.open(options),before=copy(host.read()),a=before.body.group.account.progression.account;
   const actions=[{kind:'points',characterKey:'character-1',currency:'passive',amount:2},{kind:'points',characterKey:'character-1',currency:'vocation',amount:3},{kind:'run-ledger',characterKey:'character-1',key:'quest_done:test',amount:1},
    {kind:'account',command:{op:'observe',level:a.level,credits:a.credits,roster:a.roster,ledger:{...a.ledger,'quest_done:test':1}}},{kind:'experience',characterKey:'character-1',amount:45}];
   const pending=host.submitTrusted(actions);assert(release);assert.equal(host.status,'pending');assert.deepEqual(copy(host.read()),before,'Quest reward visible before checkpoint acknowledgement');assert.deepEqual(store.read('rewards'),before);assert.equal(published,0);
   await assert.rejects(()=>host.submitTrusted([{kind:'points',characterKey:'character-2',currency:'passive',amount:1}]),/run-checkpoint-not-ready/);release();
   if(mode==='lost-ack'||mode==='publication-failure'){await assert.rejects(pending,/reward-/);assert.equal(host.status,'recovery-required');assert.equal(recovery,1);}
   else{assert.equal((await pending).status,mode);if(mode==='refused'){assert.deepEqual(copy(host.read()),before);assert.equal(discarded,1);}else if(mode==='conflict'){assert.equal(host.status,'recovery-required');assert.equal(recovery,1);}else assert.equal(published,1);}
   const expected=mode==='refused'||mode==='conflict'?0:1,stored=store.read('rewards'),p=stored.body.group.characters[0].save.character.passives;
   assert.equal(p.passivePoints,expected*(2+rules.pack.tuning.passivePointsPerLevel),'Checkpoint lost earned passive points');assert.equal(p.vocationPoints,expected*3,'Checkpoint lost earned vocation points');assert.equal(stored.body.run.ledger['quest_done:test']??0,expected,'Checkpoint lost earned run counter');assert.equal(stored.body.group.account.progression.account.ledger['quest_done:test']??0,expected,'Checkpoint split account and run counters');
   const reconnect=await DurableRunOwner.open({...options,characters:[{key:'character-1',handle:7},{key:'character-2',handle:9}],storage:{read:key=>store.read(key),commit:(key,revision,candidate)=>store.commit(key,revision,candidate)},live:{prepare:packet=>({packet}),publish:()=>{},discard:()=>{},recoverRequired:()=>assert.fail('Unexpected recovery')}});
   assert.deepEqual(copy(reconnect.read()),stored,'Fresh handle reconnect changed reward investment');const result=await reconnect.submitTrusted([{kind:'points',characterKey:'character-2',currency:'passive',amount:4}]);assert.equal(result.status,'committed');assert.equal(reconnect.read().body.group.characters[1].save.character.passives.passivePoints,4);assert.deepEqual(copy(reconnect.read().body.group.characters[0]),stored.body.group.characters[0]);reconnects++;courses++;
  }finally{store.close();}
 }
 console.log({passed:true,questProgressionCheckpointCourses:courses,reconnects,physicalStore:'Node SQLite',fullQuestPayout:false,owedLoot:false});
}
