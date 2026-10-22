import test from 'node:test';import assert from 'node:assert/strict';
import {SupportRules,supportTagsFit,canonicalSupportCut,resolveSupportCut,supportCutMechanisms,supportCutModifiers,rollSupportCut} from '../dist/support-rules.js';
const mod=(stat,value,kind='flat')=>({stat,kind,value});
const support=(id,patch={})=>({id,mods:[],...patch});
const skill=(patch={})=>({id:'skill',tags:['spell'],delivery:{type:'projectile'},effects:[],cooldown:0,...patch});
const inst=(def=skill())=>({def,level:1,sockets:[null,null,null,null]});
function setup(extra={}){
 const policy={seatBoundFields:new Set(['trigger','resonance']),globalStats:new Set(['armor']),costStats:new Set(['manaCost']),strikeFields:['constructFx','zoneEmit','tether'],surfaceStats:['lingerField'],childFlightStats:['forkCount'],defaultLeveling:[mod('damage',.1,'increased')]};
 const ports={policy:()=>policy,boarding:()=> 'gated',baseTags:i=>i.def.tags,delivery:i=>i.def.delivery,castMode:i=>i.def.castMode??'cast',treeModifiers:i=>i.treeMods,selfStack:i=>i.selfStack,summon:i=>i.summon,
  componentInstances:i=>i.components??[],componentStatuses:i=>i.statuses??[],hasChildFlights:i=>!!i.children,status:id=>({burn:{dotType:'fire'},stun:{powerInert:true},doom:{stacking:true,mods:[{}]}}[id]),tuneChance:(_id,chance)=>chance,
  createCrew:(def,sockets)=>({def,level:1,sockets:new Array(sockets).fill(null)}),...extra};
 return {policy,ports,rules:new SupportRules(ports)};
}
test('tag closure preserves slot identities, graft order and caller-owned base tags',()=>{
 const {rules}=setup(),i=inst(),a={def:support('a',{requiresTags:['spell'],grantsTags:['area']}),level:1},b={def:support('b',{requiresTags:['area'],grantsTags:['field']}),level:1},c={def:support('c',{requiresTags:['field']}),level:1};
 i.sockets=[c,null,b];i.grafts=[a];assert.deepEqual(rules.hostSockets(i),[c,b,a]);assert.deepEqual(rules.grantedTags(i),['field','area']);assert.deepEqual(i.def.tags,['spell']);
 assert.equal(rules.hostSockets(i)[0],c);assert.notEqual(rules.rawSockets(i),i.sockets);delete i.grafts;assert.equal(rules.rawSockets(i),i.sockets);assert.deepEqual(rules.hostSockets(i),[]);
 i.sockets=[a,b,c];assert.deepEqual(rules.hostSockets(i),[a,b,c]);a.def.grantsTags=[];assert.deepEqual(rules.hostSockets(i),[a]);
});
test('legacy exclusion timing and unseeded cycles stay explicit',()=>{
 const {rules}=setup(),i=inst(),a={def:support('a',{excludeTags:['late']}),level:1},b={def:support('b',{grantsTags:['late']}),level:1};
 i.sockets=[a,b];assert.deepEqual(rules.hostSockets(i),[a,b]);i.sockets=[b,a];assert.deepEqual(rules.hostSockets(i),[b]);
 i.sockets=[{def:support('x',{requiresTags:['y'],grantsTags:['x']}),level:1},{def:support('y',{requiresTags:['x'],grantsTags:['y']}),level:1}];assert.deepEqual(rules.hostSockets(i),[]);
 assert.equal(supportTagsFit({requiresTags:['a','b'],excludeTags:['c']},['b']),true);assert.equal(supportTagsFit({requiresTags:['b'],excludeTags:['c']},['b','c']),false);
});
test('effective levels floor each bonus independently and stay above paid caps',()=>{
 const {rules}=setup(),i=inst();i.level=20;i.bonusLevels=2.9;
 i.sockets=[{def:support('a',{levelBonus:1.9,levelBonusPer:.6}),level:3},{def:support('b',{levelBonus:.9}),level:1},{def:support('zero',{levelBonus:0,levelBonusPer:99}),level:5}];
 assert.equal(rules.effectiveLevel(i),25);i.sockets[0].level=1;assert.equal(rules.effectiveLevel(i),23);
});
test('numeric folding retains source order, borrowed identities and override forwarding semantics',()=>{
 const {rules}=setup(),base=mod('base',1),extra=mod('extra',2),tree=mod('tree',3),fixed=mod('fixed',4),override=mod('override',5,'override');
 const i=inst(skill({innateMods:[base],leveling:{perLevel:[mod('growth',2)]},thresholds:[{level:3,mods:[mod('threshold',9)]}]}));i.level=3;i.extraMods=[extra];i.treeMods=[tree];
 i.sockets=[{def:support('s',{mods:[fixed,override],perLevel:[mod('step',3),mod('overrideStep',4,'override')],rollBase:{axes:[{id:'axis',rows:[{id:'row',weight:1,mods:[mod('rolled',6)]}]}]}}),level:3,forwardScale:.5}];
 const out=rules.modifiers(i);assert.deepEqual(out.map(m=>[m.stat,m.value]),[['base',1],['extra',2],['tree',3],['growth',4],['threshold',9],['fixed',2],['override',5],['rolled',3],['step',3],['overrideStep',8]]);
 assert.equal(out[0],base);assert.equal(out[1],extra);assert.equal(out[2],tree);assert.equal(out[6],override);assert.notEqual(out[5],fixed);assert.equal(fixed.value,4);
});
test('global modifiers and gated creature costs use their distinct original lanes',()=>{
 let mode='gated';const {rules}=setup({boarding:()=>mode}),i=inst(skill({tags:['summon'],delivery:{type:'summon'}}));
 const gem={def:support('crew',{requiresTags:['attack'],mods:[mod('manaCost',2),mod('armor',5)],perLevel:[mod('manaCost',3),mod('armor',2)],rollBase:{axes:[{id:'a',rows:[{id:'r',weight:1,mods:[mod('manaCost',99),mod('armor',99)]}]}]}}),level:3,forwardScale:.1};i.sockets=[gem];
 assert.deepEqual(rules.modifiers(i),[]);assert.deepEqual(rules.globalModifiers(gem).map(m=>m.value),[5,4]);
 mode='free';assert.deepEqual(rules.modifiers(i).map(m=>[m.stat,m.value]),[['manaCost',2],['manaCost',6]]);
 mode='gated';i.grafts=[{def:support('key',{resonance:true}),level:1}];assert.equal(rules.boardingOpen(i),true);assert.equal(rules.modifiers(i).length,2);
});
test('component-only costs include rolled rows once, scale correctly and precede self stacks',()=>{
 const {rules}=setup(),i=inst(),component=inst(skill({tags:['attack']}));i.components=[component];
 const gem={def:support('component',{requiresTags:['attack'],mods:[mod('manaCost',2),mod('damage',9)],perLevel:[mod('manaCost',3)],rollBase:{axes:[{id:'a',rows:[{id:'r',weight:1,mods:[mod('manaCost',4),mod('manaCost',7,'override')]}]}]}}),level:3,forwardScale:.5};
 i.sockets=[gem];i.selfStack={mods:[mod('damage',6)]};i.state={stackN:3};
 assert.equal(rules.fits(gem.def,i),true);assert.deepEqual(rules.modifiers(i).map(m=>[m.stat,m.kind,m.value]),[['manaCost','flat',1],['manaCost','flat',2],['manaCost','override',7],['manaCost','flat',3],['damage','flat',18]]);
 i.components=[];assert.equal(rules.fits(gem.def,i),false);assert.deepEqual(rules.modifiers(i),[mod('damage',18)]);
});
test('creature admission composes riders, keeps definition identity and excludes seat-bound fields even when false',()=>{
 const {rules}=setup(),i=inst(skill({tags:['summon']})),crew=skill({id:'crew',tags:['attack']}),wanted=support('wanted',{requiresTags:['fissure']});
 assert.equal(rules.crewServed(wanted,i,[crew]),null);i.grafts=[{def:support('enabler',{requiresTags:['attack'],grantsTags:['fissure']}),level:1}];
 assert.equal(rules.crewServed(wanted,i,[crew])[0],crew);assert.equal(rules.fits(wanted,i),false);assert.equal(rules.fitsOrCrew(wanted,i,[crew]),true);
 assert.equal(rules.crewServed(wanted,i,'unknowable'),'unknowable');assert.equal(rules.ridesMinions({...wanted,trigger:false}),false);assert.equal(rules.ridesMinions({...wanted,trigger:undefined}),true);
 const roll=support('rolled',{requiresTags:['attack'],rollBase:{axes:[{id:'a',rows:[{id:'r',weight:1,requiresMechanisms:['pour:missing']}]}]}});
 assert.equal(rules.fits(roll,inst(crew)),false);assert.deepEqual(rules.crewServed(roll,i,[crew]),[crew]);
});
test('all fourteen built-in mechanism families observe current structural inputs',()=>{
 const {rules}=setup(),i=inst(),holds=(name,param)=>rules.builtinMechanism(name,i,param);
 assert.equal(holds('unknown'),true);assert.equal(holds('periodicConstruct'),false);i.def.delivery={type:'construct',kind:'totem',castSkillId:'payload'};assert.equal(holds('periodicConstruct'),true);assert.equal(holds('construct','massed'),false);
 i.sockets=[{def:support('lift',{massGraft:{}}),level:1}];assert.equal(holds('construct','massed'),true);assert.equal(holds('guard'),true);
 i.def.delivery={type:'projectile',rehit:1};assert.equal(holds('flight','spends'),false);assert.equal(holds('flight','mints'),true);assert.equal(holds('flight','children'),false);i.children=true;assert.equal(holds('flight','children'),true);
 assert.equal(holds('bankless'),true);i.def.useCharges={};assert.equal(holds('bankless'),false);delete i.def.useCharges;
 i.def.delivery={type:'dash'};assert.equal(holds('displaces'),true);assert.equal(holds('landing'),false);i.def.delivery={type:'ground'};assert.equal(holds('landing'),true);assert.equal(holds('surface'),true);assert.equal(holds('surface','standing'),false);i.def.delivery.lingerDuration=2;assert.equal(holds('surface','standing'),true);
 i.def.delivery={type:'aura'};assert.equal(holds('engagement'),true);assert.equal(holds('strikes'),false);i.def.effects=[{type:'damage'},{type:'status',status:'burn',magnitude:1,chance:1},{type:'restoreOverTime',lane:'surge'}];
 assert.equal(holds('strikes'),true);assert.equal(holds('affliction','fire'),true);assert.equal(holds('affliction','bleed'),false);assert.equal(holds('status','power'),true);assert.equal(holds('status','stacking'),false);assert.equal(holds('pour','surge'),true);assert.equal(holds('pour','settle'),false);
 assert.equal(holds('cooldown'),false);i.def.cooldown=1;assert.equal(holds('cooldown'),true);
});
test('mechanism overrides are per binding and do not replace built-in dispatch',()=>{
 const {rules}=setup({mechanism:(name)=>name==='custom:yes'}),other=setup().rules,i=inst();
 assert.equal(rules.mechanismHolds('custom:no',i),false);assert.equal(other.mechanismHolds('custom:no',i),true);assert.equal(rules.builtinMechanism('landing',i),true);
});
test('cut resolution preserves row identities, canonical fallback, authored order and explicit random draws',()=>{
 const a={id:'a',weight:1,requiresMechanisms:['x','y'],mods:[mod('a',1)]},b={id:'b',weight:3,requiresMechanisms:['y','z'],mods:[mod('b',2)]},base={axes:[{id:'left',rows:[a,b]},{id:'right',rows:[b,a]}]};
 assert.deepEqual(canonicalSupportCut(base),{left:'a',right:'b'});assert.equal(resolveSupportCut(base,{left:'retired'}).left,a);assert.deepEqual(supportCutMechanisms(base),['x','y','z']);assert.deepEqual(supportCutModifiers(base),[a.mods[0],b.mods[0]]);
 let draws=0;assert.deepEqual(rollSupportCut(base,()=>{draws++;return .5;}),{left:'b',right:'b'});assert.equal(draws,2);
 assert.throws(()=>rollSupportCut({axes:[...base.axes,{id:'empty',rows:[]}]},()=>{draws++;return 0;}));assert.equal(draws,2);
 assert.throws(()=>rollSupportCut({axes:[...base.axes,{id:'overflow',rows:[{id:'x',weight:Number.MAX_VALUE},{id:'y',weight:Number.MAX_VALUE}]}]},()=>{draws++;return 0;}));assert.equal(draws,2);
 assert.deepEqual(rollSupportCut({axes:[{id:'zero',rows:[{id:'first',weight:-1},{id:'last',weight:0}]}]},()=>1),{zero:'first'});
 assert.throws(()=>rollSupportCut(base,()=>NaN));assert.throws(()=>rollSupportCut(base,()=>-1));assert.throws(()=>rollSupportCut(base));
 const special={axes:[{id:'__proto__',rows:[a]}]};assert.equal(Object.getPrototypeOf(canonicalSupportCut(special)),Object.prototype);assert.equal(Object.hasOwn(resolveSupportCut(special),'__proto__'),true);
});

test('empty socket admission skips unused tags without caching later socket or graft changes',()=>{
 let reads=0;const {rules}=setup({baseTags:()=>{reads++;return ['spell'];}}),i=inst();
 const empty=rules.hostSockets(i);assert.deepEqual(empty,[]);assert.equal(reads,0);assert.notEqual(rules.hostSockets(i),empty);
 i.sockets=[];assert.deepEqual(rules.hostSockets(i),[]);assert.equal(reads,0);
 const gem={def:support('live',{requiresTags:['spell']}),level:1};i.grafts=[gem];assert.deepEqual(rules.hostSockets(i),[gem]);assert.equal(reads,1);
 i.grafts=[];i.sockets=[null,gem,null];assert.deepEqual(rules.hostSockets(i),[gem]);assert.equal(reads,2);
 i.sockets[1]=null;assert.deepEqual(rules.hostSockets(i),[]);assert.equal(reads,2);
});
