import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Rng} from '../src/core/rng';
import {VOCATION_LIST} from '../src/data/vocations';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import type {World} from '../src/engine/world';

const restore=seedGlobalRandom(193),world=makeSimWorld('warrior',193);
const vocation=VOCATION_LIST.find(v=>v.id==='harborwarden')!;
const id=vocation.id,range=Rng.prototype.range,spawn=world['spawnVocationSite'],matches=world['zoneMatchesSiteFilter'];
const calls: (string | number | boolean)[][]=[];
try{
  world['zoneMatchesSiteFilter']=(_zone,filter)=>filter===vocation.secret!.site.filter;
  world['spawnVocationSite']=function(this:World,selected,at){
    calls.push(['first',selected,this===world,at.x,at.y]);return true;
  };
  let changed=false;
  Rng.prototype.range=function(min,max){
    if(min===0.3&&max===0.7&&!changed){
      changed=true;vocation.id='changed-during-position-draw';
      world['spawnVocationSite']=function(this:World,selected,at){
        calls.push(['late',selected,this===world,at.x,at.y]);return true;
      };
    }
    return range.call(this,min,max);
  };
  world['placeVocationSites'](world.zone);
  assert(changed);assert.equal(calls.length,1);
  fs.writeFileSync(process.argv[2],JSON.stringify(calls)+'\n',{flag:'wx'});
}finally{
  world['spawnVocationSite']=spawn;world['zoneMatchesSiteFilter']=matches;
  Rng.prototype.range=range;vocation.id=id;restore();
}
