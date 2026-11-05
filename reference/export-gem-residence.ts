// Original-only observation: no SDK imports and no accepted-output regeneration.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {MONSTERS} from '../src/data/monsters';
import {ITEM_BASES} from '../src/data/itembases';
import {ITEM_AFFIXES} from '../src/data/itemaffixes';
import {UNIQUES} from '../src/data/uniques';
import {VESTIGES} from '../src/data/vestiges';
import {type ItemInstance, type SkillGemPayload} from '../src/engine/items';
import {makeSkillInstance, type SkillInstance, type SupportInstance, type SkillRarity} from '../src/engine/skills';
import {treeGraph} from '../src/engine/skilltree';
import {empowermentPassive} from '../src/engine/skillEmpowerment';
import {nextItemUid, bumpItemUidFloor, rebuildItem, itemGridSize} from '../src/engine/itemgen';
import {setBagBoardSource} from '../src/engine/inventory';
import {SKILL_GEM_BASE, SUPPORT_GEM_BASE, isGemItem, skillGemPayloadOf, supportGemPayloadOf,
  bagGemItems, findBagGem, freeCellCount, gemItemRarityOf, packSkillGemPayload,
  packSupportGemPayload, packGrantState, restoreGrantState, makeSkillGemItem,
  makeSupportGemItem, skillOfGemItem, bagSkillSupport, supportOfGemItem,
  writeBackSupportGem, rebuildAnyItem, gemInitials} from '../src/engine/gemitems';

