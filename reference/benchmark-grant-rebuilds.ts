import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {makeSimWorld} from '../src/sim/arena';
import {CLASSES} from '../src/data/classes';
import {ITEM_BASES} from '../src/data/itembases';
import {EQUIP_SLOTS} from '../src/engine/items';
import {forgeItem} from '../src/engine/itemgen';
import {mulberry32} from '../src/sim/rng';

const [root,previous,current,output]=process.argv.slice(2);
async function load(game:string) {
  const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);
  return {...await get('src/sim/arena.ts'),...await get('src/data/classes.ts'),...await get('src/data/itembases.ts'),
    ...await get('src/engine/items.ts'),...await get('src/engine/itemgen.ts'),...await get('src/sim/rng.ts')};
}
const apis={original:{makeSimWorld,CLASSES,ITEM_BASES,EQUIP_SLOTS,forgeItem,mulberry32},previous:await load(previous),current:await load(current)};
const keys=Object.keys(apis) as (keyof typeof apis)[];
const fixtureBytes=fs.readFileSync(path.join(root,'baseline/milestone-eight/passives.json.gz'));
const selections=JSON.parse(gunzipSync(fixtureBytes).toString()).scenarios.filter((s:any)=>s.name.startsWith('authored-'));
assert.equal(selections.length,39);
function prepare(key:keyof typeof apis,full:boolean) {
  const api=apis[key],world=api.makeSimWorld('magician',31981);
  const cases=selections.map((s:any,i:number)=>{
    const selected=s.steps.at(-1).expected,c=api.CLASSES.find((c:any)=>c.id===selected.classId)!;
    const slots=full?api.EQUIP_SLOTS.filter((s:any)=>s.enabled):api.EQUIP_SLOTS.filter((s:any)=>s.id==='ring1');
    const equipped=Object.fromEntries(slots.map((slot:any,j:number)=>{
      const bases=Object.values(api.ITEM_BASES) as {id:string;category:string}[];
      const base=slot.id==='ring1'?'ring_lapis':bases.find(b=>slot.accepts.includes(b.category))?.id;
      assert(base,`No authored base for ${slot.id}`);
      const item=api.forgeItem({baseId:base,ilvl:35,rarity:'rare',quality:.6,affixes:[{id:'attr_intelligence'}],rng:api.mulberry32(i+71+j*101)})!;
      assert(item);item.uid=1000+i*32+j;return [slot.id,item];
    }));
    return {classDef:c,baseAttrs:{...c.attributes},allocated:new Set<string>(selected.allocated),choices:selected.choices,equipped};
  });
  return {world,cases};
}
function apply(state:ReturnType<typeof prepare>,c:any) {
  const m=state.world.meta;m.classDef=c.classDef;m.baseAttrs=c.baseAttrs;m.allocated=c.allocated;m.choices=c.choices;m.equipped=c.equipped;
  state.world.recalcPlayer();
}
function receipt(state:ReturnType<typeof prepare>) {
  const w=state.world,p=w.player;
  return JSON.stringify({attributes:w.meta.attrs,conduits:p.wornConduits??[],sources:p.sheet.sourceNames().map((id:string)=>[id,p.sheet.getSourceMods(id)]),life:p.sheet.get('life'),mana:p.sheet.get('mana')});
}
function batch(state:ReturnType<typeof prepare>) {
  let checksum=0;for(let repeat=0;repeat<3;repeat++)for(const c of state.cases){apply(state,c);checksum+=state.world.meta.attrs.intelligence;}
  return checksum;
}
const results=[];
for(const full of [false,true]) {
  const states=Object.fromEntries(keys.map(k=>[k,prepare(k,full)])) as Record<keyof typeof apis,ReturnType<typeof prepare>>;
  const expected=states.original.cases.map((c:any)=>{apply(states.original,c);return receipt(states.original);});
  const verify=(key:keyof typeof apis)=>states[key].cases.forEach((c:any,i:number)=>{apply(states[key],c);assert.equal(receipt(states[key]),expected[i],`${key}: ${c.classDef.id}`);});
  const checksum=batch(states.original),samples=Object.fromEntries(keys.map(k=>[k,[] as number[]])) as Record<keyof typeof apis,number[]>;
  for(let warm=0;warm<6;warm++)for(const key of keys){assert.equal(batch(states[key]),checksum);verify(key);}
  for(let trial=0;trial<25;trial++)for(let offset=0;offset<keys.length;offset++) {
    const key=keys[(trial+offset)%keys.length],start=performance.now(),actual=batch(states[key]);
    samples[key].push(performance.now()-start);assert.equal(actual,checksum);verify(key);
  }
  const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return[key,{samplesMs:samples[key],medianMs:sorted[12],p95Ms:sorted[23]}];}));
  const name=full?'full-equipment':'one-ring';results.push({name,cases:39,equippedSlots:Object.keys(states.original.cases[0].equipped).length,rebuildsPerSample:117,checksum,derivedSha256:createHash('sha256').update(JSON.stringify(expected)).digest('hex'),...timing});
  console.log(name+': '+keys.map(k=>k+'='+timing[k].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'Actual World.recalcPlayer over 39 recorded class allocations and authored rare gear. Static loadouts supplied directly for rebuild measurement; this is not an equip-eligibility test. Six warmups, 25 rotating samples, 117 rebuilds per sample. Every class derived state checked outside timing after every batch. No profiler, rendering, native host, device or allocation/GC claim.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,fixtureSha256:createHash('sha256').update(fixtureBytes).digest('hex'),results},null,2)+'\n');
