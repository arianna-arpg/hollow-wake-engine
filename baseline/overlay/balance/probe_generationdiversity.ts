import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { makeSimWorld } from '../src/sim/arena';
import { seedGlobalRandom } from '../src/sim/rng';
import { ADVENTURE_LOCALE_IDS } from '../src/data/adventureLocales';
import { landmarkComplexes, resolveComplexForm, validateLandmarkComplex, type LandmarkComplex } from '../src/world/landmarkComplexes';
import { compileLocale, localeProgram } from '../src/world/locales';
import { fragmentShape, graphProfile, localeShape, localeDifference, spatialFormIndex, GENERATION_DIVERSITY } from '../src/world/generationDiversity';
import { materializeComplex } from '../src/engine/landmarkComplexGen';
import { generateLayout } from '../src/engine/levelgen';
import { edgeBlockAt } from '../src/world/edgeBlocks';
import { Rng } from '../src/core/rng';
import type { ZoneDef } from '../src/data/zones';
import type { GridWalkField } from '../src/world/gridWalk';
import { measureExploration } from './layoutmetrics';
import { orientations, silhouetteDifference, terrainSilhouette } from './generationCritic';

seedGlobalRandom(91277);
const world=makeSimWorld('warrior',91277), regions=landmarkComplexes().filter(d=>d.forms);
const live=new Set<string>();
for(const def of regions) {
  assert.deepEqual(validateLandmarkComplex(def),[]);
  for(const form of def.forms!) {
    const resolved=resolveComplexForm(def,form);
    assert.deepEqual(validateLandmarkComplex(resolved),[]);
    for(const stage of resolved.stages) for(const id of stage.id===def.entrance?[stage.locale]:stage.locales??[stage.locale]) live.add(id);
  }
  const entryAlternatives=structuredClone(def);entryAlternatives.stages.find(s=>s.id===def.entrance)!.locales=[def.stages[0].locale];
  assert(validateLandmarkComplex(entryAlternatives).some(e=>e.includes('pinned entry')));
  const bad=structuredClone(def);delete bad.forms![0].links.find(l=>l.bountyPassage)!.bountyPassage;
  assert(validateLandmarkComplex(bad).some(e=>e.includes('preserve bountyPassage')));
}
assert(ADVENTURE_LOCALE_IDS.every(id=>live.has(id)),'registered content must have a real region path');
for(let count=1;count<=12;count++) {
  const cells=new Set<number>();
  for(let x=-20;x<=20;x++) for(let y=-4;y<=4;y++) {
    const at=(a:number,b:number)=>spatialFormIndex(719,'qa',a*950+1,b*950+1,count);
    cells.add(at(x,y));
    if(count>1) {assert.notEqual(at(x,y),at(x+1,y));assert.notEqual(at(x,y),at(x,y+1));}
  }
  assert.equal(cells.size,count,'all forms selectable, including beyond six');
}
assert.throws(()=>spatialFormIndex(1,'qa',0,0,0));
const control=compileLocale(localeProgram('village_lanes')!,171), cosmetic=structuredClone(control);
cosmetic.seed++;cosmetic.id='renamed';cosmetic.program='renamed';cosmetic.size={w:5000,h:5000};
for(const d of cosmetic.districts) {d.at[0]+=.00001;d.dress=[];}
assert.equal(localeDifference(control,cosmetic),0,'labels, seed, size, jitter and dressing earn no novelty');
const fragment=[['ground','wall','wall'],['ground','ground','water']];
assert.equal(fragmentShape(fragment),fragmentShape(fragment[0].map((_,x)=>fragment.map(r=>r[x]).reverse())));
assert.equal(fragmentShape(fragment),fragmentShape(fragment.map(r=>[...r].reverse())));
const swapped=structuredClone(control),rename=new Map(swapped.districts.map((d,i)=>[d.id,'renamed_'+i]));
for(const d of swapped.districts)d.id=rename.get(d.id)!;
for(const l of swapped.links){l.from=rename.get(l.from)!;l.to=rename.get(l.to)!;}
swapped.entrance=rename.get(swapped.entrance)!;swapped.goal=rename.get(swapped.goal)!;
assert.equal(localeDifference(control,swapped),0,'district identity is not structural variety');

