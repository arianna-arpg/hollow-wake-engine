import test from 'node:test';
import assert from 'node:assert/strict';
import {CharacterBuilds} from '../dist/character-builds.js';
import {StatRules} from '../dist/stat-rules.js';
import {PassiveGrants} from '../dist/passive-grants.js';
import {packGrantState} from '../dist/gem-residence.js';

// Small independent ownership fixture. Full authored laws are checked through
// the separately compiled default package against original World observations.
function setup(){
  const defs={bolt:Object.freeze({id:'bolt',name:'Bolt'}),wave:Object.freeze({id:'wave',name:'Wave'}),golem:Object.freeze({id:'golem',name:'Golem'})};
  const support=Object.freeze({id:'repeat',name:'Repeat'}),slots=[{id:'head'},{id:'ring'}],classes=[{id:'mage',innate:[]}];
  const stats=new StatRules({life:{base:100},skillgrant_bolt:{base:0},companiongrant_golem:{base:0},slotgraft_1_repeat:{base:0}});
  const passives=new PassiveGrants({schemaVersion:1,capability:'passive-grants/v1',contentId:'test',attributes:[{id:'strength',perPoint:[{stat:'life',kind:'flat',value:2}]}],
    statIds:Object.keys(stats.definitions),supportIds:['repeat'],nodes:[],groups:[]});
  const state=row=>({sockets:row.sockets.map(r=>r?{def:support,level:r.level}:null),...(row.treeNodes?{treeNodes:[...row.treeNodes]}:{})});
  const makeSkill=(def,level,sockets)=>({def,level,sockets:Array(sockets).fill(null)});
  const copySkill=s=>({...s,sockets:s.sockets.map(r=>r&&({...r})),treeNodes:s.treeNodes&&[...s.treeNodes],grafts:s.grafts?.map(r=>({...r}))});
  const equipment={skillGrantPrefix:'skillgrant_',companionGrantPrefix:'companiongrant_',slotGraftPrefix:'slotgraft_',equipSlots:()=>slots,
    skill:id=>defs[id],support:id=>id==='repeat'?support:undefined,parseSkillGrant:id=>id.slice(11),companionGrantStat:id=>'companiongrant_'+id,
    parseSlotGraft:stat=>stat==='slotgraft_1_repeat'?{slot:0,gemId:'repeat'}:null,skillMaxLevel:()=>50,maxSupportLevel:50,
    grantSockets:()=>2,autoSeat:()=>false,makeSkill,restoreGrant:(inst,s)=>{Object.assign(inst,state(s));if(inst.treeNodes)inst.treeNodes=inst.treeNodes.slice(0,Math.floor(inst.level/5));},
    packGrant:packGrantState,classes:()=>classes,openingSkills:()=>[],classSkillStat:()=>'',treeGraft:()=>undefined,supportFits:()=>true};
  const ports={contentId:'fixture',barSlots:2,stats,passives,class:id=>classes.find(c=>c.id===id),equipment,copySkill,
    restoreLearned:payload=>({...makeSkill(defs[payload.skillId],payload.level,payload.sockets.length),...state(payload)}),
    updateLearned:(inst,payload)=>{inst.level=payload.level;Object.assign(inst,state(payload));},updateGrant:(inst,s)=>Object.assign(inst,state(s)),
    summon:def=>def.id==='golem'?{type:'summon',persistent:{respawnTime:3}}:undefined,
    levelModifiers:level=>[{stat:'life',kind:'flat',value:(level-1)*10}],
    contributions:{equipSlots:()=>slots,containers:()=>[{id:'reliquary',active:true}],compileItem:item=>item.lines??[],
      board:(_def,features)=>features.has('relics')?{w:1,h:1,open:[true],cells:1}:null,
      misfits:(_board,items)=>items.filter(item=>item.x!==0||item.y!==0),amplification:(_board,items)=>new Map(items.map(i=>[i,1])),
      amplify:mods=>mods,empower:(mods,power)=>mods.map(m=>({...m,value:m.value*(1+power)}))}};
  const input={level:1,classId:'mage',baseAttrs:{strength:3},allocated:[],choices:{},grafts:{},equipped:{},containers:{},features:[],relicEnabled:true,relicEmpowerment:0,learned:[]};
  const item=(uid,stat='skillgrant_bolt',value=10)=>({uid,name:'Item '+uid,baseId:'hat',ilvl:1,tier:1,rarity:'common',baseRoll:0,implicitRolls:[],affixes:[],lines:[{stat,kind:'flat',value}]});
  const learned=(id='bolt',level=4)=>({gem:{kind:'skill',skillId:id,level,rarity:'common',sockets:[null,null]}});
  return{builds:new CharacterBuilds(ports),ports,input,item,learned};
}
const grant=(builds,token)=>builds.read(token).grants[0][1];

