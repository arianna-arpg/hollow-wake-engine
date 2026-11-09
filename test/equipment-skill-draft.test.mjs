import test from 'node:test';
import assert from 'node:assert/strict';
import {EquipmentSkills} from '../dist/equipment-skills.js';
import {EquipmentSkillDraft} from '../dist/equipment-skill-draft.js';

const copy=value=>structuredClone(value);
const unavailable=()=>{throw Error('live callback reached');};
function fixture(){
 const definitions={fire:{id:'fire',name:'Fire'},ice:{id:'ice',name:'Ice'}},support={id:'s'};
 const makeSkill=(def,level=4,sockets=2)=>({def,level,sockets:Array(sockets).fill(null)});
 const grant=makeSkill(definitions.fire);grant.grantedHostUid=1;grant.treeNodes=['retained'];grant.state={lastUseAt:12};
 grant.sockets[0]={def:support,level:2,rolled:{form:'crew'},locked:true};
 const learned=makeSkill(definitions.ice),hat={uid:1,name:'Hat',grantState:{fire:{sockets:[{id:'s',level:2},null],treeNodes:['retained']}}};
 const values={grant_fire:4},calls=[];
 const source={seat:{grantedInsts:new Map([['fire',grant]]),grantedSkills:[{def:grant.def,level:4,inst:grant,source:'Hat',hostUid:1,slot:0}],wornGrafts:[]},
  actor:{skills:[grant,learned,null],sheet:{get:unavailable},activeAuras:new Map(),summonToggles:new Map()},
  meta:{knownSkills:new Map([['ice',learned]]),equipped:{head:hat},classDef:{innate:[]},grafts:{}},passiveMods:[],
  gearSheetMods:new Map([['head',[{stat:'grant_fire'}]]]),containerSheetMods:new Map(),containerPieceMods:new Map(),
  passiveGrafts:()=>[],deriveCompanions:unavailable,deactivateAura:unavailable,dismissSummon:unavailable};
 const services={copySkill:inst=>{const {def,...fields}=inst;return {def,...copy(fields)};},copyItem:copy,sheet:{get:id=>values[id]??0},
  copyToggle:(_kind,row,inst)=>{const {inst:_original,...fields}=row;return {...copy(fields),inst};},
  deriveCompanions:(frame,defs,name,key)=>{calls.push({frame,ids:defs.map(d=>d.id),names:defs.map(d=>name(d.id)),keys:defs.map(d=>key(d.id))});},
  retire:(frame,row)=>{(row.kind==='aura'?frame.actor.activeAuras:frame.actor.summonToggles).delete(row.id);}};
 const runtime=new EquipmentSkills({skillGrantPrefix:'grant_',companionGrantPrefix:'crew_',slotGraftPrefix:'slot_',
  equipSlots:()=>[{id:'head'},{id:'ring'}],skill:id=>definitions[id],support:id=>id==='s'?support:undefined,
  parseSkillGrant:stat=>stat.slice(6),companionGrantStat:id=>'crew_'+id,parseSlotGraft:()=>({slot:0,gemId:'s'}),
  skillMaxLevel:()=>20,maxSupportLevel:10,grantSockets:()=>2,autoSeat:()=>false,makeSkill,
  restoreGrant:(inst,saved)=>{inst.sockets=saved.sockets.map(row=>row?{def:support,level:row.level}:null);inst.treeNodes=['cold-restored'];},
  packGrant:inst=>({sockets:inst.sockets.map(row=>row?{id:row.def.id,level:row.level}:null),treeNodes:inst.treeNodes?.slice()}),
  classes:()=>[],openingSkills:()=>[],classSkillStat:()=>'',treeGraft:()=>undefined,supportFits:()=>true});
 const fork=()=>new EquipmentSkillDraft(source,services);
 return {source,services,values,calls,runtime,fork,grant,learned,hat,definitions,makeSkill};
}