function mint(def:LandmarkComplex,i:number,bank:Record<string,ZoneDef>={}):ZoneDef[] {
  const program=localeProgram(def.stages.find(s=>s.id===def.entrance)!.locale)!;
  const locale=compileLocale(program,8000+i),seed=8000+i,id=def.id+'_'+i;
  const map={x:(i%16-8)*950+137,y:(Math.floor(i/16)-2)*950+293};
  const root:ZoneDef={...structuredClone(world.zone),id,name:def.label,level:8,seed,map,locale,size:locale.size!,
    shape:'rect',layoutType:'districts',layout:[],exits:[],objective:{kind:'clear'},complex:undefined,kind:undefined,
    destination:{feature:id,name:def.label,seed:98761,seat:map,program:program.id,complex:def.id}};
  const children=materializeComplex(root,bank,def.id);bank[id]=root;
  return [root,...children];
}
const population:{family:string;samples:number;forms:number;duplicates:number;minSiblingDifference:number;maxCompileMs:number}[]=[];
for(const def of regions) {
  const signatures=new Set<string>(),forms=new Set<string>();let duplicates=0,minSiblingDifference=1,maxCompileMs=0;
  for(let i=0;i<64;i++) {
    const start=performance.now(),members=mint(def,i);maxCompileMs=Math.max(maxCompileMs,performance.now()-start);
    const root=members[0],form=def.forms!.find(f=>f.id===root.complex!.form)!;forms.add(form.id);
    const resolved=resolveComplexForm(def,form);
    assert.equal(members.length,resolved.stages.length);
    for(const stage of def.stages) {
      const member=members.find(z=>z.complex!.stage===stage.id)!;
      assert.deepEqual(member.objective,stage.objective??{kind:'clear'});
      assert.equal(member.level,8+(stage.levelDelta??0));
      if(stage.packs)assert.deepEqual(member.packs,stage.packs);
    }
    assert.deepEqual(root.locale,compileLocale(localeProgram(root.locale!.program)!,8000+i),'entry plan remains pinned');
    for(let a=0;a<members.length;a++)for(let b=a+1;b<members.length;b++)minSiblingDifference=Math.min(minSiblingDifference,localeDifference(members[a].locale!,members[b].locale!));
    const signature=graphProfile(resolved.stages.map(s=>s.id),resolved.links,resolved.entrance)+'|'+members.map(z=>JSON.stringify(localeShape(z.locale!))).sort().join('|');
    if(signatures.has(signature))duplicates++;signatures.add(signature);
    Object.assign(world.zoneMap,Object.fromEntries(members.map(z=>[z.id,z])));
    const task=members.find(z=>z.complex!.bountyPassage)!,seal=task.complex!.bountyPassage!;
    assert.equal(edgeBlockAt(world,task.id,seal.to)?.source,'bountyPassage');
    assert.equal(edgeBlockAt(world,seal.to,task.id)?.source,'bountyPassage');
    // Flood the actual saved graph with the real closed-edge predicate.
    const reached=new Set([root.id]);
    for(let pass=0;pass<members.length;pass++)for(const z of members)if(reached.has(z.id))for(const e of z.exits)if(!edgeBlockAt(world,z.id,e.to))reached.add(e.to);
    assert(reached.has(task.id)&&!reached.has(seal.to));
    assert.equal(reached.size,members.length-1);
    seal.opened=true;assert(!edgeBlockAt(world,task.id,seal.to)&&!edgeBlockAt(world,seal.to,task.id));
    const saved=JSON.parse(JSON.stringify(members));
    assert.deepEqual(materializeComplex(saved[0],Object.fromEntries(saved.map((z:ZoneDef)=>[z.id,z])),def.id),[]);
    assert.deepEqual(saved,JSON.parse(JSON.stringify(members)));
    if(def.id==='highland_pilgrimage') {
      assert.equal(members.find(z=>z.complex!.stage==='hollow')!.locale!.underTier,'overland_caverns');
      assert(members.find(z=>z.complex!.stage==='tarn')!.locale!.districts.some(d=>d.builder==='basin'));
    }
  }
  assert.equal(forms.size,def.forms!.length);assert.equal(duplicates,0,'a 64-site regional sample must not repeat its structural composition');
  assert(minSiblingDifference>=.6,'sibling selection must distinguish topology, not only a cosmetic parameter');
  population.push({family:def.id,samples:64,forms:forms.size,duplicates,minSiblingDifference,maxCompileMs});
  const forward:Record<string,ZoneDef>={},reverse:Record<string,ZoneDef>={};
  for(const i of [12,13,14])mint(def,i,forward);
  for(const i of [14,13,12])mint(def,i,reverse);
  for(const id of Object.keys(forward))assert.deepEqual(forward[id],reverse[id],'discovery order must not change terrain or graph');
}
console.log('PASS all live programs, six forms per family, 320 regions without structural duplicates, sibling critics, negative cells, preserved base objectives/levels/packs/gates and discovery-order replay');

