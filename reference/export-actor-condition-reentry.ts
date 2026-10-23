// Private original-only failure-boundary investigation. Adversarial synchronous
// callbacks and the dead flag are deliberate setup, not ordinary gameplay.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {StatSheet,CONDITION_IDS,mod} from '../src/engine/stats';

bootSimEngine();
function sheet(){const s=new StatSheet();s.setBase('life',100);s.setBase('mana',100);s.setSource('diagnostic',[mod('damage','increased',1,undefined,'lowLife')]);return s;}
function observe(a:Actor){return {mask:a['condMask'],actorConditions:CONDITION_IDS.filter(id=>a.conditionHolds(id)),sheetConditions:CONDITION_IDS.filter(id=>a.sheet.hasCondition(id)),rose:[...a.condRose],damage:a.sheet.get('damage'),life:a.life,sheetMarkerCurrent:a['condSheet']===a.sheet};}
const courses=[];
for(const replaceSheet of [false,true])for(const kind of ['unchanged','mutate-before-apply','mutate-after-apply'] as const){
  const a=new Actor('reentry','player',{x:0,y:0});a.sheet=sheet();a.life=100;a.mana=100;a['refreshConditions']();a.condRose=[];
  if(replaceSheet)a.sheet=sheet();
  a.life=20;const publish=a.sheet.setConditions.bind(a.sheet),calls:{active:string[],before:ReturnType<typeof observe>,after:ReturnType<typeof observe>}[]=[];let entered=false;
  a.sheet.setConditions=active=>{
    const record={active:[...active],before:observe(a),after:observe(a)};calls.push(record);
    if(kind==='mutate-after-apply')publish(active);
    if(!entered){entered=true;if(kind!=='unchanged')a.life=100;a['refreshConditions']();}
    if(kind!=='mutate-after-apply')publish(active);
    record.after=observe(a);
  };
  const before=observe(a);a['refreshConditions']();const after=observe(a),callsAfterFirst=calls.length;a['refreshConditions']();
  courses.push({name:(replaceSheet?'replacement':'existing')+'-'+kind,before,after,afterUnchangedRetry:observe(a),callsAfterFirst,calls});
}
{
  const restore=seedGlobalRandom(371039);try{
    const w=makeSimWorld('warrior',371039),a=w.player;a.condRose=['lowLife','recentlyHit'];const queue=a.condRose;
    a.healedSince=5;a.gasped=true;a.dead=true;let dispatches=0;w.rollOwnProcs=()=>{dispatches++;};
    w['sweepTalentEvents'](a);
    assert.equal(dispatches,0);assert.equal(a.condRose,queue);assert.equal(queue.length,0);assert.equal(a.healedSince,0);assert.equal(a.gasped,false);
    courses.push({name:'dead-world-sweep-discards-pending-events',setup:'Dead flag, pending edges, heal and gasp deliberately seeded. Original World sweep must clear them without dispatch.',dispatches,queueIdentityPreserved:a.condRose===queue,rose:[...a.condRose],healedSince:a.healedSince,gasped:a.gasped});
  }finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({schema:'private-condition-reentry-traces/v1',courses},null,2)+'\n',{flag:'wx'});
