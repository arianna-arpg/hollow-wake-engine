import test from 'node:test';
import assert from 'node:assert/strict';
import {CharacterRebuild} from '../dist/character-rebuild.js';
import {BuildContributions} from '../dist/build-contributions.js';
import {EquipmentSkills} from '../dist/equipment-skills.js';
import {StatSheet} from '../dist/stats.js';
import {StatRules} from '../dist/stat-rules.js';
import {PassiveGrants} from '../dist/passive-grants.js';
import {setup} from './character-build-fixture.mjs';

function fixture(){
  const {ports:p,input,item}=setup(),events=[];
  const sheet=new StatSheet(new StatRules({...p.stats.definitions,mana:{base:50}}));
  for(const id of ['attributes','class','passives','level'])sheet.setSource(id,[]);
  const meta={...input,allocated:new Set(input.allocated),classDef:p.class(input.classId),knownSkills:new Map()};
  const actor={sheet,level:3,life:500,mana:500,skills:[null,null],activeAuras:new Map(),summonToggles:new Map(),
    maxLife(){events.push('life');return sheet.get('life');},maxMana(){events.push('mana');return sheet.get('mana');}};
  const frame={seat:{},meta,actor,relicEffectsSuppressed:false,
    conduits(value){events.push('conduits');actor.wornConduits=value;},
    attributes(value,mods){events.push('attributes');meta.attrs=value;sheet.setSource('attributes',mods);},
    deriveCompanions(definitions,sourceName,relicKey){events.push(['companions',definitions.map(d=>[d.id,sourceName(d.id),relicKey(d.id)])]);},
    deactivateAura(id){events.push('aura:'+id);actor.activeAuras.delete(id);},
    dismissSummon(id){events.push('summon:'+id);actor.summonToggles.delete(id);},
    syncGuard(){events.push(['guard',actor.life,actor.mana]);},refreshBonds(){events.push('bonds');}};
  const contributions=new BuildContributions({...p.contributions,
    board:def=>p.contributions.board(def,new Set(meta.features)),
    beginPassives:m=>p.passives.begin(m.baseAttrs,m.allocated,m.choices)});
  const equipment=new EquipmentSkills(p.equipment);
  const runtime=new CharacterRebuild({contributions,equipment,
    levelModifiers:level=>[...p.levelModifiers(level),{stat:'mana',kind:'flat',value:(level-1)*4}]});
  return{runtime,frame,actor,meta,sheet,events,p,item,rebuild:()=>runtime.rebuild(frame)};
}

test('live rebuild preserves combat state and unrelated sources while clamping current resources',()=>{
  const f=fixture(),skill=f.p.equipment.makeSkill(f.p.equipment.skill('bolt'),4,2);
  f.meta.knownSkills.set('bolt',skill);f.actor.skills[0]=skill;
  const casting={inst:skill,remaining:.7,paid:9},cooldowns=new Map([[skill,2.5]]);
  f.actor.casting=casting;f.actor.cooldowns=cooldowns;f.actor.clock=31;
  f.sheet.setSource('temporary-buff',[{stat:'life',kind:'flat',value:11}]);
  f.meta.equipped.head=f.item(1,'life',7);f.rebuild();
  assert.equal(f.actor.life,144);assert.equal(f.actor.mana,58);
  assert.equal(f.actor.skills[0],skill);assert.equal(f.actor.casting,casting);
  assert.equal(f.actor.cooldowns,cooldowns);assert.equal(cooldowns.get(skill),2.5);
  assert.equal(casting.remaining,.7);assert.equal(f.actor.clock,31);
  assert.deepEqual(f.sheet.sourceNames(),['attributes','class','passives','level','temporary-buff','gear:head']);
  f.actor.life=44;f.actor.mana=7;f.actor.level=5;f.rebuild();
  assert.equal(f.actor.life,44);assert.equal(f.actor.mana,7,'An ordinary rebuild must not refill resources');
});

