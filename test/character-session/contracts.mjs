import assert from 'node:assert/strict';
import {Random} from '@hollow-wake/engine';
import {liveHost} from './host.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));
export function contracts(kit,content,courses){
  let count=0;const test=(name,run)=>{try{run();count++;}catch(error){error.message=name+': '+error.message;throw error;}};
  const open=(observation=courses[1].initial)=>{
    const i=copy(observation);return kit.admit({schemaVersion:1,capability:'character/v1',contentId:content.contentId,...i.data,
      character:{schemaVersion:2,capability:'workshop-character/progression-diagnostic',contentId:content.contentId,...i.data.character},
      nextUid:10000000,random:new Random(31).snapshot(),craftLore:{}},i.projection);
  };
  const access={salvage:true,oracle:true,bench:true,counter:true,study:true};
  const noEffects={publish(){assert.fail('Invalid change reached live publication');}};
  test('live retirement observes old investment before retained skills are updated',()=>{
    const session=open(),host=liveHost(kit,session),change=session.current();
    const learned=change.input.learned[0],inst=host.meta.knownSkills.get(learned.gem.skillId),level=inst.level,events=[];
    learned.gem.level=level+1;
    change.events=[{kind:'clear-summons',skillId:inst.def.id},{kind:'clear-fields',skillId:inst.def.id},{kind:'resync-supports',skillId:inst.def.id}];
    host.publisher.effects.event=event=>events.push([event.kind,inst.level]);
    host.publisher.publish(change);
    assert.equal(host.meta.knownSkills.get(inst.def.id),inst);
    assert.deepEqual(events,[['clear-summons',level],['clear-fields',level],['resync-supports',level+1]]);
  });
  test('stale, foreign and consumed proposals cannot publish',()=>{
    const a=open(),b=open(),first=a.authorize({kind:'points',currency:'passive',amount:1}),stale=a.authorize({kind:'points',currency:'vocation',amount:2});
    assert.throws(()=>b.commit(first,noEffects),/stale/);assert.throws(()=>a.commit({accepted:true,changed:true},noEffects),/stale/);
    a.commit(first);const saved=a.export();assert.throws(()=>a.commit(first,noEffects),/stale/);assert.throws(()=>a.commit(stale,noEffects),/stale/);assert.deepEqual(a.export(),saved);
  });
  test('inspection and prepared views cannot alter ownership or authority',()=>{
    const a=open(),saved=a.export(),change=a.authorize({kind:'points',currency:'passive',amount:1}),view=a.preview(change);
    view.data.state.items.length=0;view.projection.features.push('unearned');view.input.learned.length=0;view.build.sources.length=0;
    assert.deepEqual(a.export(),saved);a.commit(change);assert(!a.current().projection.features.includes('unearned'));assert(a.inspect().known.length);
  });
  test('character imports reject account fields and malformed investment',()=>{
    const a=open(),saved=a.export(),authority=a.current().projection;
    assert.throws(()=>kit.admit({...saved,account:{}},authority),/unknown-field/);
    assert.throws(()=>kit.admit({...saved,contentId:'foreign'},authority),/content/);
    const invalid=copy(saved);invalid.state.skillBook.bar[7]='unowned-skill';assert.throws(()=>kit.admit(invalid,authority));
    invalid.state.skillBook.bar=saved.state.skillBook.bar;invalid.nextUid=1;assert.throws(()=>kit.admit(invalid,authority),/uid-floor/);
    assert.deepEqual(a.export(),saved);
  });
  test('refused support editing preserves cast, state, UIDs and random continuation',()=>{
    const a=open(),host=liveHost(kit,a),skill=host.meta.knownSkills.get(courses[1].spec.skill),cast={inst:skill,mode:'cast',elapsed:.1,total:1};host.actor.casting=cast;
    const saved=a.export(),view=host.view(),events=host.events.length,support=saved.state.items.find(item=>item.gem?.kind==='support');
    const result=a.prepare({kind:'support',request:{op:'socket',residence:'learned',skillId:skill.def.id,uid:support.uid}},{hold:'combat restriction'});
    assert(!result.accepted);assert.deepEqual(a.export(),saved);assert.deepEqual(host.view(),view);assert.equal(host.actor.casting,cast);assert.equal(host.events.length,events);
    assert.throws(()=>a.commit(result,noEffects),/stale/);
  });
  test('full-bag support refusal discards private UID reservation',()=>{
    const source=open(),saved=source.export(),support=saved.state.items.find(item=>item.gem?.kind==='support');
    saved.state.items=[{...support,x:0,y:0}];saved.state.board={w:1,h:1};saved.state.skillBook.known[0].gem.sockets[0]={supportId:support.gem.supportId,level:1};
    const a=kit.admit(saved,source.current().projection),before=a.export(),id=before.state.skillBook.known[0].gem.skillId;
    const refused=a.prepare({kind:'support',request:{op:'unsocket',residence:'learned',skillId:id,index:0,supportId:support.gem.supportId}},{hold:null});
    assert(!refused.accepted);assert.deepEqual(a.export(),before);
  });
  test('duplicate vocation and malformed point grants preserve state',()=>{
    const a=open(courses[1].steps.find(step=>step.label==='vocation').expected),before=a.export();
    for(const grant of [{kind:'vocation',id:'archmage'},{kind:'vocation',id:'invented'},{kind:'points',currency:'passive',amount:-1},{kind:'xp',amount:NaN}])assert(!a.authorize(grant).accepted);
    assert.deepEqual(a.export(),before);
  });
  test('permissions and external relic custody never come from character data',()=>{
    const a=open(),saved=a.export(),authority=a.current().projection,body=authority.relics.containers.reliquary[0];
    const forged=copy(saved);forged.character.containers.reliquary=[body];assert.throws(()=>kit.admit(forged,authority),/account-container/);
    const collision=copy(authority);collision.relics.containers.reliquary[0].uid=saved.state.items[0].uid;
    const refused=a.authorize({kind:'projection',projection:collision});assert(!refused.accepted);assert.deepEqual(a.export(),saved);
    const disabled=a.authorize({kind:'projection',projection:{...authority,relics:{...authority.relics,enabled:false}}});assert(disabled.accepted);a.commit(disabled);
    assert.equal(a.inspect().companions.length,0);assert(!('features'in a.export()));assert(!('relics'in a.export()));
  });
  test('equipment-granted skill editing owns its exact host and retains the live instance',()=>{
    const a=open(courses[1].steps.find(step=>step.label==='equip').expected),host=liveHost(kit,a);
    const [id,view]=a.inspect().grants.find(([id])=>!a.inspect().known.some(([known])=>known===id));assert(id);
    const support=a.export().state.items.find(item=>item.gem?.kind==='support'&&a.canSocket(id,item.gem.supportId));assert(support);
    const instance=host.seat.grantedInsts.get(id);instance.cooldownMarker={remaining:3};const marker=instance.cooldownMarker;
    const stale=a.prepare({kind:'support',request:{op:'socket',residence:'granted',skillId:id,hostUid:view.host+1,uid:support.uid}},{hold:null});assert(!stale.accepted);
    const change=a.prepare({kind:'support',request:{op:'socket',residence:'granted',skillId:id,hostUid:view.host,uid:support.uid}},{hold:null});assert(change.accepted,change.refusal);a.commit(change,host.publisher);
    assert.equal(host.seat.grantedInsts.get(id),instance);assert.equal(instance.cooldownMarker,marker);assert.equal(instance.sockets[0]?.def.id,support.gem.supportId);
    const bound=a.prepare({kind:'bar',request:{op:'bind',slot:7,skillId:id}});assert(bound.accepted);a.commit(bound,host.publisher);assert.equal(host.actor.skills[7],instance);assert.deepEqual(host.view(),copy(a.inspect()));
    assert(a.export().state.equipped.helmet.grantState[id].sockets[0]);
  });
  test('publication exceptions quarantine the owner and cannot replay side effects',()=>{
    const a=open(),change=a.authorize({kind:'points',currency:'passive',amount:1});let calls=0;
    assert.throws(()=>a.commit(change,{publish(){calls++;throw Error('host failure');}}),/host failure/);assert.equal(calls,1);
    assert.throws(()=>a.commit(change,noEffects),/publication-failed/);assert.throws(()=>a.prepare({kind:'bar',request:{op:'bind',slot:0,skillId:null}}),/publication-failed/);
  });
  test('reentry cannot observe or command a partly published character',()=>{
    const a=open(),change=a.authorize({kind:'points',currency:'passive',amount:1});
    a.commit(change,{publish(){assert.throws(()=>a.export(),/reentrant/);assert.throws(()=>a.authorize({kind:'points',currency:'passive',amount:1}),/reentrant/);}});
  });
  test('insufficient crafting payment and denied station access do not consume randomness',()=>{
    const a=open(),before=a.export(),uid=before.state.items.find(item=>!item.gem).uid;
    const socket=a.prepare({kind:'inventory',request:{op:'socket',uid}},access);assert(!socket.accepted);assert.deepEqual(a.export(),before);
    const denied=a.prepare({kind:'inventory',request:{op:'reroll',uid,index:0,score:1}},{...access,oracle:false});assert(!denied.accepted);assert.deepEqual(a.export(),before);
  });
  test('authorized cargo and currency grants are detached, bounded and collision checked',()=>{
    const a=open(),before=a.export(),item=copy(before.state.items[0]);item.uid=before.nextUid;
    const grant=a.authorize({kind:'items',items:[item]});assert(grant.accepted,grant.refusal);item.tier=999;a.commit(grant);
    const received=a.item(before.nextUid);assert(received);assert.notEqual(received.item.tier,999);received.item.tier=888;received.modifiers.length=0;assert.notEqual(a.item(before.nextUid).item.tier,888);
    const saved=a.export();assert(!a.authorize({kind:'items',items:[a.item(before.nextUid).item]}).accepted);assert.deepEqual(a.export(),saved);
    const essence=kit.definitions.workshop.crafting.pack.essences[0].id,ability=kit.definitions.workshop.skills.pack.services.essences[0];
    for(const award of [{kind:'materials',essence,amount:7},{kind:'ability',tier:ability.tier,amount:3}]){const change=a.authorize(award);assert(change.accepted,change.refusal);a.commit(change);}
    assert.equal(a.export().state.essences[essence],(saved.state.essences[essence]??0)+7);
    assert.equal(a.export().character.abilityEssences[ability.id],(saved.character.abilityEssences[ability.id]??0)+3);
    const unchanged=a.export();for(const award of [{kind:'materials',essence:'unknown',amount:1},{kind:'ability',tier:999,amount:1},{kind:'realm-points',currency:'unknown',amount:1},{kind:'xp',amount:Number.MAX_VALUE}])assert(!a.authorize(award).accepted);
    assert.deepEqual(a.export(),unchanged);
  });
  test('cargo overflow remains owned and recovery waits for actual space',()=>{
    const source=open(),saved=source.export(),body=copy(saved.state.items.find(row=>row.gem?.kind==='support'));saved.state.items=[{...body,x:0,y:0}];saved.state.board={w:1,h:1};
    const a=kit.admit(saved,source.current().projection);body.uid=saved.nextUid;const grant=a.authorize({kind:'items',items:[body]});assert(grant.accepted,grant.refusal);a.commit(grant);
    assert.equal(a.item(body.uid).where.kind,'overflow');const before=a.export();assert(!a.prepare({kind:'inventory',request:{op:'recover',uid:body.uid}},access).accepted);assert.deepEqual(a.export(),before);
  });
  test('inventory movement and external-container refusals preserve custody',()=>{
    const a=open(),item=a.export().state.items[0],before=a.export();
    assert(!a.prepare({kind:'inventory',request:{op:'move',uid:item.uid,x:999,y:0}},access).accepted);
    assert(!a.prepare({kind:'inventory',request:{op:'place',uid:item.uid,container:'reliquary'}},access).accepted);assert.deepEqual(a.export(),before);
    const change=a.prepare({kind:'inventory',request:{op:'move',uid:item.uid,x:8,y:3}},access);assert(change.accepted,change.refusal);a.commit(change);assert.equal(a.item(item.uid).item.x,8);
  });
  test('retiring a learned skill cleans only its owned runtime state',()=>{
    const a=kit.create('magician'),host=liveHost(kit,a),id=a.export().state.skillBook.known[0].gem.skillId,inst=host.meta.knownSkills.get(id),survivor=[...host.meta.knownSkills.values()].find(s=>s!==inst);
    assert(survivor);survivor.remainingCooldown=4;host.actor.casting={inst};host.actor.activeAuras.set(id,{inst});host.actor.activeAuras.set('unrelated',{inst:survivor});
    const refused=a.prepare({kind:'rack',request:{op:'unlearn',skillId:id}},{meets:true,blocked:{[id]:'in use'}});assert(!refused.accepted);assert.equal(host.actor.casting.inst,inst);
    const change=a.prepare({kind:'rack',request:{op:'unlearn',skillId:id}},{meets:true,blocked:{}});assert(change.accepted,change.refusal);a.commit(change,host.publisher);
    assert.equal(host.retired[0],inst);assert.equal(host.actor.casting,null);assert(!host.actor.activeAuras.has(id));assert(host.actor.activeAuras.has('unrelated'));assert.equal(survivor.remainingCooldown,4);
    const gem=a.export().state.items.find(item=>item.gem?.skillId===id);assert(gem);const learned=a.prepare({kind:'rack',request:{op:'learn',uid:gem.uid,slot:0}},{meets:true,blocked:{}});assert(learned.accepted,learned.refusal);a.commit(learned,host.publisher);
    assert.notEqual(host.meta.knownSkills.get(id),inst);assert.equal(host.meta.knownSkills.get(survivor.def.id),survivor);assert.deepEqual(host.view(),copy(a.inspect()));
  });
  test('portable source order is exact and never admits caller modifiers',()=>{
    const a=open(),saved=a.export(),authority=a.current().projection;const invalid=copy(saved);invalid.sourceOrder.push(invalid.sourceOrder[0]);assert.throws(()=>kit.admit(invalid,authority),/source-order/);
    invalid.sourceOrder=saved.sourceOrder.map((id,n)=>n===0?'temporary-live-buff':id);assert.throws(()=>kit.admit(invalid,authority),/source-order/);
    assert.deepEqual(kit.admit(saved,authority).inspect(),a.inspect());
  });
  test('vestige investment spends admitted material and rebuilds a worn item',()=>{
    const a=open(),host=liveHost(kit,a),saved=a.export(),ring=copy(saved.state.items.find(item=>item.baseId==='ring_lapis'));
    ring.uid=saved.nextUid;ring.sockets=[null];let change=a.authorize({kind:'items',items:[ring]});assert(change.accepted,change.refusal);a.commit(change,host.publisher);
    change=a.prepare({kind:'inventory',request:{op:'equip',uid:ring.uid,slot:'ring1'}},access);assert(change.accepted,change.refusal);a.commit(change,host.publisher);
    const id=Object.keys(kit.definitions.workshop.crafting.items.pack.vestiges)[0];change=a.authorize({kind:'vestige',id,amount:1});assert(change.accepted);a.commit(change,host.publisher);
    change=a.prepare({kind:'inventory',request:{op:'inlay',uid:ring.uid,id}},access);assert(change.accepted,change.refusal);a.commit(change,host.publisher);
    assert.equal(a.item(ring.uid).item.sockets[0],id);assert.equal(a.export().state.vestiges[id],0);assert.deepEqual(host.view(),copy(a.inspect()));
    const before=a.export();assert(!a.prepare({kind:'inventory',request:{op:'inlay',uid:ring.uid,id,socket:0}},access).accepted);assert.deepEqual(a.export(),before);
  });
  test('local UID floors are enforced without any external relic projection',()=>{
    const a=kit.create('magician'),item=copy(courses[1].initial.data.state.items[0]);item.uid=1;
    const award=a.authorize({kind:'items',items:[item]});assert(award.accepted,award.refusal);a.commit(award);const invalid=a.export();invalid.nextUid=1;
    assert.throws(()=>kit.admit(invalid,a.current().projection),/character-uid-floor/);
  });
  test('new external relic projections reserve identities without account records',()=>{
    const projection=copy(courses[1].initial.projection),body=projection.relics.containers.reliquary[0];body.uid=200;
    const a=kit.create('magician',{authority:projection});assert.equal(a.export().nextUid,201);assert.equal(a.item(200).item.relicKey,body.relicKey);
    const b=kit.create('magician'),change=b.authorize({kind:'projection',projection});assert(change.accepted,change.refusal);b.commit(change);assert.equal(b.export().nextUid,201);
    assert.deepEqual(kit.admit(b.export(),projection).inspect(),b.inspect());
  });
  test('admission enforces worn level requirements and authored vocation capacity',()=>{
    const a=open(courses[1].steps.find(step=>step.label==='equip').expected),saved=a.export(),authority=a.current().projection,low=copy(saved);low.character.level=1;
    assert.throws(()=>kit.admit(low,authority),/worn-item-level/);
    const over=copy(saved);over.character.passives.vocations=['archmage','warbringer'];assert.throws(()=>kit.admit(over,authority),/vocation-limit/);
  });
  test('passive refunds capture live summons before changing investment',()=>{
    const a=open(courses[1].steps.find(step=>step.label==='vocation-invest').expected),host=liveHost(kit,a),node='voc_archmage_s1';let captured=0,rebuilt=0;
    const publisher=kit.live(host.frame,{retire:skill=>host.publisher.effects.retire(skill),event:event=>{
      if(event.kind==='capture-summons'){assert(host.meta.allocated.has(node));captured++;}
      if(event.kind==='recalculate'){assert(!host.meta.allocated.has(node));rebuilt++;}
      host.publisher.effects.event(event);
    }});
    const change=a.prepare({kind:'passive',request:{op:'refund',nodeId:node}},{refundRefusal:null,openAllRealms:false,runLedger:{}});assert(change.accepted,change.refusal);a.commit(change,publisher);
    assert.equal(captured,1);assert.equal(rebuilt,1);assert.deepEqual(host.view(),copy(a.inspect()));
  });
  return count;
}
