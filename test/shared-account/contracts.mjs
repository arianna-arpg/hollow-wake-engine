import assert from 'node:assert/strict';
const copy=value=>JSON.parse(JSON.stringify(value));
const accountFields=['level','credits','ledger','invested','unlockedSlots','unlockedClasses','pendingClassUnlocks',
  'unlockedClassTiers','unlockedSkills','unlockedSupports','explicitSkillUnlocks','features','packageUnlocks',
  'memorySecondary','memoryReceipts','skillGraft','reliquary','roster'];
export function splitAccount(account) {
  const extra=copy(account),state={};
  for(const key of accountFields){state[key]=extra[key];delete extra[key];}
  const craftLore=extra.craftLore;delete extra.craftLore;return {state,craftLore,extra};
}
const accepted=reply=>{const row=copy(reply);assert.equal(row.ok,true,JSON.stringify(row));return row;};
export const send=(sdk,request)=>accepted(sdk.command(request));
export const accountSave=(sdk,account=1)=>send(sdk,{op:'account-save',account}).save;
export const workshopSave=(sdk,profile=1)=>send(sdk,{op:'workshop-save',profile}).save;
export const accountCommand=(sdk,command,account=1)=>send(sdk,{op:'account',account,command});
export const workshopCommand=(sdk,command,profile=1)=>send(sdk,{op:'workshop',profile,command});
export const access={salvage:true,oracle:true,bench:true,counter:true};
export function openCourse(sdk,scenario,account=1,profile=1) {
  send(sdk,{op:'open-account',account,key:scenario.name,seed:scenario.accountSeed,...splitAccount(scenario.initial.account)});
  send(sdk,{op:'open-workshop',profile,account,seed:scenario.workshopSeed,state:scenario.initial.inventory,
    progression:scenario.initial.progression});
  return sdk;
}
export function offers(sdk,account=1) {
  const found=new Map();
  for(let offset=0;;offset+=64){
    const page=accountCommand(sdk,{op:'catalogue',offset,limit:64},account).reply;
    for(const {id,owned,visible} of page.rows)found.set(id,{id,owned,visible});
    if(offset+64>=page.total)break;
  }
  return ['feat_craft_second','feat_oracle_stone','memory_discovery'].map(id=>{assert(found.has(id));return found.get(id);});
}
const options=(sdk,profile=1)=>workshopCommand(sdk,{op:'options',uid:1001,offset:0,limit:128},profile).reply;
export function snapshot(sdk,account=1,profile=1) {
  const a=accountSave(sdk,account),w=workshopSave(sdk,profile);
  return {account:{...a.extra,...a.progression.account,craftLore:a.craftLore},inventory:w.workshop.state,
    progression:w.progression,slots:options(sdk,profile).slots,offers:offers(sdk,account),
    accountDraws:a.progression.random.draws,workshopDraws:w.workshop.random.draws};
}
export function replayStep(sdk,scenario,row) {
  const {owner,...command}=row.command;
  if(command.op==='read'){
    if(owner==='account')return offers(sdk);
    const view=options(sdk);
    return typeof row.result==='number'?view.slots:{slots:view.slots,options:view.rows.map(r=>r.id)};
  }
  if(owner==='account'){
    if(command.op==='observe'){
      const a=accountSave(sdk).progression.account;
      accountCommand(sdk,{...command,credits:a.credits,roster:a.roster});return;
    }
    return accountCommand(sdk,command).reply.result;
  }
  const reachable=scenario.variant!=='unreachable';
  return workshopCommand(sdk,{...command,access:Object.fromEntries(Object.keys(access).map(k=>[k,reachable]))}).reply;
}
function eventsFromSource(row) {
  // The original essence-grant presentation helper also marks metadata dirty.
  // The owned kernel writes the wallet directly and emits one final invalidation.
  // Compare save/recalculation/refusal ordering and the last dirty notification;
  // full state, both RNG streams and account-save payloads are checked separately.
  const lastDirty=row.events.findLastIndex(e=>e.kind==='dirty');
  return row.events.filter((e,i)=>['account-save','recalculate','refused'].includes(e.kind)||e.kind==='dirty'&&i===lastDirty).map(e=>
    e.kind==='refused'?{kind:e.kind,noteKey:e.key,reason:({'this piece holds no more craft':'capacity'})[e.reason]??e.reason}:{kind:e.kind});
}
function eventsFromReply(reply) {return reply.events.filter(e=>e.kind!=='cue');}

