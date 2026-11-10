import test from 'node:test';
import assert from 'node:assert/strict';
import {BodyLevels,bodyPlyCount,bodySkillLevel} from '../dist/body-levels.js';

export const contracts=[
 ['skill progression preserves authored boundary and configured spacing',()=>{
  assert.deepEqual([1,4,5,8,9,20].map(n=>bodySkillLevel(n)),[1,1,2,2,3,5]);
  assert.deepEqual([1,3,4,6,7].map(n=>bodySkillLevel(n,3)),[1,1,2,2,3]);
 }],
 ['ply growth floors fractional steps and clamps capacity',()=>{
  const spec={count:3,perLevel:.5};assert.deepEqual([1,2,3,4,5].map(n=>bodyPlyCount(spec,n)),[3,3,4,4,5]);
  assert.equal(bodyPlyCount({count:3,perLevel:-2},5),0);assert.equal(bodyPlyCount({count:3},50),3);assert.equal(bodyPlyCount(spec,0),3);
 }],
 ['stamp owns only level-derived inputs and borrows authored ply policy',()=>{
  const h=fixture(),a=actor(),spec={count:4,perLevel:.5};a.plies=2;a.life=23;h.runtime.stamp(a,{base:{},plies:spec},5);
  assert.equal(a.level,5);assert.equal(a.life,23);assert.equal(a.plies,2);assert.equal(a.pliesMax,6);assert.equal(a.plySpec,spec);
  assert.deepEqual(a.sources.get('level'),[{stat:'life',kind:'increased',value:.4}]);assert.equal(h.calls.some(c=>c[0]==='maxLife'),false);
 }],
 ['polynomial and geometric scaling preserve independent authored terms',()=>{
  const h=fixture(),a=actor();h.runtime.stamp(a,{base:{},scaling:{life:{flatPerLevel:2,incPerLevel:.03,rate:.1,pow:2},shield:{rate:-.1}}},5);
  const mods=a.sources.get('scaling');assert.equal(mods.length,4);
  assert.deepEqual(mods.slice(0,2),[{stat:'life',kind:'flat',value:32},{stat:'life',kind:'increased',value:.48}]);
  assert.equal(mods[2].stat,'life');assert.equal(mods[2].kind,'more');near(mods[2].value,.4641);
  assert.equal(mods[3].stat,'shield');assert.equal(mods[3].kind,'more');near(mods[3].value,-.3439);
 }],
 ['stamp preserves source and host-write order',()=>{
  const h=fixture(),a=actor();h.runtime.stamp(a,{base:{},boss:true,scaling:{life:{flatPerLevel:2}}},3);
  assert.deepEqual(h.calls.map(c=>c[0]),['growth','modifier','setSource','modifier','setSource','bossPoise','setBase']);
  assert.deepEqual(h.calls.filter(c=>c[0]==='setSource').map(c=>c[1]),['level','scaling']);assert.equal(a.bases.get('poise'),14);
 }],
 ['authored zero poise overrides default boss growth',()=>{
  const h=fixture(),a=actor();a.bases.set('poise',0);h.runtime.stamp(a,{base:{poise:0},boss:true},9);
  assert.equal(a.bases.get('poise'),0);assert.equal(h.calls.some(c=>c[0]==='bossPoise'),false);
 }],
 ['unprovided and empty policies retain prior authored sources',()=>{
  for(const scaling of [undefined,{}, {life:{flatPerLevel:0,incPerLevel:0,rate:0}}]){
   const h=fixture(),a=actor(),mods=[{stat:'life',kind:'flat',value:3}],spec={count:7};a.sources.set('scaling',mods);a.plySpec=spec;a.pliesMax=7;
   h.runtime.stamp(a,{base:{},scaling},2);assert.equal(a.sources.get('scaling'),mods);assert.equal(a.plySpec,spec);assert.equal(a.pliesMax,7);
  }
 }],
 ['relevel retains wound and spent-ply fractions with native identities',()=>{
  const h=fixture(),a=actor(),native={level:1,state:{castPayment:11}};a.skills=[native,null];a.life=25;a.plies=2;a.cooldowns=new Map([['claw',4]]);a.casting={inst:native,elapsed:.3};
  h.defs.set('body',{base:{},plies:{count:4,perLevel:.5}});h.runtime.relevel(a,7);
  assert.equal(a.life,40);assert.equal(a.pliesMax,7);assert.equal(a.plies,4);assert.equal(a.skills[0],native);assert.equal(a.skills[1],null);assert.equal(native.level,2);
  assert.deepEqual(native.state,{castPayment:11});assert.equal(a.casting.inst,native);assert.equal(a.casting.elapsed,.3);assert.equal(a.cooldowns.get('claw'),4);
 }],
 ['down-leveling respects living floor and does not revive downed bodies',()=>{
  for(const [life,expected]of [[.01,1],[0,0]]){const h=fixture(),a=actor();a.level=7;a.sources.set('level',[{stat:'life',kind:'increased',value:.6}]);a.life=life;h.runtime.relevel(a,1);assert.equal(a.life,expected);}
 }],
 ['overfull resources clamp to the new capacities',()=>{
  const h=fixture(),a=actor();a.life=200;a.plies=9;h.defs.set('body',{base:{},plies:{count:4}});h.runtime.relevel(a,3);
  assert.equal(a.life,120);assert.equal(a.plies,4);
 }],
 ['growth from zero armor capacity uses a full fraction',()=>{
  const h=fixture(),a=actor();a.pliesMax=0;a.plies=0;h.defs.set('body',{base:{},plies:{count:5}});h.runtime.relevel(a,2);assert.equal(a.plies,5);
 }],
 ['same-level refresh never reads stats or rewrites skills',()=>{
  const h=fixture(),a=actor(),before=structuredClone(a);h.runtime.relevel(a,1);assert.deepEqual(a,before);assert.deepEqual(h.calls,[['definition','body']]);
 }],
 ['missing body definitions leave all owned state untouched',()=>{
  for(const id of [undefined,'missing']){const h=fixture(),a=actor();a.defId=id;const before=structuredClone(a);h.runtime.relevel(a,9);assert.deepEqual(a,before);assert.deepEqual(h.calls,id?[['definition',id]]:[]);}
 }],
 ['one stateless service leaves another body unchanged',()=>{
  const h=fixture(),a=actor(),b=actor(),before=structuredClone(b);h.runtime.relevel(a,8);assert.deepEqual(b,before);h.runtime.relevel(b,2);assert.equal(a.level,8);assert.equal(b.level,2);assert.notEqual(a.sources.get('level'),b.sources.get('level'));
 }],
 ['host policy is read at command time without a hidden cache',()=>{
  const h=fixture(),a=actor();h.runtime.stamp(a,{base:{}},3);h.growth.life=.2;h.runtime.stamp(a,{base:{}},4);near(a.sources.get('level')[0].value,.6);
 }],
 ['trusted synchronous failure retains only preceding writes',()=>{
  const h=fixture(),a=actor();h.ports.setSource=()=>{throw Error('host write refused');};assert.throws(()=>h.runtime.stamp(a,{base:{},plies:{count:6}},4),/host write refused/);
  assert.equal(a.level,4);assert.equal(a.pliesMax,6);assert.equal(a.life,100);assert.equal(a.sources.size,0);assert.equal(h.calls.some(c=>c[0]==='setBase'),false);
 }],
];
function near(actual,expected){assert(Math.abs(actual-expected)<1e-12,`${actual} differs from ${expected}`);}
function actor(){return{defId:'body',level:1,life:100,plies:4,pliesMax:4,skills:[{level:1}],sources:new Map(),bases:new Map()};}
function fixture(){
 const calls=[],growth={life:.1},defs=new Map([['body',{base:{}}]]);
 const ports={definition:id=>(calls.push(['definition',id]),defs.get(id)),growth:()=>(calls.push(['growth']),growth),bossPoise:()=>(calls.push(['bossPoise']),{bossBase:10,bossPerLevel:2}),
  modifier:(stat,kind,value)=>(calls.push(['modifier',stat,kind,value]),{stat,kind,value}),setSource:(a,key,mods)=>{calls.push(['setSource',key]);a.sources.set(key,mods);},setBase:(a,key,value)=>{calls.push(['setBase',key,value]);a.bases.set(key,value);},
  maxLife:a=>{calls.push(['maxLife']);const mods=[...a.sources.values()].flat().filter(m=>m.stat==='life');return(100+mods.filter(m=>m.kind==='flat').reduce((n,m)=>n+m.value,0))*(1+mods.filter(m=>m.kind==='increased').reduce((n,m)=>n+m.value,0))*mods.filter(m=>m.kind==='more').reduce((n,m)=>n*(1+m.value),1);}};
 return{calls,growth,defs,ports,runtime:new BodyLevels(ports)};
}

for(const[name,run]of contracts)test(name,run);
