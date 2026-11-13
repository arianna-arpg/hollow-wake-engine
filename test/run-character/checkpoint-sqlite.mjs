import {DurableRunOwner} from 'candidate/durable-run-owner';
import {SqliteCharacterGroupStore} from '../character-composition/sqlite-character-group-store.mjs';
import {DatabaseSync} from 'node:sqlite';
{
 const file=process.argv[2],phase=process.argv[3];assert(file&&['create','recover','rollback','inspect'].includes(phase));
 const store=new SqliteCharacterGroupStore(file),key='owned-run-checkpoint',version=store.version(),seed=setup(),saved=seed.all();let other,sql;
 const initial={account:{key:'account-a',seed:51,state:copy(saved.account.save.progression.account),craftLore:copy(saved.account.save.craftLore),extra:copy(saved.account.save.extra)},
  characters:saved.saves.map((r,n)=>({key:'character-'+(n+1),start:{seed:71+n,state:copy(r.save.workshop.state),nextUid:r.save.workshop.nextUid,character:copy(r.save.character),progression:r.save.progression}})),deliveryState:{seed:49}};
 const open=async(database,handles=[7,9],fault={lose:false})=>{
  const events=[];const owner=await DurableRunOwner.open({groupKey:key,accountKey:'account-a',characters:handles.map((handle,n)=>({key:'character-'+(n+1),handle})),activeCharacterKey:null,initial,initialRun:copy(saved.run),
   createOwner:()=>new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true})}),
   storage:{read:k=>database.read(k),commit:(k,revision,body)=>{const result=database.commit(k,revision,body);if(fault.lose&&result.status==='committed')throw Error('lost-sqlite-run-ack');return result;}},
   admitDrop:v=>copy(v),delivery:{admitState:v=>copy(v),admitPlacement:v=>copy(v),prepare:()=>assert.fail('Unexpected delivery'),authorizePickup:()=>false},
   live:{prepare:packet=>({packet}),publish:(_lease,packet)=>{events.push(packet);},discard:()=>{},recoverRequired:()=>{}}
  });return{owner,events};
 };
 const xp=amount=>[{kind:'experience',characterKey:'character-1',amount}];
 try{
  if(phase==='create'){
   assert.equal(store.read(key),null);const fault={lose:false},f=await open(store,[1,2],fault);assert.equal(f.owner.read().revision,1);
   await f.owner.submitTrusted([...xp(45),{kind:'character',characterKey:'character-1',command:{op:'character-passive',command:{op:'allocate',nodeId:node.id}}},...xp(3)]);
   assert.equal(store.read(key).revision,2);assert.equal(store.read(key).body.run.characters[0].xp,3,'SQLite checkpoint omitted prepared run XP');
   fault.lose=true;await assert.rejects(()=>f.owner.submitTrusted(xp(5)),/lost-sqlite-run-ack/);assert.equal(f.owner.status,'recovery-required');assert.throws(()=>f.owner.read(),/recovery-required/);
   assert.equal(store.read(key).revision,3);assert.equal(store.read(key).body.run.characters[0].xp,8);assert.equal(f.events.length,1,'lost acknowledgement published live effects');
  }else if(phase==='recover'){
   assert.equal(store.read(key).revision,3);const f=await open(store);assert.equal(f.events.length,0,'fresh process replayed XP effects');
   const snapshot=f.owner.read();assert.equal(snapshot.body.run.characters[0].xp,8);assert.equal(snapshot.body.group.characters[0].save.character.level,2);
   assert.equal(snapshot.body.group.characters[0].save.character.passives.passivePoints,0);assert(snapshot.body.group.characters[0].save.character.passives.allocated.includes(node.id));
   assert.equal(snapshot.body.run.characters[0].xpNeeded,rules.experienceForLevel(2));
   other=new SqliteCharacterGroupStore(file);const rival=await open(other,[17,19]);await f.owner.submitTrusted(xp(2));assert.equal(store.read(key).revision,4);
   const refused=await rival.owner.submitTrusted(xp(3));assert.equal(refused.status,'conflict');assert.equal(rival.owner.status,'recovery-required');assert.equal(rival.events.length,0);
   assert.equal(store.read(key).body.run.characters[0].xp,10);assert.equal(other.read(key).revision,4);
  }else if(phase==='rollback'){
   const before=store.read(key),f=await open(store,[27,29]);assert.equal(before.revision,4);sql=new DatabaseSync(file);
   sql.exec("CREATE TRIGGER reject_owned_run_checkpoint BEFORE UPDATE ON character_groups BEGIN SELECT RAISE(ABORT, 'injected-run-rollback'); END;");
   await assert.rejects(()=>f.owner.submitTrusted(xp(3)),/injected-run-rollback/);assert.equal(f.owner.status,'recovery-required');assert.equal(f.events.length,0);assert.deepEqual(store.read(key),before,'SQLite rollback changed one part of checkpoint');
   sql.exec('DROP TRIGGER reject_owned_run_checkpoint;');
  }else{
   const f=await open(store,[37,39]),final=f.owner.read();assert.equal(final.revision,4);assert.equal(final.body.run.characters[0].xp,10);assert.equal(final.body.group.characters[0].save.character.level,2);assert.equal(f.events.length,0);
   assert.deepEqual(copy(final.body.group.deliveryState),{seed:49});
  }
  console.log({passed:true,phase,sqlite:version,revision:store.read(key).revision,physicalStore:'Node SQLite',physicalDevicePerformanceQualified:false});
 }finally{sql?.close();other?.close();store.close();}
}
