import {liveRunPublication} from 'candidate/live-run-publication';
import {SqliteCharacterGroupStore} from '../character-composition/sqlite-character-group-store.mjs';
import path from 'node:path';
{
 const sqlite=process.argv[3]==='sqlite-world';
 const amount=[1,2,3,4].reduce((sum,l)=>sum+rules.experienceForLevel(l),0),accountKey='live-run-account';
 const actions=[{kind:'experience',characterKey:'hero',amount},{kind:'character',characterKey:'hero',command:{op:'character-passive',command:{op:'allocate',nodeId:node.id}}},{kind:'experience',characterKey:'hero',amount:3}];
 const modes=['committed','refused','downed-during-delay','revived-during-delay','stale-investment','stale-base-attributes','retired','replaced-hero','controlled-body-changed','lost-ack','partial-publication','prepare-failure','discard-failure'];
 let courses=0,reconnects=0,privateBuilds=0;
 const makeOwner=()=>new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true})});
 for(const mode of modes){
  const actual=liveRunWorld(),original=liveRunWorld();let seed=makeOwner();
  if(mode==='revived-during-delay')for(const f of [actual,original]){f.p.downed=true;f.p.life=0;}
  ok(seed.command({op:'open-account',account:1,key:accountKey,seed:17}));const a=ok(seed.command({op:'account-save',account:1})).save;
  ok(seed.command({op:'close-account',account:1}));Object.assign(a.progression.account,actual.account());ok(seed.command({op:'restore-account',account:1,save:a}));
  const input=actual.input(character.character.contentId);ok(seed.command({op:'open-workshop',profile:1,account:1,seed:19,nextUid:input.nextUid,state:input.state,character:input.character}));
  seed.attach({schemaVersion:1,capability:'run-progression/diagnostic',key:'live-run',ledger:copy(actual.w.ledger),characters:[{key:'hero',accountKey,xp:actual.m.xp,xpNeeded:actual.m.xpNeeded}]},[{key:'hero',profile:1}]);
  let stored=copy({revision:1,body:{schemaVersion:1,capability:'run-character-checkpoint/diagnostic',run:seed.read(),group:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:ok(seed.command({op:'account-save',account:1})).save,characters:[{key:'hero',save:ok(seed.command({op:'workshop-save',profile:1})).save}],outbox:{nextId:1,rows:[]},deliveryState:{}}}});seed=undefined;
  const databaseFile=path.join(process.argv[2],process.pid+'-world-'+mode+'.sqlite');let database;
  try{
  if(sqlite){database=new SqliteCharacterGroupStore(databaseFile);assert.equal(database.commit(mode,0,stored.body).status,'committed');stored=database.read(mode);}
  const control={delay:true,mode},lifetime={current:true};let release,packet,held,foreignHandle,commits=0;
  const storage={read:()=>database?database.read(mode):copy(stored),commit:async(_key,revision,body)=>{
   commits++;assert.equal(revision,stored.revision);if(control.delay)await new Promise(resolve=>{release=resolve;});
   if(control.mode==='refused'||control.mode==='discard-failure')return{status:'refused'};
   if(database){assert.equal(database.commit(mode,revision,body).status,'committed');stored=database.read(mode);}else stored={revision:revision+1,body:copy(body)};
   if(control.mode==='lost-ack')throw Error('run-world-ack-lost');return{status:'committed',revision:stored.revision};
  }};
  async function open(f,handle=1){
   const binding=liveRunPublication(f,{isCurrent:()=>lifetime.current,handle,accountKey,contentId:character.character.contentId,afterRebuild:()=>{if(control.mode==='partial-publication')throw Error('run-world-after-first-rebuild');}});
   const host=await DurableRunOwner.open({groupKey:'run-world-'+mode,accountKey,characters:[{key:'hero',handle}],activeCharacterKey:null,createOwner:makeOwner,storage,
    admitDrop:()=>assert.fail('Unexpected drop'),delivery:{admitState:v=>copy(v),admitPlacement:()=>assert.fail('Unexpected placement'),prepare:()=>assert.fail('Unexpected delivery'),authorizePickup:()=>false},
    live:{...binding.live,prepare:p=>{
     packet=p;const lease=binding.live.prepare(p);held=p.run.journal.flatMap(r=>r.character.transitions).find(s=>s.after)?.after;
     assert.throws(()=>p.run.readBuild({}),/foreign/i,'foreign build capability was accepted');
     if(foreignHandle)assert.throws(()=>p.run.readBuild(foreignHandle),/foreign-run-build/,'previous lease build escaped its scope');
     if(held){const expected=p.run.readBuild(held),edit=p.run.readBuild(held);edit.character.level=999;edit.character.passives.allocated.length=0;assert.deepEqual(p.run.readBuild(held),expected,'build view leaked mutable state');}
     if(control.mode==='prepare-failure')throw Error('run-world-prepare-failed');return lease;
    },discard:lease=>{binding.live.discard(lease);if(control.mode==='discard-failure')throw Error('run-world-discard-failed');}}
   });return{host,binding};
  }
  const {host,binding}=await open(actual),before=actual.snapshot(),saveBefore=copy(stored),task=host.submitTrusted(actions),originalPacket=packet,originalHeld=held;
  if(mode==='prepare-failure'){
   await assert.rejects(task,/run-world-prepare-failed/);assert.equal(commits,0);assert.equal(host.status,'ready');assert.deepEqual(stored,saveBefore);assert.deepEqual(actual.snapshot(),before);
   assert.throws(()=>packet.run.readBuild(held),/run-build-view-expired/,'failed preparation retained its build capability');courses++;continue;
  }
  assert(release);assert.equal(host.status,'pending');assert.deepEqual(actual.snapshot(),before,'pending checkpoint touched World');assert.deepEqual(copy(host.read()),saveBefore);
  actual.advance();original.advance();
  if(mode==='downed-during-delay')for(const f of [actual,original]){f.p.downed=true;f.p.life=0;}
  if(mode==='revived-during-delay')for(const f of [actual,original]){f.p.downed=false;f.p.life=10;}
  if(mode==='stale-investment'){actual.m.passivePoints++;original.m.passivePoints++;}
  if(mode==='stale-base-attributes'){actual.m.baseAttrs.fortitude++;original.m.baseAttrs.fortitude++;}
  if(mode==='retired')lifetime.current=false;
  if(mode==='replaced-hero')actual.s.actor=original.p;
  if(mode==='controlled-body-changed')for(const f of [actual,original]){f.s.home=f.p;f.s.actor=f.firstBody;}
  const delayed=actual.snapshot();actual.events.length=0;original.events.length=0;release();
  if(['committed','downed-during-delay','revived-during-delay','controlled-body-changed'].includes(mode)){
   assert.equal((await task).status,'committed');original.w.grantXp(amount);assert.equal(original.original({op:'allocate',nodeId:node.id}),true);original.w.grantXp(3);
   assert.deepEqual(actual.events,original.events,'checkpoint World callback trace mismatch: '+mode);assert.deepEqual(actual.snapshot(),original.snapshot(),'checkpoint World final state mismatch: '+mode);
   assert.deepEqual(copy(host.read()),copy(stored));assert.equal(host.status,'ready');assert.deepEqual(binding.log,['prepare','publish']);privateBuilds+=binding.builds();
   if(mode==='committed'){
    foreignHandle=originalHeld;control.delay=false;assert.equal((await host.submitTrusted([{kind:'experience',characterKey:'hero',amount:2}])).status,'committed');original.w.grantXp(2);
    assert.deepEqual(actual.events,original.events);assert.deepEqual(actual.snapshot(),original.snapshot());
   }
  }else if(mode==='refused'){
   assert.equal((await task).status,'refused');assert.equal(host.status,'ready');assert.deepEqual(stored,saveBefore);assert.deepEqual(actual.snapshot(),delayed);assert.equal(actual.events.length,0);assert.deepEqual(binding.log,['prepare','discard']);
  }else{
   const message=mode==='lost-ack'?/run-world-ack-lost/:mode==='partial-publication'?/run-world-after-first-rebuild/:mode.startsWith('stale-')?/run-world-stale-investment/:mode==='discard-failure'?/run-world-discard-failed/:/run-world-expired/;
   await assert.rejects(task,message);assert.equal(host.status,'recovery-required');assert.throws(()=>host.read(),/character-recovery-required/);
   assert.equal(stored.revision,saveBefore.revision+(mode==='discard-failure'?0:1));
   if(mode==='partial-publication'){assert.equal(actual.p.level,2);assert.equal(actual.events.filter(e=>e.name==='recalcSeat'&&e.phase==='after').length,1);assert(!actual.passives().allocated.includes(node.id));}
   else{assert.deepEqual(actual.snapshot(),delayed);assert.equal(actual.events.length,0);}
   // Only investment recovery is qualified: restore/recalculate without replay
   // of level-up healing, announcements, XP awards or passive action effects.
   if(database){database.close();database=undefined;database=new SqliteCharacterGroupStore(databaseFile);assert.deepEqual(database.read(mode),stored);}
   const fresh=liveRunWorld(),saved=stored.body.group.characters[0].save.character;
   fresh.p.level=saved.level;fresh.m.xp=stored.body.run.characters[0].xp;fresh.m.xpNeeded=stored.body.run.characters[0].xpNeeded;fresh.w.ledger=copy(stored.body.run.ledger);
   fresh.effectPorts(()=>copy(saved.passives)).rebuild(0);fresh.events.length=0;
   lifetime.current=true;control.delay=false;control.mode='committed';const next=await open(fresh,7);
   assert.equal(fresh.events.length,0);assert.deepEqual(next.binding.log,[]);assert.deepEqual(copy(next.host.read()),copy(stored));const xp=fresh.m.xp;
   assert.equal((await next.host.submitTrusted([{kind:'experience',characterKey:'hero',amount:2}])).status,'committed');assert.equal(fresh.m.xp,xp+2);assert.equal(fresh.p.level,saved.level);
   assert(fresh.events.every(e=>e.name==='markMetaDirty'),'reconnect replayed level-up effects');reconnects++;
  }
  // Reconnect may have supplied another packet. Check the original lease too.
  assert.throws(()=>originalPacket.run.readBuild(originalHeld),/run-build-view-expired/,'finished checkpoint retained its build capability');courses++;
  }finally{database?.close();}
 }
 console.log({passed:true,checkpointWorldCourses:courses,investmentReconnects:reconnects,privateBuildsCompared:privateBuilds,scopedBuildViews:true,currentCombatState:true,controlledBodyChangeQualified:true,physicalStore:sqlite?'Node SQLite':false,fullActorRecovery:false,canonicalRelicLevelUpPublication:false});
}