// Exercise every morphology explicitly, at both zone size extremes.
let forced=0;
const choices=new Map<string,{program:string;variant:string;district:string;choice:string}>();
for(const id of ADVENTURE_LOCALE_IDS) for(const v of localeProgram(id)!.variants)for(const d of v.districts)for(const c of d.choices??[]) {
  const key=c.builder+JSON.stringify(c.params)+JSON.stringify(d.size);if(!choices.has(key))choices.set(key,{program:id,variant:v.id,district:d.id,choice:c.id});
}
for(const row of choices.values()) {
  const program=localeProgram(row.program)!,variant=program.variants.find(v=>v.id===row.variant)!;
  for(const scale of program.sizeScale!) {
    const def=structuredClone(program),v=def.variants.find(v=>v.id===variant.id)!,d=v.districts.find(d=>d.id===row.district)!;
    d.choices=d.choices!.filter(c=>c.id===row.choice);
    const plan=compileLocale(def,512,variant.id);plan.size={w:Math.round(program.size.w*scale),h:Math.round(program.size.h*scale)};
    const z:ZoneDef={...structuredClone(world.zone),id:'forced',seed:512,locale:plan,size:plan.size,layoutType:'districts',layout:[],complex:undefined,exits:[]};
    const entry={x:120,y:z.size.h/2},exit={x:z.size.w-120,y:z.size.h/2};
    const terrain=generateLayout(z,z.size,new Rng(512),entry,[exit]);
    assert(terrain.walk!.reachable!(entry,exit));
    for(const district of terrain.localeReport!.districts)assert(terrain.walk!.reachable!(entry,district.center),row.choice);
    forced++;
  }
}

