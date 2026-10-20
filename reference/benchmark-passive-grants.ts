import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { makeSimWorld } from '../src/sim/arena';
import { CLASSES } from '../src/data/classes';
import { forgeItem } from '../src/engine/itemgen';
import { mulberry32 } from '../src/sim/rng';
const sdk=process.argv[2],out=process.argv[3];
const bytes=fs.readFileSync(path.join(sdk,'baseline/milestone-eight/passives.json.gz'));
const fixture=JSON.parse(gunzipSync(bytes).toString('utf8'));
const w=makeSimWorld('magician',31981),m=w.meta,p=w.player;
const cases=fixture.scenarios.filter((s:any)=>s.name.startsWith('authored-')).map((s:any,i:number)=>{
  const state=s.steps.at(-1).expected,c=CLASSES.find(c=>c.id===state.classId)!;
  return {classDef:c,baseAttrs:{...c.attributes},allocated:new Set<string>(state.allocated),choices:state.choices,
    item:forgeItem({baseId:'ring_lapis',ilvl:35,rarity:'rare',quality:.6,affixes:[{id:'attr_intelligence'}],rng:mulberry32(i+71)})!};
});
function rebuild(c:typeof cases[number]):void {
  m.classDef=c.classDef;m.baseAttrs=c.baseAttrs;m.allocated=c.allocated;m.choices=c.choices;m.equipped.ring1=c.item;
  w.recalcPlayer();
}
const results=cases.map((c:typeof cases[number])=>{rebuild(c);return {attributes:m.attrs,conduits:p.wornConduits??[],
  sources:p.sheet.sourceNames().map(id=>[id,p.sheet.getSourceMods(id)]),life:p.sheet.get('life'),mana:p.sheet.get('mana')};});
let checksum=0;
function run():number {
  const start=performance.now();
  for(let repetition=0;repetition<3;repetition++)for(const c of cases){rebuild(c);checksum+=m.attrs.intelligence;}
  return performance.now()-start;
}
for(let i=0;i<6;i++)run();
const samplesMs=Array.from({length:25},run),sorted=[...samplesMs].sort((a,b)=>a-b);
const receipt={scope:'Whole World.recalcPlayer with final allocations from 39 class policy traces and one rare Lapis Ring; 117 rebuilds per sample. Includes item compilation and unchanged host rebuild work; excludes rendering, initial content compilation and fixture setup.',
  node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,
  fixtureSha256:crypto.createHash('sha256').update(bytes).digest('hex'),cases:cases.length,rebuildsPerSample:cases.length*3,
  derivedSha256:crypto.createHash('sha256').update(JSON.stringify(results)).digest('hex'),
  samplesMs,medianMs:sorted[12],p95Ms:sorted[23],checksum,
  limits:['Desktop only; no Steam Deck or older mobile measurements.','Total allocation and retained heap are not measured.','This is a cumulative game-adapter comparison; it does not isolate passive-grant CPU cost.']};
fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({rebuilds:receipt.rebuildsPerSample,medianMs:receipt.medianMs,derivedSha256:receipt.derivedSha256}));
