import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {forgeItem} from '../src/engine/itemgen';import {autoPlace,bagBoard} from '../src/engine/inventory';import {registerContainer} from '../src/engine/containers';import {CONTAINER_DEFS} from '../src/data/containers';import {mulberry32,seedGlobalRandom} from '../src/sim/rng';
const [root,previousGame,currentGame,output]=process.argv.slice(2);bootSimEngine();
async function load(game:string){const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href),arena=await get('src/sim/arena.ts');arena.bootSimEngine();return {...arena,...await get('src/engine/itemgen.ts'),...await get('src/engine/inventory.ts'),...await get('src/engine/containers.ts'),...await get('src/data/containers.ts')};}
const apis={original:{makeSimWorld,forgeItem,autoPlace,bagBoard,registerContainer,CONTAINER_DEFS},previousAdapter:await load(previousGame),equipmentAdapter:await load(currentGame)},keys=Object.keys(apis) as (keyof typeof apis)[];
for(const api of Object.values(apis)){const def=api.registerContainer({id:'sdk_benchmark_case',label:'benchmark case',glyph:'B',icon:'reliquary',blurb:'Synthetic benchmark.',accepts:{categories:['ring']},active:true,ladder:[{feature:'sdk_benchmark_case',label:'Case',description:'Case',cost:0,cells:['###','###']}]});(api.CONTAINER_DEFS as any[]).push(def);}
const profiles=[{name:'bag-swap-pairs',mode:'bag',filled:false,repeats:512},{name:'container-swap-pairs',mode:'board',filled:false,repeats:128},{name:'worn-ring-swap-pairs',mode:'worn',filled:false,repeats:32},...([false,true].flatMap(filled=>['equip','container'].map(mode=>({name:`${mode}-cycle-${filled?'nearly-full':'empty'}-bag`,mode,filled,repeats:32}))))];
function prepare(key:keyof typeof apis,p:typeof profiles[number]){
 const restore=seedGlobalRandom(160300),api=apis[key];try{const w=api.makeSimWorld('magician',160300),seat=w.localSeat,rng=mulberry32(160300);w.meta.items=[];w.meta.equipped={};w.meta.containers={};w.account.features.add('sdk_benchmark_case');
 const mint=(uid:number)=>{const item=api.forgeItem({baseId:'ring_lapis',ilvl:1,rarity:'magic',quality:.7,affixes:[],rng})!;assert(item);item.uid=uid;return item;};const a=mint(1000),b=mint(1001);
 if(p.mode==='worn'){w.meta.equipped.ring1=a;w.meta.equipped.ring2=b;}
 else if(p.mode==='board'){a.x=0;a.y=0;b.x=1;b.y=0;w.meta.containers.sdk_benchmark_case=[a,b];}
 else{assert(api.autoPlace(w.meta.items,a));if(p.mode==='bag')assert(api.autoPlace(w.meta.items,b));}
 if(p.filled){const board=api.bagBoard();for(let i=1;i<board.w*board.h;i++)assert(api.autoPlace(w.meta.items,mint(2000+i)));}
 w.recalcPlayer();return {w,seat,a};}finally{restore();}
}
function batch(s:ReturnType<typeof prepare>,p:typeof profiles[number]){const {w,seat,a}=s;let sum=0;
 for(let i=0;i<p.repeats;i++){
  if(p.mode==='bag'){w.moveBagItem(seat,a.uid,1,0);sum+=a.x!;w.moveBagItem(seat,a.uid,0,0);sum+=a.x!;}
  else if(p.mode==='board'){w.containerMove(seat,'sdk_benchmark_case',a.uid,1,0);sum+=a.x!;w.containerMove(seat,'sdk_benchmark_case',a.uid,0,0);sum+=a.x!;}
  else if(p.mode==='worn'){w.equipItem(seat,a.uid,'ring2');sum+=Number(w.meta.equipped.ring2===a);w.equipItem(seat,a.uid,'ring1');sum+=Number(w.meta.equipped.ring1===a);}
  else if(p.mode==='equip'){w.equipItem(seat,a.uid,'ring1');sum+=Number(w.meta.equipped.ring1===a);w.unequipItem(seat,'ring1');sum+=Number(w.meta.items.includes(a));}
  else{w.containerPlace(seat,'sdk_benchmark_case',a.uid,0,0);sum+=Number(w.meta.containers.sdk_benchmark_case?.includes(a));w.containerTake(seat,'sdk_benchmark_case',a.uid);sum+=Number(w.meta.items.includes(a));}
 }return sum;
}
function receipt(s:ReturnType<typeof prepare>){const w=s.w;return JSON.stringify({bag:w.meta.items,equipped:w.meta.equipped,containers:w.meta.containers,account:w.account.reliquary,attributes:w.player.attributeValues,life:w.player.life,maxLife:w.player.maxLife(),drops:w.drops});}
const results:any[]=[];
for(const p of profiles){const states=Object.fromEntries(keys.map(key=>[key,prepare(key,p)])) as Record<keyof typeof apis,ReturnType<typeof prepare>>,expected=batch(states.original,p),baseline=receipt(states.original),samples=Object.fromEntries(keys.map(key=>[key,[] as number[]])) as Record<keyof typeof apis,number[]>;
 for(let warm=0;warm<3;warm++)for(const key of keys){assert.equal(batch(states[key],p),expected);assert.equal(receipt(states[key]),baseline,'Warmup state differs');}
 for(let trial=0;trial<15;trial++)for(let offset=0;offset<keys.length;offset++){const key=keys[(trial+offset)%keys.length],start=performance.now(),sum=batch(states[key],p);samples[key].push(performance.now()-start);assert.equal(sum,expected);assert.equal(receipt(states[key]),baseline,'Timed state differs');}
 const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return [key,{samplesMs:samples[key],medianMs:sorted[7],p95Ms:sorted[14]}];}));results.push({profile:p.name,operationsPerSample:p.repeats*2,checksum:expected,stateSha256:createHash('sha256').update(baseline).digest('hex'),...timing});console.log(p.name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'Actual original, M15 and M16 World methods with original actor recalculation and persistence callbacks. Synthetic generic container exercises the extension API. Node has no durable browser storage. Setup and receipt serialization excluded. Three warmups, 15 rotating samples, intermediate ownership/coordinate checksums and complete final states match every batch. No device, frame, allocation or GC claim.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,fixtureSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'baseline/milestone-sixteen/equipment-actions.json.gz'))).digest('hex'),results},null,2)+'\n');
