import test from 'node:test';import assert from 'node:assert/strict';
import {EquipmentSkills} from '../dist/equipment-skills.js';

function fixture(){
  const defs={fire:{id:'fire',name:'Fire'},ice:{id:'ice',name:'Ice'}},supports=Object.fromEntries(['a','b','c'].map(id=>[id,{id}]));
  const values={},calls=[];let auto=false;
  const make=(def,level=1)=>({def,level,sockets:[null,null]});
  const frame={seat:{},actor:{skills:[null,null],sheet:{get:id=>values[id]??0},activeAuras:new Map(),summonToggles:new Map()},
    meta:{knownSkills:new Map(),equipped:{},classDef:{},grafts:{}},passiveMods:[],gearSheetMods:new Map(),containerSheetMods:new Map(),containerPieceMods:new Map(),
    passiveGrafts:()=>[],deriveCompanions:()=>{},deactivateAura:id=>calls.push('aura:'+id),dismissSummon:id=>calls.push('summon:'+id)};
  const ports={skillGrantPrefix:'grant_',companionGrantPrefix:'crew_',slotGraftPrefix:'slot_',equipSlots:()=>[{id:'head'},{id:'ring'}],
    skill:id=>defs[id],support:id=>supports[id],parseSkillGrant:stat=>stat.slice(6),companionGrantStat:id=>'crew_'+id,
    parseSlotGraft:stat=>{const [,slot,gemId]=stat.split('_');return {slot:Number(slot),gemId};},
    skillMaxLevel:()=>20,maxSupportLevel:10,grantSockets:()=>2,autoSeat:()=>auto,makeSkill:make,
    restoreGrant:(inst,state)=>{inst.sockets=structuredClone(state.sockets);},packGrant:inst=>({sockets:structuredClone(inst.sockets)}),
    classes:()=>[{id:'mage'}],openingSkills:()=>['fire'],classSkillStat:c=>'class_'+c.id,treeGraft:()=>undefined,supportFits:()=>true};
  const runtime=new EquipmentSkills(ports),derive=()=>runtime.derive(frame);
  const wear=(slot,item,stats)=>{frame.meta.equipped[slot]=item;frame.gearSheetMods.set(slot,stats.map(stat=>({stat})));};
  return {frame,ports,values,calls,defs,supports,make,derive,wear,auto:()=>{auto=true;}};
}

