import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SkillRackActions,restoreLearnedSeatIds} from '@hollow-wake/engine/skills/rack';
import {InventoryHost} from '@hollow-wake/engine/inventory/host';
import {createGemResidence,packSkillGemPayload} from '@hollow-wake/engine/inventory/gems';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {skillProgressionPack} from '../scripts/compile-skill-progression.mjs';

const progress=new SkillProgression(skillProgressionPack());
const read=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/'+name+'/observations.json.gz',import.meta.url))));
function host(){
  const seat={items:[],hero:{skills:Array(8).fill(null)},book:new Map(),next:1};
  const board={w:3,h:2},grid=new InventoryHost(()=>({w:1,h:1})),events=[];
  const gems=createGemResidence({
    skill:id=>progress.skill(id),support:id=>progress.support(id),hasOwnSupport:id=>progress.pack.supports.some(d=>d.id===id),
    hasForm:()=>false,makeSkill:(def,level,n)=>({def,level,sockets:Array(n).fill(null)}),
    validTreeNodes:(def,nodes,level,inst)=>progress.tree(def.id).restore(nodes,level,inst),
    nextUid:()=>seat.next++,rebuildItem:()=>{throw Error('unexpected migration');},
    bagWidth:()=>board.w,bagHeight:()=>board.h,itemGridSize:()=>({w:1,h:1}),
  });
  const actions=new SkillRackActions({maxLearned:8,hero:s=>s.hero,actor:s=>s.hero,known:s=>s.book,granted:()=>false,
    bagItem:(s,uid)=>s.items.find(i=>i.uid===uid),unpack:gems.skillOfGemItem,pack:gems.makeSkillGemItem,
    meets:()=>true,refusal:()=>null,fail:(_body,key,why)=>events.push([key,why]),
    remove:(s,uid)=>grid.remove(s.items,uid),freeCells:s=>gems.freeCellCount(s.items),
    place:(s,item,x,y)=>{
      if(x===undefined||y===undefined)return grid.autoPlace(s.items,item,board);
      if(!grid.canPlace(s.items,item,x,y,board))return false;
      item.x=x;item.y=y;s.items.push(item);return true;
    },
    beforeForget:()=>{},afterForget:()=>{},afterLearn:()=>{},dirty:()=>{},afterUnlearn:()=>{},
  });
  return {seat,actions,board,events};
}
test('all original skill items leave the bag, bind by identity, and return their original cargo and fresh UID',()=>{
  const {all}=read('skill-rack'),{actions,seat}=host();
  assert.equal(all.length,954);
  for(const row of all){
    seat.items=[{...row.item,x:0,y:0}];seat.next=row.item.uid+1;
    assert(actions.learn(seat,row.item.uid,row.at),row.id);
    const inst=seat.book.get(row.id);assert.equal(seat.hero.skills[row.at],inst);
    assert.deepEqual({...packSkillGemPayload(inst),locked:!!inst.locked,derivedGrafts:inst.grafts?.length??0},row.learned);
    assert(actions.unlearn(seat,row.id));
    assert.deepEqual(seat.items,[row.returned]);assert.equal(seat.book.size,0);assert(seat.hero.skills.every(i=>i===null));
  }
});
test('resume reconstructs the exact seat IDs passed by the original character loader',()=>{
  for(const row of read('skill-rack-resume')){
    const before=[...row.inputBar];
    const next=restoreLearnedSeatIds(row.inputBar,row.known,row.capacity);
    assert.deepEqual(next,row.passed);assert.notEqual(next,row.inputBar);assert.deepEqual(row.inputBar,before);
  }
});
test('rejected requests preserve the original input cell, bag order and allocator behavior',()=>{
  const {courses}=read('skill-rack'),course=courses.find(c=>c.name==='one-copy-and-capacity');
  const row=course.steps.find(s=>s.label==='two-departures-one-cell');
  const {actions,seat,board,events}=host();Object.assign(board,row.board);
  const saved=row.before[0];seat.items=structuredClone(saved.items);seat.next=row.next;
  for(const [id,raw] of saved.known)seat.book.set(id,{def:progress.skill(id),level:raw.level,rarity:raw.rarity,
    sockets:raw.sockets.map(s=>s?{def:progress.support(s.supportId),level:s.level,locked:s.locked}:null)});
  seat.hero.skills=saved.hero.map(id=>seat.book.get(id)??null);
  assert.equal(actions.learn(seat,...row.args),false);
  assert.deepEqual(seat.items,row.after[0].items);assert.equal(seat.next,row.next+row.allocated);
  assert.deepEqual(events,[['learn:'+row.args[0],'no room in the bag']]);
  assert.equal(actions.learn(seat,row.args[0],0.5),false);
});
