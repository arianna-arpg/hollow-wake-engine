// Measure only the existing World update boundary inside a warmed Node process.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {VOCATION_LIST,VOCATION_CFG,vocationDiscoveryKey} from '../src/data/vocations';

const restore=seedGlobalRandom(193),world=makeSimWorld('warrior',193);
try{
  const secret=VOCATION_LIST.filter(v=>v.secret);
  for(const v of secret)assert(world.devForceVocationSite(v.id));
  const all=[...world['vocationSites']].slice(-secret.length);
  assert.equal(all.length,8);
  const output=[],calls=250000;
  for(const [name,count,known] of [['empty',0,false],['one-outside',1,false],['one-discovered',1,true],
    ['eight-outside',8,false],['eight-discovered',8,true]] as const){
    world['vocationSites']=all.slice(0,count);world.player.pos={x:-10000,y:-10000};
    for(const site of all){
      world.ledger[vocationDiscoveryKey(site.vocId)]=known?1:0;
      assert(Math.hypot(world.player.pos.x-site.npc.pos.x,world.player.pos.y-site.npc.pos.y)>VOCATION_CFG.discoveryRadius);
    }
    const state=()=>({ids:world['vocationSites'].map(s=>[s.vocId,s.npc.id]),ledgers:all.map(s=>world.ledger[vocationDiscoveryKey(s.vocId)]),text:world.texts.length,dirty:[...world.metaDirty]});
    const before=state();
    for(let i=0;i<10000;i++)world['updateVocationSites']();
    const start=process.hrtime.bigint();
    for(let i=0;i<calls;i++)world['updateVocationSites']();
    const nanoseconds=Number(process.hrtime.bigint()-start);
    assert.deepEqual(state(),before);
    output.push({name,calls,nanoseconds,state:before});
  }
  fs.writeFileSync(process.argv[2],JSON.stringify(output)+'\n',{flag:'wx'});
}finally{restore();}