// Finished-grid critic: every authored variant, no costume or label credit.
const terrainRows:{program:string;variant:string;seed:number;mask:number[];metrics:ReturnType<typeof measureExploration>}[]=[];
for(const sampleSeed of [20261008,17,90011])for(const id of ADVENTURE_LOCALE_IDS)for(const variant of localeProgram(id)!.variants) {
  const program=localeProgram(id)!,plan=compileLocale(program,sampleSeed,variant.id);
  if(sampleSeed!==20261008){const scale=sampleSeed===17?program.sizeScale![0]:program.sizeScale![1];plan.size={w:Math.round(program.size.w*scale),h:Math.round(program.size.h*scale)};}
  const size=plan.size!;
  const z:ZoneDef={...structuredClone(world.zone),id:'critic',seed:sampleSeed,locale:plan,size,layoutType:'districts',layout:[],complex:undefined,exits:[]};
  const entry={x:120,y:size.h/2},exit={x:size.w-120,y:size.h/2},terrain=generateLayout(z,size,new Rng(z.seed!),entry,[exit]);
  const grid=terrain.walk as GridWalkField,mask=terrainSilhouette(grid,size.w,size.h);
  for(const turned of orientations(mask))assert.equal(silhouetteDifference(mask,turned),0,'rotating or reflecting terrain cannot earn variety');
  const almost=[...mask],occupied=almost.findIndex(v=>v!==0);almost[occupied]=0;
  assert(silhouetteDifference(mask,almost)<.10,'one altered bin must be rejected as a near-clone');
  const expanded=new (grid.constructor as typeof GridWalkField)(grid.cols*60,grid.rows*60,60);
  for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++)expanded.fillRegion(x*60+1,y*60+1,x*60+59,y*60+59,grid.regionAt(x*30+15,y*30+15));
  assert(silhouetteDifference(mask,terrainSilhouette(expanded,size.w*2,size.h*2))<.10,'uniformly scaling the actual terrain must remain a near-clone');
  if(sampleSeed===20261008&&variant===program.variants[0]) {
    const shifted=structuredClone(z);for(const d of shifted.locale!.districts)d.at[0]+=.000001;
    const changed=generateLayout(shifted,size,new Rng(z.seed!),entry,[exit]).walk as GridWalkField;
    assert(silhouetteDifference(mask,terrainSilhouette(changed,size.w,size.h))<.10,'tiny actual position changes cannot evade the near-clone gate');
  }
  const metrics=measureExploration(grid,entry,[exit]);assert(metrics.exits.every(e=>e.reachable));
  terrainRows.push({program:id,variant:variant.id,seed:sampleSeed,mask,metrics});
}
// Each seed/size cohort compares the whole catalogue; distant cross-seed repeats are not forbidden.
const comparisons=terrainRows.map((a,i)=>{
  let nearest=Infinity,pair=-1;
  for(let j=0;j<terrainRows.length;j++)if(i!==j&&a.seed===terrainRows[j].seed){const diff=silhouetteDifference(a.mask,terrainRows[j].mask);if(diff<nearest){nearest=diff;pair=j;}}
  return {program:a.program,variant:a.variant,seed:a.seed,nearestDifference:nearest,nearestProgram:terrainRows[pair].program,nearestVariant:terrainRows[pair].variant};
});
const clones=comparisons.filter(r=>r.nearestDifference<.10);
assert.equal(clones.length,0,'finished terrain has near-clones: '+JSON.stringify(clones));
const graphClasses=new Set(terrainRows.map(row=>{const plan=compileLocale(localeProgram(row.program)!,row.seed,row.variant);return localeShape(plan).graph;}));
assert(graphClasses.size>=8,'names and district swaps cannot hide a repeated navigation grammar');
mkdirSync('balance/reports',{recursive:true});
writeFileSync('balance/reports/generation-diversity.json',JSON.stringify({config:GENERATION_DIVERSITY,population,forced,graphClasses:graphClasses.size,nearest:comparisons.sort((a,b)=>a.nearestDifference-b.nearestDifference),terrain:terrainRows},null,2));
const cards=terrainRows.filter((r,i)=>r.seed===20261008&&i%5===Math.floor(i/5)%5).map(row=>{
  const rects=row.mask.map((v,i)=>v?'<rect x="'+(i%32)+'" y="'+Math.floor(i/32)+'" width="1" height="1" fill="'+(v===2?'#347b9c':'#b9b793')+'"/>':'').join('');
  return '<article><div>'+row.program+'</div><small>'+row.variant+'</small><svg viewBox="0 0 32 32">'+rects+'</svg></article>';
}).join('');
writeFileSync('balance/reports/generation-contact.html','<!doctype html><meta charset="utf-8"><style>body{margin:24px;background:#10151b;color:#ddd;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}article{padding:12px;background:#202832}small{color:#8da5bb}svg{display:block;width:170px;height:146px;margin-top:10px;background:#0c1015;shape-rendering:crispEdges}</style><h1>Regional terrain critic</h1><p>Finished terrain reduced to normalized occupancy; gold: traversable ground, blue: water. Names and scenery earn no novelty.</p><main>'+cards+'</main>');
console.log('PASS '+forced+' forced morphology/size cases, '+terrainRows.length+' finished terrain critics, '+graphClasses.size+' graph classes, no within-cohort near-clones at 10% occupancy difference');