test('private fork preserves graph aliases, ordered owners and complete copied investment without cold restore',()=>{
 const f=fixture();f.source.actor.activeAuras.set('fire',{inst:f.grant,reservation:{mana:5},affected:new Set([8])});f.source.actor.summonToggles.set('ice',{inst:f.learned});
 f.source.containerPieceMods.set(f.hat,[{stat:'grant_fire'}]);
 const draft=f.fork(),frame=draft.frame,g=frame.seat.grantedInsts.get('fire');
 assert.notEqual(g,f.grant);assert.equal(g.def,f.grant.def);assert.deepEqual(g.treeNodes,['retained']);
 assert.equal(frame.actor.skills[0],g);assert.equal(frame.seat.grantedSkills[0].inst,g);assert.equal(frame.actor.activeAuras.get('fire').inst,g);
 assert.equal(frame.actor.skills[1],frame.meta.knownSkills.get('ice'));assert.equal(frame.actor.summonToggles.get('ice').inst,frame.actor.skills[1]);
 const aura=frame.actor.activeAuras.get('fire');assert.deepEqual(aura.reservation,{mana:5});assert.deepEqual(aura.affected,new Set([8]));aura.reservation.mana=1;aura.affected.add(9);
 assert.equal(f.source.actor.activeAuras.get('fire').reservation.mana,5);assert.deepEqual(f.source.actor.activeAuras.get('fire').affected,new Set([8]));
 assert.equal([...frame.containerPieceMods.keys()][0],frame.meta.equipped.head);
 assert.equal(draft.sourceSkill(g),f.grant);assert.equal(draft.sourceItem(frame.meta.equipped.head),f.hat);
 assert.equal(draft.sourceSkill(f.makeSkill(f.definitions.fire)),undefined);
 g.sockets[0].rolled.form='changed';g.treeNodes.push('new');g.state.lastUseAt=99;frame.meta.equipped.head.grantState.fire.sockets[0].level=9;
 assert.equal(f.grant.sockets[0].rolled.form,'crew');assert.deepEqual(f.grant.treeNodes,['retained']);assert.equal(f.grant.state.lastUseAt,12);assert.equal(f.hat.grantState.fire.sockets[0].level,2);
});

test('same host reuses the private instance and normalizes only the private item before export',()=>{
 const f=fixture(),draft=f.fork(),g=draft.frame.seat.grantedInsts.get('fire');
 f.values.grant_fire=1;g.sockets[0].level=7;f.runtime.derive(draft.frame);
 assert.equal(draft.frame.seat.grantedInsts.get('fire'),g);assert.equal(g.level,1);assert.deepEqual(g.treeNodes,['retained']);
 assert.equal(draft.frame.meta.equipped.head.grantState.fire.sockets[0].level,7);
 assert.equal(f.grant.level,4);assert.equal(f.grant.sockets[0].level,2);assert.equal(f.hat.grantState.fire.sockets[0].level,2);
 assert.equal(draft.sourceSkill(g),f.grant);assert.equal(f.calls.length,1,'companion phase must execute even with no grants');assert.equal(f.calls[0].frame,draft.frame);assert.deepEqual(f.calls[0].ids,[]);
});

test('replacement restores its own investment while source casts, bar and old ownership stay untouched',()=>{
 const f=fixture(),cast={inst:f.grant,elapsed:.4,total:1,paidCost:{mana:3}},draft=f.fork();
 const replacement={uid:2,name:'Replacement',grantState:{fire:{sockets:[{id:'s',level:9},null]}}};draft.frame.meta.equipped.head=replacement;
 f.runtime.derive(draft.frame);const next=draft.frame.seat.grantedInsts.get('fire');
 assert.equal(next.grantedHostUid,2);assert.equal(next.sockets[0].level,9);assert.deepEqual(next.treeNodes,['cold-restored']);
 assert.equal(draft.frame.actor.skills[0],next);assert.equal(draft.sourceSkill(next),undefined);assert.equal(draft.sourceItem(replacement),undefined);
 assert.equal(f.source.actor.skills[0],f.grant);assert.equal(cast.inst,f.grant);assert.equal(cast.elapsed,.4);assert.equal(cast.inst.sockets[0].level,2);
});

test('learned takeover remains separate from granted investment in the private graph',()=>{
 const f=fixture(),draft=f.fork(),learned=f.makeSkill(f.definitions.fire,8);learned.sockets[0]={def:{id:'s'},level:6};
 draft.frame.meta.knownSkills.set('fire',learned);f.runtime.derive(draft.frame);
 assert.equal(draft.frame.actor.skills[0],learned);assert.equal(learned.bonusLevels,4);assert.equal(draft.frame.meta.equipped.head.grantState.fire.sockets[0].level,2);
 assert.equal(f.source.meta.knownSkills.has('fire'),false);assert.equal(f.source.actor.skills[0],f.grant);
});

