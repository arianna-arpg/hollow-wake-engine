import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {createNativeAttackCapturePack} from '../scripts/native-attack-observer.mjs';

const accepted=JSON.parse(fs.readFileSync(new URL('../baseline/attack-sequences/acceptance.json',import.meta.url))),helper=fs.readFileSync(new URL('../'+accepted.helper,import.meta.url),'utf8');
assert.equal(createHash('sha256').update(helper).digest('hex'),accepted.helperSha256);
const original=helper.slice(helper.indexOf('function capturePack('),helper.indexOf('function captureActor('));
const compiled=ts.transpileModule(original,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
class Actor {constructor(id){this.id=id;}}
function packers(){
  return [true,false].map(native=>{let serial=0;const ids=new WeakMap(),id=value=>{if(!ids.has(value))ids.set(value,++serial);return ids.get(value);},ref=actor=>({actor:id(actor),id:actor.id});
    return native?createNativeAttackCapturePack(Actor,ref,id):new Function('CaptureActor','captureActorRef','captureId',compiled+';return capturePack;')(Actor,ref,id);});
}
test('iterative native observer matches the frozen observer for markers, aliases and cycles',()=>{
  const [actual,expected]=packers(),shared={number:NaN},actor=new Actor(9),root={values:[undefined,-0,Infinity,-Infinity,function named(){},null,12n],actor,shared};
  root.self=root;root.set=new Set([shared,actor,root]);root.map=new Map([[shared,root],[actor,shared]]);root.again=shared;
  Object.defineProperty(root,'__proto__',{value:shared,enumerable:true});
  assert.deepEqual(actual(root),expected(root));assert.deepEqual(actual({actor}),expected({actor}));
});
test('iterative native observer preserves sparse arrays and getter visitation order',()=>{
  const make=()=>{const reads=[],array=new Array(4);array[2]={get child(){reads.push('nested');return new Actor(3);}};Object.defineProperty(array,0,{get(){reads.push('first');return {get x(){reads.push('x');return 4;}};}});
    const object={get a(){reads.push('a');return array;},get b(){reads.push('b');return array;}};return {object,reads};};
  const [actual,expected]=packers(),a=make(),b=make();assert.deepEqual(actual(a.object),expected(b.object));assert.deepEqual(a.reads,b.reads);
});
test('iterative native observer preserves skill projections and identity allocation order',()=>{
  const [actual,expected]=packers(),host={def:{id:'host',effects:[]},level:1,sockets:[],state:{}},skill={def:{id:'skill',effects:[{type:'buff',mods:[]}]},level:2,treeNodes:new Set(['a']),sockets:[null,{def:{id:'support'},level:3,rolled:{x:4}}],grafts:[{def:{id:'graft'},level:2}],sequenceHost:host,state:host.state};
  skill.state.self=skill;assert.deepEqual(actual([skill,host,skill.state]),expected([skill,host,skill.state]));
});
test('iterative native observer matches generated mixed graphs',()=>{
  let seed=7421;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let n=0;n<100;n++){const nodes=[new Actor(n)];for(let i=0;i<30;i++){const a=nodes[random()%nodes.length],b=nodes[random()%nodes.length];nodes.push([()=>({a,b,n:i}),()=>[a,b,undefined],()=>new Map([[a,b]]),()=>new Set([a,b])][random()%4]());}
    const [actual,expected]=packers();assert.deepEqual(actual(nodes),expected(nodes));}
});
test('iterative native observer records deep input without recursive traversal',()=>{
  const [actual]=packers();let input={leaf:7};for(let i=0;i<5000;i++)input={next:input};let output=actual(input);for(let i=0;i<5000;i++)output=output.next;assert.deepEqual(output,{leaf:7});
});
