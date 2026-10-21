// Independent observations: this file imports only the frozen original game.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {mulberry32} from '../src/sim/rng';
import {ITEM_BASES} from '../src/data/itembases';
import {itemGridSize} from '../src/engine/itemgen';
import {RELIC_STASH,IMMORTAL_STASH} from '../src/data/stashes';
import {emptyStash,stashPageCost,stashPage,stashOverflow,restoreStash,firstStashFit,planStashMove,type StashDef,type StashEntry,type StashState,type StashCell} from '../src/engine/stash';
import type {ItemInstance} from '../src/engine/items';
bootSimEngine();
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v)),rng=mulberry32(846133),pick=(n:number)=>Math.floor(rng()*n);
const bases=['relic_charm','relic_talisman','relic_idol','relic_effigy','ring_mi_gnoll','helmet_armor'];
for(const id of bases)assert(ITEM_BASES[id],id);
const body=(uid:number,baseId:string):ItemInstance=>({uid,baseId,name:'Storage fixture',ilvl:1,tier:1,rarity:'common',baseRoll:.5,implicitRolls:[],affixes:[],sockets:[null],x:17,y:18});
const definitions=[
 {...RELIC_STASH,kind:'relic',rows:undefined},
 {...IMMORTAL_STASH,kind:'immortal',rows:undefined},
 {...RELIC_STASH,id:'small',board:{w:2,h:2},initialPages:2,maxPages:4,kind:'all',rows:undefined,accepts:()=>true},
 {...RELIC_STASH,id:'masked',board:{w:4,h:3,open:(x:number,y:number)=>['####','#..#','####'][y]?.[x]==='#'},initialPages:1,maxPages:3,kind:'all',rows:['####','#..#','####'],accepts:()=>true},
 {...RELIC_STASH,id:'thin',board:{w:1,h:5},initialPages:1,maxPages:2,kind:'all',rows:undefined,accepts:()=>true},
];
const definition=(def:typeof definitions[number])=>({id:def.id,board:{w:def.board.w,h:def.board.h,rows:def.rows},initialPages:def.initialPages,maxPages:def.maxPages,pageCostBase:def.pageCostBase,kind:def.kind});
const snapshot=(def:StashDef,entries:StashEntry[],s:StashState)=>clone({state:s,cost:stashPageCost(def,s),overflow:stashOverflow(entries,s).map(e=>e.key),pages:Array.from({length:s.pages},(_,p)=>stashPage(entries,s,p))});
const repairs:any[]=[],scenarios:any[]=[];
let uid=910000;
// Corrupt/retuned layouts: old coordinates, page-count rails, partial investment,
// unknown layout keys and rejected item categories. All input item bodies survive.
for(let n=0;n<400;n++){
 const def=definitions[n%definitions.length],entries=Array.from({length:pick(35)},(_,i)=>({key:'old:'+i,item:body(++uid,bases[pick(bases.length)])}));
 if(entries.length&&n%5===0)entries[0].item.questId='old-quest';
 if(entries.length>1&&n%7===0)entries[1].item.relicKey='account-body';
 const cells:StashState['cells']={retired:{page:0,x:0,y:0}};
 for(const e of entries)if(rng()<.8)cells[e.key]={page:pick(7)-1,x:pick(7)-1+(n%11===0?.5:0),y:pick(7)-1};
 const value={pages:[-5,0,1,2,8,999,1.5][n%7],invested:[-4,0,15,999999,1.5][n%5],cells};
 const before=clone({entries,value}),result=restoreStash(def,entries,value);
 assert.deepEqual(clone({entries,value}),before);
 repairs.push({definition:definition(def),...before,result:snapshot(def,entries,result)});
}
// Stateful plans: apply only accepted plans exactly as a host would. Each query
// records the full input and never mutates a payload; normal saves are JSON.
for(const def of definitions){
 let entries:StashEntry[]=[],state=emptyStash(def);const steps:any[]=[];
 for(let n=0;n<600;n++){
  const roll=pick(10);let command:any,result:any;
  if(roll===0&&entries.length){
   const at=pick(entries.length),entry=entries[at];command={type:'withdraw',key:entry.key};entries=entries.filter(e=>e!==entry);state={...state,cells:{...state.cells}};delete state.cells[entry.key];result=true;
  }else if(roll===1){
   const pages=Math.min(def.maxPages,state.pages+1);command={type:'restore',pages};state=restoreStash(def,entries,{...state,pages,invested:n%30});result=true;
  }else{
   const existing=entries.length>0&&roll<7,entry=existing?entries[pick(entries.length)]:{key:'new:'+uid,item:body(++uid,bases[pick(bases.length)])};
   if(!existing&&n%17===0)entry.item.questId='held-quest';
   const vacate=!existing&&entries.length&&n%13===0?entries[pick(entries.length)].key:undefined;
   const target:StashCell|undefined=n%4?{page:pick(state.pages+1),x:pick(def.board.w+1),y:pick(def.board.h+1)}:undefined;
   const before=clone({entries,state,entry}),fit=firstStashFit(def,entries,state,entry.item),plan=planStashMove(def,entries,state,entry,target,vacate);
   assert.deepEqual(clone({entries,state,entry}),before,'A storage plan mutated input');
   command=clone({type:'plan',entry,existing,target,vacate});result=clone({fit:fit??null,plan:plan??null});
   if(plan){state=plan;if(vacate)entries=entries.filter(e=>e.key!==vacate);if(!existing)entries.push(entry);}
  }
  state=clone(state);steps.push({command,result,after:snapshot(def,entries,state),entryKeys:entries.map(e=>e.key)});
 }
 scenarios.push({definition:definition(def),steps});
}
// Explicit recovery ceiling and cross-page exchange: these are independent
// conditions, not only a comparison against whichever output a helper produced.
const def=definitions[2],entries=Array.from({length:9},(_,i)=>({key:'overflow:'+i,item:body(++uid,'relic_charm')}));
const recovered=restoreStash(def,entries);assert.equal(Object.keys(recovered.cells).length,8);assert.equal(stashOverflow(entries,recovered).length,1);
assert.equal(planStashMove(def,entries,recovered,{key:'extra',item:body(++uid,'relic_charm')}),undefined);
const a=entries[0],b=entries[7],swapped=planStashMove(def,entries,recovered,a,recovered.cells[b.key]);assert(swapped);assert.deepEqual(swapped.cells[a.key],recovered.cells[b.key]);assert.deepEqual(swapped.cells[b.key],recovered.cells[a.key]);
const dimensions=Object.fromEntries(bases.map(id=>[id,itemGridSize(body(1,id))]));
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'stash.json'),JSON.stringify({dimensions,repairs,scenarios})+'\n');
console.log(`Observed ${repairs.length} original storage repairs and ${scenarios.reduce((n,s)=>n+s.steps.length,0)} stateful storage commands.`);
// Separate additive fixture: keep the accepted main trace byte-identical.
const edges:any[]=[];
const legacyValues=[undefined,{},null,{pages:0},{pages:1,cells:null},{pages:1,invested:null,cells:{a:null}},
 {pages:'2',invested:'4',cells:{a:{page:0}}},{pages:1,cells:{a:{page:0,x:2**60,y:0}}},
 {pages:2,invested:15,cells:{a:{page:1,x:0,y:0},b:{page:1,x:0,y:0}}}];
for(const duplicateUid of [false,true])for(const value of legacyValues){
 const entries=[{key:'a',item:body(990001,'relic_charm')},{key:'b',item:body(duplicateUid?990001:990002,'relic_talisman')}];
 const before=clone({entries,value}),result=restoreStash(def,entries,value as StashState);
 assert.deepEqual(clone({entries,value}),before);
 edges.push({...before,definition:definition(def),result:snapshot(def,entries,result)});
}
fs.writeFileSync(path.join(out,'stash-edges.json'),JSON.stringify(edges)+'\n');
console.log(`Observed ${edges.length} additive legacy-shape and repeated-uid cases.`);