export function contracts(test,{AccountWorkshopSession,definitions,baseline}) {
  const fresh=(scenario=baseline.scenarios[0],limits)=>openCourse(new AccountWorkshopSession(definitions,limits),scenario);
  const pair=s=>({account:accountSave(s),workshop:workshopSave(s)});
  for(const scenario of baseline.scenarios)test('original shared-account course: '+scenario.name,()=>{
    const sdk=fresh(scenario);
    assert.deepEqual(snapshot(sdk),scenario.initial);
    for(const row of baseline.rows.filter(r=>r.scenario===scenario.name)){
      assert.deepEqual(snapshot(sdk),row.before,row.name+' before');
      const result=replayStep(sdk,scenario,row);
      assert.deepEqual(snapshot(sdk),row.after,row.name+' after');
      if(Object.hasOwn(row,'result'))assert.deepEqual(result,row.result,row.name+' result');
      if(row.command.owner==='workshop'&&row.command.op!=='read'){
        assert.deepEqual(eventsFromReply(result),eventsFromSource(row),row.name+' ordered effects');
        for(const event of row.events.filter(e=>e.kind==='account-save')){
          const a=accountSave(sdk);
          assert.deepEqual({ledger:a.progression.account.ledger,craftLore:a.craftLore,features:a.progression.account.features},
            {ledger:event.ledger,craftLore:event.craftLore,features:event.features});
        }
      }
    }
  });
  test('multiple inventories immediately share knowledge, counters and purchased capacity',()=>{
    const sdk=fresh(),scenario=baseline.scenarios[0];
    send(sdk,{op:'open-workshop',profile:2,account:1,seed:91,state:scenario.initial.inventory});
    const second=workshopSave(sdk,2);
    workshopCommand(sdk,{op:'salvage',uid:1002,lane:'break',access});
    assert(options(sdk,2).rows.some(row=>row.id===scenario.first));
    assert.deepEqual(workshopSave(sdk,2),second,'shared discoveries do not rewrite the other inventory');
    const a=accountSave(sdk).progression.account;
    accountCommand(sdk,{op:'observe',level:15,credits:a.credits,ledger:{...a.ledger,reached_level_15:1},roster:a.roster});
    assert(accountCommand(sdk,{op:'buy',id:'feat_craft_second'}).reply.result);
    assert.equal(options(sdk,2).slots,2);
    workshopCommand(sdk,{op:'craft',uid:1001,affixId:scenario.first,score:.5,access},2);
    assert.equal(workshopSave(sdk,2).workshop.state.items[0].affixes.length,1);
    assert.equal(workshopSave(sdk).workshop.state.items[0].affixes.length,0);
    assert.equal(accountSave(sdk).progression.account.ledger.crafts_unlocked,1);
  });
  test('accounts and random streams remain isolated, including after handle retirement',()=>{
    const sdk=fresh(),other={...baseline.scenarios[0],name:'other'};
    openCourse(sdk,other,2,2);const before={a:accountSave(sdk,2),w:workshopSave(sdk,2)};
    accountCommand(sdk,{op:'buy',id:'memory_discovery'});
    workshopCommand(sdk,{op:'salvage',uid:1002,lane:'break',access});
    assert.deepEqual({a:accountSave(sdk,2),w:workshopSave(sdk,2)},before);
    assert.equal(sdk.command({op:'close-account',account:1}).reason,'account-in-use');
    send(sdk,{op:'close-workshop',profile:1});send(sdk,{op:'close-account',account:1});
    assert.equal(sdk.command({op:'workshop',profile:1,command:{op:'options',uid:1001,offset:0,limit:1}}).reason,'workshop-not-open');
    openCourse(sdk,baseline.scenarios[0]);assert.equal(accountSave(sdk).progression.random.draws,0);
    assert.deepEqual({a:accountSave(sdk,2),w:workshopSave(sdk,2)},before);
  });
  test('sealed characters use shared unlocks and expertise without teaching the account',()=>{
    const scenario=copy(baseline.scenarios[0]);
    scenario.initial.progression=false;scenario.initial.account.features.push('craft_second_affix');
    scenario.initial.account.craftLore.life={rank:1,progress:0};
    const sdk=fresh(scenario),before=accountSave(sdk);
    assert.equal(options(sdk).slots,2);
    workshopCommand(sdk,{op:'craft',uid:1001,affixId:'life',score:.5,access});
    workshopCommand(sdk,{op:'salvage',uid:1003,lane:'break',access});
    assert.equal(workshopSave(sdk).workshop.state.items[0].affixes.length,1);
    assert.deepEqual(accountSave(sdk),before);
  });
  test('save continuation binds a stable account key and resumes both streams in a fresh owner',()=>{
    const sdk=fresh();
    for(const row of baseline.rows.filter(r=>r.scenario==='shared-authority').slice(0,8))replayStep(sdk,baseline.scenarios[0],row);
    const saved=pair(sdk),restored=new AccountWorkshopSession(definitions);
    send(restored,{op:'restore-account',account:1,save:saved.account});
    send(restored,{op:'restore-workshop',profile:1,account:1,save:saved.workshop});
    for(const row of baseline.rows.filter(r=>r.scenario==='shared-authority').slice(8)){
      assert.deepEqual(replayStep(restored,baseline.scenarios[0],row),replayStep(sdk,baseline.scenarios[0],row));
      assert.deepEqual(pair(restored),pair(sdk));
    }
    const relocated=new AccountWorkshopSession(definitions);
    send(relocated,{op:'restore-account',account:99,save:saved.account});
    send(relocated,{op:'restore-workshop',profile:0xffffffff,account:99,save:saved.workshop});
    assert.deepEqual(accountSave(relocated,99),saved.account);
    assert.deepEqual(workshopSave(relocated,0xffffffff),saved.workshop);
  });
  test('refused competing authority, wrong account key and corrupt saves leave both owners intact',()=>{
    const sdk=fresh(),before=pair(sdk);
    const competing={...baseline.scenarios[0].initial.inventory,account:{craftLore:{},ledger:{},features:[],progression:true}};
    for(const request of [
      {op:'open-workshop',profile:2,account:1,seed:3,state:competing},
      {op:'restore-workshop',profile:2,account:1,save:{...before.workshop,accountKey:'other'}},
      {op:'restore-workshop',profile:2,account:1,save:{...before.workshop,workshop:{...before.workshop.workshop,state:competing}}},
      {op:'restore-account',account:2,save:before.account},
      {op:'account',account:1,command:{op:'open',seed:1}},
      {op:'workshop',profile:1,command:{op:'close'}},
      {op:'workshop',profile:1,command:{op:'salvage',profile:2,uid:1002,access}},
    ]){assert.equal(sdk.command(request).ok,false);assert.deepEqual(pair(sdk),before);}
    for(const edit of [s=>s.schemaVersion=2,s=>s.craftLore.life.rank=-1,s=>s.progression.random.state=-1,s=>s.progression.account.credits=-1]){
      const save=copy(before.account);save.key='corrupt';edit(save);
      assert.equal(sdk.command({op:'restore-account',account:2,save}).ok,false);
      assert.equal(sdk.command({op:'account-save',account:2}).reason,'account-not-open');
      assert.deepEqual(pair(sdk),before);
    }
  });
  test('all admitted inputs and returned saves are detached, including opaque host fields',()=>{
    const scenario=copy(baseline.scenarios[0]),sdk=fresh(scenario),before=pair(sdk);
    scenario.initial.account.craftLore.life.rank=4;scenario.initial.account.cosmetics.grants.push('outside');
    scenario.initial.inventory.items[0].name='outside';
    const saved=pair(sdk);saved.account.extra.cosmetics.grants.push('outside');saved.account.craftLore.life.rank=3;
    saved.workshop.workshop.state.items[0].name='outside';assert.deepEqual(pair(sdk),before);
    accountCommand(sdk,{op:'buy',id:'memory_discovery'});workshopCommand(sdk,{op:'salvage',uid:1002,lane:'break',access});
    assert.deepEqual(accountSave(sdk).extra,before.account.extra);
    assert(!Object.hasOwn(workshopSave(sdk).workshop.state,'account'));
  });
  test('queries and processed no-ops preserve owner versions and random continuations',()=>{
    const sdk=fresh(),before={a:send(sdk,{op:'account-save',account:1}),w:send(sdk,{op:'workshop-save',profile:1})};
    offers(sdk);options(sdk);
    assert.equal(accountCommand(sdk,{op:'buy',id:'feat_craft_second'}).changed,false);
    const refusal=workshopCommand(sdk,{op:'craft',uid:1001,affixId:'life',score:.5,access});
    assert.equal(refusal.changed,false);assert.equal(refusal.accountChanged,false);assert(refusal.reply.events.some(e=>e.kind==='refused'));
    assert.deepEqual({a:send(sdk,{op:'account-save',account:1}),w:send(sdk,{op:'workshop-save',profile:1})},before);
  });
  test('continuation overflow rolls back account, inventory and random streams together',()=>{
    const sdk=fresh(),saved=pair(sdk);saved.workshop.workshop.random.draws=Number.MAX_SAFE_INTEGER;
    saved.account.progression.account.features.push('craft_second_affix');saved.account.craftLore.life={rank:1,progress:0};
    saved.account.progression.random.draws=Number.MAX_SAFE_INTEGER;
    const restored=new AccountWorkshopSession(definitions);
    send(restored,{op:'restore-account',account:1,save:saved.account});
    send(restored,{op:'restore-workshop',profile:1,account:1,save:saved.workshop});
    const before=pair(restored);
    for(const request of [
      {op:'account',account:1,command:{op:'buy',id:'memory_discovery'}},
      {op:'workshop',profile:1,command:{op:'craft',uid:1001,affixId:'life',score:.5,access}}
    ]){assert.equal(restored.command(request).ok,false);assert.deepEqual(pair(restored),before);}
    assert.equal(accountCommand(sdk,{op:'buy',id:'memory_discovery'}).reply.result,true);
  });
  test('hostile JSON never invokes getters or consumes a handle',()=>{
    const sdk=fresh(),before=pair(sdk);let calls=0;const cyclic={};cyclic.self=cyclic;
    const hole=[];hole.length=1;
    for(const request of [cyclic,new Map(),{op:'account',account:1,get command(){calls++;return {op:'buy',id:'memory_discovery'};}},
      {op:'open-account',account:2,key:'bad',seed:1,extra:hole},
      {op:'open-account',account:2,key:'bad',seed:1,extra:'x'.repeat(262145)},
      {op:'open-account',account:2,key:'bad',seed:NaN},
      {op:'workshop',profile:1,command:{op:'salvage',uid:1002,lane:'break',access:{...access,salvage:1}}},
      {op:'account',account:1,command:{op:'observe',level:15,credits:10,ledger:{},roster:[{}]}}
    ]){assert.equal(sdk.command(request).ok,false);assert.deepEqual(pair(sdk),before);}
    assert.equal(calls,0);assert.equal(sdk.command({op:'account-save',account:2}).reason,'account-not-open');
  });
  test('null is preserved as opaque data and refused as mechanical state or context',()=>{
    const sdk=fresh(),before=pair(sdk);
    send(sdk,{op:'open-account',account:2,key:'opaque-null',seed:7,extra:null});
    assert.equal(accountSave(sdk,2).extra,null);
    for(const request of [
      {op:'open-account',account:3,key:'bad-lore',seed:7,craftLore:null},
      {op:'open-account',account:3,key:'bad-state',seed:7,state:null},
      {op:'open-workshop',profile:2,account:1,seed:7,state:baseline.scenarios[0].initial.inventory,progression:null},
      {op:'open-workshop',profile:2,account:1,seed:7,state:baseline.scenarios[0].initial.inventory,nextUid:null}
    ]){assert.equal(sdk.command(request).ok,false);assert.deepEqual(pair(sdk),before);}
    assert.equal(sdk.command({op:'account-save',account:3}).reason,'account-not-open');
    assert.equal(sdk.command({op:'workshop-save',profile:2}).reason,'workshop-not-open');
    for(const limits of [{accounts:null},{workshops:null}])assert.throws(()=>new AccountWorkshopSession(definitions,limits));
  });
  test('account growth cannot strand an attached inventory at the combined admission boundary',()=>{
    const sdk=fresh(),initial=baseline.scenarios[0].initial.inventory;
    const makeState=count=>({...copy(initial),board:{w:256,h:16},
      items:Array.from({length:count},(_,i)=>({...copy(initial.items[1]),uid:2000+i,name:'N'.repeat(512),x:i%256,y:Math.floor(i/256)}))});
    let low=1,high=700;
    while(low<high){
      const count=Math.ceil((low+high)/2),result=sdk.command({op:'open-workshop',account:1,profile:2,seed:41,state:makeState(count)});
      if(result.ok){send(sdk,{op:'close-workshop',profile:2});low=count;}else{assert.match(result.reason,/json/);high=count-1;}
    }
    assert(low>100);
    send(sdk,{op:'open-workshop',account:1,profile:2,seed:41,state:makeState(low)});
    const before={...pair(sdk),second:workshopSave(sdk,2)},a=before.account.progression.account;
    const result=sdk.command({op:'account',account:1,command:{op:'observe',level:15,credits:a.credits,
      ledger:{...a.ledger,...Object.fromEntries(Array.from({length:100},(_,i)=>['earned_'+i+'x'.repeat(64),1]))},roster:a.roster}});
    assert.equal(result.ok,false);assert.match(result.reason,/json/);
    assert.deepEqual({...pair(sdk),second:workshopSave(sdk,2)},before);
    assert.equal(workshopCommand(sdk,{op:'options',uid:2000,offset:0,limit:1},2).changed,false);
  });
  test('bounded owners reject capacity overflow and release slots explicitly',()=>{
    const sdk=fresh(baseline.scenarios[0],{accounts:1,workshops:1});
    assert.equal(sdk.command({op:'open-account',account:2,key:'two',seed:1}).reason,'account-limit');
    assert.equal(sdk.command({op:'open-workshop',profile:2,account:1,seed:1,state:baseline.scenarios[0].initial.inventory}).reason,'workshop-limit');
    send(sdk,{op:'close-workshop',profile:1});send(sdk,{op:'close-account',account:1});
    send(sdk,{op:'open-account',account:0xffffffff,key:'new',seed:0});
    assert.equal(accountSave(sdk,0xffffffff).key,'new');
    assert.equal(sdk.command({op:'open-account',account:0x100000000,key:'bad',seed:1}).ok,false);
  });
}
