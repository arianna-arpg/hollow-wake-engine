import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON,listFiles} from './reference-utils.mjs';

// Execute the unchanged original player-interaction courses. Their relative
// paths resolve only inside a fresh directory with fresh account/run saves.
const [gameFlag,gameArg,distFlag,distArg,electronFlag,electronArg,...extra]=process.argv.slice(2);
assert.deepEqual([gameFlag,distFlag,electronFlag],['--game','--dist','--electron']);assert.equal(extra.length,0);
const game=fs.realpathSync(gameArg),dist=fs.realpathSync(distArg),electron=fs.realpathSync(electronArg);
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const build=JSON.parse(fs.readFileSync(path.join(dist,'sdk-build.json')));
assert.equal(build.originalItems,false);assert.equal(build.originalEscape,false);
const snapshot=directory=>Object.fromEntries(listFiles(directory).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]));
const sdk=fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine'));
const sourceBefore=snapshot(path.join(game,'src')),runtimeBefore=snapshot(path.join(sdk,'dist')),distBefore=snapshot(dist);
assert.deepEqual(sourceBefore,build.sourceSha256);assert.deepEqual(runtimeBefore,build.runtimeSha256);
for(const [file,digest]of Object.entries(build.outputs))assert.equal(distBefore[file],digest,file);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/unlock-ui-'));
const report={passed:false,directory,game,dist,platform:process.platform,architecture:process.arch,
 electronSha256:sha256(fs.readFileSync(electron)),buildSha256:sha256(fs.readFileSync(path.join(dist,'sdk-build.json'))),courses:[]};
const courses=[
 ['vault-progression-ui.cjs','VAULT PROGRESSION UI PASS'],
 ['vault-discovery-ui.cjs','PASS vault discovery UI:'],
 ['memory-unlocks-ui.cjs','PASS memory UI:'],
];
try{
 for(const [name,marker]of courses){
  const relative='balance/'+name,source=path.join(game,relative),bytes=fs.readFileSync(source);
  assert.equal(sha256(bytes),lock.files[relative],'Original UI course differs: '+name);
  const folder=path.join(directory,name.replace('.cjs','')),balance=path.join(folder,'balance');
  fs.mkdirSync(balance,{recursive:true});fs.mkdirSync(path.join(balance,'reports'));
  fs.cpSync(path.join(game,'launcher'),path.join(folder,'launcher'),{recursive:true});
  fs.symlinkSync(dist,path.join(folder,'dist'),process.platform==='win32'?'junction':'dir');
  const script=path.join(balance,name),log=path.join(folder,'renderer.txt');fs.writeFileSync(script,bytes,{flag:'wx'});
  const fd=fs.openSync(log,'wx');let result;
  try{result=spawnSync(electron,[script],{cwd:folder,stdio:['ignore',fd,fd],windowsHide:true,timeout:150000});}
  finally{fs.closeSync(fd);}
  assert(!result.error,result.error?.message);assert.equal(result.signal,null);assert.equal(result.status,0,name+': '+log);
  assert(fs.readFileSync(log,'utf8').includes(marker),'Missing successful course completion: '+name);
  report.courses.push({name,passed:true,courseSha256:sha256(bytes),logSha256:sha256(fs.readFileSync(log)),
   screenshots:fs.readdirSync(path.join(balance,'reports')).filter(file=>file.endsWith('.png')).map(file=>({file,sha256:sha256(fs.readFileSync(path.join(balance,'reports',file)))}))});
  writeJSON(path.join(directory,'progress.json'),report);console.log({passed:name});
 }
 report.passed=true;
}finally{
 assert.deepEqual(snapshot(path.join(game,'src')),sourceBefore);assert.deepEqual(snapshot(path.join(sdk,'dist')),runtimeBefore);assert.deepEqual(snapshot(dist),distBefore);
 report.sourcePreserved=true;report.runtimePreserved=true;report.buildPreserved=true;
 writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/unlock-ui-latest.json'),report);console.log({passed:report.passed,directory});
}
