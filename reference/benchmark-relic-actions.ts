import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {forgeItem} from '../src/engine/itemgen';import {autoPlace,bagBoard} from '../src/engine/inventory';import {bankRelic,reconcileRelicStash} from '../src/engine/accountReliquary';import {emptyReliquary} from '../src/meta/reliquary';import {RELIQUARY} from '../src/data/containers';import {mulberry32} from '../src/sim/rng';
const [root,previousGame,currentGame,output]=process.argv.slice(2);bootSimEngine();
async function load(game:string){const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href),arena=await get('src/sim/arena.ts');arena.bootSimEngine();return {...arena,...await get('src/engine/itemgen.ts'),...await get('src/engine/inventory.ts'),...await get('src/engine/accountReliquary.ts'),...await get('src/meta/reliquary.ts'),...await get('src/data/containers.ts')};}
const apis={original:{makeSimWorld,forgeItem,autoPlace,bagBoard,bankRelic,reconcileRelicStash,emptyReliquary,RELIQUARY},previousAdapter:await load(previousGame),actionAdapter:await load(currentGame)},keys=Object.keys(apis) as (keyof typeof apis)[];
const profiles=[{name:'access-query',count:1,filled:false,mode:'query',repeats:2048}, {name:'unchanged-toggle',count:1,filled:false,mode:'toggle',repeats:256},...([1,96] as const).flatMap(count=>[false,true].map(filled=>({name:`${count}-reserve-${filled?'nearly-full':'empty'}-bag-cycle`,count,filled,mode:'cycle',repeats:16})))];
function prepare(key:keyof typeof apis,p:typeof profiles[number]){
 const api=apis[key],w=api.makeSimWorld('warrior',150200),seat=w.localSeat,rng=mulberry32(150200);w.meta.modeId='immortal';w.meta.charId='benchmark';w.meta.relicScope='benchmark';w.meta.items=[];w.meta.containers={};w.account.reliquary=api.emptyReliquary();w.account.reliquary.stash.pages=8;
 for(const rung of api.RELIQUARY.ladder)w.account.features.add(rung.feature);w.account.features.add('oracle_stone');w.account.ledger.oracle_rescued=1;w.loadZone('lastlight');w.player.pos={...w.stationAnchor('oracle')!.pos};w.lastCombatAt=-999;
 const mint=(uid:number,baseId:string)=>{const item=api.forgeItem({baseId,ilvl:1,rarity:'magic',quality:1,affixes:[],rng})!;assert(item);item.uid=uid;return item;};
 for(let i=0;i<p.count;i++)assert(api.bankRelic(w.account,mint(1000+i,'relic_charm'),'benchmark'));api.reconcileRelicStash(w.account);
 if(p.filled){const board=api.bagBoard();for(let i=0;i<board.w*board.h-1;i++)assert(api.autoPlace(w.meta.items,mint(2000+i,'ring_mi_gnoll')));}
 w.restoreAccountRelics(seat);w.recalcPlayer();const expectedBag=w.meta.items.length;
 return {w,seat,expectedBag};
}
function batch(state:ReturnType<typeof prepare>,p:typeof profiles[number]):number{
 const {w,seat}=state;let sum=0;
 for(let i=0;i<p.repeats;i++){
  if(p.mode==='query')sum+=Number(w.canManageAccountRelics(seat))+Number(w.reliquaryRefusal(seat)===null);
  else if(p.mode==='toggle'){w.reliquaryToggle(seat,true);sum+=Number(w.account.reliquary.enabled);}
  else{w.withdrawRelic(seat,1000);sum+=w.meta.items.length;w.relicStashMove(seat,1000);sum+=w.meta.items.length;}
 }
 return sum;
}
function receipt(state:ReturnType<typeof prepare>){const {w,expectedBag}=state;assert.equal(w.meta.items.length,expectedBag);assert(!w.account.reliquary.carried.length);return {reliquary:w.account.reliquary,bag:w.meta.items,board:w.meta.containers.reliquary,life:w.player.life,maxLife:w.player.maxLife()};}
const results:any[]=[];
for(const p of profiles){
 const states=Object.fromEntries(keys.map(key=>[key,prepare(key,p)])) as Record<keyof typeof apis,ReturnType<typeof prepare>>,expected=batch(states.original,p),baseline=JSON.stringify(receipt(states.original)),samples=Object.fromEntries(keys.map(key=>[key,[] as number[]])) as Record<keyof typeof apis,number[]>;
 for(let warm=0;warm<3;warm++)for(const key of keys){assert.equal(batch(states[key],p),expected);assert.equal(JSON.stringify(receipt(states[key])),baseline,'Warmup state differs');}
 for(let trial=0;trial<15;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[(trial+offset)%keys.length],start=performance.now(),sum=batch(states[key],p);samples[key].push(performance.now()-start);assert.equal(sum,expected);assert.equal(JSON.stringify(receipt(states[key])),baseline,'Timed action state differs');
 }
 const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return [key,{samplesMs:samples[key],medianMs:sorted[7],p95Ms:sorted[14]}];}));
 results.push({profile:p.name,operationsPerSample:p.repeats*(p.mode==='cycle'?2:1),checksum:expected,stateSha256:createHash('sha256').update(baseline).digest('hex'),...timing});console.log(p.name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'Actual original, M14 and M15 World methods with original actor recalculation and persistence callbacks. Node simulation has no durable browser storage. Timed batches exclude setup and receipt serialization. Three warmups, 15 rotating samples, exact checksums and complete account/bag/board/life state after every batch. No device, frame, allocation or GC claim.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,fixtureSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'baseline/milestone-fifteen/relic-actions.json.gz'))).digest('hex'),results},null,2)+'\n');
