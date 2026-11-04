import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,listFiles,verifyReference,writeJSON} from './reference-utils.mjs';
import {readVocationFixture,prepareVocationObserver,prepareSiteOrderObserver,checkVocationObserverTypes,captureVocationObserver} from './vocation-reference.mjs';

const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/vocation-sites/acceptance.json')));
const lockFile=path.join(root,'baseline/source-lock.json'),ref=path.join(root,'.reference');
assert.equal(sha256(fs.readFileSync(lockFile)),accepted.sourceLockSha256);
const lock=JSON.parse(fs.readFileSync(lockFile));verifyReference(ref,lock);
const flags=process.argv.slice(2);assert(flags.length===0||flags.length===2&&flags[0]==='--location');
const game=flags.length?fs.realpathSync(JSON.parse(fs.readFileSync(path.resolve(root,flags[1]))).game):ref;
const observed=[path.join(ref,'src')];
if(game!==ref)observed.push(path.join(game,'src'),path.join(game,'node_modules/@hollow-wake/engine'));
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(f=>[f,sha256(fs.readFileSync(path.join(dir,f)))]));
const before=observed.map(snapshot);
const ast=ts.createSourceFile('world.ts',fs.readFileSync(path.join(ref,'src/engine/world.ts'),'utf8'),ts.ScriptTarget.Latest,true);
const world=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='World');
for(const [name,digest]of Object.entries(accepted.methodHashes)){
  const method=world.members.find(m=>ts.isMethodDeclaration(m)&&m.name.getText(ast)===name);
  assert(method);assert.equal(sha256(method.getText(ast).replaceAll('\r\n','\n')),digest,name);
}
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/reference-vocation-sites-'));
const entry=prepareVocationObserver('sites',game,directory,accepted.fixtures);
const order=prepareSiteOrderObserver(game,directory);
let passed=false,types,run,orderRun;
try{
  types=checkVocationObserverTypes(directory,[entry,order.entry]);
  run=captureVocationObserver(entry,directory,'observations');
  assert(run.bytes.equals(readVocationFixture('sites',accepted.fixtures)),'Vocation-site observations differ from the frozen game');
  const record=JSON.parse(run.bytes),expected=accepted.cases;
  assert.equal(record.spawns.length,expected.definitions);assert.equal(record.filterCases.length,expected.filterDecisions);
  assert.equal(record.axes.length,expected.controlledFilterDecisions);assert.equal(record.natural.length,expected.zoneSeedInputs);
  assert.equal(record.natural.filter(z=>z.sites.length).length,expected.withShrines);assert.equal(record.loaded.length,expected.normalZoneReloads);
  assert.equal(record.harbors.length,expected.completedHarborDefenses);
  assert(record.harbors.every(h=>h.before.stone.length===0&&h.won.stone.length===1&&h.heard.credit===1&&h.revisit.stone.length===1));
  orderRun=captureVocationObserver(order.entry,directory,'spawn-order');
  assert(orderRun.bytes.equals(order.bytes),'Changed selection or receiver during a position draw');
  passed=true;
}finally{
  observed.forEach((dir,i)=>assert.deepEqual(snapshot(dir),before[i]));verifyReference(ref,lock);
  writeJSON(path.join(directory,'verification.json'),{passed,directory,game,typesLogSha256:types,observationsSha256:run?.sha256,spawnOrderSha256:orderRun?.sha256,logSha256:run?.logSha256,inputsUnchanged:true});
  console.log({passed,directory,game,observationsSha256:run?.sha256});
}