test('different grant hosts restore their own investment and retire only the old owned toggles',()=>{
  const f=fixture(),{frame,values,defs,make}=f;values.grant_fire=3.9;
  const first={uid:1,name:'First'},second={uid:2,name:'Second',grantState:{fire:{sockets:[{def:{id:'b'},level:4},null]}}};
  f.wear('head',first,['grant_fire']);f.derive();const old=frame.seat.grantedInsts.get('fire');old.sockets[0]={def:{id:'a'},level:2};
  frame.actor.skills[0]=old;f.derive();assert.equal(frame.seat.grantedInsts.get('fire'),old);
  frame.actor.activeAuras.set('fire',{inst:old});frame.actor.summonToggles.set('fire',{inst:make(defs.fire)});
  f.wear('head',second,['grant_fire']);f.derive();const next=frame.seat.grantedInsts.get('fire');
  assert.notEqual(next,old);assert.equal(frame.actor.skills[0],next);assert.equal(next.level,3);
  assert.equal(next.sockets[0].def.id,'b');assert.equal(first.grantState.fire.sockets[0].def.id,'a');
  assert.deepEqual(f.calls,['aura:fire']);assert.equal(next.grantedBy,'Second');
});
test('learned ownership wins duplicate seats and bonuses never compound',()=>{
  const f=fixture();f.values.grant_fire=4;f.values.class_mage=2;f.wear('head',{uid:1,name:'Hat'},['grant_fire']);f.derive();
  const grant=f.frame.seat.grantedInsts.get('fire'),learned=f.make(f.defs.fire,7);f.frame.meta.knownSkills.set('fire',learned);
  f.frame.actor.skills=[grant,grant];f.derive();assert.deepEqual(f.frame.actor.skills,[learned,null]);assert.equal(learned.bonusLevels,6);
  f.derive();assert.equal(learned.level,7);assert.equal(learned.bonusLevels,6);
  f.frame.actor.skills=[null,null];f.derive();assert.equal(learned.bonusLevels,2);assert.equal(grant.bonusLevels,2);
});
test('source precedence uses slot order before containers; companions finish before previous grants are read',()=>{
  const f=fixture(),relic={uid:5,name:'Relic',relicKey:'canonical'};f.values.grant_fire=2;
  f.frame.containerSheetMods.set('board',[{stat:'grant_fire'},{stat:'crew_fire'}]);f.frame.containerPieceMods.set(relic,[{stat:'grant_fire'},{stat:'crew_fire'}]);
  const prior=f.make(f.defs.fire);prior.grantedHostUid=5;
  f.frame.deriveCompanions=(defs,name,key)=>{assert.deepEqual(defs,[f.defs.fire]);assert.equal(name('fire'),'Relic');assert.equal(key('fire'),'canonical');f.frame.seat.grantedInsts=new Map([['fire',prior]]);};
  f.derive();assert.equal(f.frame.seat.grantedInsts.get('fire'),prior);assert.equal(prior.relicSource,'canonical');
  f.frame.deriveCompanions=()=>{};
  f.wear('ring',{uid:2,name:'Ring'},['grant_fire']);f.wear('head',{uid:1,name:'Hat'},['grant_fire']);f.derive();
  assert.equal(f.frame.seat.grantedInsts.get('fire').grantedHostUid,1);
});
test('grant removal and retirement failure preserve original partial-write order',()=>{
  const f=fixture();f.values.grant_fire=2;f.wear('head',{uid:1,name:'Hat'},['grant_fire']);f.derive();
  const old=f.frame.seat.grantedInsts.get('fire'),map=f.frame.seat.grantedInsts;f.frame.actor.skills[0]=old;
  f.frame.actor.activeAuras.set('fire',{inst:old});f.frame.actor.summonToggles.set('fire',{inst:old});
  f.frame.gearSheetMods.clear();f.frame.deactivateAura=()=>{throw Error('host failure');};
  assert.throws(f.derive,/host failure/);assert.equal(f.frame.actor.skills[0],null);assert.equal(f.frame.seat.grantedInsts,map);assert.deepEqual(f.calls,[]);
  f.frame.deactivateAura=()=>{};f.derive();assert.equal(f.frame.seat.grantedInsts,undefined);assert.equal(f.frame.seat.grantedSkills,undefined);assert.deepEqual(f.calls,['summon:fire']);
});
test('pack failure keeps prior bar replacement without publishing a new grant map',()=>{
  const f=fixture();f.values.grant_fire=2;f.wear('head',{uid:1,name:'Hat'},['grant_fire']);f.derive();
  const old=f.frame.seat.grantedInsts.get('fire'),map=f.frame.seat.grantedInsts;f.frame.actor.skills[0]=old;
  f.wear('head',{uid:2,name:'New'},['grant_fire']);f.ports.packGrant=()=>{throw Error('pack failure');};
  assert.throws(f.derive,/pack failure/);assert.equal(f.frame.seat.grantedInsts,map);assert.notEqual(f.frame.actor.skills[0],old);assert.equal(f.frame.actor.skills[0].grantedHostUid,2);
});
test('retired and zero-level grants are absent; hostless grants retain identity; auto seats respect learned skills',()=>{
  const f=fixture();f.auto();f.frame.meta.classDef.innate=['grant_retired','grant_fire','grant_ice'].map(stat=>({stat}));
  f.values.grant_retired=100;f.values.grant_fire=99;f.values.grant_ice=.9;f.derive();
  assert.equal(f.frame.seat.grantedInsts.size,1);const inst=f.frame.seat.grantedInsts.get('fire');assert.equal(inst.level,20);assert.equal(f.frame.actor.skills[0],inst);
  f.derive();assert.equal(f.frame.seat.grantedInsts.get('fire'),inst);assert.equal(inst.grantedBy,'your passives');
  f.frame.meta.knownSkills.set('fire',f.make(f.defs.fire));f.derive();assert.equal(f.frame.actor.skills[0],f.frame.meta.knownSkills.get('fire'));
});
test('passive, socket and earlier tree grafts have original duplicate precedence',()=>{
  const f=fixture(),inst=f.make(f.defs.fire);f.frame.meta.knownSkills.set('fire',inst);f.frame.actor.skills[0]=inst;inst.treeNodes=['one','two'];
  f.frame.meta.grafts.key='fire';f.frame.passiveGrafts=()=>[{key:'key',graft:{support:'a',level:3}}];f.ports.treeGraft=()=>({support:'a',level:8});
  inst.sockets[0]={def:f.supports.a,level:2};f.wear('head',{uid:1,name:'Hat'},['slot_0_a']);f.values.slot_0_a=9;f.derive();
  assert.deepEqual(inst.grafts,[{def:f.supports.a,level:3}]);assert.equal(f.frame.seat.wornGrafts[0].state,'duplicate');f.derive();assert.equal(inst.grafts.length,1);
});
test('worn support dependencies reach a fixed point and cyclic prerequisites remain dormant',()=>{
  const f=fixture(),inst=f.make(f.defs.fire);f.frame.meta.knownSkills.set('fire',inst);f.frame.actor.skills[0]=inst;
  f.wear('head',{uid:1,name:'Hat'},['slot_0_c','slot_0_b','slot_0_a']);for(const id of ['a','b','c'])f.values['slot_0_'+id]=20;
  f.ports.supportFits=(def,s)=>def.id==='a'||s.grafts?.some(g=>g.def.id===(def.id==='b'?'a':'b'));f.derive();
  assert.deepEqual(inst.grafts.map(g=>g.def.id),['a','b','c']);assert(f.frame.seat.wornGrafts.every(r=>r.state==='live'&&r.level===10));
  f.ports.supportFits=(def,s)=>s.grafts?.some(g=>g.def.id===(def.id==='a'?'b':'a'));f.derive();assert.equal(inst.grafts,undefined);assert(f.frame.seat.wornGrafts.every(r=>r.state==='unfit'));
});
test('containers do not create worn candidates; empty seats and retired supports stay distinct',()=>{
  const f=fixture();f.frame.containerSheetMods.set('board',[{stat:'slot_0_a'}]);f.values.slot_0_a=2;f.derive();assert.equal(f.frame.seat.wornGrafts,undefined);
  f.wear('head',{uid:1,name:'Hat'},['slot_0_a','slot_1_retired','slot_1_b']);f.values.slot_1_b=.9;f.derive();
  assert.equal(f.frame.seat.wornGrafts.length,1);assert.equal(f.frame.seat.wornGrafts[0].state,'empty');
});
