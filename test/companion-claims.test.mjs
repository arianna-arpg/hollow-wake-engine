import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CompanionClaims} from '../dist/companion-claims.js';
import {CompanionStances} from '../dist/companion-stances.js';

function setup(){
  const trace=[],parts=[{kind:'collar'},{kind:'brand'}],make=(id,over={})=>({id,dead:false,team:'enemy',tier:0,companion:false,
    defId:'wolf',life:20,rarity:'normal',maxLife:()=>100,threat:new Map([[99,10]]),aggroed:true,aiFleeing:true,
    sheet:{removeSource:id=>trace.push(['remove',id])},...over});
  const keeper=make(1,{team:'player'}),beast=make(2),actors=[keeper,beast],effect={type:'tame',tags:['beast'],sureBelow:.3,wildChance:.2};
  const skill={def:{id:'bond',effects:[effect],companionCue:{color:'red'}}},adjustments={slotsAdd:0,sureBelowAdd:0,wildChanceAdd:0},bond={};
  const ports={actors:()=>actors,monster:()=>({tags:['beast']}),adjustments:()=>adjustments,bond:()=>bond,random:()=>{trace.push('random');return .5;},
    sameLayer:(a,b)=>a.tier===b.tier,cue:(a,e)=>trace.push(e),defeated:a=>trace.push(['defeated',a.team,a.owner]),
    clearEncounter:a=>{trace.push('clearEncounter');a.encounter=undefined;},adopt:a=>{trace.push(['adopt',a.life,a.owner]);}};
  return{trace,parts,make,keeper,beast,actors,effect,skill,adjustments,bond,ports,runtime:new CompanionClaims(parts,ports)};
}
test('certain claim emits optional consequence before allegiance and folds inheritance once',()=>{
  const h=setup();Object.assign(h.beast,{lifelineId:1,squadId:9,squadLeader:true,tag:'encounter',aiCommand:{},standingOrder:{},aiTargetId:5,encounter:{},extraParts:[{kind:'collar',worn:true}]});
  h.runtime.attempt(h.keeper,h.skill,h.beast,h.effect);
  assert.deepEqual(h.trace,[['defeated','enemy',undefined],['remove','owner'],'clearEncounter',['adopt',100,h.keeper],'bind']);
  assert.equal(h.beast.owner,h.keeper);assert.equal(h.beast.bondGroup,'2');assert.equal(h.beast.sourceSkillId,'__companion:bond');
  for(const key of['lifelineId','squadId','squadLeader','tag','aiCommand','standingOrder','aiTargetId','encounter'])assert.equal(h.beast[key],undefined);
  assert.equal(h.beast.threat.size,0);assert.equal(h.beast.aggroed,false);assert.equal(h.beast.aiFleeing,false);
  assert.deepEqual(h.beast.extraParts,[{kind:'collar',worn:true},{kind:'brand'}]);
});
test('downed bodies hold distinct bond slots, pack members share one, dead bodies release them',()=>{
  const h=setup();h.actors.push(h.make(3,{companion:true,downed:true,owner:h.keeper,sourceSkillId:'__companion:bond',bondGroup:'pack'}),
    h.make(4,{companion:true,owner:h.keeper,sourceSkillId:'__companion:bond',bondGroup:'pack'}),h.make(5,{companion:true,dead:true,owner:h.keeper,sourceSkillId:'__companion:bond'}));
  assert.equal(h.runtime.bonds(h.keeper,'bond'),1);h.runtime.attempt(h.keeper,h.skill,h.beast,h.effect);assert.deepEqual(h.trace,['reject']);
  h.adjustments.slotsAdd=1;h.runtime.attempt(h.keeper,h.skill,h.beast,h.effect);assert.equal(h.beast.owner,h.keeper);
});
test('taxonomy, allegiance, ownership, layer, rarity and boss gates refuse without mutation or draws',()=>{
  for(const mutate of[h=>h.ports.monster=()=>undefined,h=>h.ports.monster=()=>({tags:['spirit']}),h=>h.beast.team='player',
    h=>h.beast.owner={},h=>h.beast.companion=true,h=>h.beast.tier=1,h=>h.beast.rarity='rare',h=>h.ports.monster=()=>({boss:true,tags:['beast']})]){
    const h=setup();mutate(h);const before={...h.beast};h.runtime.attempt(h.keeper,h.skill,h.beast,h.effect);
    assert.deepEqual(h.trace,['reject']);assert.deepEqual(h.beast,before);
  }
});
test('wild chance interpolates by missing life and keeps strict random boundary',()=>{
  for(const [roll,success]of[[.6,true],[.6000000000000001,false]]){
    const h=setup();h.beast.life=65;h.ports.random=()=>roll;h.runtime.attempt(h.keeper,h.skill,h.beast,h.effect);assert.equal(h.beast.companion,success);
  }
});
test('boss bond threshold ignores wild chance and rare override may admit a rare',()=>{
  const h=setup();h.ports.monster=()=>({boss:true,tags:['beast']});h.bond.bossSure=.1;h.effect.wildChance=1;
  h.runtime.attempt(h.keeper,h.skill,h.beast,h.effect);assert.deepEqual(h.trace,['reject']);
  h.beast.life=10;h.runtime.attempt(h.keeper,h.skill,h.beast,h.effect);assert.equal(h.beast.owner,h.keeper);
  const r=setup();r.beast.rarity='rare';r.bond.rareSure=.5;r.runtime.attempt(r.keeper,r.skill,r.beast,r.effect);assert(r.beast.companion);
});
test('claim needs no campaign callback; synchronous failure preserves preceding writes',()=>{
  const h=setup();delete h.ports.defeated;h.ports.adopt=()=>{throw Error('stop');};assert.throws(()=>h.runtime.attempt(h.keeper,h.skill,h.beast,h.effect),/stop/);
  assert.equal(h.beast.owner,h.keeper);assert.equal(h.beast.life,100);assert.equal(h.beast.extraParts,undefined);
});
function stances(){
  const definitions=[{id:'aggressive',order:0,lunges:true,conduct:'aggressive',color:'red'},
    {id:'defensive',order:1,lunges:true,conduct:'defensive'},{id:'passive',order:2,lunges:false,conduct:'passive'}];
  const trace=[],choices=new Map(),skill=id=>({def:{id,effects:[{type:'tame'}]}}),actor={skills:[skill('bond'),skill('bond'),skill('pack')]},controller={actor,home:{id:99}};
  const ports={choices:()=>choices,learned:(_,id)=>id==='known',refresh:()=>trace.push('refresh'),shifted:(...a)=>trace.push(['shift',...a]),changed:()=>trace.push('changed')};
  const runtime=new CompanionStances(definitions,'defensive','stance:',ports);return{definitions,trace,choices,actor,controller,ports,runtime};
}
test('stances cycle each distinct equipped tame once and signal the home identity',()=>{
  const h=stances();assert(h.runtime.cycle(h.controller));assert.deepEqual([...h.choices],[['bond','passive'],['pack','passive']]);
  assert.deepEqual(h.trace,['refresh',['shift',h.controller.home,'bond','passive'],'changed','refresh',['shift',h.controller.home,'pack','passive'],'changed']);
});
test('unknown stance or unheld skill refuses; unchanged choice still refreshes without shift',()=>{
  const h=stances();assert.equal(h.runtime.set(h.controller,'bond','unknown'),false);assert.equal(h.runtime.set(h.controller,'unknown','passive'),false);assert.equal(h.trace.length,0);
  assert.equal(h.runtime.set(h.controller,'bond','defensive'),false);assert.deepEqual(h.trace,['refresh','changed']);
  assert.equal(h.runtime.set(h.controller,'known','aggressive'),true);
});
test('stance definitions are detached, fallback is explicit, standing orders retain infinity',()=>{
  const h=stances();h.definitions[0].color='blue';assert.equal(h.runtime.definition('aggressive').color,'red');
  h.choices.set('bond','gone');assert.equal(h.runtime.id(h.controller,'bond'),'defensive');assert.equal(h.runtime.next('gone'),'aggressive');
  assert.equal(h.runtime.fromOrder(h.runtime.order('passive')),'passive');assert.equal(h.runtime.fromOrder({kind:'stance:gone'}),undefined);
  assert.equal(h.runtime.order('defensive').until,Infinity);assert.equal(h.runtime.fromOrder({kind:'assault'}),undefined);
});
test('invalid stance catalogues are rejected at setup',()=>{
  const h=stances();for(const defs of[[],[...h.definitions,h.definitions[0]],[{...h.definitions[0],order:NaN}]])assert.throws(()=>new CompanionStances(defs,'bad','stance:',h.ports));
});
