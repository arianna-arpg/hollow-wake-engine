import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {ContainerLayout,packContainerBoard,unpackContainerBoard,containerBoardOpen} from '../dist/container-layout.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-thirteen/containers.json.gz',import.meta.url))));
test('compiled container ladders match all original feature combinations, first openers and wire roundtrips',()=>{
 let combinations=0;
 for(const row of fixture.layouts){const def=fixture.definitions[row.definition],before=JSON.stringify(def),layout=new ContainerLayout(def.ladder);
  assert.deepEqual({w:layout.w,h:layout.h},row.canvas);assert.deepEqual(layout.fullBoard(),row.full);assert(layout.matches(def.ladder));
  for(const c of row.rungAt)assert.equal(layout.rungIndexAt(c.x,c.y)??-1,c.rung);
  for(const c of row.rows){const board=layout.board(new Set(c.features));assert.deepEqual(board,c.board);if(board){assert.deepEqual(packContainerBoard(board),c.wire);assert.deepEqual(unpackContainerBoard(c.wire),c.roundtrip);}combinations++;}
  assert.equal(JSON.stringify(def),before);
 }
 assert.equal(fixture.layouts.length,81);assert(combinations>500);
});
test('container geometry owns its inputs and each returned board; live changes require a new plan',()=>{
 const ladder=[{feature:'first',cells:['#..','...']},{feature:'later',cells:['.##','###']}],layout=new ContainerLayout(ladder);
 assert.equal(layout.board(new Set(['later'])),null);const a=layout.fullBoard();a.open[0]=false;assert(layout.fullBoard().open[0]);
 ladder[0].cells[0]='.#.';assert(!layout.matches(ladder));assert(layout.board(new Set(['first'])).open[0]);
 const revised=new ContainerLayout(ladder);assert(!revised.board(new Set(['first'])).open[0]);assert(revised.board(new Set(['first'])).open[1]);
 ladder[0].feature='replacement';assert(!revised.matches(ladder));
 assert.deepEqual(unpackContainerBoard({w:2,h:2,mask:'#'}),{w:2,h:2,open:[true,false,false,false],cells:1});
 assert.equal(unpackContainerBoard({w:1,h:1,mask:'##'}).cells,1);assert.equal(containerBoardOpen(a,.5,0),false);
 assert.throws(()=>new ContainerLayout([]));assert.throws(()=>new ContainerLayout([{feature:'a',cells:['.']}]));
 assert.throws(()=>new ContainerLayout([{feature:'a',cells:['#']},{feature:'a',cells:['#']}]));
 assert.throws(()=>new ContainerLayout([{feature:'a',cells:['#'.repeat(257)]}]));assert.throws(()=>unpackContainerBoard({w:0,h:1,mask:''}));
});