test('retirement records exact private instances and delegates build consequences without live callbacks',()=>{
 const f=fixture();f.source.actor.activeAuras.set('fire',{inst:f.grant});f.source.actor.summonToggles.set('fire',{inst:f.grant});
 const draft=f.fork(),old=draft.frame.seat.grantedInsts.get('fire');draft.frame.gearSheetMods.clear();f.runtime.derive(draft.frame);
 assert.equal(draft.frame.seat.grantedInsts,undefined);assert.equal(draft.frame.actor.skills[0],null);
 assert.deepEqual(draft.retirements,[{kind:'aura',id:'fire',inst:old},{kind:'summon',id:'fire',inst:old}]);
 assert.equal(draft.frame.actor.activeAuras.size,0);assert.equal(draft.frame.actor.summonToggles.size,0);
 assert.equal(f.source.actor.activeAuras.get('fire').inst,f.grant);assert.equal(f.source.actor.summonToggles.get('fire').inst,f.grant);
});

test('class, passive, container, companion and graft inputs are retained and isolated',()=>{
 const f=fixture(),relic={uid:4,name:'Relic',relicKey:'account:4'};
 f.source.meta.classDef.innate=[{stat:'grant_ice'}];f.source.passiveMods=[{stat:'grant_fire'}];f.source.meta.grafts.a='ice';
 const passive=[{key:'a',graft:{support:'s',level:5}}];f.source.passiveGrafts=()=>passive;
 f.source.containerSheetMods.set('bag',[{stat:'grant_ice'},{stat:'crew_ice'}]);f.source.containerPieceMods.set(relic,[{stat:'grant_ice'},{stat:'crew_ice'}]);
 f.values.grant_ice=3;const draft=f.fork();passive[0].graft.level=9;f.runtime.derive(draft.frame);
 const ice=draft.frame.seat.grantedInsts.get('ice');assert.equal(ice.grantedHostUid,4);assert.equal(ice.relicSource,'account:4');
 assert.equal(draft.sourceItem([...draft.frame.containerPieceMods.keys()][0]),relic);
 assert.equal(f.calls.length,1,'companion phase must execute for a container grant');assert.deepEqual(f.calls[0].ids,['ice']);assert.deepEqual(f.calls[0].names,['Relic']);assert.deepEqual(f.calls[0].keys,['account:4']);
 assert.equal(draft.frame.meta.knownSkills.get('ice').grafts[0].level,5);assert.equal(f.learned.grafts,undefined);assert.equal(relic.grantState,undefined);
 draft.frame.meta.classDef.innate[0].stat='changed';draft.frame.passiveMods[0].stat='changed';draft.frame.containerSheetMods.get('bag')[0].stat='changed';draft.frame.meta.grafts.a='fire';
 assert.equal(f.source.meta.classDef.innate[0].stat,'grant_ice');assert.equal(f.source.passiveMods[0].stat,'grant_fire');assert.equal(f.source.containerSheetMods.get('bag')[0].stat,'grant_ice');assert.equal(f.source.meta.grafts.a,'ice');
});

test('a candidate failure after private work leaves source ownership, investment and effects unchanged',()=>{
 const f=fixture();f.source.actor.activeAuras.set('fire',{inst:f.grant});
 f.services.retire=(frame,row)=>{frame.actor.activeAuras.delete(row.id);throw Error('private retirement failed');};
 const draft=f.fork();draft.frame.gearSheetMods.clear();assert.throws(()=>f.runtime.derive(draft.frame),/private retirement failed/);
 assert.equal(f.source.actor.skills[0],f.grant);assert.equal(f.source.seat.grantedInsts.get('fire'),f.grant);assert.equal(f.source.actor.activeAuras.get('fire').inst,f.grant);assert.deepEqual(f.grant.treeNodes,['retained']);
 const next=f.fork();assert.notEqual(next.frame.seat.grantedInsts.get('fire'),draft.frame.seat.grantedInsts.get('fire'));
});

test('copy services cannot return a source object or collapse distinct owners to the same copy',()=>{
 const f=fixture();f.services.copySkill=x=>x;assert.throws(f.fork,/distinct owned copies/);
 f.services.copySkill=()=>f.learned;assert.throws(f.fork,/distinct owned copies/);
 const shared=f.makeSkill(f.definitions.fire);f.services.copySkill=()=>shared;assert.throws(f.fork,/distinct owned copies/);
 f.services.copySkill=copy;f.services.copyItem=x=>x;assert.throws(f.fork,/distinct owned copies/);
 f.services.copyItem=copy;f.source.actor.activeAuras.set('fire',{inst:f.grant});f.services.copyToggle=(_kind,row)=>row;assert.throws(f.fork,/owned toggle/);
 f.services.copyToggle=(_kind,row)=>({inst:row.inst});assert.throws(f.fork,/owned toggle/);
});
