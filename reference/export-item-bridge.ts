// Expected mode uses only the original game. Adapted mode supplies its explicit refresh hook.
import fs from 'node:fs';
import path from 'node:path';
import {bootSimEngine} from '../src/sim/arena';
import {mulberry32} from '../src/sim/rng';
import {ITEM_BASES} from '../src/data/itembases';
import {UNIQUES} from '../src/data/uniques';
import {ITEM_CFG, type ItemInstance} from '../src/engine/items';
import {rollItem,forgeItem,compileItemMods,rebuildItem,nextItemUid,bumpItemUidFloor} from '../src/engine/itemgen';
bootSimEngine();
const refresh:()=>void=process.argv.includes('--sdk')
  ? (await import(new URL('../src/engine/itemAdapter.ts',import.meta.url).href)).refreshSdkItemContent : ()=>{};
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
if(!ITEM_BASES.chest_armor||!ITEM_BASES.ring_lapis)throw new Error('Bridge workload bases are missing');
let draws=0; const random=mulberry32(712489), rng=()=>{draws++;return random();};
bumpItemUidFloor(4000000);
let expectedUid=nextItemUid()+1;
const interleaved=Array.from({length:300},(_,i)=>{
  const externalDraws=Array.from({length:i%5},()=>rng());
  const externalUid=i%7===0?nextItemUid():null;if(externalUid!==null)expectedUid++;
  const options={ilvl:1+(i%40),baseId:i%17===0?'missing':i%2?'ring_lapis':'chest_armor',rng};
  const item=i%3?rollItem(options):forgeItem({...options,rarity:'rare',fillRandom:true});
  if(item)expectedUid++;
  return {externalDraws,externalUid,item,mods:item?compileItemMods(item):null,draws,nextUid:expectedUid};
});
if(nextItemUid()!==expectedUid)throw new Error('Unexpected interleaved identity allocation');
if(interleaved.filter(row=>row.item).length!==282)throw new Error('Unexpected mint/rejection coverage');

const source=forgeItem({baseId:'ring_lapis',ilvl:21,rarity:'rare',affixes:[{id:'attr_intelligence'}],quality:.5,rng})!;
const choiceUnique=Object.values(UNIQUES).find(u=>u.choices?.length)!;
const unique=forgeItem({uniqueId:choiceUnique.id,ilvl:21,quality:.5,rng})!;
const saved:ItemInstance[]=[clone(source),clone(unique),{...clone(source),baseId:'retired-base'},
  {...clone(unique),uniqueId:'retired-unique'},
  {...clone(source),uid:9000000,implicitRolls:undefined as any,affixes:[...source.affixes.map(a=>({...a,tier:999})),{id:'retired-affix',tier:0,rolls:[.5]}],sockets:['retired-vestige',null,null,null,null,null]},
  {...clone(unique),uniqueChoices:undefined},
  {...clone(unique),uniqueChoices:Object.fromEntries(choiceUnique.choices!.map(g=>[g.id,{id:'retired-choice',rolls:[.5]}]))},
];
const restored=saved.map(input=>{
  const item=rebuildItem(clone(input));return {input,item,mods:item?compileItemMods(item):null};
});
const postRestore=forgeItem({baseId:'ring_lapis',ilvl:1,quality:1,rng});

const implicit=ITEM_BASES.ring_lapis.implicits![0], beforeRange=[...implicit.range] as [number,number];
const counts=ITEM_CFG.rare.countWeights;
const refreshRows:{phase:string;mods:ReturnType<typeof compileItemMods>;item:ItemInstance|null;draws:number}[]=[];
const observe=(phase:string)=>refreshRows.push({phase,mods:compileItemMods(source),
  item:rollItem({baseId:'ring_lapis',ilvl:21,rarity:'rare',rng}),draws});
observe('before');
try {
  implicit.range=[beforeRange[0]*2,beforeRange[1]*2];
  ITEM_CFG.rare.countWeights=[{count:0,weight:1}];
  refresh();observe('edited');
} finally { implicit.range=beforeRange;ITEM_CFG.rare.countWeights=counts;refresh(); }
observe('restored');
fs.mkdirSync(process.argv[2],{recursive:true});
fs.writeFileSync(path.join(process.argv[2],'item-bridge.json'),JSON.stringify({schemaVersion:1,interleaved,restored,postRestore,refreshRows,draws,nextUid:nextItemUid()})+'\n');
console.log('Recorded 300 interleaved RNG/identity steps, seven save migrations and explicit content refresh.');