bootSimEngine();
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const support=(value:SupportInstance|null)=>value?{...value,def:value.def.id}:null;
const skill=(value:SkillInstance|null)=>value?{...value,def:value.def.id,sockets:value.sockets.map(support)}:null;
const skillDefs=Object.values(SKILLS),supportDefs=Object.values(SUPPORTS),form=Object.keys(MONSTERS)[0];
assert(skillDefs.length>900&&supportDefs.length>400&&form);
const plain=(baseId='ring_lapis'):ItemInstance=>({uid:100,baseId,ilvl:17,tier:2,rarity:'rare',name:'Saved name',baseRoll:.35,implicitRolls:[.2],affixes:[]});
const row=(i=0):SupportInstance=>({def:supportDefs[i%supportDefs.length],level:3,locked:true,rolled:{chassis:'saved-cut'},gauge:9,forwarded:true,forwardScale:.5});
const courses:{name:string;value:unknown;warnings:string[]}[]=[];
let warnings:string[]=[];
const oldWarn=console.warn,oldRandom=Math.random;
console.warn=(...args:unknown[])=>warnings.push(args.map(String).join(' '));
Math.random=()=>{throw new Error('Residence must not draw ambient randomness');};
const record=(name:string,value:unknown)=>{courses.push({name,value:copy(value),warnings});warnings=[];};
let trees=0,empoweredTrees=0;
try {
  bumpItemUidFloor(6000000);
  record('constants',{skill:SKILL_GEM_BASE,support:SUPPORT_GEM_BASE,firstUid:nextItemUid()});
  for(const def of skillDefs){
    const graph=treeGraph(def),passive=graph?.order.find(id=>empowermentPassive(def,id));
    if(graph)trees++;if(passive)empoweredTrees++;
    for(const [rarity,level,rank] of [['common',1,undefined],['rare',20,undefined],['legendary',1,3]] as const){
      const inst=makeSkillInstance(def,level,3);inst.rarity=rarity;inst.empowermentRank=rank;
      inst.sockets=[row(),null,row(1)];inst.locked=true;inst.granted=true;
      inst.replenishmentPaused=true;inst.attunedForm=form;
      inst.treeNodes=graph?[...graph.order,...(passive?Array(5).fill(passive):[]),'retired-node']:['retired-node'];
      Object.assign(inst,{markPos:{x:2,y:3},transientProbe:'must-not-persist'});
      const input=skill(inst),packed=packSkillGemPayload(inst),wrapped=makeSkillGemItem(inst);
      assert.notEqual(packed.sockets,inst.sockets,'Packing detaches the socket list');
      assert.notEqual(packed.sockets[0]!.rolled,inst.sockets[0]!.rolled,'Packing detaches socket cuts');
      assert(!Object.hasOwn(packed.sockets[0]!,'gauge')&&!Object.hasOwn(packed.sockets[0]!,'forwarded')&&!Object.hasOwn(packed.sockets[0]!,'forwardScale'));
      assert.notEqual(packed.treeNodes,inst.treeNodes,'Packing detaches ordered ranks');
      assert(!Object.hasOwn(packed,'locked')&&!Object.hasOwn(packed,'transientProbe'));
      assert(!Object.hasOwn(wrapped,'x')&&!Object.hasOwn(wrapped,'y'));
      assert.equal(wrapped.rarity,rarity==='legendary'?'unique':rarity);
      assert.equal(wrapped.locked,true);assert.deepEqual(wrapped.gem,packed);
      const saved=copy(wrapped),rebuilt=rebuildAnyItem(saved)!;assert(rebuilt);
      assert.notEqual(rebuilt,saved);assert.equal(rebuilt.gem,saved.gem,'Native restore borrows gem cargo');
      const live=skillOfGemItem(rebuilt)!;assert(live);assert.equal(live.def,def);
      assert.equal(live.sockets[0]!.def,supportDefs[0]);assert.equal(live.sockets.length,3);
      assert.notEqual(live.sockets[0]!.rolled,(rebuilt.gem as SkillGemPayload).sockets[0]!.rolled);
      assert.equal(live.replenishmentPaused,true);assert.equal(live.locked,true);
      assert(!Object.hasOwn(live,'markPos')&&!Object.hasOwn(live,'transientProbe'));
      record('skill:'+def.id+':'+rarity,{input,packed,wrapped,rebuilt,live:skill(live),repacked:packSkillGemPayload(live)});
    }
    if(graph){
      const donor=makeSkillInstance(def,20,3);donor.sockets=[row(),null,row(1)];donor.treeNodes=[...graph.order,'retired-node'];
      const state=packGrantState(donor);assert(!Object.hasOwn(state,'level'));assert.notEqual(state.sockets,donor.sockets);
      assert.notEqual(state.sockets[0]!.rolled,donor.sockets[0]!.rolled);assert.notEqual(state.treeNodes,donor.treeNodes);
      for(const capacity of [0,1,5]){
        const target=makeSkillInstance(def,1,capacity);target.rarity='legendary';target.empowermentRank=3;
        const before=copy(state);restoreGrantState(target,state);
        assert.equal(target.sockets.length,capacity);assert.deepEqual(state,before);
        if(capacity)assert.notEqual(target.sockets[0]!.rolled,state.sockets[0]!.rolled,'Grant restore detaches cuts');
        record('grant:'+def.id+':'+capacity,{state,capacity,live:skill(target)});
      }
    }
  }
  for(const def of supportDefs){
    const inst:SupportInstance={def,level:7,locked:true,rolled:{chassis:'saved-cut'},gauge:9,forwarded:true,forwardScale:.5};
    const packed=packSupportGemPayload(inst),wrapped=makeSupportGemItem(inst);
    assert.notEqual(packed.rolled,inst.rolled);assert(!Object.hasOwn(packed,'locked'));assert.equal(wrapped.rarity,'common');
    assert(!Object.hasOwn(packed,'gauge')&&!Object.hasOwn(packed,'forwarded')&&!Object.hasOwn(packed,'forwardScale'));
    const saved=copy(wrapped),rebuilt=rebuildAnyItem(saved)!;assert(rebuilt);
    const live=supportOfGemItem(rebuilt)!;assert(live);assert.equal(live.def,def);assert.notEqual(live.rolled,rebuilt.gem&&'rolled' in rebuilt.gem?rebuilt.gem.rolled:undefined);
    const before=copy(wrapped),oldPayload=wrapped.gem;
    live.level++;delete live.locked;live.rolled!.chassis='changed';writeBackSupportGem(wrapped,live);
    assert.notEqual(wrapped.gem,oldPayload);assert(!Object.hasOwn(wrapped,'locked'));assert.equal(wrapped.uid,before.uid);
    record('support:'+def.id,{input:support(inst),packed,before,live:support(live),after:wrapped});
  }

  const def=skillDefs.find(s=>treeGraph(s)?.order.some(id=>empowermentPassive(s,id)))!;assert(def);
  const passive=treeGraph(def)!.order.find(id=>empowermentPassive(def,id))!;
  for(const [label,rarity,rank] of [
    ['zero','legendary',0],['negative','legendary',-1],['fraction','legendary',1.5],['nan','legendary',NaN],
    ['infinity','legendary',Infinity],['unsafe','legendary',Number.MAX_SAFE_INTEGER+1],['ordinary','rare',3],
    ['roman','legendary',4004],['nested-roman','legendary',4000001],
  ] as [string,SkillRarity,number][]){
    const inst=makeSkillInstance(def,1,0);inst.rarity=rarity;inst.empowermentRank=rank;
    const wrapped=makeSkillGemItem(inst),payload=wrapped.gem as SkillGemPayload;
    payload.empowermentRank=rank;
    const input=copy(wrapped),rebuilt=rebuildAnyItem(wrapped)!;assert(rebuilt);
    const live=skillOfGemItem(rebuilt)!;assert(live);assert.equal(live.sockets.length,0);
    if(label!=='roman'&&label!=='nested-roman')assert(!Object.hasOwn(payload,'empowermentRank'));
    record('rank:'+label,{input,rebuilt,live:skill(live),packed:packSkillGemPayload(inst)});
  }
  const enriched=makeSkillInstance(def,1,1);enriched.rarity='legendary';enriched.empowermentRank=3;
  enriched.treeNodes=Array(4).fill(passive);enriched.sockets=[row()];
  const grant=makeSkillInstance(def,1,1);grant.rarity='legendary';grant.empowermentRank=3;
  restoreGrantState(grant,packGrantState(enriched));
  const loose=skillOfGemItem(makeSkillGemItem(enriched))!;
  assert.notDeepEqual(grant.treeNodes,loose.treeNodes,'Grant restore deliberately lacks the empowerment budget');
  record('grant-versus-loose-budget',{grant:skill(grant),loose:skill(loose)});
  const missingRows=makeSkillInstance(def,2,2);missingRows.treeNodes=[passive];
  restoreGrantState(missingRows,{sockets:undefined as any,treeNodes:[]});
  assert.deepEqual(missingRows.sockets,[null,null]);assert.deepEqual(missingRows.treeNodes,[passive]);
  record('grant-missing-rows-empty-tree',skill(missingRows));
  const staleState={sockets:[{supportId:'retired-support',level:1},null,{supportId:supportDefs[0].id,level:4,locked:false,rolled:{}}]};
  const staleGrant=makeSkillInstance(def,2,4);restoreGrantState(staleGrant,staleState);
  assert.equal(staleGrant.sockets[0],null);assert.equal(staleGrant.sockets[2]!.def,supportDefs[0]);
  record('grant-stale-supports',skill(staleGrant));

  const stale=makeSkillGemItem(enriched),p=stale.gem as SkillGemPayload;
  p.attunedForm='retired-monster';p.treeNodes=[passive,'retired-node'];
  p.sockets=[{supportId:'retired-support',level:7},null,{supportId:supportDefs[0].id,level:4,locked:true,rolled:{chassis:'untouched'}}];
  const before=copy(stale),indexes=[-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,0,1,2,3];
  const selected=indexes.map(index=>({index:String(index),support:support(bagSkillSupport(stale,index))}));
  assert.deepEqual(stale,before,'Reading a socket never normalizes unrelated cargo');
  const socket=bagSkillSupport(stale,2)!;assert(socket);assert.equal(socket.def,supportDefs[0]);
  assert.notEqual(socket.rolled,p.sockets[2]!.rolled);socket.rolled!.chassis='detached';assert.deepEqual(stale,before);
  const unpacked=skillOfGemItem(stale)!;assert(unpacked);assert.equal(unpacked.attunedForm,undefined);assert.equal(unpacked.sockets[0],null);
  record('stale-cargo-and-indexes',{before,selected,unpacked:skill(unpacked),after:stale});
  for(const paused of [undefined,false,true,1]){
    const item=copy(stale);(item.gem as any).replenishmentPaused=paused;
    record('pause:'+String(paused),skill(skillOfGemItem(item)));
  }
  const without=makeSkillInstance(def,1,0);without.locked=false;without.granted=false;without.treeNodes=[];without.attunedForm='';
  record('absent-defaults',{payload:packSkillGemPayload(without),wrapper:makeSkillGemItem(without),grant:packGrantState(without)});
  const looseSupport=makeSupportGemItem({def:supportDefs[0],level:1,locked:false});
  const lockBefore=copy(looseSupport);writeBackSupportGem(looseSupport,{def:supportDefs[1],level:2,locked:true,rolled:{}});
  assert.equal(looseSupport.locked,true);assert.equal(looseSupport.name,supportDefs[1].name);
  record('support-write-lock',{before:lockBefore,after:looseSupport});
  const renameSkill=makeSkillGemItem(enriched),renameSupport=makeSupportGemItem(row());
  const originalSkillName=def.name,originalSupportName=supportDefs[0].name;
  try{
    def.name='Renamed skill';supportDefs[0].name='Renamed support';
    const restoredSkill=rebuildAnyItem(renameSkill)!,restoredSupport=rebuildAnyItem(renameSupport)!;
    assert.equal(restoredSkill.name,'Renamed skill III');assert.equal(restoredSupport.name,'Renamed support');
    assert.equal(skillOfGemItem(renameSkill)!.def,def);assert.equal(supportOfGemItem(renameSupport)!.def,supportDefs[0]);
    record('live-definition-names',{skill:restoredSkill,support:restoredSupport});
  }finally{def.name=originalSkillName;supportDefs[0].name=originalSupportName;}

  const gear=plain(),sg=makeSkillGemItem(enriched),ug=makeSupportGemItem(row()),duplicate=makeSkillGemItem(enriched);
  const bag=[gear,sg,ug,duplicate];const found=bagGemItems(bag);
  assert.deepEqual(found,[sg,ug,duplicate]);assert.equal(found[0],sg);assert.equal(findBagGem(bag,'skill',def.id),sg);
  assert.equal(findBagGem(bag,'support',supportDefs[0].id),ug);assert.equal(findBagGem(bag,'skill','retired'),undefined);
  assert.equal(skillGemPayloadOf(sg),sg.gem);assert.equal(supportGemPayloadOf(ug),ug.gem);
  assert.equal(skillOfGemItem(ug),null);assert.equal(supportOfGemItem(sg),null);
  assert.equal(skillOfGemItem(gear),null);assert.equal(supportOfGemItem(gear),null);
  const nullGem={...gear,gem:null} as any;assert.equal(isGemItem(nullGem),true);assert.equal(skillGemPayloadOf(nullGem),null);
  record('bag-identities',{items:bag,gemUids:found.map(i=>i.uid),isGem:bag.map(isGemItem),nullGem:isGemItem(nullGem),
    wrongKinds:[skillGemPayloadOf(ug),supportGemPayloadOf(sg)],rarities:bag.slice(1).map(i=>gemItemRarityOf(i.gem!))});
  const placed=[{...plain('chest_armor'),x:0,y:0},{...sg,x:0,y:0},{...ug,x:1},{...duplicate,y:1}];
  let reads=0;setBagBoardSource(()=>{reads++;return reads%2?{w:4,h:99}:{w:99,h:3};});
  const free=freeCellCount(placed);assert.equal(reads,2,'Width and height are distinct live observations');
  assert.equal(free,12-itemGridSize(placed[0]).w*itemGridSize(placed[0]).h-1,'Overlapping placed areas are each counted');
  record('live-board',{placed,free,reads});setBagBoardSource(()=>({w:1,h:1}));
  record('overfull-board',{free:freeCellCount(placed)});setBagBoardSource(null);
  assert.equal(gemInitials('one two three four'),'OTT');
  record('initials',['','  ','Arcane  Echo',' ember of rain ','éclair 火 bolt','💥 star fall','one-two three','one two three four'].map(name=>({name,initials:gemInitials(name)})));

  // Item restoration is a tolerant borrowed-state seam, not a strict JSON ingress.
  const affix=Object.values(ITEM_AFFIXES).find(a=>a.tiers.length>1)!;assert(affix);
  const vestige=Object.keys(VESTIGES)[0];assert(vestige);
  for(const base of Object.values(ITEM_BASES)){
    const saved=plain(base.id);saved.uid=7000000+courses.length;saved.locked=true;saved.craftedSockets=1;
    saved.affixes=[{id:affix.id,tier:-4,rolls:[.1],crafted:true},{id:affix.id,tier:999,rolls:[.2]},{id:'retired-affix',tier:0,rolls:[]}];
    saved.sockets=[vestige,'retired-vestige',null,vestige,null,null,null,null];
    const input=copy(saved),result=rebuildItem(saved)!;assert(result);assert.notEqual(result,saved);
    assert.notEqual(result.affixes,saved.affixes);assert.equal(result.affixes[0],saved.affixes[0]);
    assert.equal(result.affixes[0].tier,0);assert.equal(result.affixes[1].tier,affix.tiers.length-1);assert.equal(result.affixes.length,2);
    assert.equal(result.implicitRolls,saved.implicitRolls);assert.notEqual(result.sockets,saved.sockets);
    record('base-restore:'+base.id,{input,after:saved,result,nextUid:nextItemUid()});
  }
  for(const unique of Object.values(UNIQUES).filter(u=>u.choices?.length)){
    for(const choice of ['missing','stale','out-of-range'] as const){
      const saved=plain(unique.baseId);saved.uniqueId=unique.id;
      if(choice!=='missing')saved.uniqueChoices=Object.fromEntries(unique.choices!.map(g=>[g.id,{id:choice==='stale'?'retired-choice':g.options[0].id,rolls:[-1,2,NaN]}]));
      const input=copy(saved),result=rebuildItem(saved)!;assert(result);assert(result.uniqueChoices);
      assert.notEqual(result.uniqueChoices,saved.uniqueChoices);record('unique-restore:'+unique.id+':'+choice,{input,result,after:saved});
    }
  }
  const memory=plain('rough_memory');memory.mem=[{d:'found',s:7,g:{k:'skill',id:def.id,l:4,r:'rare'}},{d:'quest',s:8,ceiling:'magic'}];
  memory.grantState={skill:{sockets:[{supportId:supportDefs[0].id,level:2}],treeNodes:[passive]}};
  memory.questId='quest';memory.relicKey='relic';memory.writ={category:'ring',complexity:2};
  const memoryRestored=rebuildAnyItem(memory)!;assert(memoryRestored);assert.equal(memoryRestored.mem,memory.mem);assert.equal(memoryRestored.grantState,memory.grantState);
  record('opaque-persisted-fields',{memory,result:memoryRestored});
  const defaults=plain();delete (defaults as any).affixes;delete (defaults as any).implicitRolls;defaults.sockets=[];
  const rebuiltDefaults=rebuildItem(defaults)!;assert.deepEqual(rebuiltDefaults.affixes,[]);assert.deepEqual(rebuiltDefaults.implicitRolls,[]);assert(!Object.hasOwn(rebuiltDefaults,'sockets'));
  record('item-defaults',{input:defaults,result:rebuiltDefaults});
  const knownSupport=makeSupportGemItem(row()),knownSkill=makeSkillGemItem(enriched);
  for(const [label,baseId,uniqueId,gem] of [
    ['base','retired-base',undefined,undefined],['unique','ring_lapis','retired-unique',undefined],
    ['skill','skill_gem',undefined,{kind:'skill',skillId:'retired-skill',level:1,rarity:'common',sockets:[]}],
    ['support','support_gem',undefined,{kind:'support',supportId:'retired-support',level:1}],
    ['known-skill','skill_gem',undefined,knownSkill.gem],['known-support','support_gem',undefined,knownSupport.gem],
  ] as const){
    const beforeUid=nextItemUid(),saved={...plain(baseId),uid:beforeUid+100,uniqueId,gem} as ItemInstance;
    const result=rebuildAnyItem(saved),afterUid=nextItemUid();
    assert.equal(afterUid,beforeUid+(label==='base'||label==='unique'?1:101),'UID floor precedes gem registry rejection');
    if(!label.startsWith('known'))assert.equal(result,null);
    record('registry-rejection:'+label,{saved,result,beforeUid,afterUid});
  }
  const unknownSkill=copy(knownSkill);(unknownSkill.gem as SkillGemPayload).skillId='retired-skill';assert.equal(skillOfGemItem(unknownSkill),null);
  const unknownSupport=copy(knownSupport);(unknownSupport.gem as any).supportId='retired-support';assert.equal(supportOfGemItem(unknownSupport),null);
  const special=copy(stale);(special.gem as SkillGemPayload).sockets=[{supportId:'constructor',level:1},{supportId:'__proto__',level:1}];
  assert.equal(bagSkillSupport(special,0),null);assert.equal(bagSkillSupport(special,1),null);
  record('unknown-lookups',{skill:skillOfGemItem(unknownSkill),support:supportOfGemItem(unknownSupport),special:[bagSkillSupport(special,0),bagSkillSupport(special,1)]});
  const uidSteps=[-1,NaN,Infinity,1,9000000.75,2].map(seen=>{const before=nextItemUid();bumpItemUidFloor(seen);return {seen:String(seen),before,after:nextItemUid()};});
  record('legacy-uid-floor',uidSteps);
  assert(trees>100&&empoweredTrees>0);assert.equal(warnings.length,0);
  const counts={skills:skillDefs.length,supports:supportDefs.length,trees,empoweredTrees,bases:Object.keys(ITEM_BASES).length,
    choiceUniques:Object.values(UNIQUES).filter(u=>u.choices?.length).length,courses:courses.length};
  fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,counts,courses,nextUid:nextItemUid()})+'\n');
  console.log({passed:true,...counts});
} finally {console.warn=oldWarn;Math.random=oldRandom;setBagBoardSource(null);}
