{
 const base=character.builds;let calls=0;character.builds={contentId:base.contentId,...Object.fromEntries(['open','adopt','read','stat','canSocket','lineages','investment'].map(k=>[k,base[k].bind(base)])),rebuild:(...args)=>{calls++;return base.rebuild(...args);}};
 const point=(currency,amount,profile=1)=>({kind:'points',profile,currency,amount}),ledger=(key,amount)=>({kind:'run-ledger',key,amount});let rewardCases=0;
 {
  const f=setup(),before=f.all();calls=0;const p=ok(f.owner.prepareTrusted([point('passive',2),point('vocation',3),ledger('quests_completed',1)])),pending=f.owner.prepared(p.token);
  assert.equal(calls,0,'Earned point currency rebuilt combat investment');assert.deepEqual(f.all(),before,'Prepared reward leaked');assert.equal(pending.state.ledger.quests_completed,1,'Earned run counter was lost');
  const first=pending.journal[0].character,second=pending.journal[1].character;assert.equal(first.transitions.length,1,'Earned passive points were lost');assert.equal(second.transitions.length,1,'Earned vocation points were lost');
  assert.equal(f.owner.build(first.transitions[0].after).character.passives.passivePoints,2,'Earned passive points were lost');assert.equal(f.owner.build(second.transitions[0].after).character.passives.vocationPoints,3,'Earned vocation points were lost');
  assert.deepEqual(f.owner.build(first.transitions[0].before).projection,f.owner.build(second.transitions[0].after).projection,'Currency altered the combat projection');assert.equal(pending.journal[2].character.transitions.length,0);
  assert.deepEqual(copy(p.writes),[{kind:'workshop',handle:1}]);ok(f.owner.command({op:'commit-prepared',token:p.token}));assert.equal(f.saves()[0].save.character.passives.passivePoints,2);assert.equal(f.saves()[0].save.character.passives.vocationPoints,3);assert.deepEqual(f.saves()[1],before.saves[1]);assert.deepEqual(f.all().account,before.account);rewardCases++;
 }
 {
  const f=setup(),p=ok(f.owner.prepareTrusted([point('passive',2),command(1,{op:'allocate',nodeId:node.id}),award(45),point('vocation',1),ledger('quest_done:one',1)])),pending=f.owner.prepared(p.token);
  assert.equal(pending.journal[1].character.reply.reply.accepted,true,'Earned points unavailable to same-batch spending');assert.equal(pending.journal[2].experience.before.passivePoints,2-policy.pack.pickCost);
  ok(f.owner.command({op:'commit-prepared',token:p.token}));assert.equal(f.saves()[0].save.character.passives.passivePoints,2-policy.pack.pickCost+rules.pack.tuning.passivePointsPerLevel);assert.equal(f.owner.read().ledger['quest_done:one'],1);rewardCases++;
 }
 {
  const f=setup(),before=f.all(),p=ok(f.owner.prepareTrusted([point('passive',5),ledger('quest_done:abort',1)]));ok(f.owner.command({op:'abort-prepared',token:p.token}));assert.deepEqual(f.all(),before);
  assert.throws(()=>f.owner.prepareTrusted([point('vocation',6),ledger('quest_done:failure',1),command(1,{op:'allocate',nodeId:node.id,invalid:true})]));assert.deepEqual(f.all(),before,'Late admission failure published reward');
  const next=ok(f.owner.prepareTrusted([point('vocation',2)]));ok(f.owner.command({op:'commit-prepared',token:next.token}));assert.equal(f.saves()[0].save.character.passives.vocationPoints,2);rewardCases++;
 }
 {
  const f=setup(),before=f.all();for(const raw of [{op:'run-points',profile:1,grant:1},{op:'run-ledger',grant:1},{op:'workshop',profile:1,command:{op:'character-point-grant',grant:1}}]){
   assert.equal(f.owner.command(raw).ok,false);assert.equal(f.owner.command({op:'prepare',commands:[raw]}).ok,false);assert.throws(()=>f.owner.prepareTrusted([{kind:'command',command:raw}]));
  }
  for(const bad of [point('passive',-1),point('vocation',0.5),point('forged',1),point('passive',1,999),{...point('passive',1),granted:true},ledger('x',NaN),ledger('',1),ledger('x',-1)])assert.throws(()=>f.owner.prepareTrusted([bad]));assert.deepEqual(f.all(),before);rewardCases++;
 }
 {
  const f=setup(),p=ok(f.owner.prepareTrusted([ledger('__proto__',2),ledger('constructor',3),ledger('toString',4),ledger('__proto__',1)]));ok(f.owner.command({op:'commit-prepared',token:p.token}));for(const[key,count]of [['__proto__',3],['constructor',3],['toString',4]]){assert(Object.hasOwn(f.owner.read().ledger,key));assert.equal(f.owner.read().ledger[key],count);}rewardCases++;
 }
 {
  const f=setup(),p=ok(f.owner.prepareTrusted([point('passive',2,1),point('passive',4,2),point('vocation',3,2)]));ok(f.owner.command({op:'commit-prepared',token:p.token}));assert.equal(f.saves()[0].save.character.passives.passivePoints,2);assert.equal(f.saves()[1].save.character.passives.passivePoints,4);assert.equal(f.saves()[1].save.character.passives.vocationPoints,3);rewardCases++;
 }
 {
  const f=setup(),before=f.all(),p=ok(f.owner.prepareTrusted([point('passive',2)]));assert.throws(()=>f.owner.prepareTrusted([point('vocation',1)]),/prepared-change-pending/);assert.deepEqual(f.all(),before);ok(f.owner.command({op:'abort-prepared',token:p.token}));assert.deepEqual(f.all(),before);rewardCases++;
 }
 {
  const f=setup(),p=ok(f.owner.prepareTrusted([point('passive',Number.MAX_SAFE_INTEGER),ledger('max',Number.MAX_SAFE_INTEGER)]));ok(f.owner.command({op:'commit-prepared',token:p.token}));const before=f.all();for(const a of [point('passive',1),ledger('max',1)])assert.throws(()=>f.owner.prepareTrusted([a]),/invalid-integer/);assert.deepEqual(f.all(),before);rewardCases++;
 }
 {
  const seed=setup(),stored=seed.all(),bounded=new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true})});
  ok(bounded.command({op:'restore-account',account:1,save:stored.account.save}));for(const profile of [1,2])ok(bounded.command({op:'restore-workshop',profile,account:1,save:stored.saves[profile-1].save}));
  const full=Object.fromEntries(Array.from({length:4096},(_,n)=>['counter-'+n,0]));bounded.attach({...copy(stored.run),ledger:full},[{profile:1,key:'character-1'},{profile:2,key:'character-2'}]);
  assert.throws(()=>bounded.prepareTrusted([ledger('extra',1)]),/run-ledger-limit/,'Reward exceeded bounded run ledger');const p=ok(bounded.prepareTrusted([ledger('counter-0',1)]));ok(bounded.command({op:'commit-prepared',token:p.token}));assert.equal(bounded.read().ledger['counter-0'],1);assert.equal(Object.keys(bounded.read().ledger).length,4096);rewardCases++;
 }
 {
  const seed=setup(),stored=seed.all(),bindings=[{profile:1,key:'character-1'},{profile:2,key:'character-2'}];
  const make=ledger=>{const owner=new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:()=>({eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true})});ok(owner.command({op:'restore-account',account:1,save:stored.account.save}));for(const profile of [1,2])ok(owner.command({op:'restore-workshop',profile,account:1,save:stored.saves[profile-1].save}));owner.attach({...copy(stored.run),ledger},bindings);return owner;};
  const milestoneLevel=Math.min(...[...rules.pack.milestones,...rules.classMilestones('warrior')].filter(row=>row.level>1).map(row=>row.level));assert(Number.isSafeInteger(milestoneLevel)&&milestoneLevel<=20);
  let xp=0;for(let level=1;level<milestoneLevel;level++)xp+=rules.experienceForLevel(level);
  const full=Object.fromEntries(Array.from({length:4096},(_,n)=>['counter-'+n,0])),owner=make(full),before=copy(owner.read()),saves=()=>[1,2].map(profile=>ok(owner.command({op:'workshop-save',profile}))),saved=saves();calls=0;
  assert.throws(()=>owner.prepareTrusted([point('passive',3),ledger('counter-0',1),award(xp)]),/run-ledger-limit/,'XP milestone exceeded bounded run ledger');assert.deepEqual(copy(owner.read()),before,'Rejected milestone changed the run');assert.deepEqual(saves(),saved,'Rejected milestone changed character investment');assert.equal(calls,0,'Rejected milestone rebuilt character investment');
  const ordinary=ok(owner.prepareTrusted([award(1)]));ok(owner.command({op:'commit-prepared',token:ordinary.token}));assert.equal(owner.read().characters[0].xp,1);assert.equal(Object.keys(owner.read().ledger).length,4096);
  const control=setup(),prepared=ok(control.owner.prepareTrusted([award(xp)])),stamps=copy(control.owner.prepared(prepared.token).state.ledger);ok(control.owner.command({op:'abort-prepared',token:prepared.token}));
  const stampCount=Object.keys(stamps).length,admitted={...Object.fromEntries(Array.from({length:4096-stampCount},(_,n)=>['counter-'+n,0])),...stamps},alreadyStamped=make(admitted),accepted=ok(alreadyStamped.prepareTrusted([award(xp)]));ok(alreadyStamped.command({op:'commit-prepared',token:accepted.token}));assert.equal(Object.keys(alreadyStamped.read().ledger).length,4096,'Existing milestone keys should not consume capacity');rewardCases++;
 }
 {
  const f=setup(),before=f.all(),a=before.account.save.progression.account;calls=0;
  const observe=n=>({kind:'command',command:{op:'account',account:1,command:{op:'observe',level:a.level,credits:a.credits+n,roster:copy(a.roster),ledger:{...a.ledger,'bestiary:skeleton_warrior':n}}}});
  const p=ok(f.owner.prepareTrusted([observe(1),point('passive',3),observe(2),command(1,{op:'allocate',nodeId:node.id})]));
  assert.equal(calls,1,'Counter-only account updates rebuilt unchanged characters');assert.deepEqual(f.all(),before,'Account normalization leaked prepared reward');
  ok(f.owner.command({op:'commit-prepared',token:p.token}));assert.equal(f.saves()[0].save.character.passives.passivePoints,3-policy.pack.pickCost);assert(f.saves()[0].save.character.passives.allocated.includes(node.id));assert.equal(f.all().account.save.progression.account.ledger['bestiary:skeleton_warrior'],2);assert.deepEqual(f.saves()[1].save,before.saves[1].save);assert.equal(f.saves()[1].version,before.saves[1].version);assert.equal(f.saves()[1].accountVersion,before.saves[1].accountVersion+2);rewardCases++;
 }
 {
  const f=setup(),before=f.all(),a=before.account.save.progression.account;calls=0;
  const observe={kind:'command',command:{op:'account',account:1,command:{op:'observe',level:a.level,credits:a.credits+1,roster:copy(a.roster),ledger:{...a.ledger,reuse_counter:1}}}};
  const p=ok(f.owner.prepareTrusted([observe])),journal=f.owner.prepared(p.token).journal;
  assert.equal(calls,0,'Account-only bookkeeping rebuilt character investment');
  assert.deepEqual(copy(p.writes),[{kind:'account',handle:1}],'Account-only bookkeeping invented character storage writes');
  assert.equal(journal[0].character.transitions.length,0,'Account-only bookkeeping invented character transitions');
  assert.deepEqual(f.all(),before);ok(f.owner.command({op:'abort-prepared',token:p.token}));assert.deepEqual(f.all(),before);
  const q=ok(f.owner.prepareTrusted([observe]));ok(f.owner.command({op:'commit-prepared',token:q.token}));
  for(let i=0;i<2;i++){assert.deepEqual(f.saves()[i].save,before.saves[i].save);assert.equal(f.saves()[i].version,before.saves[i].version);}
  const next=ok(f.owner.prepareTrusted([point('passive',1)]));ok(f.owner.command({op:'commit-prepared',token:next.token}));
  assert.equal(f.saves()[0].save.character.passives.passivePoints,1);assert.equal(f.all().account.save.progression.account.ledger.reuse_counter,1);assert.equal(calls,0);rewardCases++;
 }
 character.builds=base;
 console.log({passed:true,rewardOwnerCases:rewardCases,pointGrantsDoNotRebuild:true,runCountersBounded:true,ordinaryGrantForgeryRejected:true});
}
