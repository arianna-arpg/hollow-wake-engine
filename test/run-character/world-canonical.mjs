import {relicRunWorld} from 'candidate/relic-run-world';
import {SqliteCharacterGroupStore as CanonicalSqliteStore} from '../character-composition/sqlite-character-group-store.mjs';
import canonicalPath from 'node:path';
{
 const sqlite=process.argv[3]==='sqlite-world';
 const codec=new AccountRelicItems(workshop),definitions={...account,relicItems:codec,relicBuilds:true};let courses=0,builds=0;
 for(const mode of ['committed','refused','downed-during-delay','lost-ack','mixed-committed','mixed-refused','mixed-lost-ack']){
  const mixed=mode.startsWith('mixed-'),outcome=mode.replace('mixed-','');
  const actual=relicRunWorld(),original=relicRunWorld(),key='canonical-run-account',make=()=>new RunCharacterSession({account:definitions,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true})});
  let seed=make();ok(seed.command({op:'open-account',account:1,key,seed:17,relicItems:true}));const a=ok(seed.command({op:'account-save',account:1})).save;
  ok(seed.command({op:'close-account',account:1}));Object.assign(a.progression.account,actual.account());a.progression.account.reliquary=codec.encode(actual.relicState());ok(seed.command({op:'restore-account',account:1,save:a}));
  const input=actual.input(character.character.contentId);ok(seed.command({op:'open-workshop',profile:1,account:1,seed:19,nextUid:input.nextUid,state:input.state,character:input.character}));
  ok(seed.command({op:'activate-workshop',account:1,profile:1}));seed.attach({schemaVersion:1,capability:'run-progression/diagnostic',key:'canonical-run',ledger:copy(actual.w.ledger),characters:[{key:'hero',accountKey:key,xp:actual.m.xp,xpNeeded:actual.m.xpNeeded}]},[{key:'hero',profile:1}]);
  let stored=copy({revision:1,body:{schemaVersion:1,capability:'run-character-checkpoint/diagnostic',run:seed.read(),group:{schemaVersion:2,capability:'durable-character-group/located-diagnostic',account:ok(seed.command({op:'account-save',account:1})).save,characters:[{key:'hero',save:ok(seed.command({op:'workshop-save',profile:1})).save}],outbox:{nextId:1,rows:[]},deliveryState:{}}}});seed=undefined;
  const databaseFile=canonicalPath.join(process.argv[2],process.pid+'-canonical-'+mode+'.sqlite');let database;
  try{
  if(sqlite){database=new CanonicalSqliteStore(databaseFile);assert.equal(database.commit(mode,0,stored.body).status,'committed');stored=database.read(mode);}
  assert.deepEqual(copy(codec.decode(stored.body.group.account.progression.account.reliquary)),actual.relicState(),'cold private canonical normalization changed source fixture');
  const amount=Math.ceil([1,2,3,4].reduce((sum,l)=>sum+rules.experienceForLevel(l),0)/reliquaryExperience(actual.w.meta.containers.reliquary,true))+3;
  let release,packet;const logs=[];
  const build=held=>{
   const view=packet.run.readBuild(held),source=actual.projection();
   assert.equal(view.character.level,actual.p.level);assert.deepEqual(copy(view.projection.attrs),source.attrs);
   assert.deepEqual(copy(view.projection.grants),source.grants,'worn skill grants diverged during canonical XP');
   assert.deepEqual(copy(view.projection.companions),source.companions,'canonical companion declaration diverged during XP');
   for(const[id,mods]of view.projection.sources)assert.deepEqual(copy(mods),source.sources.find(r=>r[0]===id)?.[1]??[],'canonical XP source mismatch: '+id);
   assert.deepEqual(copy(view.state.equipped),source.equipped,'worn investment diverged during XP');builds++;
  };
  const host=await DurableRunOwner.open({groupKey:'canonical-xp-'+mode,accountKey:key,characters:[{key:'hero',handle:1}],activeCharacterKey:'hero',createOwner:make,
   storage:{read:()=>database?database.read(mode):copy(stored),commit:async(_key,revision,body)=>{await new Promise(resolve=>{release=resolve;});if(outcome==='refused')return{status:'refused'};
    if(database){assert.equal(database.commit(mode,revision,body).status,'committed');stored=database.read(mode);}else stored={revision:revision+1,body:copy(body)};
    if(outcome==='lost-ack')throw Error('canonical-xp-ack-lost');return{status:'committed',revision:stored.revision};}},
   admitDrop:()=>assert.fail('Unexpected drop'),delivery:{admitState:v=>copy(v),admitPlacement:()=>assert.fail('Unexpected placement'),prepare:()=>assert.fail('Unexpected delivery'),authorizePickup:()=>false},
   live:{prepare:p=>{packet=p;for(const row of p.run.journal)if(row.experience)assert.equal(row.character.transitions.length,row.experience.events.filter(e=>e.kind==='recalculate').length,'canonical XP added an unaccounted normalization rebuild');return{};},
    publish:()=>{
     for(const row of packet.run.journal){
      if(row.experience){let index=0;new ExperiencePlanEffects(actual.experiencePorts(()=>build(row.character.transitions[index++].after))).play(row.experience);assert.equal(index,row.character.transitions.length);}
      else if(row.character.command.op==='account'){
       assert.equal(row.character.accounts.length,1);const change=row.character.accounts[0],before=copy(codec.decode(change.before.save.progression.account.reliquary)),after=copy(codec.decode(change.after.save.progression.account.reliquary));
       assert.deepEqual(actual.relicState(),before,'canonical account was published ahead of its command');assert.deepEqual({...before,enabled:after.enabled},after,'course supports enabled-state changes only');
       // This diagnostic binds an already trusted account edit to the original
       // host's toggle completion; it does not expose raw account replacement
       // as player authorization or claim a new UI admission surface.
       assert.equal(actual.w.reliquaryRefusal(actual.s),null);actual.w.reliquaryToggle(actual.s,after.enabled);assert.deepEqual(actual.relicState(),after);
       assert.equal(row.character.transitions.length,1);build(row.character.transitions[0].after);
      }else{
       const ports=actual.effectPorts(index=>packet.run.readBuild(row.character.transitions[index].after).character.passives),rebuild=ports.rebuild;
       ports.rebuild=index=>{rebuild(index);build(row.character.transitions[index].after);};new CharacterPassiveEffects(ports).play(row.character.reply.reply.events);
      }
     }
     logs.push('publish');
    },discard:()=>{logs.push('discard');},recoverRequired:()=>{logs.push('recovery');}}
  });
  const xp=amount=>({kind:'experience',characterKey:'hero',amount}),toggle=enabled=>({kind:'account',command:{op:'relic-items',state:{...actual.relicState(),enabled}}});
  const before=actual.snapshot(),beforeSave=copy(stored),actions=[xp(amount),...(mixed?[toggle(false),xp(5),toggle(true),xp(Math.ceil(rules.experienceForLevel(5)/reliquaryExperience(actual.w.meta.containers.reliquary,true)))]:[]),{kind:'character',characterKey:'hero',command:{op:'character-passive',command:{op:'allocate',nodeId:node.id}}},xp(3)],pending=host.submitTrusted(actions);
  assert(release);assert.deepEqual(actual.snapshot(),before);actual.advance();original.advance();if(mode==='downed-during-delay')for(const f of [actual,original]){f.p.downed=true;f.p.life=0;}
  const delayed=actual.snapshot();actual.events.length=0;original.events.length=0;actual.relicEvents.length=0;original.relicEvents.length=0;release();
  if(outcome==='refused'){assert.equal((await pending).status,'refused');assert.deepEqual(actual.snapshot(),delayed);assert.deepEqual(stored,beforeSave);assert.deepEqual(logs,['discard']);}
  else if(outcome==='lost-ack'){await assert.rejects(pending,/canonical-xp-ack-lost/);assert.equal(host.status,'recovery-required');assert.deepEqual(actual.snapshot(),delayed);assert.deepEqual(logs,['recovery']);assert.equal(stored.revision,2);}
  else{
   assert.equal((await pending).status,'committed');for(const action of actions){if(action.kind==='experience')original.w.grantXp(action.amount);else if(action.kind==='account')original.w.reliquaryToggle(original.s,action.command.state.enabled);else assert.equal(original.original({op:'allocate',nodeId:node.id}),true);}
   assert.deepEqual(actual.events,original.events,'canonical XP original callback trace diverged');assert.deepEqual(actual.relicEvents,original.relicEvents,'canonical companion/gear callback trace diverged');assert.deepEqual(actual.snapshot(),original.snapshot());
   assert.equal(actual.p.level,mixed?6:5);if(!mixed)assert(actual.snapshot().companion.sameBody&&actual.snapshot().companion.sameInst,'level-up replaced live companion identity');
   assert.deepEqual(copy(codec.decode(stored.body.group.account.progression.account.reliquary)),actual.relicState());assert.deepEqual(copy(host.read()),stored);
  }
  courses++;
  }finally{database?.close();}
 }
 console.log({passed:true,canonicalCheckpointCourses:courses,privateBuildsCompared:builds,realCompanionLeveling:true,wornSkillGrants:true,physicalStore:sqlite?'Node SQLite':false,mixedCanonicalChanges:true,trustedToggleOnly:true,fullRelicPlayerAdmission:false});
}
