import {CharacterWorldAdapter} from 'diagnostic/world-adapter';
import {accountContracts as typedAccountContracts} from 'diagnostic/account-kernel';
import {LocatedPickupFrame} from 'diagnostic/pickup-authority';
import locatedPickupOriginal from 'diagnostic/located-pickup-original';
import {HollowWakeSpillPlacement} from 'diagnostic/spill-placement';
import {DurableCharacterOwner as LocatedOwner} from 'diagnostic/located-owner';
import {WorldDeliveryBinding as LocatedWorldBinding} from 'diagnostic/located-world';
import spillLocationOriginal from 'diagnostic/spill-location-original';
import {publishGemPickupItems,restoreOwnedInventory} from 'diagnostic/world-item-publication';
import {WorldDeliveryBinding,WorldDeliveryFrame} from 'diagnostic/world-deliveries';
import {worldFixture} from 'diagnostic/world-harness';
import pickupOriginal from 'diagnostic/pickup-original';
import rerollOriginal from 'diagnostic/reroll-original';
import mergeOriginal from 'diagnostic/merge-original';
import progressionOriginal from 'diagnostic/progression-original';
import graftOriginal from 'diagnostic/graft-original';
import {WorkshopCharacterData as LegacyCharacterData} from '../../dist/workshop-character.js';
import {CharacterWorkshopAdmission as ResidenceAdmission} from 'diagnostic/rack-admission';
import residenceOriginal from 'diagnostic/residence-original';
import supportOriginal from 'diagnostic/support-original';
import allSupportOriginal from 'diagnostic/all-support-original';
import {createGemCargo} from '../../dist/gem-residence.js';
import {CraftingSessionData as GrantData} from 'diagnostic/grant-data';
import {CraftingSessionData as OriginalData} from '../../dist/crafting-session-data.js';
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {CharacterWorkshopAdmission} from 'diagnostic/admission';
import {createCharacterBuilds} from 'authored/factory';import pack from 'authored/pack';import extra from 'diagnostic/content';import raw from 'diagnostic/original';
import {ItemContent,ItemRules} from '../../dist/item-rules.js';import {CraftingContent} from '../../dist/crafting-content.js';import {SkillProgression} from '../../dist/skill-progression.js';
import {PassivePolicy} from '../../dist/passive-policy.js';import {EquipmentSlots} from '../../dist/equipment-actions.js';import {CraftingSession} from '../../dist/crafting-session.js';
import {WorkshopSkillBook} from '../../dist/workshop-skill-book.js';
import {AccountWorkshopSession} from '../../dist/account-workshop-session.js';import {AccountRelicItems} from '../../dist/account-relic-items.js';
const copy=value=>JSON.parse(JSON.stringify(value)),same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
const items=new ItemContent(pack.items),workshop={crafting:new CraftingContent(extra.crafting,items),skills:new SkillProgression(pack.progression),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
const defs={workshop,equipment:new EquipmentSlots(extra.equipment),builds:createCharacterBuilds(pack),relicPowerPerRank:pack.containers.custody.progression.powerPerRank,
 character:{contentId:'diagnostic-character-context',passives:new PassivePolicy(extra.passives),attributes:pack.passives.attributes.map(a=>a.id),
 containers:pack.containers.containers.map(({id,accepts,accountStorage})=>({id,accepts,...(accountStorage===undefined?{}:{accountStorage})}))}};
const service=new CharacterWorkshopAdmission(defs),rows=[],observe=(name,run)=>{run();rows.push(name);};
const initial=raw.original[0].input,canonical=raw.original.at(-1).input;
function input(source=initial){
 const containers=copy(source.containers);for(const def of defs.character.containers)if(def.accountStorage)containers[def.id]=[];
 return {capability:'character-workshop/diagnostic',nextUid:1000000,state:{board:{w:16,h:16},items:[],equipped:copy(source.equipped),overflow:[],essences:{},
  skillBook:{known:[],bar:[null,null,'firebolt',null,null,null,null,null]}},character:{schemaVersion:1,capability:'workshop-character/v1',contentId:defs.character.contentId,
  level:source.level,baseAttrs:copy(source.baseAttrs),passives:{classId:source.classId,allocated:source.allocated,choices:source.choices,grafts:source.grafts,
   vocations:[],passivePoints:0,vocationPoints:0,realmPoints:{}},containers}};
}
const scope=()=>({accountKey:'admission-probe',profile:1,account:{craftLore:{},ledger:{},features:initial.features,progression:true},relics:{role:'inactive'}});
const request=input(),before=copy(request),authority=scope(),authorityBefore=copy(authority),token=service.admit(request,authority),held=service.read(token);
observe('derived worn grant resolves without a learned-book echo',()=>{assert.equal(held.projection.bar[2].id,'firebolt');assert.equal(held.state.skillBook.known.length,0);assert.equal(held.state.skillBook.bar[2],'firebolt');});
observe('cold grant repair writes normalized residence only into owned output',()=>{assert.equal(held.projection.grants.find(r=>r[0]==='firebolt')[1].tree.length,1);assert.equal(held.state.equipped.helmet.grantState.firebolt.treeNodes.length,1);same(request,before);same(authority,authorityBefore);});
observe('saved inventory contains neither an account nor canonical bodies',()=>{assert(!Object.hasOwn(held.state,'account'));assert.equal(held.character.containers.reliquary?.length??0,0);});
observe('legacy v4 learned-only admission still rejects a granted binding',()=>{const legacy=new CraftingSession(workshop,1,new WorkshopSkillBook(items));assert.equal(legacy.command({op:'open',profile:0,seed:1,nextUid:request.nextUid,state:{...request.state,account:authority.account}}).reason,'unresolved-bar-skill');});
const rejected=(name,edit,pattern)=>observe(name,()=>{const candidate=copy(request),s=scope();edit(candidate,s);const original=copy(candidate),originalScope=copy(s);assert.throws(()=>service.admit(candidate,s),pattern);same(candidate,original);same(s,originalScope);same(service.read(token),held);});
rejected('bar cannot invent an authored but unowned skill',r=>r.state.skillBook.bar[2]='fireball',/Unresolved/);
rejected('stored investment alone cannot grant a skill',r=>{r.state.equipped.ring2.grantState=copy(r.state.equipped.helmet.grantState);delete r.state.equipped.helmet;},/Unresolved/);
rejected('duplicate bar ownership is refused',r=>r.state.skillBook.bar[1]='firebolt',/duplicate-bar/);
rejected('malformed binding is refused',r=>r.state.skillBook.bar[1]=3,/invalid-string/);
rejected('invalid passive currency is refused before a build can escape',r=>r.character.passives.passivePoints=-1,/invalid-integer/);
rejected('unknown class is refused',r=>r.character.passives.classId='missing',/invalid-character-passives/);
rejected('foreign source-context revision is refused',r=>r.character.contentId='foreign',/content-mismatch/);
rejected('unknown worn slot cannot hide a body',r=>{r.state.equipped.hidden=r.state.equipped.ring2;delete r.state.equipped.ring2;},/invalid-worn-slot/);
rejected('wrong equipment category is refused',r=>{const ring=r.state.equipped.ring2;r.state.equipped.helmet=ring;delete r.state.equipped.ring2;},/invalid-worn-slot/);
rejected('local item address must stay below the counter',r=>r.nextUid=r.state.equipped.helmet.uid,/character-uid-floor/);
rejected('request cannot supply a second account authority',r=>r.state.account=scope().account,/unknown-field/);
rejected('request cannot select its own relic role',r=>r.relics={role:'active'},/unknown-field/);
rejected('canonical relic echoes in character containers are refused',r=>r.character.containers.reliquary=canonical.containers.reliquary,/account-container-in-character/);
observe('reads are detached and opaque handles are owner-specific',()=>{const changed=service.read(token);changed.state.equipped.helmet.name='changed';changed.projection.bar[2].level=999;same(service.read(token),held);assert.throws(()=>new CharacterWorkshopAdmission(defs).read(token),/foreign-character-workshop/);});
// Obtain the selected projection from the real account owner. Its complete
// custody and typed body checks run before the diagnostic admission receives it.
const codec=new AccountRelicItems(workshop);let selected;
const owner=new AccountWorkshopSession({...defs,progression:extra.progression,rack:new WorkshopSkillBook(items),relicItems:codec,relicBuilds:true,
 preparation:{prepare:(_previous,value)=>{selected=copy({accountKey:value.account.key,profile:value.profile,account:value.state.account,relics:value.relics});return{state:value.state,continuation:{}};}}});
const send=request=>{const result=owner.command(request);assert.equal(result.ok,true,JSON.stringify(result));return result;};
send({op:'open-account',account:1,key:'admission-probe',seed:1,relicItems:true});
const savedAccount=send({op:'account-save',account:1}).save,canonicalState=send({op:'account-relic-items',account:1}).state;
canonicalState.items=copy(canonical.containers.reliquary);
const anotherUid=Math.max(...canonicalState.items.map(item=>item.uid),...Object.values(request.state.equipped).map(item=>item.uid))+100;
const bead=new ItemRules(items,37,anotherUid).forge({uniqueId:'hermits_bead',ilvl:40,quality:1});assert(bead);bead.relicKey='diagnostic-hermit';bead.x=2;bead.y=0;
canonicalState.items.push(bead);canonicalState.seated=canonicalState.items.map(item=>item.relicKey).reverse();
savedAccount.progression.account.reliquary=codec.encode(canonicalState);savedAccount.progression.account.features=canonical.features;
send({op:'close-account',account:1});send({op:'restore-account',account:1,save:savedAccount});
const withRelic=input(canonical),inventory=copy(withRelic.state);inventory.skillBook.bar.fill(null);
send({op:'open-workshop',profile:1,account:1,seed:2,nextUid:withRelic.nextUid,state:inventory,character:withRelic.character});
const inactive=copy(selected);send({op:'activate-workshop',profile:1,account:1});
const active=copy(selected),ownerBefore=send({op:'account-save',account:1}),activeBefore=copy(active),activeToken=service.admit(withRelic,active),activeRead=service.read(activeToken);
observe('only owner-selected canonical relics contribute companion declarations',()=>{assert.equal(activeRead.projection.companions.length,1);assert.equal(activeRead.projection.companions[0][0],'summon_stone_golem');same(active,activeBefore);same(send({op:'account-save',account:1}),ownerBefore);});
observe('inactive character cannot retain the account companion',()=>{assert.equal(inactive.relics.role,'inactive');assert.equal(service.read(service.admit(withRelic,inactive)).projection.companions.length,0);});
observe('seated keys select membership without reordering canonical bodies',()=>{const reversed=copy(active);reversed.relics.state.seated.reverse();same(service.read(service.admit(withRelic,reversed)),activeRead);});
observe('canonical address collision refuses before admission',()=>{const s=copy(active);s.relics.state.items[0].uid=request.state.equipped.helmet.uid;assert.throws(()=>service.admit(withRelic,s),/relic-address-collision/);same(service.read(activeToken),activeRead);});
observe('all canonical addresses reserve the item counter',()=>{const s=copy(active);s.relics.state.items[0].uid=withRelic.nextUid;assert.throws(()=>service.admit(withRelic,s),/relic-uid-floor/);});
const projected=token=>{const {state,character,nextUid}=service.read(token);return {capability:'character-workshop/diagnostic',state,character,nextUid};};
const invested=input();invested.state.equipped=copy(extra.investedPair);const high=service.admit(invested,scope()),highRead=service.read(high);
const lower=projected(high),ring=lower.state.equipped.ring1;delete lower.state.equipped.ring1;ring.x=0;ring.y=0;lower.state.items.push(ring);
const low=service.rebuild(high,lower,scope()),lowRead=service.read(low);
observe('warm same-host lower level retains admitted investment',()=>{assert.equal(highRead.projection.grants.find(r=>r[0]==='firebolt')[1].level,10);const grant=lowRead.projection.grants.find(r=>r[0]==='firebolt')[1];assert.equal(grant.level,5);assert.equal(grant.tree.length,2);same(service.read(high),highRead);assert.equal(service.lineages(high).get('grant/firebolt'),service.lineages(low).get('grant/firebolt'));});
observe('cold reopening remains a separate repair boundary',()=>assert.equal(service.read(service.admit(projected(low),scope())).projection.grants.find(r=>r[0]==='firebolt')[1].tree.length,1));
const rebind=Array(8).fill(null);rebind[7]='firebolt';const bound=service.rebuild(low,projected(low),scope(),rebind);
observe('explicit rebind preserves owned grant investment and lineage',()=>{same(service.read(bound).state.skillBook.bar,rebind);assert.equal(service.read(bound).projection.bar[7].tree.length,2);assert.equal(service.lineages(bound).get('grant/firebolt'),service.lineages(low).get('grant/firebolt'));});
observe('implicit binding changes are refused',()=>{const changed=projected(low);changed.state.skillBook.bar.fill(null);assert.throws(()=>service.rebuild(low,changed,scope()),/implicit-bar-change/);same(service.read(low),lowRead);});
observe('continuation cannot switch account authority',()=>assert.throws(()=>service.rebuild(low,projected(low),{...scope(),accountKey:'another'}),/foreign-workshop-scope/));
observe('continuation cannot switch character identity',()=>assert.throws(()=>service.rebuild(low,projected(low),{...scope(),profile:2}),/foreign-workshop-scope/));
const removal=projected(bound),helmet=removal.state.equipped.helmet;delete removal.state.equipped.helmet;helmet.x=2;helmet.y=0;removal.state.items.push(helmet);
const removed=service.rebuild(bound,removal,scope()),removedRead=service.read(removed);
observe('removing a host clears its binding without losing item custody',()=>{assert(removedRead.state.skillBook.bar.every(id=>id===null));assert(removedRead.state.items.some(item=>item.uid===helmet.uid));assert.equal(removedRead.projection.grants.length,0);});
const renewal=projected(removed),back=renewal.state.items.find(item=>item.uid===helmet.uid);renewal.state.items=renewal.state.items.filter(item=>item!==back);delete back.x;delete back.y;renewal.state.equipped.helmet=back;
const renewed=service.rebuild(removed,renewal,scope());
observe('re-equipping the same body creates a new grant lifetime',()=>{assert.notEqual(service.lineages(renewed).get('grant/firebolt'),service.lineages(bound).get('grant/firebolt'));assert(service.read(renewed).state.skillBook.bar.every(id=>id===null));});
const disabledCanonical=send({op:'account-relic-items',account:1}).state;disabledCanonical.enabled=false;
send({op:'account',account:1,command:{op:'relic-items',state:disabledCanonical}});
const disabled=service.rebuild(activeToken,projected(activeToken),copy(selected));
observe('acknowledged account disable removes the private companion declaration',()=>{assert.equal(service.read(disabled).projection.companions.length,0);same(service.read(activeToken),activeRead);});
disabledCanonical.enabled=true;send({op:'account',account:1,command:{op:'relic-items',state:disabledCanonical}});
const reenabled=service.rebuild(disabled,projected(disabled),copy(selected));
observe('account re-enable creates a new companion lifetime',()=>{assert.equal(service.read(reenabled).projection.companions.length,1);assert.notEqual(service.lineages(activeToken).get('companion/summon_stone_golem'),service.lineages(reenabled).get('companion/summon_stone_golem'));});
// Appended to the existing authored admission course by the runner generator.
const surgeryBase=projected(low),surgeryBefore=copy(surgeryBase);
const grantEdit={skillId:'firebolt',hostUid:lowRead.projection.grants.find(row=>row[0]==='firebolt')[1].host,
  state:copy(surgeryBase.state.equipped.helmet.grantState.firebolt)};
grantEdit.state.sockets[0]={supportId:'arcing',level:1,locked:true,rolled:{diagnostic:'preserved'}};
const editBefore=copy(grantEdit),edited=service.rebuild(low,surgeryBase,scope(),undefined,[grantEdit]),editedRead=service.read(edited);
observe('strict grant edit writes support investment into the exact existing host',()=>{
  same(editedRead.state.equipped.helmet.grantState.firebolt,grantEdit.state);
  same(editedRead.projection.grants.find(row=>row[0]==='firebolt')[1].sockets[0],{id:'arcing',level:1,locked:true,rolled:{diagnostic:'preserved'}});
  assert.equal(editedRead.state.skillBook.known.length,0);same(surgeryBase,surgeryBefore);same(grantEdit,editBefore);same(service.read(low),lowRead);
});
observe('editing a lowered grant preserves existing tree investment and its private lifetime',()=>{
  const row=editedRead.projection.grants.find(row=>row[0]==='firebolt')[1];assert.equal(row.level,5);assert.equal(row.tree.length,2);
  assert.equal(service.lineages(edited).get('grant/firebolt'),service.lineages(low).get('grant/firebolt'));
});
observe('binding and investment edits compose on one owned candidate',()=>{
  const next=service.rebuild(low,projected(low),scope(),rebind,[grantEdit]),view=service.read(next);
  assert.equal(view.projection.bar[7].sockets[0].id,'arcing');assert.equal(view.projection.bar[7].tree.length,2);
  assert.equal(service.lineages(next).get('grant/firebolt'),service.lineages(low).get('grant/firebolt'));
});
observe('an explicit socket removal preserves the preceding candidate and learned book',()=>{
  const clear=copy(grantEdit);clear.state.sockets[0]=null;
  const next=service.rebuild(edited,projected(edited),scope(),undefined,[clear]);
  assert.equal(service.read(next).projection.grants.find(row=>row[0]==='firebolt')[1].sockets[0],null);
  same(service.read(edited),editedRead);same(service.read(next).state.skillBook.known,[]);
});
const refuseEdit=(name,mutate,pattern)=>observe(name,()=>{
  const edit=copy(grantEdit),request=projected(low);mutate(edit,request);const before=copy(edit),beforeRequest=copy(request);
  assert.throws(()=>service.rebuild(low,request,scope(),undefined,[edit]),pattern);
  same(edit,before);same(request,beforeRequest);same(service.read(low),lowRead);
});
refuseEdit('unknown fields in a grant edit refuse before investment can be dropped',e=>e.extra=true,/unknown-field/);
refuseEdit('unknown grant-state fields refuse instead of being silently omitted',e=>e.state.extra=true,/unknown-field/);
refuseEdit('unknown support identity refuses',e=>e.state.sockets[0].supportId='missing',/unknown-support/);
refuseEdit('out-of-range support investment refuses',e=>e.state.sockets[0].level=9999,/invalid-support-level/);
refuseEdit('nontextual rolled support data refuses',e=>e.state.sockets[0].rolled.diagnostic=12,/invalid-string/);
refuseEdit('invalid support residence locks refuse',e=>e.state.sockets[0].locked='yes',/invalid-boolean/);
refuseEdit('invalid tree nodes refuse without cold-repairing investment',e=>e.state.treeNodes=['missing'],/invalid-skill-tree/);
refuseEdit('an extra socket cannot be truncated during grant writeback',e=>e.state.sockets.push(null),/grant-socket-count/);
refuseEdit('a missing socket cannot be silently recreated',e=>e.state.sockets.pop(),/grant-socket-count/);
refuseEdit('a mismatched expected host refuses before preparation',e=>e.hostUid++,/foreign-grant-edit/);
refuseEdit('an edit cannot invent a grant from authored skill identity',e=>{e.skillId='fireball';e.state.treeNodes=[];},/foreign-grant-edit/);
refuseEdit('replacing a host in the same change refuses investment intended for its predecessor',(e,r)=>{
  r.state.equipped.helmet.uid+=10000;r.nextUid+=10000;
},/Edited grant no longer belongs/);
refuseEdit('removing a grant host refuses an edit while preserving physical custody',(e,r)=>{
  const item=r.state.equipped.helmet;delete r.state.equipped.helmet;item.x=2;item.y=0;r.state.items.push(item);
},/Edited grant no longer belongs/);
observe('duplicate grant edits refuse atomically',()=>{
  assert.throws(()=>service.rebuild(low,projected(low),scope(),undefined,[grantEdit,grantEdit]),/Foreign or duplicate/);same(service.read(low),lowRead);
});
observe('factored grant admission matches the existing real-item boundary',()=>{
  const next=new GrantData(workshop),old=new OriginalData(workshop),body=copy(surgeryBase.state.equipped.helmet);
  const candidates=[['accepted retained investment',()=>{}],['empty tree',s=>delete s.treeNodes],
    ['unknown field',s=>s.extra=0],['unknown support',s=>s.sockets[0].supportId='missing'],['support cap',s=>s.sockets[0].level=9999],
    ['support zero',s=>s.sockets[0].level=0],['unknown tree',s=>s.treeNodes=['missing']],['bad lock',s=>s.sockets[0].locked='yes'],
    ['bad rolls',s=>s.sockets[0].rolled={bad:3}],['residence extra socket',s=>s.sockets.push(null)],['missing sockets',s=>delete s.sockets]];
  const verdict=fn=>{try{fn();return 'accepted';}catch(error){return error.message;}};
  for(const[name,mutate]of candidates){const state=copy(grantEdit.state);mutate(state);const original=copy(state);
    const expected=verdict(()=>old.item({...body,grantState:{firebolt:state}}));
    assert.equal(verdict(()=>next.grantState('firebolt',state)),expected,name);same(state,original);
  }
  assert.throws(()=>next.grantState('missing',grantEdit.state),/unknown-skill/);
});

const wrapper=(supportId,uid)=>{
  const cargo=createGemCargo({skill:()=>undefined,support:id=>workshop.skills.support(id),hasForm:()=>false,makeSkill:()=>{throw Error('unused');},
    validTreeNodes:()=>{throw Error('unused');},nextUid:()=>uid,bagWidth:()=>16,bagHeight:()=>16,itemGridSize:item=>items.pack.bases[item.baseId]});
  return {...cargo.itemOfSocket({supportId,level:1,locked:true,rolled:{diagnostic:'custody'}}),x:2,y:0};
};
const socketInput=projected(low),supportItem=wrapper('arcing',900000);socketInput.state.items.push(supportItem);
const supportStart=service.rebuild(low,socketInput,scope()),supportStartRead=service.read(supportStart);
const supportRequest={op:'socket',residence:'granted',skillId:'firebolt',hostUid:grantEdit.hostUid,uid:supportItem.uid};
const unhold={hold:null};
const socketed=service.support(supportStart,scope(),supportRequest,unhold),socketedRead=service.read(socketed.token);
observe('actual support action transfers one bag wrapper into the existing grant',()=>{
  assert(socketed.changed&&socketed.needsSave);assert(!socketedRead.state.items.some(item=>item.uid===supportItem.uid));
  same(socketedRead.state.equipped.helmet.grantState.firebolt.sockets[0],{supportId:'arcing',level:1,locked:true,rolled:{diagnostic:'custody'}});
  assert.equal(socketedRead.nextUid,supportStartRead.nextUid);same(service.read(supportStart),supportStartRead);
  assert.equal(socketedRead.projection.bar[2].tree.length,2);assert.equal(service.lineages(socketed.token).get('grant/firebolt'),service.lineages(supportStart).get('grant/firebolt'));
  same(socketed.events,[{kind:'recalculate'},{kind:'resync-supports',skillId:'firebolt'},{kind:'dirty'}]);
});
const unsocketRequest={op:'unsocket',residence:'granted',skillId:'firebolt',hostUid:grantEdit.hostUid,index:0,supportId:'arcing'};
const unsocketed=service.support(socketed.token,scope(),unsocketRequest,unhold),unsocketedRead=service.read(unsocketed.token);
observe('actual unsocket action returns one complete support wrapper with a fresh address',()=>{
  assert(unsocketed.changed&&unsocketed.needsSave);assert.equal(unsocketedRead.nextUid,socketedRead.nextUid+1);
  assert.equal(unsocketedRead.state.equipped.helmet.grantState.firebolt.sockets[0],null);
  const returned=unsocketedRead.state.items.find(item=>item.uid===socketedRead.nextUid);assert(returned);
  same(returned.gem,{kind:'support',supportId:'arcing',level:1,rolled:{diagnostic:'custody'}});assert.equal(returned.locked,true);
  assert.equal(returned.name,workshop.skills.support('arcing').name);same(service.read(socketed.token),socketedRead);
  same(unsocketed.events,[{kind:'dirty'},{kind:'recalculate'},{kind:'resync-supports',skillId:'firebolt'}]);
});
observe('host discipline holds refuse without spending a wrapper or address',()=>{
  for(const[token,request]of [[supportStart,supportRequest],[socketed.token,unsocketRequest]]){
    const before=service.read(token),result=service.support(token,scope(),request,{hold:'held-discipline'});
    assert.equal(result.token,token);assert(!result.changed&&!result.needsSave);assert.equal(result.refusal,'held-discipline');same(result.events,[]);same(service.read(token),before);
  }
});
observe('stale support identity cannot remove another socket',()=>{
  const result=service.support(socketed.token,scope(),{...unsocketRequest,supportId:'missing'},unhold);
  assert.equal(result.token,socketed.token);assert.equal(result.refusal,'stale-socket');same(service.read(socketed.token),socketedRead);
});
observe('a missing bag wrapper leaves the owned grant unchanged',()=>{
  const result=service.support(supportStart,scope(),{...supportRequest,uid:888888},unhold);
  assert.equal(result.token,supportStart);assert(!result.changed&&!result.needsSave);same(service.read(supportStart),supportStartRead);
});
const fitBuild=defs.builds.open({...initial,learned:[]},[null,null,'firebolt',null,null,null,null,null]);
const incompatible=Object.keys(pack.definitions.supports).find(id=>!defs.builds.canSocket(fitBuild,'firebolt',id));assert(incompatible);assert.notEqual(incompatible,'arcing');
observe('compatibility uses the actual authored instance and crew rules',()=>{
  assert.equal(defs.builds.canSocket(fitBuild,'firebolt','arcing'),true);assert.equal(defs.builds.canSocket(fitBuild,'missing','arcing'),false);
  assert.equal(defs.builds.canSocket(fitBuild,'firebolt','missing'),false);
  const request=projected(low);request.state.items.push(wrapper(incompatible,900001));const token=service.rebuild(low,request,scope()),before=service.read(token);
  const result=service.support(token,scope(),{...supportRequest,uid:900001},unhold);assert.equal(result.token,token);assert(!result.changed);same(service.read(token),before);
});
observe('a full bag retains the socket and preserves the original consumed-address rule',()=>{
  const request=projected(socketed.token);request.state.board={w:1,h:1};const token=service.rebuild(socketed.token,request,scope()),before=service.read(token);
  const result=service.support(token,scope(),unsocketRequest,unhold),after=service.read(result.token);
  assert(!result.changed&&result.needsSave);assert.equal(result.refusal,'inventory full');assert.notEqual(result.token,token);
  assert.equal(after.nextUid,before.nextUid+1);same(after.state,before.state);same(result.events,[]);same(service.read(token),before);
});
observe('blocked bag cells cannot receive returned support cargo',()=>{
  const request=projected(socketed.token);request.state.board={w:1,h:1,rows:['.']};
  for(const item of request.state.items){delete item.x;delete item.y;request.state.overflow.push(item);}request.state.items=[];
  const token=service.rebuild(socketed.token,request,scope()),before=service.read(token),result=service.support(token,scope(),unsocketRequest,unhold);
  assert(!result.changed&&result.needsSave);assert.equal(result.refusal,'inventory full');same(service.read(result.token).state,before.state);
});
observe('address exhaustion fails before any prepared state can escape',()=>{
  const request=projected(socketed.token);request.nextUid=Number.MAX_SAFE_INTEGER;
  const token=service.rebuild(socketed.token,request,scope()),before=service.read(token);
  assert.throws(()=>service.support(token,scope(),unsocketRequest,unhold),/invalid-integer/);same(service.read(token),before);
});
observe('support commands cannot switch account, character or expected grant host',()=>{
  assert.throws(()=>service.support(supportStart,{...scope(),profile:2},supportRequest,unhold),/foreign-workshop-scope/);
  assert.throws(()=>service.support(supportStart,{...scope(),accountKey:'foreign'},supportRequest,unhold),/foreign-workshop-scope/);
  assert.throws(()=>service.support(supportStart,scope(),{...supportRequest,hostUid:1},unhold),/foreign-grant-support-host/);
  same(service.read(supportStart),supportStartRead);
});
observe('compatibility and holds cannot be supplied in player command data',()=>{
  assert.throws(()=>service.support(supportStart,scope(),{...supportRequest,fits:true},unhold),/unknown-field/);
  assert.throws(()=>service.support(supportStart,scope(),{...supportRequest,hold:null},unhold),/unknown-field/);
  same(service.read(supportStart),supportStartRead);
});
observe('custom-content invariant: rolled requirements reach the original mechanism gate',()=>{
  // An explicitly synthetic compiler-input revision, not a change to authored
  // content or an original-game observation. Firebolt strikes but is not an
  // aura, summon, guard or minion; the original named mechanisms own that law.
  const custom=copy(pack);custom.contentId='diagnostic-rolled-support-gate';
  custom.definitions.supports.arcing.rollBase={axes:[{id:'gate',rows:[
    {id:'strike',weight:1,line:'Requires a damaging hit',requiresMechanisms:['strikes']},
    {id:'standing',weight:1,line:'Requires a standing engagement',requiresMechanisms:['engagement']}
  ]}]};
  const builds=createCharacterBuilds(custom),service2=new CharacterWorkshopAdmission({...defs,builds});
  const probe=builds.open({...initial,learned:[]},[null,null,'firebolt',null,null,null,null,null]);
  assert.equal(builds.canSocket(probe,'firebolt','arcing'),true);
  assert.equal(builds.canSocket(probe,'firebolt','arcing',{gate:'standing'}),false);
  for(const [gate,accepted]of [['strike',true],['standing',false]]){
    const request=projected(low),item=wrapper('arcing',900002);item.gem.rolled={gate};request.state.items.push(item);
    const token=service2.admit(request,scope()),before=service2.read(token);
    const result=service2.support(token,scope(),{...supportRequest,uid:900002},unhold),after=service2.read(result.token);
    assert.equal(result.changed,accepted);
    if(accepted){assert(!after.state.items.some(item=>item.uid===900002));same(after.state.equipped.helmet.grantState.firebolt.sockets[0].rolled,{gate});}
    else {assert.equal(result.token,token);same(after,before);}
    same(service2.read(token),before);
  }
});

// Inputs and expectations come from two identical, original-only World runs.
// Between steps the fixture mints bag fillers, removes one filler, and reserves
// observer UID probes. These are explicit setup changes, not player commands.
let pairedToken;
const pairedObservations=[];
const suites=[supportOriginal.original.map(row=>({...row,request:{...row.request,residence:'granted'}})),allSupportOriginal.original];
for(const suite of suites){pairedToken=undefined;
for(const original of suite){
  observe('original World: '+original.label,()=>{
    const {before,after}=original,request=input(before.input);
    request.state={...copy(before.inventory),skillBook:{known:copy(before.input.learned),bar:copy(before.bar)}};
    request.nextUid=before.nextUid;
    const ownerScope=scope();ownerScope.account.features=copy(before.input.features);
    pairedToken=pairedToken?service.rebuild(pairedToken,request,ownerScope):service.admit(request,ownerScope);
    const previous=service.read(pairedToken),lineages=service.lineages(pairedToken);
    const check=(read,expected)=>{
      // Compare the complete JSON value contract; SDK dictionaries deliberately
      // have null prototypes and optional undefined members are not wire data.
      read=copy(read);
      const {skillBook,...inventory}=read.state;
      assert.deepEqual(inventory,expected.inventory,original.label+' inventory');
      assert.deepEqual(skillBook,{known:expected.input.learned,bar:expected.bar},original.label+' book');
      assert.deepEqual(read.projection,expected.view,original.label+' build');
      assert.equal(read.nextUid,expected.nextUid,original.label+' counter');
      assert.deepEqual(read.relicWrites,[],original.label+' canonical writes');
    };
    check(previous,before);
    const command=copy(original.request),conditions=copy(original.conditions);
    const result=service.support(pairedToken,ownerScope,command,conditions),next=service.read(result.token);
    check(next,after);
    assert.deepEqual({changed:result.changed,needsSave:result.needsSave,events:result.events,refusal:result.refusal},
      {changed:original.changed,needsSave:original.needsSave,events:original.events,refusal:original.refusal},original.label+' reply/effect order');
    assert.deepEqual(service.read(pairedToken),previous,original.label+' predecessor');
    assert.deepEqual(command,original.request);assert.deepEqual(conditions,original.conditions);
    const nextLineages=service.lineages(result.token);
    for(const[key,lifetime]of lineages)assert.equal(nextLineages.get(key),lifetime,original.label+' '+key+' lifetime');
    pairedObservations.push({label:original.label,nextUid:next.nextUid,inventory:next.state,projection:next.projection,
      changed:result.changed,needsSave:result.needsSave,events:result.events,...(result.refusal?{refusal:result.refusal}:{})});
    pairedToken=result.token;
  });
}
}
assert.equal(pairedObservations.length,16);
const completeBefore=service.read(pairedToken),completeScope=scope();completeScope.account.features=copy(allSupportOriginal.original.at(-1).after.input.features);
const completeItem=completeBefore.state.items.find(item=>item.gem?.kind==='support');assert(completeItem);
const completeStored=completeBefore.state.items.find(item=>item.gem?.kind==='skill');assert(completeStored);
const completeRequest={op:'socket',residence:'learned',skillId:'firebolt',uid:completeItem.uid};
const completeCall=request=>service.support(pairedToken,completeScope,request,{hold:null});
observe('a learned residence cannot address an equipment host',()=>{
  assert.throws(()=>completeCall({...completeRequest,hostUid:4}),/unknown-field/);same(service.read(pairedToken),completeBefore);
});
observe('an old granted target cannot edit a newly learned same-ID skill',()=>{
  assert.throws(()=>completeCall({...completeRequest,residence:'granted',hostUid:4}),/learned-skill-takes-precedence/);
  same(service.read(pairedToken),completeBefore);
});
observe('support command residence is required and admits no unknown variant',()=>{
  const missing={...completeRequest};delete missing.residence;
  for(const request of [missing,{...completeRequest,residence:'equipped'}])assert.throws(()=>completeCall(request),/invalid-support-residence/);
  same(service.read(pairedToken),completeBefore);
});
observe('stored skill gems cannot receive support installation through a removal endpoint',()=>{
  assert.throws(()=>completeCall({...completeRequest,residence:'stored',uid:completeStored.uid}),/stored-support-installation-unavailable/);
  same(service.read(pairedToken),completeBefore);
});
observe('missing learned ownership refuses before custody changes',()=>{
  assert.throws(()=>completeCall({...completeRequest,skillId:'fireball'}),/foreign-learned-support-skill/);same(service.read(pairedToken),completeBefore);
});
observe('stale stored wrappers and support witnesses cannot remove investment',()=>{
  const request={op:'unsocket',residence:'stored',skillId:'firebolt',uid:completeStored.uid,index:0,supportId:'arcing'};
  for(const changed of [request,{...request,uid:999999},{...request,skillId:'fireball'},{...request,supportId:'splitting'}]){
    const result=completeCall(changed);assert.equal(result.token,pairedToken);assert(!result.changed&&!result.needsSave);
    assert.equal(result.refusal,'stale-socket');same(result.events,[]);same(service.read(pairedToken),completeBefore);
  }
});

// Trusted original observations enter through a distinct method. Cold save
// admission cannot request retained-budget handling through data fields.
const adoptedRows=[];
for(const original of raw.original){
  const request=input(original.input);request.state.skillBook={known:copy(original.input.learned),bar:original.view.bar.map(row=>row?.id??null)};
  const ownerScope=scope();ownerScope.account.features=copy(original.input.features);
  if(original.input.containers.reliquary?.length){
    const state=copy(active.relics.state);state.items=copy(original.input.containers.reliquary);state.seated=state.items.map(row=>row.relicKey);
    state.rank=original.input.relicEmpowerment/defs.relicPowerPerRank;state.enabled=original.input.relicEnabled;
    // Complete typed bodies/custody pass the existing account codec. These are
    // trusted fixture scope inputs, not a new account-owner transaction.
    ownerScope.relics={role:'active',state:codec.decode(codec.encode(state))};
  }
  let token;
  observe('trusted workshop adoption: '+original.label,()=>{
    const before=copy({request,ownerScope,seed:original.seed});
    assert.doesNotThrow(()=>{token=service.adopt(request,ownerScope,original.seed);});
    assert.deepEqual(copy(service.read(token).projection),original.view);
    assert.deepEqual(copy({request,ownerScope,seed:original.seed}),before);
    const next=service.rebuild(token,projected(token),ownerScope);
    assert.deepEqual(copy(service.read(next)),copy(service.read(token)));
    for(const[key,value]of service.lineages(token))assert.equal(service.lineages(next).get(key),value);
    adoptedRows.push({original,token,ownerScope,request});
  });
}
const retainedGrant=adoptedRows[0],retainedLearned=adoptedRows[3];
observe('cold grant normalization remains separate from trusted live adoption',()=>{
  assert.equal(service.read(service.admit(retainedGrant.request,retainedGrant.ownerScope)).projection.grants.find(row=>row[0]==='firebolt')[1].tree.length,1);
  assert.equal(service.read(retainedGrant.token).projection.grants.find(row=>row[0]==='firebolt')[1].tree.length,2);
});
observe('cold learned save admission still enforces the ordinary point budget',()=>{
  assert.throws(()=>service.admit(retainedLearned.request,retainedLearned.ownerScope),/invalid-skill-tree/);
});
observe('a save cannot grant itself trusted adoption authority',()=>{
  assert.throws(()=>service.admit({...retainedLearned.request,adoption:retainedLearned.original.seed},retainedLearned.ownerScope),/unknown-field/);
});
observe('new learned ownership during a warm rebuild retains strict admission',()=>{
  const request=projected(retainedGrant.token);request.state.skillBook.known=copy(retainedLearned.original.input.learned);
  assert.throws(()=>service.rebuild(retainedGrant.token,request,retainedGrant.ownerScope),/invalid-skill-tree/);
});
observe('retained learned investment still validates graph structure and ranks',()=>{
  const request=projected(retainedLearned.token);request.state.skillBook.known[0].gem.treeNodes=['unknown-node'];
  assert.throws(()=>service.rebuild(retainedLearned.token,request,retainedLearned.ownerScope),/invalid-skill-tree/);
});
observe('retained budget handling never applies to physical skill-gem cargo',()=>{
  const request=projected(retainedLearned.token),invalid=copy(completeStored);
  Object.assign(invalid,{uid:900003,x:0,y:0,gem:copy(retainedLearned.original.input.learned[0].gem)});request.state.items.push(invalid);
  assert.throws(()=>service.rebuild(retainedLearned.token,request,retainedLearned.ownerScope),/invalid-skill-tree/);
});
observe('support preparation preserves already retained learned investment',()=>{
  const request=projected(retainedLearned.token),item=wrapper('arcing',900004);request.state.items.push(item);
  const before=service.rebuild(retainedLearned.token,request,retainedLearned.ownerScope),held=service.read(before);
  const result=service.support(before,retainedLearned.ownerScope,{op:'socket',residence:'learned',skillId:'firebolt',uid:item.uid},{hold:null});
  assert(result.changed&&result.needsSave);const next=service.read(result.token);
  assert.equal(next.state.skillBook.known[0].gem.treeNodes.length,2);assert.equal(next.state.skillBook.known[0].locked,true);
  assert.equal(next.state.skillBook.known[0].gem.sockets[0].supportId,'arcing');
  assert.equal(service.lineages(before).get('learned/firebolt'),service.lineages(result.token).get('learned/firebolt'));same(service.read(before),held);
});

function withAbility(request,wallet={}){request.character={...request.character,schemaVersion:2,capability:'workshop-character/progression-diagnostic',abilityEssences:copy(wallet)};return request;}
const residence=new ResidenceAdmission({...defs,catalogue:pack.definitions}),rScope=scope(),nativeResidence=residenceOriginal.original;
const originalRow=label=>nativeResidence.find(row=>row.label===label);
function residenceRequest(state,nextUid=1000000){
  const request=input();request.capability='character-workshop/residence-diagnostic';withAbility(request);request.state.equipped={};request.character.containers={};
  request.state.skillBook={known:copy(state.known),bar:copy(state.bar)};request.state.items=copy(state.items);request.nextUid=nextUid;return request;
}
function residenceSaved(token){const value=residence.read(token);return{capability:'character-workshop/residence-diagnostic',state:value.state,character:value.character,nextUid:value.nextUid};}
const residenceView=token=>{const value=residence.read(token);return copy({known:value.state.skillBook.known,bar:value.state.skillBook.bar,items:value.state.items});};
const initialResidence=originalRow('trusted-lowered-learned').state,firstMove=originalRow('unlearn-into-bag');
const rawResidence=residenceRequest(initialResidence,firstMove.next),coldResidence=residence.admit(rawResidence,rScope);
const observedResidence={sourceOrder:residence.read(coldResidence).projection.sources.map(row=>row[0]),grants:[],companions:[]};
const adoptedResidence=residence.adopt(rawResidence,rScope,observedResidence);let currentResidence=adoptedResidence;
// Independent ownership invariants, additional to the frozen original observations.
{
 const beforeRead=JSON.stringify(residence.read(coldResidence)),exposed=residence.read(coldResidence);
 exposed.state.skillBook.known[0].gem.level+=1;
 assert.equal(JSON.stringify(residence.read(coldResidence)),beforeRead,'character read leaked mutable ownership');
 assert.throws(()=>residence.rebuild(coldResidence,residenceSaved(coldResidence),{...rScope,profile:rScope.profile+1}),/foreign-workshop-scope/);
 assert(firstMove.after.items.length>0,'UID-floor fixture requires physical cargo');
 assert.throws(()=>residence.admit(residenceRequest(firstMove.after,1),rScope),/character-uid-floor/);
}

observe('complete residence: trusted original investment stays warm',()=>{
  assert.deepEqual(residenceView(adoptedResidence),initialResidence);assert.equal(residence.read(adoptedResidence).state.skillBook.known[0].gem.treeNodes.length,2);
});
observe('complete residence: cold learned save uses the original budget repair',()=>{
  assert.deepEqual(copy(residence.read(coldResidence).state.skillBook.known),originalRow('cold-learned-save').known);
  assert.deepEqual(rawResidence.state.skillBook.known,initialResidence.known);
});
observe('complete residence: actual unlearn projection and UID use match',()=>{
  const before=residence.read(currentResidence),result=residence.rack(currentResidence,rScope,{op:'unlearn',skillId:'firebolt'},{meets:true,blocked:{}});
  assert(result.changed&&result.needsSave);assert.deepEqual(residenceView(result.token),firstMove.after);
  assert.equal(residence.read(result.token).nextUid,firstMove.next+firstMove.allocated);assert.deepEqual(residence.read(currentResidence),before);currentResidence=result.token;
});
observe('complete residence: own saved physical cargo restores without trimming',()=>{
  const restored=residence.admit(residenceSaved(currentResidence),rScope),expected=originalRow('cold-bag-save');
  assert.deepEqual(copy(residence.read(restored).state.items),expected.items);assert.deepEqual(copy(residence.read(restored).state.skillBook.known),expected.known);
});
observe('complete residence: stored support removal preserves original cargo',()=>{
  const original=originalRow('stored-unsocket-retains-investment'),request=residenceSaved(currentResidence);
  // Original before/after UID observers consume addresses. Advancing the owned
  // counter here is an explicit observation fixture, not a player operation.
  request.nextUid=original.next;currentResidence=residence.rebuild(currentResidence,request,rScope);
  const uid=original.before.items.find(row=>row.gem?.kind==='skill').uid;
  const result=residence.support(currentResidence,rScope,{op:'unsocket',residence:'stored',skillId:'firebolt',uid,index:0,supportId:'arcing'},{hold:null});
  assert(result.changed);assert.deepEqual(residenceView(result.token),original.after);
  assert.equal(residence.read(result.token).nextUid,original.next+original.allocated);currentResidence=result.token;
});
observe('complete residence: relearning creates the original repaired investment',()=>{
  const original=originalRow('relearn-from-bag'),request=residenceSaved(currentResidence);request.nextUid=original.next;
  currentResidence=residence.rebuild(currentResidence,request,rScope);const uid=original.before.items.find(row=>row.gem?.kind==='skill').uid;
  const result=residence.rack(currentResidence,rScope,{op:'learn',uid,slot:2},{meets:true,blocked:{}});
  assert(result.changed);assert.deepEqual(residenceView(result.token),original.after);
  assert.equal(residence.read(result.token).nextUid,original.next+original.allocated);
  assert.notEqual(residence.lineages(result.token).get('learned/firebolt'),residence.lineages(adoptedResidence).get('learned/firebolt'));currentResidence=result.token;
});
observe('complete residence: saved relearned state restores to the original result',()=>{
  const restored=residence.admit(residenceSaved(currentResidence),rScope),expected=originalRow('cold-relearned-save');
  assert.deepEqual(copy(residence.read(restored).state.skillBook.known),expected.known);assert.deepEqual(copy(residence.read(restored).state.items),expected.items);
});
observe('complete residence: legacy public item admission remains strict',()=>{
  assert.throws(()=>new OriginalData(defs.workshop).item(copy(firstMove.after.items[0])),/invalid-skill-tree/);
});
observe('complete residence: a separate capability is required',()=>{
  assert.throws(()=>residence.admit({...rawResidence,capability:'character-workshop/diagnostic'},rScope),/unsupported-character-workshop/);
  assert.throws(()=>residence.admit({...rawResidence,retained:true},rScope),/unknown-field/);
});
observe('complete residence: structural tree validation precedes cold repair',()=>{
  const malformed=copy(rawResidence);malformed.state.skillBook.known[0].gem.treeNodes=['unknown-node'];
  assert.throws(()=>residence.admit(malformed,rScope),/invalid-skill-tree/);
  const cargo=residenceRequest(firstMove.after);cargo.state.items[0].gem.treeNodes=['unknown-node'];assert.throws(()=>residence.admit(cargo,rScope),/invalid-skill-tree/);
});
observe('complete residence: full-bag refusal keeps investment and consumes the original minted UID',()=>{
  const request=residenceSaved(adoptedResidence);request.state.board={w:1,h:1};request.state.items=[{...wrapper('arcing',900000),x:0,y:0}];request.nextUid=1000000;
  const before=residence.rebuild(adoptedResidence,request,rScope),held=residence.read(before),result=residence.rack(before,rScope,{op:'unlearn',skillId:'firebolt'},{meets:true,blocked:{}});
  assert(!result.changed&&result.needsSave);assert.equal(result.refusal,'no room in the bag');assert.equal(residence.read(result.token).nextUid,1000001);
  assert.deepEqual(residenceView(result.token),residenceView(before));assert.equal(residence.lineages(result.token).get('learned/firebolt'),residence.lineages(before).get('learned/firebolt'));
  assert.deepEqual(residence.read(before),held);
});
observe('complete residence: host holds and requirements refuse without consuming custody',()=>{
  const held=residence.read(adoptedResidence),result=residence.rack(adoptedResidence,rScope,{op:'unlearn',skillId:'firebolt'},{meets:true,blocked:{firebolt:'mid-cast'}});
  assert(!result.changed&&!result.needsSave);assert.equal(result.token,adoptedResidence);assert.equal(result.refusal,'mid-cast');assert.deepEqual(residence.read(adoptedResidence),held);
  const loose=residence.admit(residenceRequest(firstMove.after),rScope),uid=firstMove.after.items[0].uid;
  const refused=residence.rack(loose,rScope,{op:'learn',uid,slot:2},{meets:false,blocked:{}});assert.equal(refused.token,loose);assert.equal(refused.refusal,'requirements unmet');
});
observe('complete residence: a same-ID learned copy is a replacement with a new lineage',()=>{
  const request=residenceSaved(adoptedResidence),incoming=copy(firstMove.after.items[0]);incoming.uid=900000;incoming.gem.level=10;delete incoming.locked;
  request.state.items=[incoming];request.nextUid=1000000;const before=residence.rebuild(adoptedResidence,request,rScope),held=residence.read(before);
  const result=residence.rack(before,rScope,{op:'learn',uid:incoming.uid,slot:2},{meets:true,blocked:{}});assert(result.changed);
  const value=residence.read(result.token);assert.notEqual(residence.lineages(result.token).get('learned/firebolt'),residence.lineages(before).get('learned/firebolt'));
  assert.equal(value.state.skillBook.known[0].gem.level,10);assert.equal(value.state.skillBook.known[0].locked,undefined);
  assert.equal(value.state.items.length,1);assert.equal(value.state.items[0].gem.treeNodes.length,2);assert.equal(value.state.items[0].locked,true);
  assert.equal(value.state.skillBook.bar[2],'firebolt');assert.deepEqual(residence.read(before),held);
});
observe('complete residence: granted ownership cannot mint a learned gem',()=>{
  const request=input();request.capability='character-workshop/residence-diagnostic';withAbility(request);const token=residence.admit(request,rScope);
  const result=residence.rack(token,rScope,{op:'unlearn',skillId:'firebolt'},{meets:true,blocked:{}});
  assert(!result.changed&&!result.needsSave);assert.equal(result.token,token);assert.match(result.refusal,/granted by your gear/);
});
observe('complete residence: exact blocked cell refuses before forgetting',()=>{
  const request=residenceSaved(adoptedResidence);request.state.board={w:2,h:1,rows:['.#']};
  const before=residence.rebuild(adoptedResidence,request,rScope),result=residence.rack(before,rScope,{op:'unlearn',skillId:'firebolt',x:0,y:0},{meets:true,blocked:{}});
  assert(!result.changed&&result.needsSave);assert.equal(result.refusal,'no room there');assert.deepEqual(residenceView(result.token),residenceView(before));
  assert.throws(()=>residence.rack(before,rScope,{op:'unlearn',skillId:'firebolt',x:1},{meets:true,blocked:{}}),/partial-placement/);
});

observe('complete bar: moving learned ownership preserves investment and lineage',()=>{
  const before=residence.read(adoptedResidence),result=residence.bar(adoptedResidence,rScope,{op:'bind',slot:0,skillId:'firebolt'});
  assert(result.accepted&&result.changed);const next=residence.read(result.token);
  assert.equal(next.state.skillBook.bar[0],'firebolt');assert.equal(next.state.skillBook.bar[2],null);
  assert.deepEqual(next.state.skillBook.known,before.state.skillBook.known);assert.equal(next.projection.bar[0].tree.length,2);
  assert.equal(residence.lineages(result.token).get('learned/firebolt'),residence.lineages(adoptedResidence).get('learned/firebolt'));
  assert.deepEqual(residence.read(adoptedResidence),before);
});
const grantedBarRequest=input();grantedBarRequest.capability='character-workshop/residence-diagnostic';withAbility(grantedBarRequest);
const grantedBar=residence.admit(grantedBarRequest,rScope);
observe('complete bar: equipment grants move without a learned echo',()=>{
  const result=residence.bar(grantedBar,rScope,{op:'bind',slot:1,skillId:'firebolt'});assert(result.accepted&&result.changed);
  const next=residence.read(result.token);assert.equal(next.state.skillBook.known.length,0);assert.equal(next.state.skillBook.bar[1],'firebolt');assert.equal(next.state.skillBook.bar[2],null);
  assert.equal(residence.lineages(result.token).get('grant/firebolt'),residence.lineages(grantedBar).get('grant/firebolt'));
});
observe('complete bar: rebinding an occupied same-ID seat toggles it off',()=>{
  const result=residence.bar(adoptedResidence,rScope,{op:'bind',slot:2,skillId:'firebolt'});assert(result.accepted&&result.changed);
  const next=residence.read(result.token);assert.equal(next.state.skillBook.bar[2],null);assert.equal(next.state.skillBook.known[0].gem.treeNodes.length,2);
});
observe('complete bar: learned ownership shadows its separately retained equipment grant',()=>{
  const request=copy(retainedLearned.request);request.capability='character-workshop/residence-diagnostic';withAbility(request);
  const before=residence.adopt(request,retainedLearned.ownerScope,retainedLearned.original.seed);
  const result=residence.bar(before,retainedLearned.ownerScope,{op:'bind',slot:0,skillId:'firebolt'}),next=residence.read(result.token);
  assert.deepEqual(next.projection.bar[0],next.projection.known.find(row=>row[0]==='firebolt')[1]);
  assert.equal(residence.lineages(result.token).get('grant/firebolt'),residence.lineages(before).get('grant/firebolt'));
  assert.equal(next.state.skillBook.known[0].gem.treeNodes.length,2);
});
observe('complete bar: swapping learned occupants retains both lineages',()=>{
  const request=residenceSaved(adoptedResidence);request.state.skillBook.known.push({gem:{kind:'skill',skillId:'fireball',level:1,rarity:'common',sockets:[null,null]}});
  const before=residence.rebuild(adoptedResidence,request,rScope,['fireball',null,'firebolt',null,null,null,null,null]);
  const result=residence.bar(before,rScope,{op:'swap',a:0,b:2});assert(result.accepted&&result.changed);
  assert.deepEqual(residence.read(result.token).state.skillBook.bar,['firebolt',null,'fireball',null,null,null,null,null]);
  for(const id of ['fireball','firebolt'])assert.equal(residence.lineages(result.token).get('learned/'+id),residence.lineages(before).get('learned/'+id));
});
observe('complete bar: carried skill cargo does not authorize a binding',()=>{
  const stored=copy(completeStored);stored.uid=900010;stored.x=0;stored.y=0;
  const request=residenceRequest({known:[],bar:Array(8).fill(null),items:[stored]},1000000);
  const before=residence.admit(request,rScope),result=residence.bar(before,rScope,{op:'bind',slot:0,skillId:stored.gem.skillId});
  assert(!result.accepted&&!result.changed&&!result.needsSave);assert.equal(result.token,before);assert.deepEqual(result.events,[]);
});
observe('complete bar: malformed slots and foreign scope refuse without changing ownership',()=>{
  const before=residence.read(adoptedResidence);
  for(const request of [{op:'bind',slot:-1,skillId:'firebolt'},{op:'bind',slot:8,skillId:'firebolt'},{op:'swap',a:0.5,b:2}])assert.throws(()=>residence.bar(adoptedResidence,rScope,request),/invalid-integer/);
  assert.throws(()=>residence.bar(adoptedResidence,{...rScope,profile:999},{op:'bind',slot:0,skillId:'firebolt'}),/foreign-workshop-scope/);
  assert.deepEqual(residence.read(adoptedResidence),before);
});
observe('complete bar: empty swaps and self-swaps preserve the original no-op behavior',()=>{
  const empty=residence.bar(adoptedResidence,rScope,{op:'swap',a:6,b:7});assert(empty.accepted&&!empty.changed);assert.equal(empty.token,adoptedResidence);assert.deepEqual(empty.events,[]);
  const self=residence.bar(adoptedResidence,rScope,{op:'swap',a:2,b:2});assert(!self.accepted&&!self.changed);assert.equal(self.token,adoptedResidence);
});
observe('complete bar: event-only empty unbind remains observable',()=>{
  const result=residence.bar(adoptedResidence,rScope,{op:'bind',slot:0,skillId:null});assert(result.accepted&&!result.changed&&!result.needsSave);
  assert.equal(result.token,adoptedResidence);assert.deepEqual(result.events,[{kind:'bar-rebound',skillIds:[]}]);
});
observe('complete bar: before-and-after preference observations retain their order',()=>{
  const result=residence.bar(adoptedResidence,rScope,{op:'bind',slot:0,skillId:'firebolt'});
  assert.deepEqual(result.events,[{kind:'remember-skill-slot',skillId:'firebolt',slot:0},{kind:'bar-rebound',skillIds:['firebolt']}]);
  const removed=residence.bar(adoptedResidence,rScope,{op:'bind',slot:2,skillId:null});
  assert.deepEqual(removed.events,[{kind:'remember-skill-slot',skillId:'firebolt',slot:2},{kind:'remember-skill-slot',skillId:'firebolt',slot:-1},{kind:'bar-rebound',skillIds:['firebolt']}]);
});

assert.equal(graftOriginal.fixture,'synthetic-passive-graft');
const syntheticNode=graftOriginal.node,graftPack=copy(pack),graftPolicy=copy(extra.passives);
graftPack.contentId+=':graft-residence-fixture';graftPack.passives.contentId+=':graft-residence-fixture';graftPolicy.contentId+=':graft-residence-fixture';
graftPack.passives.nodes.push({id:syntheticNode.id,name:syntheticNode.name,description:syntheticNode.description,graft:copy(syntheticNode.graft)});
graftPolicy.nodes.push({id:syntheticNode.id,name:syntheticNode.name,graft:copy(syntheticNode.graft)});graftPolicy.adjacency[syntheticNode.id]=[];
const graftDefinitions={...defs,catalogue:graftPack.definitions,builds:createCharacterBuilds(graftPack),character:{...defs.character,passives:new PassivePolicy(graftPolicy)}};
const graftService=new ResidenceAdmission(graftDefinitions),graftScope=scope(),graftRow=label=>graftOriginal.original.find(row=>row.label===label);
const graftInitial=graftRow('owned-passive-graft').state,graftUnlearned=graftRow('unlearn-retains-passive-assignment').state;
const graftRequest=residenceRequest(graftInitial,graftUnlearned.items[0].uid);
graftRequest.character.passives.allocated=copy(graftInitial.allocated);graftRequest.character.passives.choices=copy(graftInitial.choices);graftRequest.character.passives.grafts=copy(graftInitial.grafts);
let graftCurrent=graftService.admit(graftRequest,graftScope);
const graftSaved=token=>{const value=graftService.read(token);return{capability:'character-workshop/residence-diagnostic',state:value.state,character:value.character,nextUid:value.nextUid};};
const graftView=token=>{const value=graftService.read(token);return copy({known:value.state.skillBook.known,bar:value.state.skillBook.bar,items:value.state.items,
  grafts:value.character.passives.grafts,allocated:value.character.passives.allocated,choices:value.character.passives.choices,
  liveGrafts:value.projection.known.map(([id,row])=>[id,row.grafts??[]])});};
observe('synthetic original graft: admitted earned source derives onto its learned owner',()=>{assert.deepEqual(graftView(graftCurrent),graftInitial);});
observe('synthetic original graft: unlearn preserves the assignment without packing derived support',()=>{
  const before=graftService.read(graftCurrent),result=graftService.rack(graftCurrent,graftScope,{op:'unlearn',skillId:'firebolt'},{meets:true,blocked:{}});assert(result.changed);
  assert.deepEqual(graftView(result.token),graftUnlearned);assert.deepEqual(graftService.read(graftCurrent),before);graftCurrent=result.token;
});
observe('synthetic original graft: warm rebuild keeps an earned unbound assignment',()=>{
  const next=graftService.rebuild(graftCurrent,graftSaved(graftCurrent),graftScope);
  assert.deepEqual(graftView(next),graftRow('warm-rebuild-retains-unbound-assignment').state);graftCurrent=next;
});
observe('synthetic original graft: cold save restoration drops the unowned target',()=>{
  const request=graftSaved(graftCurrent),before=copy(request),restored=graftService.admit(request,graftScope),expected=graftRow('cold-restore-drops-unowned-target'),value=graftService.read(restored);
  assert.deepEqual(copy(value.character.passives.grafts),expected.grafts);assert.deepEqual(copy(value.state.skillBook.known),expected.known);assert.deepEqual(copy(value.state.items),expected.items);assert.deepEqual(copy(request),before);
});
observe('synthetic original graft: warm relearning reconnects the retained assignment',()=>{
  const uid=graftUnlearned.items[0].uid,result=graftService.rack(graftCurrent,graftScope,{op:'learn',uid,slot:2},{meets:true,blocked:{}});assert(result.changed);
  assert.deepEqual(graftView(result.token),graftRow('warm-relearn-restores-passive-graft').state);
});
observe('synthetic original graft: unknown targets and unearned sources remain invalid',()=>{
  const unknown=graftSaved(graftCurrent);unknown.character.passives.grafts[syntheticNode.id]='not-an-authored-skill';
  assert.throws(()=>graftService.rebuild(graftCurrent,unknown,graftScope),/unknown-graft-carrier/);
  const unearned=graftSaved(graftCurrent);unearned.character.passives.allocated=unearned.character.passives.allocated.filter(id=>id!==syntheticNode.id);
  assert.throws(()=>graftService.rebuild(graftCurrent,unearned,graftScope),/invalid-character-passives/);
});
observe('synthetic original graft: legacy character admission keeps its strict ownership link',()=>{
  const value=graftService.read(graftCurrent),legacy=new LegacyCharacterData(graftDefinitions.character,defs.workshop);
  assert.throws(()=>legacy.admit((({abilityEssences,...rest})=>({...rest,schemaVersion:1,capability:'workshop-character/v1'}))(value.character),{...value.state,account:graftScope.account}),/unknown-graft-carrier/);
});

const progressConditions={nearFont:true,memory:{},hold:null};
const progressView=token=>{const value=residence.read(token);return copy({known:value.state.skillBook.known,bar:value.state.skillBook.bar,items:value.state.items,abilityEssences:value.character.abilityEssences});};
const progressRequest=row=>withAbility(residenceRequest(row),row.abilityEssences);
const progressOriginal=progressionOriginal.original;
for(const row of progressOriginal)observe('original progression: '+row.label,()=>{
  const request=progressRequest(row.before),before=residence.admit(request,rScope),held=residence.read(before),inputBefore=copy(request),conditionsBefore=copy(row.conditions);
  const result=residence.progression(before,rScope,row.request,row.conditions);
  assert.deepEqual(progressView(result.token),row.after);
  if(typeof row.result==='boolean')assert.equal(result.accepted,row.result);
  if(row.request.op==='levelSupportSocket')assert.equal(result.events.filter(e=>e.kind==='resync-supports').length,row.refreshes);
  assert.deepEqual(residence.read(before),held);assert.deepEqual(request,inputBefore);assert.deepEqual(row.conditions,conditionsBefore);
  assert.deepEqual(residence.read(result.token).state.essences,held.state.essences);
  assert.equal(residence.read(result.token).nextUid,held.nextUid);
  assert.deepEqual(residence.lineages(result.token),residence.lineages(before));
});
const progressBase=progressOriginal.find(row=>row.label==='skill-milestone'),progressInput=progressRequest(progressBase.before),progressToken=residence.admit(progressInput,rScope);
observe('ability wallet requires explicit context version and never treats crafting currency as ability funding',()=>{
  const legacy=copy(progressInput);legacy.character.schemaVersion=1;legacy.character.capability='workshop-character/v1';delete legacy.character.abilityEssences;
  assert.throws(()=>residence.admit(legacy,rScope),/unsupported-progression-character/);
  const missing=copy(progressInput);delete missing.character.abilityEssences;assert.throws(()=>residence.admit(missing,rScope),/invalid-object/);
  const empty=copy(progressInput);empty.character.abilityEssences={};const token=residence.admit(empty,rScope),result=residence.progression(token,rScope,{op:'levelSkill',skillId:'firebolt'},progressConditions);
  assert.equal(result.accepted,false);assert.equal(result.changed,false);assert.equal(result.token,token);assert.match(result.refusal,/needs/);
});
observe('ability wallet admits fractional owned currency but rejects unknown and negative balances',()=>{
  assert.equal(residence.read(progressToken).character.abilityEssences.ability1,1000.5);
  for(const wallet of [{unknown:1},{ability1:-1}]){const request=copy(progressInput);request.character.abilityEssences=wallet;assert.throws(()=>residence.admit(request,rScope),/invalid-ability-wallet/);}
  const poisoned=copy(progressInput);Object.defineProperty(poisoned.character.abilityEssences,'ability1',{get(){throw Error('must not execute');},enumerable:true});assert.throws(()=>residence.admit(poisoned,rScope),/invalid-property/);
});
observe('new ability wallet is not accepted by the legacy character protocol',()=>{
  const legacy=new LegacyCharacterData(defs.character,defs.workshop);assert.throws(()=>legacy.admit(progressInput.character,{...progressInput.state,account:rScope.account}),/unknown-field/);
});
observe('ability progression keeps grant-derived levels and granted socket restrictions',()=>{
  const request=withAbility(input(),{ability1:1000});request.capability='character-workshop/residence-diagnostic';
  request.state.equipped.helmet.grantState.firebolt.sockets[0]={supportId:'arcing',level:1};
  const token=residence.admit(request,rScope),before=residence.read(token);
  assert.equal(before.projection.grants.find(([id])=>id==='firebolt')[1].sockets[0].id,'arcing');
  const level=residence.progression(token,rScope,{op:'levelSkill',skillId:'firebolt'},progressConditions);assert(!level.accepted&&!level.changed);assert.match(level.refusal,/gear/);
  const socket=residence.progression(token,rScope,{op:'levelSupportSocket',skillId:'firebolt',index:0},progressConditions);assert(!socket.accepted&&!socket.changed);assert.deepEqual(socket.events,[]);assert.deepEqual(residence.read(socket.token),before);
  const reset=residence.progression(token,rScope,{op:'reset',skillId:'firebolt'},progressConditions);assert(!reset.accepted&&!reset.changed);
});
observe('tree picks on a worn grant write its residence and retain its private lineage',()=>{
  const request=withAbility(input(),{ability1:1000});request.capability='character-workshop/residence-diagnostic';request.state.equipped.helmet.grantState.firebolt.treeNodes=[];
  const token=residence.admit(request,rScope),before=residence.read(token),result=residence.progression(token,rScope,{op:'pick',skillId:'firebolt',nodeId:'flame_studies'},progressConditions);
  assert(result.accepted&&result.changed);assert.deepEqual(residence.read(result.token).state.equipped.helmet.grantState.firebolt.treeNodes,['flame_studies']);
  assert.deepEqual(residence.lineages(result.token),residence.lineages(token));assert.deepEqual(residence.read(token),before);
});
observe('upgrade commands reject malformed or save-carried permission fields without touching the continuation',()=>{
  const before=residence.read(progressToken);
  for(const request of [{op:'levelSkill',skillId:'firebolt',nearFont:true},{op:'levelSupportInv',uid:-1},{op:'levelSupportSocket',skillId:'firebolt',index:1.5},{op:'convert',tier:1,direction:'sideways'},{op:'no-such-command'}])
    assert.throws(()=>residence.progression(progressToken,rScope,request,progressConditions),/unknown-field|invalid-integer|invalid-conversion-direction|unsupported-progression-command/);
  assert.throws(()=>residence.progression(progressToken,rScope,{op:'levelSkill',skillId:'firebolt'},{...progressConditions,hold:true}),/invalid-string/);assert.deepEqual(residence.read(progressToken),before);
});
observe('refused socket upgrade keeps its refresh event without replacing the durable token',()=>{
  const row=progressOriginal.find(row=>row.label==='socket-support-poor-refreshes'),token=residence.admit(progressRequest(row.before),rScope),result=residence.progression(token,rScope,row.request,row.conditions);
  assert.equal(result.token,token);assert(!result.accepted&&!result.changed);assert(result.events.some(e=>e.kind==='resync-supports'));
});
observe('loose refused upgrade preserves original display normalization as a durable change',()=>{
  const row=progressOriginal.find(row=>row.label==='loose-support-poor-normalizes-wrapper'),token=residence.admit(progressRequest(row.before),rScope),result=residence.progression(token,rScope,row.request,row.conditions);
  assert.equal(result.accepted,false);assert.equal(result.changed,true);assert.notEqual(result.token,token);
});
observe('upgrade wallet survives subsequent bar and custody commands and cold restoration',()=>{
  let token=residence.progression(progressToken,rScope,{op:'levelSkill',skillId:'firebolt'},progressConditions).token;
  token=residence.progression(token,rScope,{op:'pick',skillId:'firebolt',nodeId:'flame_studies'},progressConditions).token;
  const wallet=copy(residence.read(token).character.abilityEssences);
  token=residence.bar(token,rScope,{op:'bind',slot:4,skillId:'firebolt'}).token;
  token=residence.rack(token,rScope,{op:'unlearn',skillId:'firebolt'},{meets:true,blocked:{}}).token;
  const gem=residence.read(token).state.items.find(item=>item.gem?.kind==='skill');assert(gem);
  token=residence.rack(token,rScope,{op:'learn',uid:gem.uid,slot:4},{meets:true,blocked:{}}).token;
  assert.deepEqual(copy(residence.read(token).character.abilityEssences),wallet);
  const cold=residence.admit(residenceSaved(token),rScope);assert.deepEqual(copy(residence.read(cold).character.abilityEssences),wallet);assert.deepEqual(progressView(cold),progressView(token));
});

const mergeOriginalRows=mergeOriginal.original;
const mergeRequest=row=>{const request=withAbility(residenceRequest(row.before,row.next),row.before.abilityEssences);request.state.board=copy(row.before.board);return request;};
const mergeView=token=>{const value=residence.read(token);return copy({board:value.state.board,known:value.state.skillBook.known,bar:value.state.skillBook.bar,items:value.state.items,abilityEssences:value.character.abilityEssences});};
for(const row of mergeOriginalRows)observe('original merge: '+row.label,()=>{
  const request=mergeRequest(row),token=residence.admit(request,rScope),before=residence.read(token),inputBefore=copy(request),conditionsBefore=copy(row.conditions);
  const result=residence.merge(token,rScope,row.request,row.conditions),after=residence.read(result.token);
  assert.equal(result.accepted,row.accepted);assert.deepEqual(copy(result.preview),row.preview);assert.deepEqual(mergeView(result.token),row.after);
  assert.deepEqual(copy(result.worldDrops),row.drops);assert.equal(after.nextUid-row.next,row.allocated);
  assert.deepEqual(after.state.overflow,before.state.overflow);assert.deepEqual(after.state.essences,before.state.essences);
  assert.deepEqual(after.state.skillBook,before.state.skillBook);assert.deepEqual(residence.lineages(result.token),residence.lineages(token));
  assert.deepEqual(residence.read(token),before);assert.deepEqual(request,inputBefore);assert.deepEqual(row.conditions,conditionsBefore);
  assert.equal(result.events.filter(e=>e.kind==='world-drop-required').length,row.drops.length);
  if(!row.accepted){assert.equal(result.token,token);assert.equal(result.changed,false);assert.deepEqual(result.worldDrops,[]);}
});
const spillCase=mergeOriginalRows.find(row=>row.label==='legendary-full-bag-spill');
observe('merge spill obligations are bare owned gems, not duplicate durable overflow wrappers',()=>{
  const request=mergeRequest(spillCase),token=residence.admit(request,rScope),result=residence.merge(token,rScope,spillCase.request,spillCase.conditions),after=residence.read(result.token);
  assert.equal(result.worldDrops.length,3);assert.deepEqual(after.state.overflow,[]);
  for(const drop of result.worldDrops){assert.equal(drop.kind,'support');assert.equal(drop.locked,true);assert(!Object.hasOwn(drop,'uid'));assert(!Object.hasOwn(drop,'x'));assert(!Object.hasOwn(drop,'pos'));}
  assert.equal(after.nextUid-request.nextUid,5);assert(spillCase.randomDraws>=9);
  result.worldDrops[0].gem.level=999;result.preview.result.level=999;assert.deepEqual(residence.read(result.token),after);
});
observe('merge restrictions cannot be provided in a player request and foreign continuations refuse',()=>{
  const request=mergeRequest(spillCase),token=residence.admit(request,rScope),before=residence.read(token);
  assert.throws(()=>residence.merge(token,rScope,{...spillCase.request,nearFont:true},spillCase.conditions),/unknown-field/);
  assert.throws(()=>residence.merge(token,rScope,spillCase.request,{nearFont:'yes'}),/invalid-boolean/);
  assert.throws(()=>residence.merge(token,{...rScope,profile:2},spillCase.request,spillCase.conditions),/foreign-workshop-scope/);
  assert.deepEqual(residence.read(token),before);
});
observe('merge ignores a world block on the learned tree because original font merge has only its own eligibility gates',()=>{
  const row=mergeOriginalRows.find(row=>row.label==='common-funded'),request=mergeRequest(row),token=residence.admit(request,rScope);
  const result=residence.merge(token,rScope,row.request,{nearFont:true});assert(result.accepted);
  assert.equal(residence.read(result.token).state.skillBook.known.length,0);
});
observe('merge preparation honors blocked bag cells and returns every unplaced owed gem',()=>{
  const row=mergeOriginalRows.find(row=>row.label==='legendary-funded'),request=mergeRequest(row);
  // Existing wrappers fit their original cells. All other cells are blocked.
  const occupied=new Set(request.state.items.map(item=>item.x+','+item.y));request.state.board.rows=Array.from({length:request.state.board.h},(_,y)=>Array.from({length:request.state.board.w},(_,x)=>occupied.has(x+','+y)?'#':'.').join(''));
  const token=residence.admit(request,rScope),result=residence.merge(token,rScope,row.request,{nearFont:true});assert(result.accepted);assert.equal(result.worldDrops.length,3);
  assert.deepEqual(residence.read(result.token).state.overflow,[]);
});

const invAccess={salvage:true,oracle:true,bench:true,counter:true},invRandom={algorithm:'mulberry32/v1',state:41325,draws:0};
const invInput=withAbility(input(),{ability1:100.5});invInput.capability='character-workshop/residence-diagnostic';
const invToken=residence.admit(invInput,rScope),invBefore=residence.read(invToken);
observe('complete inventory: locking a worn host keeps a granted binding and its private lineage',()=>{
  const result=residence.inventory(invToken,rScope,{op:'lock',uid:invBefore.state.equipped.helmet.uid,on:true,access:invAccess},invRandom),after=residence.read(result.token);
  assert(result.reply.ok&&result.changed);assert.equal(after.state.equipped.helmet.locked,true);assert.equal(after.state.skillBook.bar[2],'firebolt');
  assert.equal(residence.lineages(result.token).get('grant/firebolt'),residence.lineages(invToken).get('grant/firebolt'));assert.deepEqual(after.character.abilityEssences,invBefore.character.abilityEssences);
  assert.deepEqual(residence.read(invToken),invBefore);assert.deepEqual(copy(result.random),invRandom);
});
observe('complete inventory: removing and returning a grant host retains cargo and replaces its grant lineage',()=>{
  const uid=invBefore.state.equipped.helmet.uid,removed=residence.inventory(invToken,rScope,{op:'unequip',uid,slot:'helmet'},invRandom),gone=residence.read(removed.token);
  assert(removed.reply.ok&&removed.changed);assert(!gone.projection.grants.some(([id])=>id==='firebolt'));assert(!gone.state.skillBook.bar.includes('firebolt'));assert(gone.state.items.some(item=>item.uid===uid));
  const returned=residence.inventory(removed.token,rScope,{op:'equip',uid,slot:'helmet',actorLevel:100},removed.random),back=residence.read(returned.token);
  assert(returned.reply.ok&&returned.changed);assert(back.projection.grants.some(([id])=>id==='firebolt'));assert(!back.state.items.some(item=>item.uid===uid));
  assert.notEqual(residence.lineages(returned.token).get('grant/firebolt'),residence.lineages(invToken).get('grant/firebolt'));
});
function legacyInventory(state,nextUid,command,random=invRandom){
  // Test-only control: the legacy protocol has no granted bindings. Compare
  // its ordinary inventory result while the complete candidate retains them.
  const control=new CraftingSession(workshop,1,new WorkshopSkillBook(items));control.configureEquipment(defs.equipment);
  const admitted=copy(state);admitted.skillBook.bar=Array(8).fill(null);
  assert(control.command({op:'open',profile:0,seed:random.state,nextUid,state:{...admitted,account:copy(rScope.account)}}).ok);
  const reply=control.command({...command,profile:0}),save=control.command({op:'save',profile:0}).save;assert(control.command({op:'close',profile:0}).ok);return{reply,save};
}
observe('complete inventory: authored mint preserves the same random and item continuation as the existing kernel',()=>{
  const command={op:'mint',kind:'roll',options:{baseId:'ring_lapis',ilvl:20,rarity:'magic'}},control=legacyInventory(invBefore.state,invBefore.nextUid,command);
  const result=residence.inventory(invToken,rScope,command,invRandom),after=residence.read(result.token);
  assert.deepEqual(copy(result.reply),copy(control.reply));assert.deepEqual(copy(result.random),copy(control.save.random));assert.deepEqual(copy(after.state.items),copy(control.save.state.items));
  assert.equal(after.nextUid,control.save.nextUid);assert.equal(after.state.skillBook.bar[2],'firebolt');assert(result.random.draws>0);
  const second=residence.inventory(result.token,rScope,command,result.random);assert(second.reply.ok);assert(second.random.draws>result.random.draws);assert.equal(residence.read(second.token).nextUid,after.nextUid+1);
});
observe('complete inventory: salvage returns the account delta for its owning transaction',()=>{
  const minted=legacyInventory(invBefore.state,invBefore.nextUid,{op:'mint',kind:'roll',options:{baseId:'ring_lapis',ilvl:20,rarity:'magic'}});
  const request=copy(invInput),item=copy(minted.save.state.items[0]);assert(item.affixes.length>0);request.state.items.push(item);request.nextUid=minted.save.nextUid;
  const token=residence.admit(request,rScope),before=residence.read(token),command={op:'salvage',uid:item.uid,lane:'break',access:invAccess},control=legacyInventory(before.state,before.nextUid,command);
  const result=residence.inventory(token,rScope,command,invRandom),after=residence.read(result.token);
  assert.deepEqual(copy(result.reply),copy(control.reply));assert.deepEqual(copy(result.account),copy(control.save.state.account));assert.deepEqual(copy(after.state.essences),copy(control.save.state.essences));
  assert.notDeepEqual(copy(result.account.craftLore),copy(rScope.account.craftLore));assert(!after.state.items.some(row=>row.uid===item.uid));assert.equal(after.state.skillBook.bar[2],'firebolt');
  result.account.features.push('caller-mutation');assert.deepEqual(residence.read(result.token),after);assert(!rScope.account.features.includes('caller-mutation'));
});
observe('complete inventory: a failed command closes its temporary carrier and leaves the prior graph usable',()=>{
  const failed=residence.inventory(invToken,rScope,{op:'lock',uid:invBefore.state.equipped.helmet.uid,on:true,access:{...invAccess,bench:'yes'}},invRandom);
  assert.equal(failed.reply.ok,false);assert.equal(failed.token,invToken);assert.deepEqual(residence.read(invToken),invBefore);
  const next=residence.inventory(invToken,rScope,{op:'lock',uid:invBefore.state.equipped.helmet.uid,on:true,access:invAccess},invRandom);assert(next.reply.ok);
});
observe('complete inventory: skill and lifecycle commands cannot bypass the complete routing or change profile',()=>{
  for(const op of ['learn-skill','unlearn-skill','socket-support','bind-skill','open','restore','close','save'])assert.throws(()=>residence.inventory(invToken,rScope,{op},invRandom),/complete-skill-route-required/);
  assert.throws(()=>residence.inventory(invToken,rScope,{op:'lock',profile:7,uid:1,on:true,access:invAccess},invRandom),/implicit-profile-command/);
  assert.throws(()=>residence.inventory(invToken,{...rScope,accountKey:'foreign'},{op:'lock',uid:1,on:true,access:invAccess},invRandom),/foreign-workshop-scope/);
});
observe('complete inventory: carried over-budget skill investment is not cold-restored by a lock command',()=>{
  const request=residenceRequest(firstMove.after),token=residence.admit(request,rScope),before=residence.read(token),item=before.state.items.find(row=>row.gem?.kind==='skill');assert.equal(item.gem.treeNodes.length,2);
  const result=residence.inventory(token,rScope,{op:'lock',uid:item.uid,on:false,access:invAccess},invRandom);assert(result.reply.ok);
  assert.equal(residence.read(result.token).state.items.find(row=>row.uid===item.uid).gem.treeNodes.length,2);
});
observe('complete inventory: trusted learned investment stays warm through item generation',()=>{
  const before=residence.read(adoptedResidence),result=residence.inventory(adoptedResidence,rScope,{op:'mint',kind:'roll',options:{baseId:'ring_lapis',ilvl:1,rarity:'common'}},invRandom);
  assert(result.reply.ok);assert.deepEqual(residence.read(result.token).state.skillBook,before.state.skillBook);assert.equal(residence.read(result.token).state.skillBook.known[0].gem.treeNodes.length,2);
});
observe('complete inventory: read-only station inspection retains the same token and random snapshot',()=>{
  const result=residence.inventory(invToken,rScope,{op:'station-view',uid:invBefore.state.equipped.helmet.uid,offset:0,limit:5},invRandom);
  assert(result.reply.ok);assert.equal(result.token,invToken);assert.equal(result.changed,false);assert.deepEqual(copy(result.random),invRandom);assert.deepEqual(residence.read(invToken),invBefore);
});
observe('complete inventory: vestige ownership preserves complete skill bindings',()=>{
  const id=Object.keys(items.pack.vestiges)[0],result=residence.inventory(invToken,rScope,{op:'grant-vestige',id,count:2},invRandom),after=residence.read(result.token);
  assert(result.reply.ok&&result.changed);assert.equal(after.state.vestiges[id],2);assert.equal(after.state.skillBook.bar[2],'firebolt');
});
observe('complete inventory: invalid random continuation refuses without changing character custody',()=>{
  assert.throws(()=>residence.inventory(invToken,rScope,{op:'mint',kind:'roll',options:{baseId:'ring_lapis',ilvl:1}}, {...invRandom,draws:-1}),/invalid-integer/);
  assert.deepEqual(residence.read(invToken),invBefore);
});

observe('original unfunded reroll: random-only change requires saving without replacing the private character graph',()=>{
  const original=rerollOriginal.original[0],request=copy(invInput);assert.equal(original.hostDraws,1);assert.equal(original.draws,original.ruleDraws+original.hostDraws);request.state.board=copy(original.board);request.state.items=copy(original.before.items);request.state.essences=copy(original.before.essences);
  // This original course has no worn gear. Keep its independent UID namespace
  // intact instead of mixing its item with another World's grant fixtures.
  request.state.equipped={};request.state.skillBook.bar=Array(8).fill(null);request.character.containers={};
  request.nextUid=Math.max(...request.state.items.map(item=>item.uid),...Object.values(request.state.equipped).map(item=>item.uid))+1;
  const token=residence.admit(request,rScope),before=residence.read(token),command={...original.request,access:invAccess},control=legacyInventory(before.state,before.nextUid,command);
  const result=residence.inventory(token,rScope,command,invRandom),after=residence.read(result.token);
  assert(result.reply.ok);assert.equal(result.changed,true);assert.equal(result.token,token);
  assert.equal(result.random.draws-invRandom.draws,original.ruleDraws);assert.deepEqual(copy(result.random),copy(control.save.random));assert.deepEqual(copy(result.reply),copy(control.reply));
  assert.deepEqual(copy({items:after.state.items,essences:after.state.essences}),original.after);assert.deepEqual(after,before);
  const again=residence.inventory(token,rScope,command,result.random);assert.equal(again.token,token);assert(again.changed);assert.equal(again.random.draws,result.random.draws+original.ruleDraws);assert.notEqual(again.random.state,result.random.state);
});

import {AccountWorkshopSession as CompleteOwner} from 'diagnostic/complete-owner';
import {CompleteAccountKernel} from 'diagnostic/account-kernel';
const completeBase={...defs,catalogue:pack.definitions};
const completeTrace=[],completeKernel=new CompleteAccountKernel(completeBase,{trace:row=>completeTrace.push(row),conditions:({command})=>command.op==='character-merge'?{nearFont:true}:progressConditions});
const completeDefs={...completeBase,progression:extra.progression,relicItems:new AccountRelicItems(workshop),completeKernel};
const completeOwner=new CompleteOwner(completeDefs);
const cs=(host,request)=>{const reply=host.command(request);assert.equal(reply.ok,true,JSON.stringify(reply));return copy(reply);};
const ws=(host,profile)=>cs(host,{op:'workshop-save',profile});
const as=(host,account)=>cs(host,{op:'account-save',account});
function startComplete(host,profile,account,value){return cs(host,{op:'open-workshop',profile,account,seed:41325,nextUid:value.nextUid,state:copy(value.state),character:copy(value.character)});}
function accountComplete(host,id,key='complete-'+id){
 cs(host,{op:'open-account',account:id,key,seed:1,relicItems:true});const save=as(host,id).save;cs(host,{op:'close-account',account:id});
 save.progression.account.features=copy(rScope.account.features);return cs(host,{op:'restore-account',account:id,save});
}
const wcmd=(profile,command)=>({op:'workshop',profile,command});
const barcmd=(profile,command)=>wcmd(profile,{op:'character-bar',command});
const progcmd=(profile,command)=>wcmd(profile,{op:'character-progression',command});
accountComplete(completeOwner,11);accountComplete(completeOwner,12);
startComplete(completeOwner,41,11,invInput);startComplete(completeOwner,42,11,invInput);startComplete(completeOwner,43,12,invInput);
// Additional malformed-command invariants. The accepted 343 observations stay
// unchanged; these cases must return refusals and leave the owner reusable.
{
 const kernel=new CompleteAccountKernel(completeBase,{conditions:()=>progressConditions});
 const owner=new CompleteOwner({...completeDefs,completeKernel:kernel});accountComplete(owner,91);
 const before=as(owner,91);
 const cases=[
  ['missing-items',r=>{delete r.state.items;}],['null-items',r=>{r.state.items=null;}],['object-items',r=>{r.state.items={};}],
  ['null-equipped',r=>{r.state.equipped=null;}],['object-overflow',r=>{r.state.overflow={};}],
  ['null-character',r=>{r.character=null;}],['missing-containers',r=>{delete r.character.containers;}],
  ['null-containers',r=>{r.character.containers=null;}],['invalid-container-list',r=>{r.character.containers.invalid=null;}],
  ['null-item',r=>{r.state.items=[null];}],['string-uid',r=>{r.state.items=[{uid:'1'}];}]
 ];
 for(const withFloor of [false,true])for(const[label,change]of cases){
  const request={op:'open-workshop',profile:901,account:91,seed:41325,state:copy(invInput.state),character:copy(invInput.character),...(withFloor?{nextUid:invInput.nextUid}:{})};
  change(request);const input=copy(request);let reply;
  assert.doesNotThrow(()=>{reply=owner.command(request);},label+' with explicit UID floor '+withFloor);
  assert.equal(reply.ok,false,label);assert.deepEqual(request,input,label+' changed caller input');assert.deepEqual(as(owner,91),before,label+' changed account');
  assert.equal(owner.command({op:'workshop-save',profile:901}).reason,'workshop-not-open');
 }
 startComplete(owner,901,91,invInput);assert.equal(ws(owner,901).ok,true);
 const request={op:'open-workshop',profile:902,account:91,seed:41325,state:copy(invInput.state),character:copy(invInput.character)};
 cs(owner,request);
 const existing=[...request.state.items,...Object.values(request.state.equipped),...request.state.overflow,...Object.values(request.character.containers).flat()];
 assert(existing.length>0,'Automatic-counter fixture needs owned items');
 const expectedFloor=Math.max(1,...existing.map(item=>item.uid+1)),saved=ws(owner,902).save.workshop;
 assert.equal(saved.nextUid,expectedFloor,'Automatic identity counter must reserve every owned item');assert.equal(saved.random.draws,0);
}

const snapshotComplete=()=>[ws(completeOwner,41),ws(completeOwner,42),ws(completeOwner,43),as(completeOwner,11),as(completeOwner,12)];
observe('complete owner: cold admission derives exactly once for each actual profile and account',()=>{
 assert.deepEqual(completeTrace.map(r=>[r.profile,r.accountKey,r.stage]),[[41,'complete-11','open'],[42,'complete-11','open'],[43,'complete-12','open']]);
 const saved=ws(completeOwner,41).save;assert.equal(saved.schemaVersion,3);assert.equal(saved.capability,'account-workshop-inventory/v3');
 assert.equal(saved.workshop.state.skillBook.bar[2],'firebolt');assert.equal(saved.character.abilityEssences.ability1,100.5);assert(!Object.hasOwn(saved.workshop.state,'account'));
});
const completeHelmet=invInput.state.equipped.helmet.uid;
observe('complete owner: ordinary inventory commands reuse their prepared graph and preserve grant lineage',()=>{
 const previous=completeTrace.find(r=>r.profile===41).continuation;completeTrace.length=0;
 cs(completeOwner,wcmd(41,{op:'lock',uid:completeHelmet,on:true,access:invAccess}));assert.equal(completeTrace.length,1);assert.equal(completeTrace[0].previous,previous);
 assert.equal(completeKernel.lineages(previous).get('grant/firebolt'),completeKernel.lineages(completeTrace[0].continuation).get('grant/firebolt'));
 assert.equal(ws(completeOwner,41).save.workshop.state.equipped.helmet.locked,true);assert.equal(ws(completeOwner,42).save.workshop.state.equipped.helmet.locked,undefined);
});
observe('complete owner: pending commands chain only their private candidates and abort preserves committed state',()=>{
 const before=snapshotComplete(),previous=completeTrace.at(-1).continuation;completeTrace.length=0;
 const pending=cs(completeOwner,{op:'prepare',commands:[barcmd(41,{op:'bind',slot:4,skillId:'firebolt'}),barcmd(41,{op:'bind',slot:5,skillId:'firebolt'}),barcmd(42,{op:'bind',slot:6,skillId:'firebolt'})]});
 assert(pending.token>0);assert.deepEqual(completeTrace.map(r=>r.profile),[41,41,42]);assert.equal(completeTrace[0].previous,previous);assert.equal(completeTrace[1].previous,completeTrace[0].continuation);
 assert.deepEqual(snapshotComplete(),before);assert.equal(cs(completeOwner,{op:'prepared-save',token:pending.token,kind:'workshop',handle:41}).save.workshop.state.skillBook.bar[5],'firebolt');
 cs(completeOwner,{op:'abort-prepared',token:pending.token});assert.deepEqual(snapshotComplete(),before);
 completeTrace.length=0;cs(completeOwner,wcmd(41,{op:'station-view',uid:completeHelmet,offset:0,limit:1}));assert.equal(completeTrace[0].previous,previous);
});
observe('complete owner: commit promotes each candidate under its own account without leaking continuation into saves',()=>{
 const pending=cs(completeOwner,{op:'prepare',commands:[barcmd(41,{op:'bind',slot:4,skillId:'firebolt'}),barcmd(43,{op:'bind',slot:7,skillId:'firebolt'})]});
 cs(completeOwner,{op:'commit-prepared',token:pending.token});assert.equal(ws(completeOwner,41).save.workshop.state.skillBook.bar[4],'firebolt');assert.equal(ws(completeOwner,43).save.workshop.state.skillBook.bar[7],'firebolt');
 for(const profile of [41,43])assert(!JSON.stringify(ws(completeOwner,profile)).includes('continuation'));
});
observe('complete owner: failure after an earlier edit discards the complete batch',()=>{
 const before=snapshotComplete();const reply=completeOwner.command({op:'prepare',commands:[barcmd(41,{op:'bind',slot:1,skillId:'firebolt'}),barcmd(42,{op:'bind',slot:99,skillId:'firebolt'})]});
 assert.equal(reply.ok,false);assert.deepEqual(snapshotComplete(),before);
});
observe('complete owner: explicit complete saves restore through a fresh graph and reject the legacy owner',()=>{
 const saved=ws(completeOwner,43).save;cs(completeOwner,{op:'close-workshop',profile:43});completeTrace.length=0;
 cs(completeOwner,{op:'restore-workshop',profile:43,account:12,save:saved});assert.deepEqual(ws(completeOwner,43).save,saved);assert.equal(completeTrace.length,1);assert.equal(completeTrace[0].previous,undefined);
 const legacy=new CompleteOwner({...defs,progression:extra.progression,relicItems:new AccountRelicItems(workshop)});accountComplete(legacy,12);assert.equal(legacy.command({op:'restore-workshop',profile:43,account:12,save:saved}).reason,'unsupported-save');
});
// Original progression controls continue through the actual account owner's save path.
observe('complete owner: ability investment and fractional wallet changes survive save and restore',()=>{
 startComplete(completeOwner,44,11,progressInput);const before=ws(completeOwner,44),result=cs(completeOwner,progcmd(44,progressBase.request)),after=ws(completeOwner,44);
 assert.equal(result.reply.accepted,progressBase.result);assert.deepEqual(after.save.character.abilityEssences,progressBase.after.abilityEssences);
 assert.deepEqual(after.save.workshop.state.skillBook.known,progressBase.after.known);assert(after.version>before.version);
 cs(completeOwner,{op:'close-workshop',profile:44});cs(completeOwner,{op:'restore-workshop',profile:44,account:11,save:after.save});assert.deepEqual(ws(completeOwner,44).save,after.save);
});
observe('complete owner: an event-only refusal has an acknowledgement token and zero invented storage writes',()=>{
 const row=progressOriginal.find(r=>r.label==='socket-support-poor-refreshes');startComplete(completeOwner,45,11,progressRequest(row.before));const before=ws(completeOwner,45);
 const pending=cs(completeOwner,{op:'prepare',commands:[progcmd(45,row.request)]});assert(pending.token>0);assert.deepEqual(pending.writes,[]);
 assert(pending.replies[0].reply.events.some(e=>e.kind==='resync-supports'));assert.equal(pending.replies[0].changed,false);assert.deepEqual(ws(completeOwner,45),before);
 cs(completeOwner,{op:'commit-prepared',token:pending.token});assert.deepEqual(ws(completeOwner,45),before);
});
const poorReroll=()=>{const original=rerollOriginal.original[0],request=copy(invInput);request.state.board=copy(original.board);request.state.items=copy(original.before.items);request.state.essences={};request.state.equipped={};request.state.skillBook.bar.fill(null);request.character.containers={};request.nextUid=Math.max(...request.state.items.map(i=>i.uid))+1;return request;};
observe('complete owner: random-only refusal persists and restores without replacing the graph',()=>{
 startComplete(completeOwner,46,11,poorReroll());const before=ws(completeOwner,46),held=completeTrace.at(-1).continuation;completeTrace.length=0;
 const pending=cs(completeOwner,{op:'prepare',commands:[wcmd(46,{...rerollOriginal.original[0].request,access:invAccess})]});assert(pending.token>0);assert.deepEqual(pending.writes,[{kind:'workshop',handle:46}]);
 const after=cs(completeOwner,{op:'prepared-save',token:pending.token,kind:'workshop',handle:46});assert.deepEqual(after.save.workshop.state,before.save.workshop.state);
 assert.equal(after.save.workshop.random.draws-before.save.workshop.random.draws,rerollOriginal.original[0].ruleDraws);assert.equal(completeTrace.length,1);assert.equal(completeTrace[0].continuation,held);
 assert.deepEqual(ws(completeOwner,46),before);cs(completeOwner,{op:'commit-prepared',token:pending.token});assert.deepEqual(ws(completeOwner,46),after);
});
observe('complete owner: shared craft knowledge refreshes siblings without losing granted bars',()=>{
 const mint=cs(completeOwner,wcmd(41,{op:'mint',kind:'roll',options:{baseId:'ring_lapis',ilvl:20,rarity:'magic'}}));assert(mint.changed);
 const uid=ws(completeOwner,41).save.workshop.state.items.at(-1).uid,before=as(completeOwner,11),foreign=ws(completeOwner,43);completeTrace.length=0;
 const pending=cs(completeOwner,{op:'prepare',commands:[wcmd(41,{op:'salvage',uid,lane:'break',access:invAccess})]});
 assert(pending.writes.some(w=>w.kind==='account'&&w.handle===11));assert.deepEqual(as(completeOwner,11),before);assert(!completeTrace.some(r=>r.profile===43));
 cs(completeOwner,{op:'commit-prepared',token:pending.token});assert.notDeepEqual(as(completeOwner,11).save.craftLore,before.save.craftLore);
 assert.equal(ws(completeOwner,41).save.workshop.state.skillBook.bar[4],'firebolt');assert.equal(ws(completeOwner,42).save.workshop.state.skillBook.bar[2],'firebolt');assert.deepEqual(ws(completeOwner,43),foreign);
});
observe('complete owner: merge cannot silently discard undelivered world drops',()=>{
 startComplete(completeOwner,47,11,mergeRequest(spillCase));const before=ws(completeOwner,47),account=as(completeOwner,11);
 const reply=completeOwner.command(wcmd(47,{op:'character-merge',command:spillCase.request}));assert.equal(reply.reason,'world-delivery-outbox-required');assert.deepEqual(ws(completeOwner,47),before);assert.deepEqual(as(completeOwner,11),account);
});
const canonicalTrace=[],canonicalKernel=new CompleteAccountKernel(completeBase,{trace:row=>canonicalTrace.push(row),conditions:()=>progressConditions});
const canonicalOwner=new CompleteOwner({...completeDefs,completeKernel:canonicalKernel,relicBuilds:true});
accountComplete(canonicalOwner,21);const canonicalAccount=as(canonicalOwner,21).save;
cs(canonicalOwner,{op:'close-account',account:21});canonicalAccount.progression.account.reliquary=codec.encode(copy(canonicalState));canonicalAccount.progression.account.features=copy(canonical.features);
cs(canonicalOwner,{op:'restore-account',account:21,save:canonicalAccount});
const canonicalRequest=withAbility(input(canonical),{ability1:100});canonicalRequest.capability='character-workshop/residence-diagnostic';
startComplete(canonicalOwner,60,21,canonicalRequest);startComplete(canonicalOwner,61,21,canonicalRequest);
observe('complete owner: activation prepares the selected canonical character before inactive siblings',()=>{
 canonicalTrace.length=0;cs(canonicalOwner,{op:'activate-workshop',account:21,profile:60});
 assert.deepEqual(canonicalTrace.map(r=>[r.profile,r.role]),[[60,'active'],[61,'inactive']]);
 assert.equal(canonicalKernel.read(canonicalTrace[0].continuation).projection.companions.length,1);assert.equal(canonicalKernel.read(canonicalTrace[1].continuation).projection.companions.length,0);
 for(const profile of [60,61])assert.equal(ws(canonicalOwner,profile).save.character.containers.reliquary.length,0);
});
observe('complete owner: random-only saving also survives selected-canonical coordination',()=>{
 startComplete(canonicalOwner,62,21,poorReroll());cs(canonicalOwner,{op:'activate-workshop',account:21,profile:62});const before=ws(canonicalOwner,62),held=canonicalTrace.findLast(r=>r.profile===62).continuation;canonicalTrace.length=0;
 const pending=cs(canonicalOwner,{op:'prepare',commands:[wcmd(62,{...rerollOriginal.original[0].request,access:invAccess})]});assert(pending.writes.some(row=>row.kind==='workshop'&&row.handle===62));
 const next=cs(canonicalOwner,{op:'prepared-save',token:pending.token,kind:'workshop',handle:62});assert.equal(next.save.workshop.random.draws,before.save.workshop.random.draws+2);assert.deepEqual(next.save.workshop.state,before.save.workshop.state);
 assert.equal(canonicalTrace.length,1);assert.equal(canonicalTrace[0].continuation,held);assert.deepEqual(ws(canonicalOwner,62),before);cs(canonicalOwner,{op:'commit-prepared',token:pending.token});assert.deepEqual(ws(canonicalOwner,62),next);
});
observe('complete owner: pending activation uses candidate roles and abort restores the committed selection',()=>{
 const before=[ws(canonicalOwner,60),ws(canonicalOwner,61),ws(canonicalOwner,62),as(canonicalOwner,21)];canonicalTrace.length=0;
 const pending=cs(canonicalOwner,{op:'prepare',commands:[{op:'activate-workshop',account:21,profile:61},barcmd(61,{op:'bind',slot:5,skillId:'firebolt'})]});
 assert.equal(cs(canonicalOwner,{op:'active-workshop',account:21}).profile,62);assert.equal(canonicalTrace.findLast(r=>r.stage==='command').role,'active');
 cs(canonicalOwner,{op:'abort-prepared',token:pending.token});assert.equal(cs(canonicalOwner,{op:'active-workshop',account:21}).profile,62);
 assert.deepEqual([ws(canonicalOwner,60),ws(canonicalOwner,61),ws(canonicalOwner,62),as(canonicalOwner,21)],before);
});
observe('complete owner: canonical disabling retires only the selected private companion declaration',()=>{
 const state=cs(canonicalOwner,{op:'account-relic-items',account:21}).state;state.enabled=false;canonicalTrace.length=0;
 cs(canonicalOwner,{op:'account',account:21,command:{op:'relic-items',state}});assert.equal(canonicalTrace[0].profile,62);assert.equal(canonicalTrace[0].role,'active');
 assert(canonicalTrace.every(row=>canonicalKernel.read(row.continuation).projection.companions.length===0));
});

const routeConditions=new Map(),routeTrace=[];
const routeKernel=new CompleteAccountKernel(completeBase,{trace:row=>routeTrace.push(row),conditions:({profile,command})=>{
 const selected=routeConditions.get(profile);if(selected)return copy(selected);
 switch(command.op){case 'character-rack':return{meets:true,blocked:{}};case 'character-support':return{hold:null};case 'character-merge':return{nearFont:true};default:return progressConditions;}
}});
const routeOwner=new CompleteOwner({...completeDefs,completeKernel:routeKernel});accountComplete(routeOwner,31);
observe('complete owner routing: original retained cargo relearns with the original repair and address counter',()=>{
 const row=originalRow('relearn-from-bag');startComplete(routeOwner,70,31,residenceRequest(row.before,row.next));
 const uid=row.before.items.find(item=>item.gem?.kind==='skill').uid;
 const reply=cs(routeOwner,wcmd(70,{op:'character-rack',command:{op:'learn',uid,slot:2}})),after=ws(routeOwner,70).save;
 assert(reply.changed);assert.deepEqual({known:after.workshop.state.skillBook.known,bar:after.workshop.state.skillBook.bar,items:after.workshop.state.items},row.after);
 assert.equal(after.workshop.nextUid,row.next+row.allocated);
});
observe('complete owner routing: trusted rack holds cannot be overridden by the player request',()=>{
 routeConditions.set(70,{meets:true,blocked:{firebolt:'held-cast'}});const before=ws(routeOwner,70);
 const reply=cs(routeOwner,wcmd(70,{op:'character-rack',command:{op:'unlearn',skillId:'firebolt'}}));assert.equal(reply.reply.refusal,'held-cast');assert.deepEqual(ws(routeOwner,70),before);
 assert.equal(routeOwner.command(wcmd(70,{op:'character-rack',command:{op:'unlearn',skillId:'firebolt',blocked:{}}})).ok,false);assert.deepEqual(ws(routeOwner,70),before);routeConditions.delete(70);
});
observe('complete owner routing: unlearning preserves the full returned gem and creates a fresh wrapper address',()=>{
 const before=ws(routeOwner,70).save,gem=copy(before.workshop.state.skillBook.known[0].gem);
 const result=cs(routeOwner,wcmd(70,{op:'character-rack',command:{op:'unlearn',skillId:'firebolt'}})),after=ws(routeOwner,70).save;
 assert(result.changed);assert.equal(after.workshop.state.skillBook.known.length,0);assert(after.workshop.state.skillBook.bar.every(id=>id===null));
 const item=after.workshop.state.items.find(i=>i.uid===before.workshop.nextUid);assert(item);assert.deepEqual(item.gem,gem);assert.equal(after.workshop.nextUid,before.workshop.nextUid+1);
});
for(const[profile,row,residenceKind]of [[71,allSupportOriginal.original[0],'learned'],[72,supportOriginal.original[0],'granted']])observe('complete owner routing: original '+residenceKind+' support custody and event ordering',()=>{
 const before=row.before,request=withAbility(input(before.input));request.capability='character-workshop/residence-diagnostic';
 request.state={...copy(before.inventory),skillBook:{known:copy(before.input.learned),bar:copy(before.bar)}};request.nextUid=before.nextUid;
 startComplete(routeOwner,profile,31,request);routeConditions.set(profile,row.conditions);
 const result=cs(routeOwner,wcmd(profile,{op:'character-support',command:{...row.request,residence:residenceKind}})),after=ws(routeOwner,profile).save;
 const {skillBook,...inventory}=after.workshop.state;assert.deepEqual(inventory,row.after.inventory);assert.deepEqual(skillBook,{known:row.after.input.learned,bar:row.after.bar});
 assert.equal(after.workshop.nextUid,row.after.nextUid);assert.equal(result.reply.changed,row.changed);assert.deepEqual(result.reply.events,row.events);
});
observe('complete owner routing: original stored-support removal retains over-budget physical investment',()=>{
 const row=originalRow('stored-unsocket-retains-investment');startComplete(routeOwner,73,31,residenceRequest(row.before,row.next));
 const uid=row.before.items.find(item=>item.gem?.kind==='skill').uid;
 const result=cs(routeOwner,wcmd(73,{op:'character-support',command:{op:'unsocket',residence:'stored',skillId:'firebolt',uid,index:0,supportId:'arcing'}})),after=ws(routeOwner,73).save;
 assert(result.changed);assert.deepEqual({known:after.workshop.state.skillBook.known,bar:after.workshop.state.skillBook.bar,items:after.workshop.state.items},row.after);assert.equal(after.workshop.nextUid,row.next+row.allocated);
});
observe('complete owner routing: successful merge without delivery obligations commits exact original cargo and wallet',()=>{
 const row=mergeOriginalRows.find(r=>r.label==='common-funded');startComplete(routeOwner,74,31,mergeRequest(row));const before=ws(routeOwner,74);
 const pending=cs(routeOwner,{op:'prepare',commands:[wcmd(74,{op:'character-merge',command:row.request})]});assert.deepEqual(ws(routeOwner,74),before);
 const saved=cs(routeOwner,{op:'prepared-save',token:pending.token,kind:'workshop',handle:74}).save;
 assert.deepEqual({board:saved.workshop.state.board,known:saved.workshop.state.skillBook.known,bar:saved.workshop.state.skillBook.bar,items:saved.workshop.state.items,abilityEssences:saved.character.abilityEssences},row.after);
 assert.equal(saved.workshop.nextUid,row.next+row.allocated);cs(routeOwner,{op:'commit-prepared',token:pending.token});assert.deepEqual(ws(routeOwner,74).save,saved);
});
observe('complete owner routing: character-only currency conversion advances the durable version',()=>{
 const row=progressOriginal.find(r=>r.request.op==='convert'&&r.result===true);assert(row);startComplete(routeOwner,75,31,progressRequest(row.before));const before=ws(routeOwner,75);
 cs(routeOwner,progcmd(75,row.request));const after=ws(routeOwner,75);assert.deepEqual(after.save.workshop,before.save.workshop);
 assert.notDeepEqual(after.save.character.abilityEssences,before.save.character.abilityEssences);assert.deepEqual(after.save.character.abilityEssences,row.after.abilityEssences);assert.equal(after.version,before.version+1);
});

observe('journal: remove and return preserve ordered intermediate lifetimes instead of collapsing to final gear',()=>{
 const before=ws(completeOwner,41),commands=[wcmd(41,{op:'unequip',uid:completeHelmet,slot:'helmet'}),wcmd(41,{op:'equip',uid:completeHelmet,slot:'helmet',actorLevel:100}),barcmd(41,{op:'bind',slot:4,skillId:'firebolt'})];
 const pending=cs(completeOwner,{op:'prepare',commands}),journal=completeOwner.preparedJournal(pending.token);
 assert.equal(journal.length,3);assert.deepEqual(journal.map(r=>r.index),[0,1,2]);assert.deepEqual(copy(journal.map(r=>r.command)),commands);
 const [removed,returned,bound]=journal.map(r=>r.transitions.find(t=>t.profile===41));assert(removed&&returned&&bound);
 assert.equal(returned.before,removed.after);assert.equal(bound.before,returned.after);assert(!completeKernel.lineages(removed.after).has('grant/firebolt'));
 assert.notEqual(completeKernel.lineages(removed.before).get('grant/firebolt'),completeKernel.lineages(returned.after).get('grant/firebolt'));
 assert.deepEqual(ws(completeOwner,41),before);cs(completeOwner,{op:'abort-prepared',token:pending.token});assert.deepEqual(ws(completeOwner,41),before);
});
observe('journal: every nested command, reply and transition is immutable and caller inputs are detached',()=>{
 const command=barcmd(41,{op:'bind',slot:6,skillId:'firebolt'}),pending=cs(completeOwner,{op:'prepare',commands:[command]}),journal=completeOwner.preparedJournal(pending.token);
 command.command.command.slot=0;assert.equal(journal[0].command.command.command.slot,6);
 assert.throws(()=>journal.push({}),TypeError);assert.equal(Reflect.set(journal[0].command.command.command,'slot',0),false);
 assert.equal(Reflect.set(journal[0].reply.reply.events,'length',0),false);assert.equal(Reflect.set(journal[0].transitions[0],'profile',99),false);
 cs(completeOwner,{op:'abort-prepared',token:pending.token});
});
observe('journal: active canonical publication order survives an activation followed by an edit',()=>{
 const pending=cs(canonicalOwner,{op:'prepare',commands:[{op:'activate-workshop',account:21,profile:61},barcmd(61,{op:'bind',slot:6,skillId:'firebolt'})]}),journal=canonicalOwner.preparedJournal(pending.token);
 assert.deepEqual(journal[0].transitions.map(row=>row.profile),[61,60,62]);assert.equal(journal[1].transitions[0].before,journal[0].transitions[0].after);
 assert(journal.every(row=>row.transitions.every(t=>t.accountKey==='complete-21')));cs(canonicalOwner,{op:'abort-prepared',token:pending.token});
});
observe('journal: event-only refusal remains ordered without a fake build transition or save write',()=>{
 const row=progressOriginal.find(r=>r.label==='socket-support-poor-refreshes'),before=ws(completeOwner,45),pending=cs(completeOwner,{op:'prepare',commands:[progcmd(45,row.request)]});
 const journal=completeOwner.preparedJournal(pending.token);assert.equal(journal.length,1);assert.equal(journal[0].transitions.length,0);assert.deepEqual(pending.writes,[]);
 assert(journal[0].reply.reply.events.some(event=>event.kind==='resync-supports'));assert.throws(()=>completeOwner.preparedJournal(pending.token+1),/stale-prepared-change/);
 cs(completeOwner,{op:'commit-prepared',token:pending.token});assert.deepEqual(ws(completeOwner,45),before);assert.throws(()=>completeOwner.preparedJournal(pending.token),/no-prepared-change/);
});
observe('journal: original full-bag merge can prepare owned drop obligations together with its candidate save',()=>{
 const before=ws(completeOwner,47),pending=cs(completeOwner,{op:'prepare',commands:[wcmd(47,{op:'character-merge',command:spillCase.request})]}),journal=completeOwner.preparedJournal(pending.token),reply=journal[0].reply.reply;
 assert.deepEqual(copy(reply.worldDrops),spillCase.drops);assert.deepEqual(reply.events.filter(e=>e.kind==='world-drop-required').map(e=>e.index),[0,1,2]);
 const saved=cs(completeOwner,{op:'prepared-save',token:pending.token,kind:'workshop',handle:47}).save;assert.equal(saved.workshop.nextUid,spillCase.next+spillCase.allocated);
 assert.deepEqual(saved.workshop.state.items,spillCase.after.items);assert.deepEqual(ws(completeOwner,47),before);
 cs(completeOwner,{op:'abort-prepared',token:pending.token});assert.deepEqual(ws(completeOwner,47),before);
});
observe('journal: failed late command exposes neither candidate journal nor prior edits',()=>{
 const before=ws(completeOwner,41),reply=completeOwner.command({op:'prepare',commands:[barcmd(41,{op:'bind',slot:3,skillId:'firebolt'}),barcmd(41,{op:'bind',slot:99,skillId:'firebolt'})]});
 assert.equal(reply.ok,false);assert.deepEqual(ws(completeOwner,41),before);assert.throws(()=>completeOwner.preparedJournal(1),/no-prepared-change/);
});

import {DurableCharacterOwner} from 'diagnostic/durable-owner';
import {SqliteCharacterGroupStore} from 'diagnostic/group-store';
import {createCharacterDeliveryCodec} from 'diagnostic/delivery-codec';
import {spawnSync} from 'node:child_process';
const asyncObserve=async(name,fn)=>{await fn();rows.push(name);};
(async()=>{
 const stores=[],dbPath=process.argv[2]+'.sqlite',store=()=>{const value=new SqliteCharacterGroupStore(dbPath);stores.push(value);return value;};
 try{
  const writer=store(),reader=store(),controls={},liveLog=[],runtime={time:100,life:45},codec=createCharacterDeliveryCodec(workshop);
  const live={prepare(value){assert.equal(value.groupKey,'group');liveLog.push({kind:'prepare'});return value;},discard(){liveLog.push({kind:'discard'});if(controls.failDiscard)throw Error('discard failure');},recoverRequired(value){liveLog.push({kind:'recover',groupKey:value.groupKey});},publish(lease,result){
   if(controls.failPublish)throw Error('publication failure');assert.equal(result.groupKey,'group');liveLog.push({kind:'publish',time:runtime.time,life:runtime.life,events:copy(result.journal.flatMap(row=>row.reply.reply?.events??[])),deliveries:copy(result.deliveries)});
  }};
  const port={read:key=>writer.read(key),async commit(...args){
   if(controls.refuse)return{status:'refused'};
   if(controls.delay){controls.waiting=true;await new Promise(resolve=>{controls.release=resolve;});controls.waiting=false;}
   const result=writer.commit(...args);if(controls.throwAfterCommit)throw Error('lost commit acknowledgement');return result;
  }};
  const createOwner=()=>new CompleteOwner({...completeDefs,completeKernel:new CompleteAccountKernel(completeBase,{conditions:({command})=>{
   if(command.op==='character-merge')return{nearFont:true};if(command.op==='character-rack')return{meets:true,blocked:{}};if(command.op==='character-support')return{hold:null};return progressConditions;
  }})});
  const poor=progressOriginal.find(row=>row.label==='socket-support-poor-refreshes');
  const start=value=>({seed:41325,nextUid:value.nextUid,state:copy(value.state),character:copy(value.character)});
  const initial={account:{key:'durable-account',seed:1,state:as(completeOwner,11).save.progression.account,relicItems:true},characters:[
   {key:'hero',start:start(invInput)},{key:'spill',start:start(mergeRequest(spillCase))},{key:'poor',start:start(progressRequest(poor.before))}]};
  const options={createOwner,storage:port,groupKey:'group',accountKey:'durable-account',characters:[{key:'hero',handle:101},{key:'spill',handle:102},{key:'poor',handle:103}],live,admitDrop:codec,initial};
  let durable=await DurableCharacterOwner.open(options);
  const lock=on=>[{kind:'character',characterKey:'hero',command:{op:'lock',uid:completeHelmet,on,access:invAccess}}];
  await asyncObserve('durable group: initial full aggregate is readable through an independent SQLite connection',async()=>{
   assert.equal(durable.status,'ready');assert.equal(durable.read().revision,1);assert.deepEqual(copy(reader.read('group')),copy(durable.read()));assert.equal(reader.read('group').body.characters.length,3);
  });
  await asyncObserve('durable group: pending disk write preserves committed reads while simulation advances',async()=>{
   const before=durable.read();controls.delay=true;liveLog.length=0;const pending=durable.submit(lock(true));assert(controls.waiting);assert.equal(durable.status,'pending');
   assert.deepEqual(durable.read(),before);assert.deepEqual(copy(reader.read('group')),copy(before));assert(!liveLog.some(row=>row.kind==='publish'));
   await assert.rejects(durable.submit(lock(false)),/character-save-pending/);runtime.time+=0.75;runtime.life-=3;controls.delay=false;controls.release();const reply=await pending;
   assert.equal(reply.status,'committed');assert.equal(durable.read().revision,2);assert.equal(liveLog.at(-1).time,100.75);assert.equal(liveLog.at(-1).life,42);
   assert.equal(durable.read().body.characters.find(row=>row.key==='hero').save.workshop.state.equipped.helmet.locked,true);
   assert.deepEqual(copy(reader.read('group')),copy(durable.read()));
  });
  await asyncObserve('durable group: event-only refusal still crosses the complete group revision fence',async()=>{
   const before=durable.read(),reply=await durable.submit([{kind:'character',characterKey:'poor',command:{op:'character-progression',command:poor.request}}]);
   assert.equal(reply.status,'committed');assert.equal(durable.read().revision,before.revision+1);assert.deepEqual(durable.read().body,before.body);
   assert(liveLog.at(-1).events.some(event=>event.kind==='resync-supports'));
  });
  await asyncObserve('durable group: merge inventory and every original owed gem become visible atomically',async()=>{
   const before=durable.read();controls.delay=true;liveLog.length=0;const pending=durable.submit([{kind:'character',characterKey:'spill',command:{op:'character-merge',command:spillCase.request}}]);
   assert(controls.waiting);assert.deepEqual(copy(reader.read('group')),copy(before));assert.equal(reader.read('group').body.outbox.rows.length,0);assert(!liveLog.some(row=>row.kind==='publish'));
   controls.delay=false;controls.release();await pending;const after=durable.read(),saved=after.body.characters.find(row=>row.key==='spill').save;
   assert.deepEqual(copy(after.body.outbox.rows.map(row=>row.drop)),spillCase.drops);assert.deepEqual(after.body.outbox.rows.map(row=>row.id),[1,2,3]);assert(after.body.outbox.rows.every(row=>row.characterKey==='spill'));assert.equal(after.body.outbox.nextId,4);
   assert.deepEqual(copy(saved.workshop.state.items),spillCase.after.items);assert.equal(saved.workshop.nextUid,spillCase.next+spillCase.allocated);assert.deepEqual(copy(reader.read('group')),copy(after));
   assert.deepEqual(liveLog.at(-1).deliveries,copy(after.body.outbox.rows));
  });
  await asyncObserve('durable group: known storage refusal discards the journal and leaves the same owner reusable',async()=>{
   const before=durable.read();controls.refuse=true;const reply=await durable.submit(lock(false));controls.refuse=false;
   assert.equal(reply.status,'refused');assert.equal(durable.status,'ready');assert.equal(liveLog.at(-1).kind,'discard');assert.deepEqual(durable.read(),before);assert.deepEqual(copy(reader.read('group')),copy(before));
   assert.equal((await durable.submit(lock(false))).status,'committed');
  });
  await asyncObserve('durable group: late command refusal writes neither account state nor delivery records',async()=>{
   const before=durable.read();liveLog.length=0;await assert.rejects(durable.submit([...lock(true),{kind:'character',characterKey:'hero',command:{op:'character-bar',command:{op:'bind',slot:99,skillId:'firebolt'}}}]),/invalid-integer/);
   assert.deepEqual(durable.read(),before);assert.deepEqual(copy(reader.read('group')),copy(before));assert.deepEqual(liveLog,[]);
  });
  await asyncObserve('durable group: reloaded obligations use stable character keys when runtime handles change',async()=>{
   liveLog.length=0;const reloaded=await DurableCharacterOwner.open({...options,storage:reader,initial:undefined,characters:[{key:'poor',handle:9},{key:'hero',handle:8},{key:'spill',handle:7}]});
   assert.equal(reloaded.read().revision,durable.read().revision);assert.deepEqual(copy(reloaded.read().body.outbox),copy(durable.read().body.outbox));assert.deepEqual(liveLog,[]);
   assert.equal((await durable.submit(lock(true))).status,'committed');const kept=reader.read('group');
   assert.equal((await reloaded.submit(lock(false))).status,'conflict');assert.equal(reloaded.status,'recovery-required');assert.throws(()=>reloaded.read(),/character-recovery-required/);assert.deepEqual(reader.read('group'),kept);
  });
  await asyncObserve('durable group: committed storage followed by failed publication requires recovery, never fake rollback',async()=>{
   const before=reader.read('group');controls.failPublish=true;await assert.rejects(durable.submit(lock(false)),/publication failure/);controls.failPublish=false;
   assert.equal(durable.status,'recovery-required');assert.equal(liveLog.at(-1).kind,'recover');assert.throws(()=>durable.read(),/character-recovery-required/);const after=reader.read('group');assert.equal(after.revision,before.revision+1);assert.equal(Object.hasOwn(after.body.characters.find(r=>r.key==='hero').save.workshop.state.equipped.helmet,'locked'),false);
   durable=await DurableCharacterOwner.open({...options,initial:undefined});assert.deepEqual(copy(durable.read()),copy(after));
  });
  await asyncObserve('durable group: lost storage acknowledgement also requires reload of the authoritative saved group',async()=>{
   const before=reader.read('group');controls.throwAfterCommit=true;await assert.rejects(durable.submit(lock(true)),/lost commit acknowledgement/);controls.throwAfterCommit=false;
   assert.equal(durable.status,'recovery-required');assert.equal(reader.read('group').revision,before.revision+1);durable=await DurableCharacterOwner.open({...options,initial:undefined});assert.deepEqual(copy(durable.read()),copy(reader.read('group')));
  });
  await asyncObserve('durable group: malformed restored delivery payload is rejected before a usable owner escapes',async()=>{
   const bad=copy(reader.read('group').body);bad.outbox.rows[0].drop.gem.supportId='missing-support';assert.equal(writer.commit('malformed',0,bad).status,'committed');
   await assert.rejects(DurableCharacterOwner.open({...options,groupKey:'malformed',initial:undefined}),/unknown-support/);
  });
  await asyncObserve('durable group: abrupt writer exit rolls back both unfinished revision and payload',async()=>{
   const before=reader.read('group');const code="import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec(\"PRAGMA synchronous=FULL; BEGIN IMMEDIATE; UPDATE character_groups SET revision=999,body='{}' WHERE key='group';\");process.exit(77);";
   const child=spawnSync(process.execPath,['--input-type=module','-e',code,dbPath],{windowsHide:true,encoding:'utf8',timeout:30000});assert.equal(child.status,77,child.stderr);assert.deepEqual(reader.read('group'),before);assert.deepEqual(copy(durable.read()),copy(before));
  });
  await asyncObserve('durable group: bounded pending deliveries refuse overflow before any storage or live publication',async()=>{
   const full=copy(reader.read('group').body);full.characters.find(r=>r.key==='spill').save=ws(completeOwner,47).save;full.characters.find(r=>r.key==='spill').save.accountKey='durable-account';
   full.outbox={nextId:257,rows:Array.from({length:256},(_,n)=>({id:n+1,characterKey:'spill',drop:copy(spillCase.drops[0])}))};assert.equal(writer.commit('full',0,full).status,'committed');
   const bounded=await DurableCharacterOwner.open({...options,groupKey:'full',initial:undefined}),before=bounded.read();liveLog.length=0;
   await assert.rejects(bounded.submit([{kind:'character',characterKey:'spill',command:{op:'character-merge',command:spillCase.request}}]),/invalid-array/);assert.deepEqual(bounded.read(),before);assert.deepEqual(copy(reader.read('full')),copy(before));assert.deepEqual(liveLog,[]);
  });
  await asyncObserve('durable group: a failed lease discard requests recovery once without retrying live cleanup',async()=>{
   const before=reader.read('group');liveLog.length=0;controls.refuse=true;controls.failDiscard=true;
   await assert.rejects(durable.submit(lock(false)),/discard failure/);controls.refuse=false;controls.failDiscard=false;
   assert.equal(durable.status,'recovery-required');assert.deepEqual(liveLog.map(row=>row.kind),['prepare','discard','recover']);assert.equal(liveLog.at(-1).groupKey,'group');assert.deepEqual(reader.read('group'),before);
  });
  const pickupRequest=row=>{const input=copy(invInput);input.state.board=copy(row.before.board);input.state.items=copy(row.before.items);input.state.equipped={};input.state.overflow=[];input.state.skillBook={known:[],bar:Array(8).fill(null)};input.character.containers={};input.nextUid=row.next;return input;};
  const pickupFactory=({resolveDelivery})=>new CompleteOwner({...completeDefs,completeKernel:new CompleteAccountKernel(completeBase,{conditions:({profile,accountKey,command})=>{
   if(command.op==='character-pickup')return{drop:resolveDelivery({profile,accountKey,deliveryId:command.command.deliveryId})};
   return command.op==='character-merge'?{nearFont:true}:progressConditions;
  }})});
  const seedPickup=(key,row,withSecond=false)=>{
   const owner=new CompleteOwner({...completeDefs,completeKernel:new CompleteAccountKernel(completeBase,{conditions:()=>{throw Error('Unexpected seed command');}})});
   accountComplete(owner,1,'pickup-account');startComplete(owner,21,1,pickupRequest(row));
   const characters=[{key:'source',save:ws(owner,21).save}];
   if(withSecond){startComplete(owner,22,1,pickupRequest(pickupOriginal.original[0]));characters.push({key:'recipient',save:ws(owner,22).save});}
   const body={schemaVersion:1,capability:'durable-character-group/diagnostic',account:as(owner,1).save,characters,
    outbox:{nextId:row.beforeDrops.length+1,rows:row.beforeDrops.map((d,n)=>({id:n+1,characterKey:'source',drop:copy(d.drop)}))}};
   assert.equal(writer.commit(key,0,body).status,'committed');return copy(reader.read(key));
  };
  const pickupControls={},pickupLog=[];
  const pickupStorage={read:key=>writer.read(key),async commit(...args){
   if(pickupControls.refuse)return{status:'refused'};
   if(pickupControls.delay){pickupControls.waiting=true;await new Promise(resolve=>{pickupControls.release=resolve;});pickupControls.waiting=false;}
   const result=writer.commit(...args);if(pickupControls.loseAck)throw Error('pickup acknowledgement lost');return result;
  }};
  const pickupLive={prepare(packet){pickupLog.push({kind:'prepare',groupKey:packet.groupKey});return packet;},discard(){pickupLog.push({kind:'discard'});},recoverRequired(packet){pickupLog.push({kind:'recover',groupKey:packet.groupKey});},publish(lease,packet){
   if(pickupControls.failPublish)throw Error('pickup publication failed');
   // At the publication boundary both the item and its retirement must already
   // be visible together through a separate SQLite connection.
   assert.deepEqual(copy(reader.read(packet.groupKey)),copy(lease.candidate));
   pickupLog.push({kind:'publish',groupKey:packet.groupKey,settlements:copy(packet.settlements),events:copy(packet.journal.flatMap(row=>row.reply.reply?.events??[]))});
  }};
  const openPickup=(key,withSecond=false,handles=[31,32])=>DurableCharacterOwner.open({createOwner:pickupFactory,storage:pickupStorage,groupKey:key,accountKey:'pickup-account',
   characters:[{key:'source',handle:handles[0]},...(withSecond?[{key:'recipient',handle:handles[1]}]:[])],live:pickupLive,admitDrop:codec});
  const pickup=(id=1,key='source')=>({kind:'pickup',characterKey:key,deliveryId:id});
  await asyncObserve('durable pickup: an original fixture outside authored support limits is refused at durable admission',async()=>{
   const invalid=copy(pickupOriginal.original[0]);invalid.beforeDrops[0].drop.gem.level=7;seedPickup('out-of-range-pickup',invalid);pickupLog.length=0;
   await assert.rejects(openPickup('out-of-range-pickup'),/invalid-support-level/);assert.deepEqual(pickupLog,[]);
  });
  for(const [n,row]of pickupOriginal.original.slice(0,8).entries())await asyncObserve('durable original pickup: '+row.label,async()=>{
   const key='original-pickup-'+n;seedPickup(key,row);const host=await openPickup(key),before=host.read();pickupLog.length=0;
   const result=await host.submit(row.beforeDrops.map((_,index)=>pickup(index+1)).reverse());assert.equal(result.status,'committed');
   const after=host.read(),save=after.body.characters[0].save.workshop;
   assert.deepEqual(copy(save.state.items),row.after.items,row.label);assert.equal(save.nextUid,row.next+row.allocated,row.label);
   assert.deepEqual(copy(after.body.outbox.rows.map(r=>r.drop)),row.afterDrops.map(r=>r.drop));assert.equal(after.body.outbox.nextId,before.body.outbox.nextId);
   const published=pickupLog.at(-1);assert.equal(published.kind,'publish');assert.equal(published.settlements.length,row.beforeDrops.length-row.afterDrops.length);
   assert.deepEqual(published.events.filter(e=>e.kind!=='pickup'),row.events);
   assert.deepEqual(published.events.filter(e=>e.kind==='pickup').map(({kind,...e})=>e),row.feed.map(({bornAt,...e})=>e));
   assert.deepEqual(copy(reader.read(key)),copy(after));
  });
  await asyncObserve('durable pickup: one complete transaction keeps committed inventory and obligation unchanged while awaiting storage',async()=>{
   const key='pending-pickup',before=seedPickup(key,pickupOriginal.original[0]),host=await openPickup(key);pickupLog.length=0;pickupControls.delay=true;
   const pending=host.submit([pickup()]);assert(pickupControls.waiting);assert.deepEqual(copy(host.read()),before);assert.deepEqual(copy(reader.read(key)),before);assert.deepEqual(pickupLog.map(r=>r.kind),['prepare']);
   await assert.rejects(host.submit([pickup()]),/character-save-pending/);pickupControls.delay=false;pickupControls.release();await pending;
   assert.equal(host.read().body.outbox.rows.length,0);assert.equal(host.read().body.characters[0].save.workshop.state.items.length,1);
  });
  await asyncObserve('durable pickup: refusal retains its obligation and item counter, then the same owner can retry',async()=>{
   const key='refused-pickup',before=seedPickup(key,pickupOriginal.original[0]),host=await openPickup(key);pickupLog.length=0;pickupControls.refuse=true;
   assert.equal((await host.submit([pickup()])).status,'refused');pickupControls.refuse=false;assert.deepEqual(copy(host.read()),before);assert.deepEqual(copy(reader.read(key)),before);assert.deepEqual(pickupLog.map(r=>r.kind),['prepare','discard']);
   assert.equal((await host.submit([pickup()])).status,'committed');assert.equal(host.read().body.outbox.rows.length,0);
  });
  await asyncObserve('durable pickup: duplicate, unknown and forged bodies are rejected before any storage or live effect',async()=>{
   const key='invalid-pickup',before=seedPickup(key,pickupOriginal.original[0]),host=await openPickup(key);pickupLog.length=0;
   await assert.rejects(host.submit([pickup(),pickup()]),/duplicate-pickup-delivery/);
   await assert.rejects(host.submit([pickup(999)]),/unknown-pending-delivery/);
   await assert.rejects(host.submit([{...pickup(),drop:pickupOriginal.original[0].beforeDrops[0].drop}]),/unknown-field/);
   await assert.rejects(host.submit([{kind:'character',characterKey:'source',command:{op:'character-pickup',command:{op:'pickup',deliveryId:1}}}]),/durable-pickup-action-required/);
   assert.deepEqual(copy(host.read()),before);assert.deepEqual(copy(reader.read(key)),before);assert.deepEqual(pickupLog,[]);
   assert.equal((await host.submit([pickup()])).status,'committed');
  });
  await asyncObserve('durable pickup: a later invalid command cannot consume an earlier picked item or obligation',async()=>{
   const key='late-pickup-refusal',before=seedPickup(key,pickupOriginal.original[0]),host=await openPickup(key);pickupLog.length=0;
   await assert.rejects(host.submit([pickup(),{kind:'character',characterKey:'source',command:{op:'character-bar',command:{op:'bind',slot:99,skillId:'firebolt'}}}]),/invalid-integer/);
   assert.deepEqual(copy(host.read()),before);assert.deepEqual(copy(reader.read(key)),before);assert.deepEqual(pickupLog,[]);
   assert.equal((await host.submit([pickup()])).status,'committed');
  });
  await asyncObserve('durable pickup: lost commit acknowledgement recovers the item once and refuses duplicate retry',async()=>{
   const key='lost-pickup';seedPickup(key,pickupOriginal.original[1]);let host=await openPickup(key);pickupControls.loseAck=true;pickupLog.length=0;
   await assert.rejects(host.submit([pickup()]),/pickup acknowledgement lost/);pickupControls.loseAck=false;assert.equal(host.status,'recovery-required');assert.deepEqual(pickupLog.map(r=>r.kind),['prepare','recover']);
   host=await openPickup(key,false,[99]);const restored=host.read();assert.equal(restored.body.characters[0].save.workshop.state.items.length,1);assert.equal(restored.body.outbox.rows.length,0);
   await assert.rejects(host.submit([pickup()]),/unknown-pending-delivery/);assert.deepEqual(host.read(),restored);
  });
  await asyncObserve('durable pickup: publication failure recovers the committed inventory without restoring its settled drop',async()=>{
   const key='failed-pickup-publication';seedPickup(key,pickupOriginal.original[0]);let host=await openPickup(key);pickupControls.failPublish=true;
   await assert.rejects(host.submit([pickup()]),/pickup publication failed/);pickupControls.failPublish=false;assert.equal(host.status,'recovery-required');
   host=await openPickup(key);assert.equal(host.read().body.outbox.rows.length,0);assert.equal(host.read().body.characters[0].save.workshop.state.items.length,1);
  });
  await asyncObserve('durable pickup: same-account host-selected recipient receives the item and settles the source obligation',async()=>{
   const key='cooperative-pickup';seedPickup(key,pickupOriginal.original[0],true);const host=await openPickup(key,true);pickupLog.length=0;
   await host.submit([pickup(1,'recipient')]);const after=host.read().body;assert.equal(after.characters[0].save.workshop.state.items.length,0);assert.equal(after.characters[1].save.workshop.state.items.length,1);assert.equal(after.outbox.rows.length,0);
   assert.deepEqual(pickupLog.at(-1).settlements,[{id:1,characterKey:'recipient',sourceCharacterKey:'source'}]);
  });
  await asyncObserve('durable pickup: independent stale owner cannot pick up the same saved obligation twice',async()=>{
   const key='stale-pickup';seedPickup(key,pickupOriginal.original[0]);const one=await openPickup(key),two=await openPickup(key);await one.submit([pickup()]);const saved=reader.read(key);
   assert.equal((await two.submit([pickup()])).status,'conflict');assert.equal(two.status,'recovery-required');assert.deepEqual(reader.read(key),saved);assert.equal(saved.body.characters[0].save.workshop.state.items.length,1);
  });

  const worldSnapshot=(groupKey,snapshot)=>({groupKey,revision:snapshot.revision,rows:copy(snapshot.body.outbox.rows)});
  const createWorldOwner=async(key,row,options={})=>{
   seedPickup(key,row);const fixture=worldFixture(row,key);let binding=new WorldDeliveryBinding({groupKey:key,admitDrop:codec,world:fixture.ports});
   const control={},log=[];let host,publicationKernel;
   const storage={read:id=>writer.read(id),async commit(...args){
    if(control.refuse)return{status:'refused'};
    if(control.delay){control.waiting=true;await new Promise(resolve=>{control.release=resolve;});control.waiting=false;}
    const result=writer.commit(...args);if(control.loseAck)throw Error('world acknowledgement lost');return result;
   }};
   const live={prepare:packet=>packet,discard:()=>log.push('discard'),recoverRequired:()=>log.push('recovery'),publish:(lease,packet)=>{
    assert.deepEqual(copy(reader.read(key)),copy(lease.candidate));
    fixture.apply(lease.candidate.body.characters[0].save,packet.journal,entry=>{
     const transition=entry.transitions.filter(row=>row.profile===31).at(-1);assert(transition?.after);
     return publicationKernel.inventoryItems(transition.after);
    },()=>{if(control.failPublish)throw Error('world publication failed');});
    if(control.failPublish)throw Error('world publication failed');
    binding.reconcile(worldSnapshot(key,lease.candidate));log.push('publish');
   }};
   const createOwner=({resolveDelivery})=>{
    publicationKernel=new CompleteAccountKernel(completeBase,{conditions:({profile,accountKey,command})=>{
     if(command.op==='character-pickup')return{drop:resolveDelivery({profile,accountKey,deliveryId:command.command.deliveryId})};
     return command.op==='character-merge'?{nearFont:true}:progressConditions;
    }});return new CompleteOwner({...completeDefs,completeKernel:publicationKernel});
   };
   const open=()=>DurableCharacterOwner.open({createOwner,storage,groupKey:key,accountKey:'pickup-account',characters:[{key:'source',handle:31}],live,admitDrop:codec});
   const connect=()=>{const frame=new WorldDeliveryFrame({binding,owner:host,characterOf:seat=>seat===fixture.s?'source':undefined});
    fixture.bridge((drop,seat)=>{if(drop.sdkDelivery.groupKey===key)frame.offer(drop,seat);});
    return{frame,update(dt){frame.begin();try{fixture.update(dt);}catch(error){frame.cancel();throw error;}return frame.end();}};
   };
   host=await open();binding.reconcile(worldSnapshot(key,host.read()));let bridge=connect();
   return{fixture,control,log,get host(){return host;},get binding(){return binding;},get frame(){return bridge.frame;},update:dt=>bridge.update(dt),
    async recover(){host=await open();fixture.apply(host.read().body.characters[0].save,[]);binding=new WorldDeliveryBinding({groupKey:key,admitDrop:codec,world:fixture.ports});binding.reconcile(worldSnapshot(key,host.read()));bridge=connect();}
   };
  };
  for(const [index,row]of pickupOriginal.original.entries())await asyncObserve('actual World durable pickup: '+row.label,async()=>{
   const key='world-original-'+index,run=await createWorldOwner(key,row),{fixture}=run,next=fixture.nextUid()+1;
   const bag=fixture.m.items,retained=bag.slice();await run.update(row.dt);assert.equal(fixture.m.items,bag);for(const item of retained)assert(fixture.m.items.includes(item));assert.equal(fixture.nextUid()-next,0,'World must not independently wrap a durable gem');
   assert.deepEqual(copy(fixture.m.items),row.after.items,row.label);assert.deepEqual(copy(run.host.read().body.characters[0].save.workshop.state.items),row.after.items,row.label);
   assert.equal(run.host.read().body.characters[0].save.workshop.nextUid,row.next+row.allocated,row.label);
   assert.deepEqual(fixture.snapshot(),row.afterDrops,row.label);assert.deepEqual(fixture.events,row.events,row.label);assert.deepEqual(fixture.visible,row.visible,row.label+' callback-visible publication');
   assert.deepEqual(copy(fixture.w.pickupFeed.map(({seatId,...value})=>value)),row.feed,row.label);assert.deepEqual(fixture.touches,row.touches,row.label);
   assert.deepEqual(copy(reader.read(key)),copy(run.host.read()));
  });
  await asyncObserve('World reconciliation: replay preserves live handles, position, grace, bob and tier',async()=>{
   const run=await createWorldOwner('world-preserved',pickupOriginal.original[0]),drop=run.fixture.w.drops[0],list=run.fixture.w.drops;
   drop.pos.x+=17;drop.bob=8;drop.grace=2;drop.tier=4;drop.customLive={retained:true};const before={...drop,pos:{...drop.pos}};
   assert.deepEqual(run.binding.reconcile(worldSnapshot('world-preserved',run.host.read())),{revision:1,created:0,retired:0,preserved:1});
   assert.equal(run.fixture.w.drops,list);assert.equal(run.fixture.w.drops[0],drop);assert.deepEqual(drop,before);
   await run.recover();assert.equal(run.fixture.w.drops[0],drop);assert.deepEqual(drop,before);
  });
  await asyncObserve('World reconciliation: duplicate and settled owned drops retire while foreign and unmanaged handles survive',async()=>{
   const key='world-namespace',run=await createWorldOwner(key,pickupOriginal.original[0]),{fixture}=run,first=fixture.w.drops[0];
   const duplicate=fixture.ports.create(fixture.ports.inspect(first)),foreign=fixture.ports.create({...fixture.ports.inspect(first),groupKey:'other-group'}),unmanaged={...first,sdkDelivery:undefined};fixture.w.drops.push(unmanaged);
   const result=run.binding.reconcile(worldSnapshot(key,run.host.read()));assert.equal(result.retired,1);assert.deepEqual(fixture.w.drops,[first,foreign,unmanaged]);assert(!fixture.w.drops.includes(duplicate));
   run.binding.reconcile({groupKey:key,revision:2,rows:[]});assert.deepEqual(fixture.w.drops,[foreign,unmanaged]);
  });
  await asyncObserve('World reconciliation: stale or conflicting snapshots refuse before changing the world',async()=>{
   const key='world-stale',run=await createWorldOwner(key,pickupOriginal.original[0]),snapshot=worldSnapshot(key,run.host.read()),before=run.fixture.w.drops.slice();
   run.binding.reconcile({...snapshot,revision:3});assert.throws(()=>run.binding.reconcile({...snapshot,revision:2}),/stale-delivery-revision/);
   assert.throws(()=>run.binding.reconcile({groupKey:key,revision:3,rows:[]}),/conflicting-delivery-revision/);assert.deepEqual(run.fixture.w.drops,before);assert.equal(run.binding.status,'ready');
  });
  await asyncObserve('World reconciliation: a partial creation failure poisons only the binding and recovery reuses the created handle',async()=>{
   const key='world-create-failure',row=pickupOriginal.original[7],fixture=worldFixture(row,key),snapshot=worldSnapshot(key,seedPickup(key,row));let fail=true;
   const ports={...fixture.ports,create:value=>{const handle=fixture.ports.create(value);if(fail){fail=false;throw Error('after-create');}return handle;}};
   const broken=new WorldDeliveryBinding({groupKey:key,admitDrop:codec,world:ports});assert.throws(()=>broken.reconcile(snapshot),/after-create/);assert.equal(broken.status,'recovery-required');assert.throws(()=>broken.reconcile(snapshot),/delivery-world-recovery-required/);
   const first=fixture.w.drops[0],recovered=new WorldDeliveryBinding({groupKey:key,admitDrop:codec,world:ports});assert.equal(recovered.reconcile(snapshot).created,1);assert.equal(fixture.w.drops.length,2);assert.equal(fixture.w.drops[0],first);
  });
  await asyncObserve('World reconciliation: partial removal failure can recover from the actual remaining world',async()=>{
   const key='world-remove-failure',run=await createWorldOwner(key,pickupOriginal.original[7]);let fail=true;
   const ports={...run.fixture.ports,remove:handle=>{run.fixture.ports.remove(handle);if(fail){fail=false;throw Error('after-remove');}}},binding=new WorldDeliveryBinding({groupKey:key,admitDrop:codec,world:ports}),empty={groupKey:key,revision:2,rows:[]};
   assert.throws(()=>binding.reconcile(empty),/after-remove/);assert.equal(binding.status,'recovery-required');assert.equal(run.fixture.w.drops.length,1);
   assert.equal(new WorldDeliveryBinding({groupKey:key,admitDrop:codec,world:ports}).reconcile(empty).retired,1);assert.equal(run.fixture.w.drops.length,0);
  });
  await asyncObserve('actual World: unavailable delivery bridge cannot fall back to an independent legacy pickup',async()=>{
   const key='world-unavailable',run=await createWorldOwner(key,pickupOriginal.original[0]),before=run.host.read(),drop=run.fixture.w.drops[0];run.fixture.bridge(undefined);
   const next=run.fixture.nextUid()+1;run.fixture.update(0.1);assert.equal(run.fixture.nextUid()-next,0);assert.equal(run.fixture.w.drops[0],drop);assert.deepEqual(run.host.read(),before);assert.equal(run.fixture.m.items.length,0);
  });
  await asyncObserve('actual World: awaiting storage animates drops without duplicate pickup requests or inventory changes',async()=>{
   const key='world-waiting',run=await createWorldOwner(key,pickupOriginal.original[0]),drop=run.fixture.w.drops[0],before=run.host.read();run.control.delay=true;
   const pending=run.update(0.1);assert(run.control.waiting);assert.equal(run.host.status,'pending');const bob=drop.bob;run.fixture.w.time+=0.5;run.fixture.p.life-=1;
   assert.equal(run.update(0.2),undefined);assert(drop.bob>bob);assert.equal(run.fixture.m.items.length,0);assert.deepEqual(run.host.read(),before);const life=run.fixture.p.life;
   run.control.delay=false;run.control.release();await pending;assert.equal(run.fixture.w.drops.length,0);assert.equal(run.fixture.m.items.length,1);assert.equal(run.fixture.w.time,0.5);assert.equal(run.fixture.p.life,life);
  });
  await asyncObserve('actual World: known save refusal leaves the same ground handle available for the next frame',async()=>{
   const run=await createWorldOwner('world-refusal',pickupOriginal.original[0]),drop=run.fixture.w.drops[0];run.control.refuse=true;
   assert.equal((await run.update(0.1)).status,'refused');run.control.refuse=false;assert.equal(run.fixture.w.drops[0],drop);assert.equal(run.fixture.m.items.length,0);assert.deepEqual(run.log,['discard']);
   await run.update(0.1);assert.equal(run.fixture.w.drops.length,0);assert.equal(run.fixture.m.items.length,1);
  });
  await asyncObserve('actual World: lost storage acknowledgement suspends pickups until saved inventory and ground reconcile',async()=>{
   const run=await createWorldOwner('world-lost-ack',pickupOriginal.original[0]),drop=run.fixture.w.drops[0];run.control.loseAck=true;
   await assert.rejects(run.update(0.1),/world acknowledgement lost/);run.control.loseAck=false;assert.equal(run.host.status,'recovery-required');assert.equal(run.fixture.w.drops[0],drop);assert.equal(run.fixture.m.items.length,0);
   assert.equal(run.update(0.1),undefined);await run.recover();assert.equal(run.fixture.w.drops.length,0);assert.equal(run.fixture.m.items.length,1);assert.equal(run.update(0.1),undefined);
  });
  await asyncObserve('actual World: failed publication after inventory update recovers without a second item',async()=>{
   const run=await createWorldOwner('world-failed-publish',pickupOriginal.original[0]);run.control.failPublish=true;await assert.rejects(run.update(0.1),/world publication failed/);run.control.failPublish=false;
   assert.equal(run.fixture.m.items.length,1);assert.equal(run.fixture.w.drops.length,1);assert.equal(run.update(0.1),undefined);await run.recover();assert.equal(run.fixture.m.items.length,1);assert.equal(run.fixture.w.drops.length,0);
  });
  await asyncObserve('actual World: bounded pickup batches retain reverse drop order across frames',async()=>{
   const row=copy(pickupOriginal.original[0]);row.beforeDrops=Array.from({length:17},()=>copy(row.beforeDrops[0]));const run=await createWorldOwner('world-bounded',row);
   await run.update(0.1);assert.equal(run.host.read().body.outbox.rows.length,1);assert.equal(run.fixture.w.drops[0].sdkDelivery.id,1);assert.equal(run.fixture.m.items.length,16);
   await run.update(0.1);assert.equal(run.fixture.w.drops.length,0);assert.equal(run.fixture.m.items.length,17);
  });

  await asyncObserve('delivery frame: asynchronous owners retain a detached submitted batch while later frames reuse scratch buffers',async()=>{
   let release,held,busy=false;const binding={status:'ready',pickup:(drop,key)=>({kind:'pickup',characterKey:key,deliveryId:drop.id})};
   const owner={get status(){return busy?'pending':'ready';},async submit(actions){busy=true;await new Promise(resolve=>{release=resolve;});held=copy(actions);busy=false;return{status:'committed'};}};
   const frame=new WorldDeliveryFrame({binding,owner,characterOf:seat=>seat.key});frame.begin();frame.offer({id:3},{key:'hero'});const pending=frame.end();
   for(let n=0;n<20;n++){frame.begin();frame.offer({id:4},{key:'hero'});assert.equal(frame.end(),undefined);}
   release();await pending;assert.deepEqual(held,[{kind:'pickup',characterKey:'hero',deliveryId:3}]);
   frame.begin();frame.offer({id:4},{key:'hero'});frame.cancel();frame.begin();assert.equal(frame.end(),undefined);
  });
  observe('ordered publication: inventory-only projection is detached and rejects foreign private handles',()=>{
   const trace=[],kernel=new CompleteAccountKernel(completeBase,{conditions:()=>progressConditions,trace:row=>trace.push(row)}),owner=new CompleteOwner({...completeDefs,completeKernel:kernel});
   accountComplete(owner,1,'projection-account');startComplete(owner,31,1,pickupRequest(pickupOriginal.original[2]));const token=trace.at(-1).continuation;
   const before=copy(kernel.inventoryItems(token)),borrowed=kernel.inventoryItems(token);borrowed.splice(0,1);assert.deepEqual(copy(kernel.inventoryItems(token)),before);assert.throws(()=>kernel.inventoryItems({}),/foreign-character-workshop/);
  });
  await asyncObserve('World inventory: failed placement and no-op recovery preserve the live bag and existing body identities',async()=>{
   const run=await createWorldOwner('world-item-identity',pickupOriginal.original[2]),bag=run.fixture.m.items,items=bag.slice();await run.update(0.1);await run.recover();
   assert.equal(run.fixture.m.items,bag);assert.equal(bag.length,items.length);for(let n=0;n<items.length;n++)assert.equal(bag[n],items[n]);
  });
  observe('World inventory: publication owns new bodies and recovery repairs divergence without changing the bag reference',()=>{
   const source=copy(pickupOriginal.original[0].after.items),target=[];publishGemPickupItems(target,source);const body=target[0],expected=copy(target);
   source[0].name='caller edit';assert.deepEqual(copy(target),expected);restoreOwnedInventory(target,expected);assert.equal(target[0],body);
   target[0].name='divergent live edit';restoreOwnedInventory(target,expected);assert.notEqual(target[0],body);assert.deepEqual(copy(target),expected);
   const kept=target[0],before=copy(target);assert.throws(()=>publishGemPickupItems(target,[{...expected[0],name:'uncoordinated edit'}]),/stale-live-pickup-inventory/);assert.equal(target[0],kept);assert.deepEqual(copy(target),before);
  });
  for(const row of spillLocationOriginal.original.slice(0,12))observe('original spill placement: '+row.label,()=>{
   const calls=[],policy=new HollowWakeSpillPlacement({observe:()=>({worldKey:'arena-instance',pos:copy(row.at),tier:row.tier}),canPickup:()=>true,clamp:(worldKey,...args)=>{
    assert.equal(worldKey,'arena-instance');const [pos,radius,from,opts]=args,result={x:Math.max(radius,Math.min(row.arena.w-radius,pos.x)),y:Math.max(radius,Math.min(row.arena.h-radius,pos.y))};
    calls.push(copy({input:pos,radius,from:from??null,opts:opts??null,arguments:args.length,result}));return result;
   }}),state=policy.seed(row.seed),before=copy(state),result=policy.prepare({groupKey:'geometry',state,rows:[{id:1,characterKey:'hero',drop:row.drops[0].drop}]});
   const expected=row.drops[0],placement=result.placements[0].placement;assert.deepEqual(copy(calls),row.clamps);assert.deepEqual(copy(placement.pos),expected.pos);assert.equal(placement.bob,expected.bob);assert.equal(placement.tier,expected.tier);
   assert.equal(Object.hasOwn(placement,'tier'),Object.hasOwn(expected,'tier'));assert.equal(result.state.random.draws,3);assert.deepEqual(copy(state),before);
  });
  let currentWorld='world-A',anchor={x:100,y:200},actorTier=2,allowPickup=true,observationsAvailable=true;
  const placementPolicy=new HollowWakeSpillPlacement({observe:()=>{assert(observationsAvailable,'Unexpected live observation during restoration');return{worldKey:currentWorld,pos:{...anchor},tier:actorTier};},
   canPickup:()=>allowPickup,clamp:(worldKey,pos,radius,from,opts)=>{assert(['world-A','world-B'].includes(worldKey));return{x:Math.max(radius,Math.min(1590,pos.x)),y:Math.max(radius,Math.min(1190,pos.y))};}});
  const locatedMerge={kind:'character',characterKey:'spill',command:{op:'character-merge',command:spillCase.request}};
  const startLocated=value=>({seed:41325,nextUid:value.nextUid,state:copy(value.state),character:copy(value.character)});
  const locatedInitial=()=>({account:{key:'located-account',seed:1,state:as(completeOwner,11).save.progression.account,relicItems:true},characters:[
   {key:'spill',start:startLocated(mergeRequest(spillCase))},{key:'empty',start:startLocated(pickupRequest(pickupOriginal.original[0]))}],deliveryState:placementPolicy.seed(4621)});
  const locatedFixture=async(groupKey)=>{
   const control={},log=[],plans=[],worlds=new Map();let owner;
   const delivery={admitState:value=>placementPolicy.admitState(value),admitPlacement:(value,drop)=>placementPolicy.admitPlacement(value,drop),authorizePickup:value=>placementPolicy.authorizePickup(value),prepare:value=>{
    const result=placementPolicy.prepare(value);if(control.badAddress)result.placements[0].id++;return result;
   }};
   const worldFor=worldKey=>{
    let found=worlds.get(worldKey);if(found)return found;
    const fixture=worldFixture(pickupOriginal.original[0],groupKey),ports={...fixture.ports,create:value=>{
     const handle=fixture.ports.create(value);handle.pos=copy(value.placement.pos);handle.bob=value.placement.bob;if(value.placement.tier===undefined)delete handle.tier;else handle.tier=value.placement.tier;
     handle.sdkDelivery.placement=copy(value.placement);return handle;
    }};
    found={fixture,ports,binding:new LocatedWorldBinding({groupKey,worldKey,admitDrop:codec,admitPlacement:(value,drop)=>placementPolicy.admitPlacement(value,drop),world:ports})};worlds.set(worldKey,found);return found;
   };
   const syncWorld=snapshot=>worldFor(currentWorld).binding.reconcile(worldSnapshot(groupKey,snapshot));
   const storage={read:key=>writer.read(key),async commit(...args){
    if(control.refuse)return{status:'refused'};
    if(control.delay){control.waiting=true;await new Promise(resolve=>{control.release=resolve;});control.waiting=false;}
    const result=writer.commit(...args);if(control.loseAck)throw Error('located acknowledgement lost');return result;
   }};
   const live={prepare:packet=>{plans.push(copy(packet.candidate));return packet;},discard:()=>log.push('discard'),recoverRequired:()=>log.push('recovery'),publish:(lease,packet)=>{
    assert.deepEqual(copy(reader.read(groupKey)),copy(lease.candidate));syncWorld(lease.candidate);if(control.failPublish)throw Error('located publication failed');log.push('publish');
   }};
   const options={createOwner:pickupFactory,storage,groupKey,accountKey:'located-account',characters:[{key:'spill',handle:71},{key:'empty',handle:72}],live,admitDrop:codec,delivery};
   owner=await LocatedOwner.open({...options,initial:locatedInitial()});
   return{control,log,plans,worldFor,syncWorld,options,get owner(){return owner;},async reload(){owner=await LocatedOwner.open(options);return owner;}};
  };
  const located=await locatedFixture('located-main');
  await asyncObserve('located owner: explicit v2 envelope persists its own random continuation and rejects silent v1 interchange',async()=>{
   const saved=located.owner.read();assert.equal(saved.body.schemaVersion,2);assert.equal(saved.body.capability,'durable-character-group/located-diagnostic');assert.equal(saved.body.deliveryState.random.draws,0);assert.deepEqual(copy(saved),copy(reader.read('located-main')));
   await assert.rejects(DurableCharacterOwner.open(located.options),/unknown-field/);
   await assert.rejects(LocatedOwner.open({...located.options,groupKey:'group',accountKey:'durable-account'}),/unsupported-character-group/);
  });
  await asyncObserve('located owner: placement and RNG commit atomically while an actor changes worlds during the pending save',async()=>{
   const before=located.owner.read();located.control.delay=true;const pending=located.owner.submit([locatedMerge]);assert(located.control.waiting);assert.deepEqual(located.owner.read(),before);assert.deepEqual(copy(reader.read('located-main')),copy(before));
   currentWorld='world-B';anchor={x:900,y:900};actorTier=0;located.control.delay=false;located.control.release();await pending;
   const after=located.owner.read();assert.equal(after.body.outbox.rows.length,3);assert.equal(after.body.deliveryState.random.draws,9);assert(after.body.outbox.rows.every(row=>row.placement.worldKey==='world-A'&&row.placement.pos.x>=86&&row.placement.pos.x<=114&&row.placement.pos.y>=186&&row.placement.pos.y<=214));
   assert(after.body.outbox.rows.every(row=>!Object.hasOwn(row.placement,'tier')));assert.equal(located.worldFor('world-B').fixture.w.drops.length,0);assert.deepEqual(copy(after),copy(reader.read('located-main')));
  });
  await asyncObserve('located recovery: saved positions restore without live actor observations, clamping or ambient RNG',async()=>{
   observationsAvailable=false;await located.reload();currentWorld='world-A';const world=located.worldFor(currentWorld),saved=located.owner.read();
   const random=Math.random;Math.random=()=>{throw Error('Recovery must not roll placement');};try{located.syncWorld(saved);}finally{Math.random=random;observationsAvailable=true;}
   assert.equal(world.fixture.w.drops.length,3);for(const[at,row]of saved.body.outbox.rows.entries()){const handle=world.fixture.w.drops[at];assert.deepEqual(copy(handle.pos),copy(row.placement.pos));assert.equal(handle.bob,row.placement.bob);}
   const kept=world.fixture.w.drops[0];kept.pos.x+=5;kept.bob+=8;kept.tier=4;located.syncWorld(saved);assert.equal(world.fixture.w.drops[0],kept);assert.equal(kept.pos.x,saved.body.outbox.rows[0].placement.pos.x+5);assert.equal(kept.tier,4);
  });
  await asyncObserve('located authority: another world and a denied current-world pickup cannot consume a delivery',async()=>{
   const before=located.owner.read(),count=located.plans.length;currentWorld='world-B';await assert.rejects(located.owner.submit([{kind:'pickup',characterKey:'empty',deliveryId:1}]),/pickup-not-authorized/);
   currentWorld='world-A';allowPickup=false;await assert.rejects(located.owner.submit([{kind:'pickup',characterKey:'empty',deliveryId:1}]),/pickup-not-authorized/);allowPickup=true;
   assert.deepEqual(located.owner.read(),before);assert.equal(located.plans.length,count);assert.deepEqual(copy(reader.read('located-main')),copy(before));
  });
  await asyncObserve('located pickup: failed placement keeps its birth context and stream, then same-world recipient settles it',async()=>{
   const before=located.owner.read();await located.owner.submit([{kind:'pickup',characterKey:'spill',deliveryId:1}]);const full=located.owner.read();
   assert.deepEqual(full.body.outbox,before.body.outbox);assert.deepEqual(full.body.deliveryState,before.body.deliveryState);assert.equal(full.body.characters[0].save.workshop.nextUid,before.body.characters[0].save.workshop.nextUid+1);
   await located.owner.submit([{kind:'pickup',characterKey:'empty',deliveryId:1}]);const after=located.owner.read();assert.equal(after.body.outbox.rows.length,2);assert.equal(after.body.characters[1].save.workshop.state.items.length,1);assert.deepEqual(after.body.deliveryState,before.body.deliveryState);
   assert.equal(located.worldFor('world-A').fixture.w.drops.length,2);assert(!located.worldFor('world-A').fixture.w.drops.some(d=>d.sdkDelivery.id===1));
  });
  await asyncObserve('located refusal: geometry and random continuation remain private and the retry produces identical placements',async()=>{
   anchor={x:100,y:200};actorTier=2;const fixture=await locatedFixture('located-refused'),before=fixture.owner.read();fixture.control.refuse=true;
   assert.equal((await fixture.owner.submit([locatedMerge])).status,'refused');fixture.control.refuse=false;assert.deepEqual(fixture.owner.read(),before);assert.deepEqual(copy(reader.read('located-refused')),copy(before));assert.equal(fixture.worldFor(currentWorld).fixture.w.drops.length,0);
   await fixture.owner.submit([locatedMerge]);assert.deepEqual(fixture.plans[0].body.outbox,fixture.plans[1].body.outbox);assert.deepEqual(fixture.plans[0].body.deliveryState,fixture.plans[1].body.deliveryState);
  });
  await asyncObserve('located recovery: lost acknowledgement retains exact saved locations and the next random state',async()=>{
   const fixture=await locatedFixture('located-lost');fixture.control.loseAck=true;await assert.rejects(fixture.owner.submit([locatedMerge]),/located acknowledgement lost/);fixture.control.loseAck=false;assert.equal(fixture.owner.status,'recovery-required');
   const stored=reader.read('located-lost');await fixture.reload();assert.deepEqual(copy(fixture.owner.read()),copy(stored));fixture.syncWorld(fixture.owner.read());assert.equal(fixture.worldFor(currentWorld).fixture.w.drops.length,3);assert.equal(fixture.owner.read().body.deliveryState.random.draws,9);
  });
  await asyncObserve('located recovery: failed publication reuses already-created world handles without rerolling',async()=>{
   const fixture=await locatedFixture('located-publish');fixture.control.failPublish=true;await assert.rejects(fixture.owner.submit([locatedMerge]),/located publication failed/);fixture.control.failPublish=false;const world=fixture.worldFor(currentWorld),kept=world.fixture.w.drops.slice();
   await fixture.reload();world.binding=new LocatedWorldBinding({groupKey:'located-publish',worldKey:currentWorld,admitDrop:codec,admitPlacement:(value,drop)=>placementPolicy.admitPlacement(value,drop),world:world.ports});fixture.syncWorld(fixture.owner.read());assert.equal(world.fixture.w.drops.length,3);kept.forEach((handle,n)=>assert.equal(world.fixture.w.drops[n],handle));
  });
  await asyncObserve('located admission: malformed planner addresses refuse before storage and the same owner can retry',async()=>{
   const fixture=await locatedFixture('located-plan-refusal'),before=fixture.owner.read();fixture.control.badAddress=true;await assert.rejects(fixture.owner.submit([locatedMerge]),/delivery-placement-address/);fixture.control.badAddress=false;
   assert.deepEqual(fixture.owner.read(),before);assert.deepEqual(copy(reader.read('located-plan-refusal')),copy(before));assert.equal(fixture.plans.length,0);await fixture.owner.submit([locatedMerge]);assert.equal(fixture.owner.read().body.outbox.rows.length,3);
  });
  await asyncObserve('located admission: malformed stored placement refuses before a usable owner escapes',async()=>{
   const bad=copy(located.owner.read().body);bad.outbox.rows[0].placement.pos.x=null;assert.equal(writer.commit('located-malformed',0,bad).status,'committed');
   await assert.rejects(LocatedOwner.open({...located.options,groupKey:'located-malformed'}),/invalid-placement-number/);
  });
  observe('located policy: batch continuation matches split preparation without borrowing inputs',()=>{
   const rows=copy(located.owner.read().body.outbox.rows).map(({placement,...row})=>row),state=placementPolicy.seed(98),input={groupKey:'continuation',state,rows};const before=copy(input),batch=placementPolicy.prepare(input),first=placementPolicy.prepare({...input,rows:rows.slice(0,1)}),second=placementPolicy.prepare({...input,state:first.state,rows:rows.slice(1)});
   assert.deepEqual(copy(batch.placements),copy([...first.placements,...second.placements]));assert.deepEqual(copy(batch.state),copy(second.state));assert.deepEqual(copy(input),before);
   assert.throws(()=>placementPolicy.prepare({...input,state:{...state,random:{...state.random,draws:Number.MAX_SAFE_INTEGER}}}),/placement-stream-exhausted/);
  });
  observe('located binding: world selection retains a whole-group revision fence and rejects foreign handles',()=>{
   const rows=copy(located.owner.read().body.outbox.rows),other=copy(rows[0]);other.id=99;other.placement.worldKey='world-B';rows.push(other);
   const make=worldKey=>{const list=[],world={list:()=>list,inspect:handle=>handle.value,create:value=>{const handle={value:copy(value)};list.push(handle);return handle;},remove:handle=>list.splice(list.indexOf(handle),1)};
    return{list,binding:new LocatedWorldBinding({groupKey:'world-fence',worldKey,admitDrop:codec,admitPlacement:(value,drop)=>placementPolicy.admitPlacement(value,drop),world})};};
   const a=make('world-A'),b=make('world-B'),snapshot={groupKey:'world-fence',revision:50,rows};a.binding.reconcile(snapshot);b.binding.reconcile(snapshot);assert.equal(a.list.length,2);assert.equal(b.list.length,1);
   const changed=copy(snapshot);changed.rows.at(-1).placement.pos.x+=1;assert.throws(()=>a.binding.reconcile(changed),/conflicting-delivery-revision/);
   const duplicate=copy(snapshot);duplicate.rows.at(-1).id=duplicate.rows[0].id;assert.throws(()=>a.binding.reconcile(duplicate),/duplicate-delivery-id/);
   assert.throws(()=>a.binding.pickup(b.list[0],'empty'),/foreign-world-delivery/);
  });

  const createLocatedWorldOwner=async(key,row)=>{
   const fixture=worldFixture(row,key),birthWorld=key+'-scene';let activeWorld=birthWorld,binding,host,frame,publicationKernel;
   const control={},log=[],ports={...fixture.ports,create:value=>{
    const handle=fixture.ports.create(value);handle.pos=copy(value.placement.pos);handle.bob=value.placement.bob;
    if(value.placement.tier===undefined)delete handle.tier;else handle.tier=value.placement.tier;
    handle.sdkDelivery.placement=copy(value.placement);return handle;
   }};
   const policy=new HollowWakeSpillPlacement({observe:()=>({worldKey:activeWorld,pos:{...fixture.p.pos},tier:fixture.p.tier}),
    clamp:()=>{throw Error('Pickup must not reroll saved placement');},canPickup:request=>frame?.authorizePickup(request)===true});
   // A trusted, test-only birth fixture. This is not an automatic v1 save migration.
   const seed=seedPickup(key+'-birth-fixture',row).body;
   seed.schemaVersion=2;seed.capability='durable-character-group/located-diagnostic';seed.deliveryState=policy.seed(614);
   // Support birth metadata omits tier. The original loop resolves a live tier
   // on its first update; later fixture steps already contain that live value.
   seed.outbox.rows.forEach((delivery,n)=>{const original=row.beforeDrops[n];delivery.placement=policy.admitPlacement({schemaVersion:1,capability:'hollow-wake-ground/v1',worldKey:birthWorld,pos:copy(original.pos),bob:original.bob,...(delivery.drop.kind==='skill'?{tier:original.tier}:{})},delivery.drop);});
   assert.equal(writer.commit(key,0,seed).status,'committed');
   const storage={read:id=>writer.read(id),async commit(...args){
    if(control.refuse)return{status:'refused'};
    if(control.delay){control.waiting=true;await new Promise(resolve=>{control.release=resolve;});control.waiting=false;}
    const result=writer.commit(...args);if(control.loseAck)throw Error('located World acknowledgement lost');return result;
   }};
   const createOwner=({resolveDelivery})=>{
    publicationKernel=new CompleteAccountKernel(completeBase,{conditions:({profile,accountKey,command})=>{
     if(command.op==='character-pickup')return{drop:resolveDelivery({profile,accountKey,deliveryId:command.command.deliveryId})};
     return command.op==='character-merge'?{nearFont:true}:progressConditions;
    }});return new CompleteOwner({...completeDefs,completeKernel:publicationKernel});
   };
   const live={prepare:packet=>packet,discard:()=>log.push('discard'),recoverRequired:()=>log.push('recovery'),publish:(lease,packet)=>{
    assert.deepEqual(copy(reader.read(key)),copy(lease.candidate));
    fixture.apply(lease.candidate.body.characters[0].save,packet.journal,entry=>{
     const transition=entry.transitions.filter(row=>row.profile===31).at(-1);assert(transition?.after);return publicationKernel.inventoryItems(transition.after);
    },()=>{if(control.failPublish)throw Error('located World publication failed');});
    binding.reconcile(worldSnapshot(key,lease.candidate));log.push('publish');
   }};
   const open=()=>LocatedOwner.open({createOwner,storage,groupKey:key,accountKey:'pickup-account',characters:[{key:'source',handle:31}],live,admitDrop:codec,delivery:policy});
   const connect=()=>{
    binding=new LocatedWorldBinding({groupKey:key,worldKey:birthWorld,admitDrop:codec,admitPlacement:(value,drop)=>policy.admitPlacement(value,drop),world:ports});binding.reconcile(worldSnapshot(key,host.read()));
    frame=new LocatedPickupFrame({groupKey:key,binding,owner:host,characterOf:seat=>seat===fixture.s?'source':undefined});fixture.bridge((drop,seat)=>{if(drop.sdkDelivery.groupKey===key)frame.offer(drop,seat);});
   };
   host=await open();connect();
   return{fixture,control,log,policy,ports,birthWorld,get host(){return host;},get binding(){return binding;},get frame(){return frame;},set activeWorld(value){activeWorld=value;},
    update(dt){frame.begin();try{fixture.update(dt);}catch(error){frame.cancel();throw error;}return frame.end();},
    snapshot:()=>fixture.snapshot().map((value,n)=>({...value,pos:copy(fixture.w.drops[n].pos)})),
    async recover(){host=await open();fixture.apply(host.read().body.characters[0].save,[]);connect();}
   };
  };
  for(const[index,row]of locatedPickupOriginal.original.entries())await asyncObserve('located actual World pickup: '+row.label,async()=>{
   const key='located-world-original-'+index,run=await createLocatedWorldOwner(key,row),{fixture}=run,next=fixture.nextUid()+1;
   const bag=fixture.m.items,retained=bag.slice(),stream=run.host.read().body.deliveryState;
   await run.update(row.dt);assert.equal(fixture.nextUid()-next,0);assert.equal(fixture.m.items,bag);for(const item of retained)assert(bag.includes(item));
   assert.deepEqual(copy(bag),row.after.items);assert.deepEqual(copy(run.host.read().body.characters[0].save.workshop.state.items),row.after.items);
   assert.equal(run.host.read().body.characters[0].save.workshop.nextUid,row.next+row.allocated);
   assert.deepEqual(copy(run.snapshot()),row.afterDrops);assert.deepEqual(fixture.events,row.events);assert.deepEqual(fixture.visible,row.visible);
   assert.deepEqual(copy(fixture.w.pickupFeed.map(({seatId,...value})=>value)),row.feed);assert.deepEqual(fixture.touches,row.touches);
   assert.deepEqual(run.host.read().body.deliveryState,stream);assert.deepEqual(copy(reader.read(key)),copy(run.host.read()));
  });
  await asyncObserve('located World authority: direct requests cannot bypass original eligibility or reuse a refused frame permit',async()=>{
   const run=await createLocatedWorldOwner('located-world-permit',locatedPickupOriginal.original[0]),before=run.host.read(),drop=run.fixture.w.drops[0];
   await assert.rejects(run.host.submit([pickup()]),/pickup-not-authorized/);assert.deepEqual(run.host.read(),before);assert.equal(run.log.length,0);
   run.control.refuse=true;assert.equal((await run.update(0.1)).status,'refused');run.control.refuse=false;
   await assert.rejects(run.host.submit([pickup()]),/pickup-not-authorized/);assert.equal(run.fixture.w.drops[0],drop);assert.deepEqual(run.host.read(),before);
   await run.update(0.1);assert.equal(run.fixture.w.drops.length,0);assert.equal(run.fixture.m.items.length,1);
  });
  await asyncObserve('located World authority: scene change before submission rejects the old scene offer without a write',async()=>{
   const run=await createLocatedWorldOwner('located-world-moved',locatedPickupOriginal.original[0]),before=run.host.read(),drop=run.fixture.w.drops[0];
   run.frame.begin();run.fixture.update(0.1);run.activeWorld='different-world';await assert.rejects(run.frame.end(),/pickup-not-authorized/);
   assert.deepEqual(run.host.read(),before);assert.equal(run.fixture.w.drops[0],drop);assert.equal(run.fixture.m.items.length,0);assert.equal(run.log.length,0);
   run.activeWorld=run.birthWorld;await run.update(0.1);assert.equal(run.fixture.m.items.length,1);
  });
  await asyncObserve('located World pending save: simulation continues and accepted pickup settles its birth-world handle after a scene change',async()=>{
   const run=await createLocatedWorldOwner('located-world-pending',locatedPickupOriginal.original[0]),drop=run.fixture.w.drops[0],before=run.host.read();run.control.delay=true;
   const pending=run.update(0.1);assert(run.control.waiting);assert.equal(run.host.status,'pending');const bob=drop.bob;run.fixture.w.time+=0.5;run.fixture.p.life-=1;run.activeWorld='new-scene';
   assert.equal(run.update(0.2),undefined);assert(drop.bob>bob);assert.equal(run.fixture.m.items.length,0);assert.deepEqual(run.host.read(),before);assert.deepEqual(copy(reader.read('located-world-pending')),copy(before));
   const grant={groupKey:'located-world-pending',characterKey:'source',delivery:before.body.outbox.rows[0]};assert.equal(run.frame.authorizePickup(grant),false);
   const life=run.fixture.p.life;run.control.delay=false;run.control.release();await pending;assert.equal(run.fixture.w.drops.length,0);assert.equal(run.fixture.m.items.length,1);assert.equal(run.fixture.w.time,0.5);assert.equal(run.fixture.p.life,life);
  });
  await asyncObserve('located World recovery: lost acknowledgement restores one inventory result without replaying pickup effects',async()=>{
   const run=await createLocatedWorldOwner('located-world-ack',locatedPickupOriginal.original[0]),drop=run.fixture.w.drops[0],bag=run.fixture.m.items;run.control.loseAck=true;
   await assert.rejects(run.update(0.1),/located World acknowledgement lost/);run.control.loseAck=false;assert.equal(run.host.status,'recovery-required');assert.equal(run.fixture.w.drops[0],drop);assert.equal(bag.length,0);assert.equal(run.fixture.events.length,0);
   assert.equal(run.update(0.1),undefined);await run.recover();assert.equal(run.fixture.m.items,bag);assert.equal(bag.length,1);assert.equal(run.fixture.w.drops.length,0);assert.equal(run.fixture.events.length,0);assert.equal(run.update(0.1),undefined);
  });
  await asyncObserve('located World recovery: partial live publication repairs inventory and ground without replacing an already-published item',async()=>{
   const run=await createLocatedWorldOwner('located-world-partial',locatedPickupOriginal.original[0]),bag=run.fixture.m.items;run.control.failPublish=true;
   await assert.rejects(run.update(0.1),/located World publication failed/);run.control.failPublish=false;const item=bag[0],events=copy(run.fixture.events);assert(item);assert.equal(run.fixture.w.drops.length,1);
   await run.recover();assert.equal(run.fixture.m.items,bag);assert.equal(bag[0],item);assert.equal(run.fixture.w.drops.length,0);assert.deepEqual(run.fixture.events,events);
  });
  await asyncObserve('located World recovery: full bag keeps original birth placement while bob continues and retry allocates only once',async()=>{
   const run=await createLocatedWorldOwner('located-world-full',locatedPickupOriginal.original[2]),drop=run.fixture.w.drops[0],before=run.host.read(),bag=run.fixture.m.items,items=bag.slice();
   await run.update(0.1);const next=run.host.read();assert.equal(next.body.characters[0].save.workshop.nextUid,before.body.characters[0].save.workshop.nextUid+1);assert.deepEqual(next.body.outbox,before.body.outbox);assert.deepEqual(next.body.deliveryState,before.body.deliveryState);
   const bob=drop.bob;await run.recover();assert.equal(run.fixture.w.drops[0],drop);assert.equal(drop.bob,bob);assert.equal(run.fixture.m.items,bag);items.forEach((item,n)=>assert.equal(bag[n],item));
   await assert.rejects(run.host.submit([pickup()]),/pickup-not-authorized/);await run.update(0.1);assert.equal(run.host.read().body.characters[0].save.workshop.nextUid,next.body.characters[0].save.workshop.nextUid+1);
  });
  observe('located frame authority: grants are single use, group scoped and cleared on synchronous failure',()=>{
   const delivery={id:1},request={groupKey:'authority',characterKey:'hero',delivery};let fail=false,bridge,nextId=1;
   const binding={status:'ready',pickup:()=>({kind:'pickup',characterKey:'hero',deliveryId:nextId})},owner={status:'ready',submit(){
    const current={...request,delivery:{id:nextId}};
    assert.equal(bridge.authorizePickup({...current,groupKey:'foreign'}),false);assert.equal(bridge.authorizePickup({...current,characterKey:'foreign'}),false);
    if(fail)throw Error('synchronous submit failure');if(nextId!==1)assert.equal(bridge.authorizePickup(request),false);
    assert.equal(bridge.authorizePickup(current),true);assert.equal(bridge.authorizePickup(current),false);return Promise.resolve();
   }};bridge=new LocatedPickupFrame({groupKey:'authority',binding,owner,characterOf:()=> 'hero'});
   assert.equal(bridge.authorizePickup(request),false);bridge.begin();bridge.offer({},{});bridge.cancel();assert.equal(bridge.authorizePickup(request),false);
   bridge.begin();bridge.offer({},{});bridge.end();assert.equal(bridge.authorizePickup(request),false);fail=true;bridge.begin();bridge.offer({},{});assert.throws(()=>bridge.end(),/synchronous submit failure/);assert.equal(bridge.authorizePickup(request),false);
   fail=false;nextId=2;bridge.begin();bridge.offer({},{});bridge.end();assert.equal(bridge.authorizePickup(request),false);
  });

  await asyncObserve('typed located owner: a stale aggregate revision discards live work and requires recovery',async()=>{
   const key='typed-owner-stale',fixture=await locatedFixture(key),before=fixture.owner.read();
   const external=writer.commit(key,before.revision,copy(before.body));
   assert.equal(external.status,'committed');assert.equal(external.revision,before.revision+1);
   const reply=await fixture.owner.submit([locatedMerge]);
   assert.equal(reply.status,'conflict');assert.equal(reply.revision,before.revision);
   assert.equal(fixture.owner.status,'recovery-required');
   assert.deepEqual(fixture.log,['discard','recovery']);
   assert.equal(fixture.worldFor(currentWorld).fixture.w.drops.length,0);
   assert.deepEqual(copy(reader.read(key)),{revision:before.revision+1,body:copy(before.body)});
   assert.throws(()=>fixture.owner.read(),/character-recovery-required/);
   await assert.rejects(fixture.owner.submit([locatedMerge]),/character-recovery-required/);
   await fixture.reload();assert.equal(fixture.owner.status,'ready');
   assert.equal(fixture.owner.read().revision,before.revision+1);
   assert.equal((await fixture.owner.submit([locatedMerge])).status,'committed');
   assert.equal(fixture.owner.read().revision,before.revision+2);
  });
  await asyncObserve('typed located owner: asynchronous live publication poisons the owner after the durable commit',async()=>{
   const key='typed-owner-async-publish',fixture=await locatedFixture(key),before=fixture.owner.read();
   const publish=fixture.options.live.publish;
   fixture.options.live.publish=async()=>{};
   await assert.rejects(fixture.owner.submit([locatedMerge]),/live-publish-must-be-synchronous/);
   fixture.options.live.publish=publish;
   assert.equal(fixture.owner.status,'recovery-required');assert.deepEqual(fixture.log,['recovery']);
   const stored=copy(reader.read(key));assert.equal(stored.revision,before.revision+1);assert.equal(stored.body.outbox.rows.length,3);
   assert.equal(fixture.worldFor(currentWorld).fixture.w.drops.length,0);
   assert.throws(()=>fixture.owner.read(),/character-recovery-required/);
   await fixture.reload();assert.deepEqual(copy(fixture.owner.read()),stored);
   fixture.syncWorld(fixture.owner.read());assert.equal(fixture.worldFor(currentWorld).fixture.w.drops.length,3);
   assert.deepEqual(copy(reader.read(key)),stored);
  });
  await asyncObserve('typed located owner: asynchronous discard requires recovery without claiming a durable commit',async()=>{
   const key='typed-owner-async-discard',fixture=await locatedFixture(key),before=fixture.owner.read();
   const discard=fixture.options.live.discard;
   fixture.control.refuse=true;fixture.options.live.discard=async()=>{fixture.log.push('discard');};
   await assert.rejects(fixture.owner.submit([locatedMerge]),/live-discard-must-be-synchronous/);
   fixture.options.live.discard=discard;fixture.control.refuse=false;
   assert.equal(fixture.owner.status,'recovery-required');assert.deepEqual(fixture.log,['discard','recovery']);
   assert.deepEqual(copy(reader.read(key)),copy(before));assert.equal(fixture.worldFor(currentWorld).fixture.w.drops.length,0);
   assert.throws(()=>fixture.owner.read(),/character-recovery-required/);
   await fixture.reload();assert.deepEqual(copy(fixture.owner.read()),copy(before));
   assert.equal((await fixture.owner.submit([locatedMerge])).status,'committed');
   assert.equal(fixture.owner.read().revision,before.revision+1);
  });

  await asyncObserve('typed placement boundary: malformed source addresses fail before host observations',async()=>{
   const fixture=await locatedFixture('typed-placement-source');await fixture.owner.submit([locatedMerge]);
   const delivery=copy(fixture.owner.read().body.outbox.rows[0]);let observations=0,permissions=0;
   const policy=new HollowWakeSpillPlacement({
    observe:()=>{observations++;return{worldKey:delivery.placement.worldKey,pos:{x:0,y:0},tier:0};},
    clamp:(_world,pos)=>pos,canPickup:()=>{permissions++;return true;}
   });
   const request={groupKey:'typed-placement-source',characterKey:'empty',delivery};
   assert.equal(policy.authorizePickup(request),true);assert.equal(observations,1);assert.equal(permissions,1);
   for(const value of [null,42,'']){
    const invalid=copy(request);invalid.delivery.characterKey=value;
    assert.throws(()=>policy.authorizePickup(invalid),/invalid-string/);
   }
   const missing=copy(request);delete missing.delivery.characterKey;
   assert.throws(()=>policy.authorizePickup(missing),/invalid-string/);
   assert.equal(observations,1);assert.equal(permissions,1);
  });

  await asyncObserve('typed world ports: numeric handles retain identity, frame ownership and retirement',async()=>{
   const groupKey='typed-world-numeric',fixture=await locatedFixture(groupKey);
   await fixture.owner.submit([locatedMerge]);const saved=fixture.owner.read(),rows=copy(saved.body.outbox.rows);
   const entries=new Map();let nextHandle=100,submitted=0,frame;
   const world={list:()=>[...entries.keys()],inspect:handle=>entries.get(handle),create:row=>{const handle=nextHandle++;entries.set(handle,copy(row));return handle;},remove:handle=>{entries.delete(handle);}};
   const binding=new LocatedWorldBinding({groupKey,worldKey:rows[0].placement.worldKey,admitDrop:codec,
    admitPlacement:(value,drop)=>placementPolicy.admitPlacement(value,drop),world});
   const snapshot={groupKey,revision:saved.revision,rows};
   assert.deepEqual(binding.reconcile(snapshot),{revision:saved.revision,created:3,retired:0,preserved:0});
   const handles=[...entries.keys()];assert.deepEqual(handles,[100,101,102]);
   assert.deepEqual(binding.reconcile(copy(snapshot)),{revision:saved.revision,created:0,retired:0,preserved:3});
   assert.deepEqual([...entries.keys()],handles);
   const request={groupKey,characterKey:'empty',delivery:rows[0]};
   frame=new LocatedPickupFrame({groupKey,binding,characterOf:seat=>seat.key,owner:{status:'ready',submit(actions){
    submitted++;assert.deepEqual(actions,[{kind:'pickup',characterKey:'empty',deliveryId:rows[0].id}]);
    assert.equal(frame.authorizePickup(request),true);assert.equal(frame.authorizePickup(request),false);
    return Promise.resolve({status:'unchanged',revision:saved.revision,replies:[]});
   }}});
   frame.begin();frame.offer(handles[0],{key:'empty'});frame.offer(handles[0],{key:'empty'});const pending=frame.end();
   assert.equal(frame.authorizePickup(request),false);assert.equal((await pending).status,'unchanged');assert.equal(submitted,1);
   assert.deepEqual(binding.reconcile({groupKey,revision:saved.revision+1,rows:[]}),{revision:saved.revision+1,created:0,retired:3,preserved:0});
   assert.equal(entries.size,0);assert.throws(()=>binding.pickup(handles[0],'empty'),/foreign-world-delivery/);
  });

  assert.deepEqual(typedAccountContracts,{identity:true,stale:true,delivery:true});
  const createAdapterWorldOwner=async(key,row)=>{
   const fixture=worldFixture(row,key),birthWorld=key+'-scene';let activeWorld=birthWorld,binding,host,frame,publicationKernel,authorize;let instanceCurrent=true;
   const control={},log=[],ports={...fixture.ports,create:value=>{
    const handle=fixture.ports.create(value);handle.pos=copy(value.placement.pos);handle.bob=value.placement.bob;
    if(value.placement.tier===undefined)delete handle.tier;else handle.tier=value.placement.tier;
    handle.sdkDelivery.placement=copy(value.placement);return handle;
   }};
   const policy=new HollowWakeSpillPlacement({observe:()=>({worldKey:activeWorld,pos:{...fixture.p.pos},tier:fixture.p.tier}),
    clamp:()=>{throw Error('Pickup must not reroll saved placement');},canPickup:request=>authorize?.(request)===true});
   // A trusted, test-only birth fixture. This is not an automatic v1 save migration.
   const seed=seedPickup(key+'-birth-fixture',row).body;
   seed.schemaVersion=2;seed.capability='durable-character-group/located-diagnostic';seed.deliveryState=policy.seed(614);
   // Support birth metadata omits tier. The original loop resolves a live tier
   // on its first update; later fixture steps already contain that live value.
   seed.outbox.rows.forEach((delivery,n)=>{const original=row.beforeDrops[n];delivery.placement=policy.admitPlacement({schemaVersion:1,capability:'hollow-wake-ground/v1',worldKey:birthWorld,pos:copy(original.pos),bob:original.bob,...(delivery.drop.kind==='skill'?{tier:original.tier}:{})},delivery.drop);});
   assert.equal(writer.commit(key,0,seed).status,'committed');
   const storage={read:id=>writer.read(id),async commit(...args){
    if(control.refuse)return{status:'refused'};
    if(control.delay){control.waiting=true;await new Promise(resolve=>{control.release=resolve;});control.waiting=false;}
    const result=writer.commit(...args);if(control.loseAck)throw Error('located World acknowledgement lost');return result;
   }};
   const createOwner=({resolveDelivery})=>{
    publicationKernel=new CompleteAccountKernel(completeBase,{conditions:({profile,accountKey,command})=>{
     if(command.op==='character-pickup')return{drop:resolveDelivery({profile,accountKey,deliveryId:command.command.deliveryId})};
     return command.op==='character-merge'?{nearFont:true}:progressConditions;
    }});return new CompleteOwner({...completeDefs,completeKernel:publicationKernel});
   };
   const live={prepare:packet=>packet,discard:()=>log.push('discard'),recoverRequired:()=>log.push('recovery'),publish:(lease,packet)=>{
    assert.deepEqual(copy(reader.read(key)),copy(lease.candidate));
    fixture.apply(lease.candidate.body.characters[0].save,packet.journal,entry=>{
     const transition=entry.transitions.filter(row=>row.profile===31).at(-1);assert(transition?.after);return publicationKernel.inventoryItems(transition.after);
    },()=>{if(control.failPublish)throw Error('located World publication failed');});
    log.push('publish');
   }};

   const open=()=>CharacterWorldAdapter.open({
    world:{groupKey:key,worldKey:birthWorld,admitDrop:codec,admitPlacement:(value,drop)=>policy.admitPlacement(value,drop),world:ports},
    characterOf:seat=>seat===fixture.s?'source':undefined,isCurrent:()=>instanceCurrent,live,
    restore:snapshot=>{fixture.apply(snapshot.body.characters[0].save,[]);},
    createOwner:({live,authorizePickup})=>{authorize=authorizePickup;return LocatedOwner.open({createOwner,storage,groupKey:key,accountKey:'pickup-account',characters:[{key:'source',handle:31}],live,admitDrop:codec,delivery:policy});}
   });
   host=await open();
   return{fixture,control,log,policy,ports,birthWorld,get host(){return host;},get binding(){return binding;},get frame(){return frame;},set activeWorld(value){activeWorld=value;},
    update(dt){return host.update(offer=>{fixture.bridge((drop,seat)=>{if(drop.sdkDelivery.groupKey===key)offer(drop,seat);});fixture.update(dt);});},
    snapshot:()=>fixture.snapshot().map((value,n)=>({...value,pos:copy(fixture.w.drops[n].pos)})),
    retire(){instanceCurrent=false;},async recover(){host.dispose();instanceCurrent=true;host=await open();}
   };
  };

  for(const[index,row]of locatedPickupOriginal.original.entries())await asyncObserve('assembled world adapter: '+row.label,async()=>{
   const key='assembled-original-'+index,run=await createAdapterWorldOwner(key,row),{fixture}=run;
   const bag=fixture.m.items,retained=bag.slice(),next=fixture.nextUid()+1;
   await run.update(row.dt);assert.equal(fixture.nextUid()-next,0);assert.equal(fixture.m.items,bag);
   retained.forEach(item=>assert(bag.includes(item)));
   assert.deepEqual(copy(bag),row.after.items);assert.deepEqual(run.snapshot(),row.afterDrops);
   assert.deepEqual(fixture.events,row.events);assert.deepEqual(fixture.visible,row.visible);
   assert.deepEqual(fixture.touches,row.touches);assert.deepEqual(copy(fixture.w.pickupFeed.map(({seatId,...value})=>value)),row.feed);
   assert.deepEqual(copy(reader.read(key)),copy(run.host.read()));
  });
  await asyncObserve('world lifetime: explicit disposal rejects new work before a durable write',async()=>{
   const key='adapter-disposed',run=await createAdapterWorldOwner(key,locatedPickupOriginal.original[0]),before=reader.read(key);
   run.host.dispose();assert.equal(run.host.status,'disposed');
   assert.throws(()=>run.update(.1),/world-adapter-disposed/);
   assert.throws(()=>run.host.submit([pickup()]),/world-adapter-disposed/);
   assert.deepEqual(reader.read(key),before);assert.equal(run.fixture.events.length,0);
  });
  for(const kind of ['dispose','expire'])await asyncObserve('world lifetime: '+kind+' during save retains the committed result without mutating the retired world',async()=>{
   const key='adapter-pending-'+kind,run=await createAdapterWorldOwner(key,locatedPickupOriginal.original[0]),before=reader.read(key);
   run.control.delay=true;const pending=run.update(.1);assert(run.control.waiting);
   const bag=run.fixture.m.items,drop=run.fixture.w.drops[0],snapshot=run.snapshot();
   if(kind==='dispose')run.host.dispose();else run.retire();
   run.control.release();await assert.rejects(pending,new RegExp(kind==='dispose'?'world-adapter-disposed':'world-adapter-expired'));
   assert.equal(run.host.status,'disposed');assert.equal(run.fixture.m.items,bag);assert.equal(bag.length,0);
   assert.equal(run.fixture.w.drops[0],drop);assert.deepEqual(run.snapshot(),snapshot);
   assert.deepEqual(run.log,['recovery']);assert.equal(run.fixture.events.length,0);
   const saved=reader.read(key);assert.equal(saved.revision,before.revision+1);assert.equal(saved.body.outbox.rows.length,0);
   assert.equal(saved.body.characters[0].save.workshop.state.items.length,1);
   await run.recover();assert.equal(run.host.status,'ready');assert.equal(run.fixture.m.items,bag);assert.equal(bag.length,1);
   assert.equal(run.fixture.w.drops.length,0);assert.equal(run.fixture.events.length,0);
  });
  await asyncObserve('world lifetime: refusal after departure still discards the prepared lease',async()=>{
   const key='adapter-refused-disposal',run=await createAdapterWorldOwner(key,locatedPickupOriginal.original[0]),before=reader.read(key);
   run.control.delay=true;const pending=run.update(.1);assert(run.control.waiting);run.host.dispose();
   // The first fixture refusal check precedes its delay. A competing revision
   // provides a definite post-delay conflict instead of pretending to cancel I/O.
   const competing=writer.commit(key,before.revision,before.body);assert.equal(competing.status,'committed');
   run.control.release();assert.equal((await pending).status,'conflict');assert.deepEqual(run.log,['discard','recovery']);
   assert.equal(run.fixture.m.items.length,0);assert.equal(run.fixture.w.drops.length,1);assert.equal(run.fixture.events.length,0);
   assert.deepEqual(reader.read(key).body,before.body);await run.recover();assert.equal(run.host.status,'ready');
  });
  await asyncObserve('world update: eligibility callbacks expire across updates and exception exits',async()=>{
   const key='adapter-eligibility',run=await createAdapterWorldOwner(key,locatedPickupOriginal.original[0]),before=reader.read(key);
   const drop=run.fixture.w.drops[0],seat=run.fixture.s;let stale;
   assert.throws(()=>run.host.update(offer=>{stale=offer;offer(drop,seat);throw Error('update failed');}),/update failed/);
   assert.throws(()=>stale(drop,seat),/expired-world-eligibility/);
   assert.equal(run.host.update(()=>{assert.throws(()=>stale(drop,seat),/expired-world-eligibility/);}),undefined);
   assert.deepEqual(reader.read(key),before);assert.equal(run.fixture.events.length,0);
   await run.update(.1);assert.equal(run.fixture.m.items.length,1);
  });
  await asyncObserve('world update: async and reentrant eligibility loops cannot submit partial offers',async()=>{
   const key='adapter-update-contract',run=await createAdapterWorldOwner(key,locatedPickupOriginal.original[0]),before=reader.read(key);
   assert.throws(()=>run.host.update(async offer=>{offer(run.fixture.w.drops[0],run.fixture.s);}),/world-adapter-update-must-be-synchronous/);
   assert.throws(()=>run.host.update(()=>{run.host.update(()=>{});}),/reentrant-world-adapter-update/);
   assert.deepEqual(reader.read(key),before);assert.equal(run.fixture.events.length,0);
   await run.update(.1);assert.equal(run.fixture.m.items.length,1);
  });
  await asyncObserve('world lifetime: a pending save keeps simulating a still-live birth world after the player moves',async()=>{
   const key='adapter-pending-live',run=await createAdapterWorldOwner(key,locatedPickupOriginal.original[0]);
   const before=reader.read(key),bag=run.fixture.m.items,drop=run.fixture.w.drops[0];run.control.delay=true;
   const pending=run.update(.1);assert(run.control.waiting);assert.equal(run.host.status,'pending');
   const bob=drop.bob;run.activeWorld='another-scene';run.fixture.p.life-=1;const life=run.fixture.p.life;
   assert.equal(run.update(.2),undefined);assert(drop.bob>bob);assert.equal(bag.length,0);assert.deepEqual(reader.read(key),before);
   run.control.release();assert.equal((await pending).status,'committed');assert.equal(run.host.status,'ready');
   assert.equal(run.fixture.p.life,life);assert.equal(run.fixture.m.items,bag);assert.equal(bag.length,1);
   assert.equal(run.fixture.w.drops.length,0);assert.deepEqual(run.log,['publish']);assert.deepEqual(copy(reader.read(key)),copy(run.host.read()));
  });
  await asyncObserve('world lifetime: disposal inside eligibility cancels the open frame before storage',async()=>{
   const key='adapter-dispose-update',run=await createAdapterWorldOwner(key,locatedPickupOriginal.original[0]),before=reader.read(key);
   let stale;assert.throws(()=>run.host.update(offer=>{stale=offer;offer(run.fixture.w.drops[0],run.fixture.s);run.host.dispose();}),/world-adapter-disposed/);
   assert.throws(()=>stale(run.fixture.w.drops[0],run.fixture.s),/expired-world-eligibility/);
   assert.equal(run.host.status,'disposed');assert.deepEqual(reader.read(key),before);assert.equal(run.fixture.events.length,0);
  });

  writeFileSync(process.argv[2],JSON.stringify({rows,sqlite:writer.version()})+'\n');
 }finally{for(const value of stores)value.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
