import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,listFiles,verifyReference,writeJSON} from './reference-utils.mjs';
import {readVocationFixture,prepareVocationObserver,captureVocationObserver} from './vocation-reference.mjs';

const read=file=>JSON.parse(fs.readFileSync(file)),ref=path.join(root,'.reference'),lock=read('baseline/source-lock.json');
const accepted=read('baseline/vocation-sites/acceptance.json');verifyReference(ref,lock);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/vocation-site-source-faults-')),game=path.join(directory,'game'),src=path.join(game,'src');
fs.cpSync(path.join(ref,'src'),src,{recursive:true});
fs.symlinkSync(path.join(ref,'node_modules'),path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
fs.copyFileSync(path.join(ref,'package.json'),path.join(game,'package.json'));
const entry=prepareVocationObserver('sites',game,directory,accepted.fixtures);
const before=fs.readFileSync(entry,'utf8');
// The radius fault can suppress credit even after unlocking. Let that course
// serialize the changed outcome so the negative control can compare the edge.
const positive='s.addedActors===1&&s.outside.credit===null&&s.unlocked.credit===1';
assert.equal(before.split(positive).length,2);
fs.writeFileSync(entry,before.replace(positive,'s.addedActors===1&&s.outside.credit===null'));
const baseline=readVocationFixture('sites',accepted.fixtures),expected=JSON.parse(baseline);
const file=path.join(src,'engine/world.ts'),original=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile('world.ts',original,ts.ScriptTarget.Latest,true);
const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
const differs=(a,b)=>JSON.stringify(a)!==JSON.stringify(b);
const changes=[
  ['safe-ground','zoneMatchesSiteFilter',"if (def.objective.kind === 'safe') return false;","if (false && def.objective.kind === 'safe') return false;",d=>differs(d.axes,expected.axes)],
  ['level-threshold','zoneMatchesSiteFilter','def.level < filter.minLevel','def.level <= filter.minLevel',d=>differs(d.axes,expected.axes)],
  ['unowned-territory','zoneMatchesSiteFilter','!own.faction || !own.owned ||','!own.faction ||',d=>differs(d.axes,expected.axes)],
  ['radius-edge','updateVocationSites','> VOCATION_CFG.discoveryRadius','>= VOCATION_CFG.discoveryRadius',d=>d.spawns.some((s,i)=>differs(s.edge,expected.spawns[i].edge))],
  ['repeated-silence','updateVocationSites','if (!site.silentNoted)','if (true)',d=>d.spawns.some((s,i)=>s.repeat.count>expected.spawns[i].repeat.count)],
  ['seed-salt','placeVocationSites','vocsite_${v.id}_${def.id}','vocsite_${def.id}_${v.id}',d=>differs(d.natural,expected.natural)],
  ['dressing-angle','spawnVocationSite','const a = rng.range(0, Math.PI * 2);','const a = rng.range(0, Math.PI);',d=>d.spawns.some((s,i)=>differs(s.dressing,expected.spawns[i].dressing))],
];
assert.deepEqual(changes.map(c=>c[0]),accepted.faults);
const capture=label=>captureVocationObserver(entry,directory,label);
const results=[];let passed=false;
try{
  assert(capture('control').bytes.equals(baseline));
  for(const [name,key,needle,replacement,predicate]of changes){
    const method=cls.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===key),body=method.getText(ast);
    assert.equal(sha256(body.replaceAll('\r\n','\n')),accepted.methodHashes[key]);assert.equal(body.split(needle).length,2,name);
    fs.writeFileSync(file,original.slice(0,method.getStart(ast))+body.replace(needle,replacement)+original.slice(method.end));
    let run;
    try{run=capture(name);}finally{fs.writeFileSync(file,original);}
    assert(!run.bytes.equals(baseline)&&predicate(JSON.parse(run.bytes)),name+' did not distinguish the intended change');
    results.push({name,sha256:run.sha256,logSha256:run.logSha256});
  }
  assert(capture('restored').bytes.equals(baseline));passed=true;
}finally{
  for(const f of listFiles(src))assert.equal(sha256(fs.readFileSync(path.join(src,f))),sha256(fs.readFileSync(path.join(ref,'src',f))),f);
  verifyReference(ref,lock);writeJSON(path.join(directory,'verification.json'),{passed,directory,results,sourceRestored:true,controlSha256:sha256(baseline)});
  console.log({passed,directory,detected:results.length});
}
