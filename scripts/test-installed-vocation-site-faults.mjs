import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,writeJSON} from './reference-utils.mjs';
import {readVocationFixture,prepareVocationObserver,prepareSiteOrderObserver,captureVocationObserver} from './vocation-reference.mjs';
import {prepareVocationFaultGame} from './vocation-installed-fault-tools.mjs';

const [flag,file]=process.argv.slice(2);assert.equal(flag,'--location');
const location=JSON.parse(fs.readFileSync(path.resolve(root,file)));
assert.equal(location.vocationSiteDecision,'SDK site filtering, seeded placement, spawn and discovery');
const {game,copy,directory,verifyUnchanged}=prepareVocationFaultGame(location,'installed-vocation-site-faults-');
const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/vocation-sites/acceptance.json')));
const expectedBytes=readVocationFixture('sites',accepted.fixtures),expected=JSON.parse(expectedBytes);
const entry=prepareVocationObserver('sites',game,directory,accepted.fixtures);
const source=fs.readFileSync(entry,'utf8'),positive='s.addedActors===1&&s.outside.credit===null&&s.unlocked.credit===1';
assert.equal(source.split(positive).length,2);fs.writeFileSync(entry,source.replace(positive,'s.addedActors===1&&s.outside.credit===null'));
const paths={rules:path.join(copy,'dist/vocation-sites.js'),placement:path.join(copy,'dist/vocation-site-placement.js'),
  world:path.join(game,'src/engine/world.ts'),binding:path.join(game,'src/engine/vocationSiteAdapter.ts')};
const originals=Object.fromEntries(Object.entries(paths).map(([key,f])=>[key,fs.readFileSync(f,'utf8')]));
const different=(a,b)=>JSON.stringify(a)!==JSON.stringify(b);
const faults=[
  ['safe-ground','rules',"zone.objective.kind === 'safe'","zone.objective.kind === 'unused'",d=>different(d.axes,expected.axes)],
  ['level-threshold','rules','zone.level < filter.minLevel','zone.level <= filter.minLevel',d=>different(d.axes,expected.axes)],
  ['unowned-territory','rules','!owner.faction || !owner.owned ||','!owner.faction ||',d=>different(d.axes,expected.axes)],
  ['radius-edge','rules','> ports.discoveryRadius()','>= ports.discoveryRadius()',d=>d.spawns.some((s,i)=>different(s.edge,expected.spawns[i].edge))],
  ['repeated-silence','rules','if (!site.silentNoted)','if (true)',d=>d.spawns.some((s,i)=>s.repeat.count>expected.spawns[i].repeat.count)],
  ['seed-salt','placement','vocsite_${vocation.id}_${zone.id}','vocsite_${zone.id}_${vocation.id}',d=>different(d.natural,expected.natural)],
  ['dressing-angle','placement','const angle = random.range(0, Math.PI * 2);','const angle = random.range(0, Math.PI);',d=>d.spawns.some((s,i)=>different(s.dressing,expected.spawns[i].dressing))],
  ['dirty-notification','binding','world.markMetaDirty(world.localSeat)','void world.localSeat',d=>d.spawns.some((s,i)=>s.positions.length!==expected.spawns[i].positions.length)],
  ['host-radial-geometry','binding','npc.pos.x+Math.cos(angle)*distance','npc.pos.x+Math.sin(angle)*distance',d=>d.spawns.some((s,i)=>different(s.dressing,expected.spawns[i].dressing))],
  ['world-zone-filter','world','this.engineVocationSites.matches(def, filter)','this.engineVocationSites.matches(def, {...filter, layouts:undefined})',d=>different(d.axes,expected.axes)],
];
const results=[];let passed=false;
try{
  assert(captureVocationObserver(entry,directory,'control').bytes.equals(expectedBytes));
  for(const [name,key,before,after,detected]of faults){
    const target=paths[key],whole=originals[key];assert.equal(whole.split(before).length,2,name);
    fs.writeFileSync(target,whole.replace(before,after));let run;
    try{run=captureVocationObserver(entry,directory,name);}finally{fs.writeFileSync(target,whole);}
    assert(!run.bytes.equals(expectedBytes)&&detected(JSON.parse(run.bytes)),name+' did not distinguish the intended change');
    results.push({name,sha256:run.sha256,logSha256:run.logSha256});
  }
  const order=prepareSiteOrderObserver(game,directory);
  assert(captureVocationObserver(order.entry,directory,'order-control').bytes.equals(order.bytes));
  const draw='ports.point(ports.width() * random.range(0.3, 0.7), ports.height() * random.range(0.3, 0.7))';
  for(const [name,key,before,after,expectedPrefix]of [
    ['selection-after-draw','placement','ports.spawn(vocation.id, '+draw+', random);','const at = '+draw+'; ports.spawn(vocation.id, at, random);',['late','changed-during-position-draw',true]],
    ['late-world-method','binding','return boundSpawn;', "return (id,at,rng) => world['spawnVocationSite'](id,at,rng);",['late','harborwarden',true]],
  ]){
    const target=paths[key],whole=originals[key];assert.equal(whole.split(before).length,2,name);
    fs.writeFileSync(target,whole.replace(before,after));let run;
    try{run=captureVocationObserver(order.entry,directory,name);}finally{fs.writeFileSync(target,whole);}
    assert.deepEqual(JSON.parse(run.bytes)[0].slice(0,3),expectedPrefix,name);
    results.push({name,sha256:run.sha256,logSha256:run.logSha256});
  }
  assert(captureVocationObserver(entry,directory,'restored').bytes.equals(expectedBytes));passed=true;
}finally{
  verifyUnchanged();writeJSON(path.join(directory,'verification.json'),{passed,directory,results,controlSha256:accepted.fixtures.sites.sha256,inputsUnchanged:true});
  console.log({passed,directory,detected:results.length});
}
