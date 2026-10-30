import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';import {hitSustainDecision} from '../adapters/hollow-wake/integrate-hit-sustain.mjs';
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--location');
const location=JSON.parse(fs.readFileSync(path.resolve(root,args[1]))),game=fs.realpathSync(location.game);
assert(game.startsWith(path.join(root,'.artifacts')+path.sep),'Fault tests require a disposable adapter inside this repository');assert.equal(location.hitSustainDecision,hitSustainDecision);
const installed=fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine'));assert(installed.startsWith(path.join(root,'.artifacts')+path.sep));
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
assert.deepEqual(snapshot(path.join(installed,'dist')),snapshot(path.join(root,'dist')));
const before=snapshot(path.join(game,'src')),pkg=snapshot(installed),file=path.join(installed,'dist/hit-sustain.js'),bytes=fs.readFileSync(file),source=bytes.toString('utf8');
const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/hit-sustain/acceptance.json'))),expected=gunzipSync(fs.readFileSync(path.join(root,accepted.observations)));
assert.equal(sha256(expected),accepted.observationsSha256);const helper=fs.readFileSync(path.join(root,accepted.helper),'utf8');assert.equal(sha256(helper),accepted.helperSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/game-hit-sustain-faults-')),runtime=path.join(directory,'capture.ts');
fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
const faults=[
 ['siphon-truthiness','def.siphon &&','(def.siphon ?? 0) > 0 &&'],
 ['sharing-radius','> ports.sharingRadius','>= ports.sharingRadius'],
 ['sharing-snapshot','for (const ally of ports.actors())','for (const ally of [...ports.actors()])'],
 ['bond-feed-default','def.bondFeed ?? 1','def.bondFeed || 1'],
 ['tree-story-origin','ports.sameStory(tree, target)','ports.sameStory(tree, caster)'],
 ['tree-base-default','tree.construct.baseRadius ?? tree.radius','tree.construct.baseRadius || tree.radius'],
];
const errors=value=>value.rows.flatMap(row=>row.steps.filter(step=>!step.error?.$undefined).map(step=>[row.name,step.error.message]));
const expectedErrors=errors(JSON.parse(expected)),results=[];let passed=false;
try{
 for(const[name,needle,replacement]of [['control',null,null],...faults]){
  if(needle){assert.equal(source.split(needle).length-1,1,name);fs.writeFileSync(file,source.replace(needle,replacement));}
  const out=path.join(directory,name+'.json'),fd=fs.openSync(path.join(directory,name+'.txt'),'wx');
  try{execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out],{cwd:game,stdio:['ignore',fd,fd],timeout:180000});}
  finally{fs.closeSync(fd);fs.writeFileSync(file,bytes);}
  const actual=fs.readFileSync(out),matches=actual.equals(expected);assert.equal(matches,name==='control',name);
  const value=JSON.parse(actual);assert.equal(value.rows.length,98);assert.deepEqual(errors(value),expectedErrors,'Fault introduced an unrelated exception: '+name);
  const compressed=gzipSync(actual,{level:9});assert(gunzipSync(compressed).equals(actual));fs.writeFileSync(out+'.gz',compressed,{flag:'wx'});fs.unlinkSync(out);
  results.push({name,detected:name!=='control',sha256:sha256(actual),compressedSha256:sha256(compressed),matches});
 }passed=true;
}finally{fs.writeFileSync(file,bytes);assert.deepEqual(snapshot(path.join(game,'src')),before);assert.deepEqual(snapshot(installed),pkg);
 const report={passed,directory,game,faults:results.filter(r=>r.detected).length,results,sourceAndPackageRestored:true,sourceMapSha256:sha256(JSON.stringify(before)),packageMapSha256:sha256(JSON.stringify(pkg))};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/game-hit-sustain-fault-verification.json'),report);console.log({passed,directory,faults:report.faults});}
