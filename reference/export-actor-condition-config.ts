import fs from 'node:fs';
import {RECENT_CFG,recentIndex,recentWindow} from '../src/engine/recency';

// Diagnostic only: use the public native timer/condition queries. Load-order
// configuration runs in its own process; no candidate SDK participates.
const beforeImport=process.argv.includes('--before-import');
if(beforeImport)RECENT_CFG.window.hit=10;
const arena=await import('../src/sim/arena');arena.bootSimEngine();
const world=arena.makeSimWorld('magician',371001),actor=world.player,index=recentIndex('hit');
function sample(label:string,body=actor){
 body.since[index]=5;body.updateTimers(0);
 return {label,secondsSinceHit:body.since[index],reportedWindow:recentWindow('hit'),sheetHolds:body.sheet.hasCondition('recentlyHit'),actorHolds:body.conditionHolds('recentlyHit')};
}
const observations=[sample('loaded')];RECENT_CFG.window.hit=beforeImport?2:10;
observations.push(sample('configuration-changed'));
const fresh=arena.makeSimWorld('magician',371002).player;observations.push(sample('fresh-actor-after-change',fresh));
fs.writeFileSync(process.argv[2],JSON.stringify({beforeImport,observations},null,2)+'\n',{flag:'wx'});