test('builds combine independent base, gear and level inputs',()=>{
  const {builds,input,item}=setup();input.level=3;input.equipped.head=item(1,'life',7);
  const before=JSON.stringify(input),token=builds.open(input,[null,null]);assert.equal(builds.stat(token,'life'),133);assert.equal(JSON.stringify(input),before);
  assert.deepEqual(builds.read(token).sources.map(r=>r[0]),['attributes','class','passives','level','gear:head']);
});
test('warm grants retain investment and logical identity across lower levels',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);input.equipped.head.grantState={bolt:{sockets:[null,null],treeNodes:['a','b']}};
  const first=builds.open(input,['bolt',null]),before=JSON.stringify(builds.read(first));input.equipped.head.lines[0].value=5;
  const next=builds.rebuild(first,input);assert.deepEqual(grant(builds,next).tree,['a','b']);assert.equal(grant(builds,next).level,5);
  assert.equal(builds.lineages(first).get('grant/bolt'),builds.lineages(next).get('grant/bolt'));assert.equal(JSON.stringify(builds.read(first)),before);
});
test('replacement hosts cold restore and replace logical identity',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]);
  input.equipped.head=item(2,'skillgrant_bolt',5);input.equipped.head.grantState={bolt:{sockets:[null,null],treeNodes:['a','b']}};
  const next=builds.rebuild(first,input);assert.deepEqual(grant(builds,next).tree,['a']);assert.equal(builds.read(next).bar[0].host,2);
  assert.notEqual(builds.lineages(first).get('grant/bolt'),builds.lineages(next).get('grant/bolt'));
});
test('remove and re-equip the same UID creates a new grant',()=>{
  const {builds,input,item}=setup();const host=item(1);input.equipped.head=host;const first=builds.open(input,['bolt',null]);
  delete input.equipped.head;const removed=builds.rebuild(first,input);assert.deepEqual(builds.read(removed).bar,[null,null]);
  input.equipped.head=host;const restored=builds.rebuild(removed,input);assert.notEqual(builds.lineages(first).get('grant/bolt'),builds.lineages(restored).get('grant/bolt'));
  assert.deepEqual(builds.read(restored).bar,[null,null]);
});
test('same-host explicit investment edits preserve identity without cold repair',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1,'skillgrant_bolt',5);const first=builds.open(input,['bolt',null]);
  const next=builds.rebuild(first,input,{grants:[{skillId:'bolt',hostUid:1,state:{sockets:[null,null],treeNodes:['a','b']}}]});
  assert.deepEqual(grant(builds,next).tree,['a','b']);assert.deepEqual(builds.read(next).equipped.head.grantState.bolt.treeNodes,['a','b']);
  assert.equal(grant(builds,first).tree,undefined);assert.equal(builds.lineages(first).get('grant/bolt'),builds.lineages(next).get('grant/bolt'));
});
test('grant edits cannot target another host, replacement or removed grant',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,[null,null]),before=JSON.stringify(builds.read(first));
  const edit={skillId:'bolt',hostUid:1,state:{sockets:[null,null]}};
  assert.throws(()=>builds.rebuild(first,input,{grants:[{...edit,hostUid:2}]}),/Foreign/);
  assert.throws(()=>builds.rebuild(first,input,{grants:[edit,edit]}),/duplicate/);
  input.equipped.head=item(2);assert.throws(()=>builds.rebuild(first,input,{grants:[edit]}),/no longer/);
  delete input.equipped.head;assert.throws(()=>builds.rebuild(first,input,{grants:[edit]}),/no longer/);assert.equal(JSON.stringify(builds.read(first)),before);
});
test('learned takeover and warm learned updates retain the owned learned instance',()=>{
  const {builds,input,item,learned}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]);
  input.learned=[learned()];const taken=builds.rebuild(first,input);assert.equal(builds.read(taken).bar[0].level,4);assert.equal(builds.read(taken).bar[0].host,undefined);
  input.learned[0].gem.level=7;input.learned[0].gem.treeNodes=['a','b'];const next=builds.rebuild(taken,input);
  assert.equal(builds.read(next).bar[0].level,7);assert.deepEqual(builds.read(next).bar[0].tree,['a','b']);
  assert.equal(builds.lineages(taken).get('learned/bolt'),builds.lineages(next).get('learned/bolt'));assert.equal(builds.read(taken).bar[0].level,4);
});
test('removed and relearned skills do not inherit the removed identity',()=>{
  const {builds,input,learned}=setup();input.learned=[learned()];const first=builds.open(input,['bolt',null]);input.learned=[];
  const removed=builds.rebuild(first,input);assert.deepEqual(builds.read(removed).bar,[null,null]);input.learned=[learned()];
  const again=builds.rebuild(removed,input,{bar:['bolt',null]});assert.notEqual(builds.lineages(first).get('learned/bolt'),builds.lineages(again).get('learned/bolt'));
});
test('learned residence locks survive cold restoration, forks and detached writeback',()=>{
  const {builds,input,learned}=setup();input.learned=[{...learned(),locked:true}];const first=builds.open(input,['bolt',null]);
  const next=builds.rebuild(first,input);assert.equal(builds.investment(first).learned[0].locked,true);assert.equal(builds.investment(next).learned[0].locked,true);
  delete input.learned[0].locked;const unlocked=builds.rebuild(next,input);assert.equal(builds.investment(unlocked).learned[0].locked,undefined);
  assert.equal(builds.investment(next).learned[0].locked,true);assert.equal(builds.lineages(unlocked).get('learned/bolt'),builds.lineages(next).get('learned/bolt'));
});
test('rebind recomputes worn grafts on the requested slot',()=>{
  const {builds,input,item,learned}=setup();input.learned=[learned('bolt'),learned('wave')];input.equipped.head=item(1,'slotgraft_1_repeat',3);
  const first=builds.open(input,['bolt','wave']);assert.deepEqual(builds.read(first).bar[0].grafts,[{id:'repeat',level:3}]);
  const next=builds.rebuild(first,input,{bar:['wave','bolt']});assert.deepEqual(builds.read(next).bar[0].grafts,[{id:'repeat',level:3}]);assert.equal(builds.read(next).bar[1].grafts,undefined);
});
test('companion declarations are independent and account changes stay private',()=>{
  const {builds,input,item}=setup();const relic=item(1,'companiongrant_golem',2);relic.x=0;relic.y=0;relic.relicKey='canonical-1';
  input.containers.reliquary=[relic];input.features=['relics'];const first=builds.open(input,[null,null]);assert.equal(builds.read(first).companions[0][1].level,2);
  input.relicEmpowerment=2;const next=builds.rebuild(first,input);assert.equal(builds.read(next).companions[0][1].level,6);assert.equal(builds.read(first).companions[0][1].level,2);
  assert.equal(builds.lineages(first).get('companion/golem'),builds.lineages(next).get('companion/golem'));
  input.relicEnabled=false;const disabled=builds.rebuild(next,input);assert.equal(builds.read(disabled).companions.length,0);assert.equal(builds.read(next).companions.length,1);
});
test('late binding failure leaves every prior build and input untouched',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]),before=JSON.stringify(builds.read(first)),raw=JSON.stringify(input);
  assert.throws(()=>builds.rebuild(first,input,{bar:['wave',null]}),/Unresolved/);assert.equal(JSON.stringify(builds.read(first)),before);assert.equal(JSON.stringify(input),raw);
  assert.equal(builds.read(builds.rebuild(first,input)).bar[0].id,'bolt');
});
test('foreign tokens, unresolved bindings and duplicate ownership are rejected',()=>{
  const {builds,input,learned}=setup();assert.throws(()=>builds.open(input,['bolt',null]),/Unresolved/);assert.throws(()=>builds.open(input,[null]),/length/);
  assert.throws(()=>builds.open(input,['bolt','bolt']),/duplicate/);input.learned=[learned(),learned()];assert.throws(()=>builds.open(input,[null,null]),/Duplicate learned/);
  input.learned=[];const first=builds.open(input,[null,null]);assert.throws(()=>setup().builds.rebuild(first,input),/Foreign/);assert.throws(()=>builds.read({}),/Foreign/);
});
test('display data and lineage maps cannot mutate a retained build',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]),before=JSON.stringify(builds.read(first));
  const view=builds.read(first);view.equipped.head.lines[0].value=0;view.attrs.strength=99;view.bar[0].level=99;view.sources[0][1][0].value=99;
  const lineage=builds.lineages(first);lineage.clear();assert.equal(builds.lineages(first).size,1);assert.equal(JSON.stringify(builds.read(first)),before);
  const investment=builds.investment(first);investment.grants[0].grantState.bolt.sockets=[];assert.equal(builds.investment(first).grants[0].grantState.bolt.sockets.length,2);
});
test('separate branches can proceed without sharing mutable state',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]);
  const left=builds.rebuild(first,{...input,level:2});const right=builds.rebuild(first,{...input,level:3});
  assert.equal(builds.stat(left,'life'),116);assert.equal(builds.stat(right,'life'),126);assert.equal(builds.stat(first,'life'),106);
});
