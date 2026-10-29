// Focused observer addendum: retain every candidate body, including beyond the cap.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {mod} from '../src/engine/stats';
import {STATUS_DEFS} from '../src/engine/status';
bootSimEngine();
const rows=[];
for(const count of [0,1,6,7,12])for(const silent of [false,true]){
  const restore=seedGlobalRandom(711);
  try{
    const w=makeSimWorld('guardian',711);w.actors=[w.player];w.player.pos={x:10000,y:10000};
    const bodies=Array.from({length:count+1},(_,i)=>{const a=w.createMonster('zombie',1,'enemy');a.id=100+i;a.noBounty=true;a.pos={x:100+i,y:100};a.skills=[];a.stationary=true;a.sheet.setSource('observer',[mod('life','override',10000)]);a.fillResources();w.actors.push(a);return a;});
    const [carrier]=bodies;carrier.applyStatus('burn',10,1,'original',{casterId:w.player.id,propagates:true,leech:.2,power:2});const status=carrier.statuses.find(s=>s.id==='burn');assert(status);status.total=8;
    const calls:unknown[]=[];for(const a of bodies){const apply=a.applyStatus.bind(a);a.applyStatus=(...args)=>{calls.push({id:a.id,args});apply(...args);};}
    w.kill(carrier,silent,w.player);
    rows.push({count,silent,calls,bodies:bodies.map(a=>({id:a.id,dead:a.dead,statuses:a.statuses,life:a.life})),flashes:w.flashes});
  }finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,definition:STATUS_DEFS.burn,courses:rows.length,rows},null,2)+'\n');
console.log('Observed all recipients in 10 original death-propagation courses');