test('live skill grants retain warm investment and retire replaced hosts through the same effect order',()=>{
  const f=fixture();f.meta.equipped.head=f.item(1);f.rebuild();
  const first=f.frame.seat.grantedInsts.get('bolt');first.treeNodes=['a','b'];
  first.sockets[0]={def:f.p.equipment.support('repeat'),level:6};
  f.actor.skills[0]=first;f.actor.activeAuras.set('bolt',{inst:first});f.actor.summonToggles.set('bolt',{inst:first});
  f.meta.equipped.head.lines[0].value=1;f.rebuild();
  assert.equal(f.frame.seat.grantedInsts.get('bolt'),first);assert.deepEqual(first.treeNodes,['a','b']);
  assert.equal(first.sockets[0].level,6);assert.equal(first.level,1);
  const cast={inst:first,remaining:.2};f.actor.casting=cast;
  f.meta.equipped.head=f.item(2);f.events.length=0;f.rebuild();
  assert.notEqual(f.actor.skills[0],first);assert.equal(f.actor.casting,cast);assert.equal(cast.inst,first);
  assert.equal(f.actor.skills[0].sockets[0],null);
  assert.deepEqual(f.events.filter(e=>typeof e==='string'&&e.includes(':')),['aura:bolt','summon:bolt']);
  delete f.meta.equipped.head;f.rebuild();assert.equal(f.actor.skills[0],null);assert.equal(f.frame.seat.grantedInsts,undefined);
});

test('authorized relic inputs and suppression reach both stats and companion discovery',()=>{
  const f=fixture(),relic={...f.item(2,'companiongrant_golem',2),x:0,y:0,relicKey:'r'};
  f.meta.containers.reliquary=[relic];f.meta.features=['relics'];f.meta.relicEmpowerment=1;f.rebuild();
  assert.equal(f.sheet.get('companiongrant_golem'),4);
  assert.deepEqual(f.events.find(Array.isArray),['companions',[['golem','Item 2','r']]]);
  f.frame.relicEffectsSuppressed=true;f.events.length=0;f.rebuild();
  assert.equal(f.sheet.get('companiongrant_golem'),0);assert.deepEqual(f.events.find(Array.isArray),['companions',[]]);
  assert.equal(relic.lines[0].value,2);
});

test('the current passive graft fold reaches the same learned skill used by combat',()=>{
  const f=fixture(),skill=f.p.equipment.makeSkill(f.p.equipment.skill('bolt'),4,2);
  const passives=new PassiveGrants({schemaVersion:1,capability:'passive-grants/v1',contentId:'live-graft-test',
    attributes:[{id:'strength',perPoint:[]}],statIds:['life'],supportIds:['repeat'],groups:[],nodes:[{id:'root',graft:{support:'repeat',level:3}}]});
  f.runtime.ports.contributions.ports.beginPassives=m=>passives.begin(m.baseAttrs,m.allocated,m.choices);
  f.meta.allocated.add('root');f.meta.grafts.root='bolt';f.meta.knownSkills.set('bolt',skill);f.actor.skills[0]=skill;
  f.rebuild();assert.equal(f.actor.skills[0],skill);assert.deepEqual(skill.grafts,[{def:f.p.equipment.support('repeat'),level:3}]);
  f.meta.allocated.clear();f.rebuild();assert.equal(skill.grafts,undefined);
});

test('derived skill callbacks precede level sources, life then mana clamping, guard and bonds',()=>{
  const f=fixture();let levelSeen;
  const derive=f.runtime.ports.equipment.derive.bind(f.runtime.ports.equipment);
  f.runtime.ports.equipment.derive=frame=>{levelSeen=frame.actor.sheet.getSourceMods('level');derive(frame);};
  f.rebuild();assert.deepEqual(levelSeen,[]);
  assert.deepEqual(f.events,['conduits','attributes',['companions',[]],'life','mana',['guard',126,58],'bonds']);
});

test('live failures retain preceding writes and stop before later phases',()=>{
  const f=fixture();f.frame.syncGuard=()=>{throw Error('host guard failure');};
  assert.throws(f.rebuild,/host guard failure/);assert.equal(f.actor.life,126);assert.equal(f.actor.mana,58);
  assert(!f.events.includes('bonds'));
  f.runtime.ports.equipment.derive=()=>{throw Error('host grant failure');};f.actor.life=999;f.actor.level=5;
  assert.throws(f.rebuild,/host grant failure/);assert.equal(f.actor.life,999);
  assert.deepEqual(f.sheet.getSourceMods('level'),[{stat:'life',kind:'flat',value:20},{stat:'mana',kind:'flat',value:8}]);
});

test('one rules service rebuilds independent current characters without changing the previous character',()=>{
  const a=fixture(),b=fixture();a.meta.equipped.head=a.item(1);a.rebuild();
  const grant=a.frame.seat.grantedInsts.get('bolt'),before=JSON.stringify(a.meta.equipped);
  // No container board is present, so the shared fixture's content service has
  // no character-dependent board input in this independence case.
  a.runtime.rebuild(b.frame);
  assert.equal(b.frame.seat.grantedInsts,undefined);assert.equal(a.frame.seat.grantedInsts.get('bolt'),grant);
  assert.equal(JSON.stringify(a.meta.equipped),before);assert.equal(b.actor.life,126);
});
