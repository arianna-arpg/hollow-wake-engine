import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';

const snapshot = dir => Object.fromEntries(listFiles(dir).map(file => [file,sha256(fs.readFileSync(path.join(dir,file)))]));

export function verifyInstalledProcFaults({label,decisionKey,decision,binding,faults}) {
  const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--location');
  const location=JSON.parse(fs.readFileSync(path.resolve(root,args[1])));
  assert.equal(location[decisionKey],decision);
  const game=fs.realpathSync(location.game),installed=fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine'));
  for(const dir of [game,installed])assert(dir.startsWith(path.join(root,'.artifacts')+path.sep),'Requires a disposable installation');
  assert.deepEqual(snapshot(path.join(installed,'dist')),snapshot(path.join(root,'dist')));
  const sourceBefore=snapshot(path.join(game,'src')),packageBefore=snapshot(installed);
  const files={runtime:path.join(installed,'dist',label+'.js'),binding:path.join(game,'src/engine',binding+'.ts'),world:path.join(game,'src/engine/world.ts')};
  const originals=new Map();
  for(const [kind,file] of Object.entries(files)) {
    const relative=path.relative(kind==='runtime'?installed:game,fs.realpathSync(file));
    assert(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Fault target escapes the selected installation');
    const stat=fs.lstatSync(file);
    assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'Fault target must be a private regular file');
    originals.set(kind,fs.readFileSync(file));
  }
  const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/proc-delivery/acceptance.json')));
  const expectedBytes=gunzipSync(fs.readFileSync(path.join(root,accepted.observations)));
  assert.equal(sha256(expectedBytes),accepted.observationsSha256);
  const expected=JSON.parse(expectedBytes),expectedRows=new Map(expected.rows.map(row=>[row.name,row]));
  const helper=fs.readFileSync(path.join(root,accepted.helper),'utf8');assert.equal(sha256(helper),accepted.helperSha256);
  const directory=fs.mkdtempSync(path.join(root,'.artifacts/game-'+label+'-faults-')),capture=path.join(directory,'capture.ts');
  fs.writeFileSync(capture,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
  const selectedFaults=typeof faults==='function'?faults(originals.get('world').toString()):faults;
  for(const [name,kind,needle,,course,count=1] of selectedFaults) {
    assert(Number.isInteger(count)&&count>0,name+' empty mutation');
    assert.equal(originals.get(kind).toString().split(needle).length-1,count,name);
    assert(expectedRows.has(course),course);
  }
  const results=[],controlled=new Set();
  function run(name,course,fault) {
    const output=path.join(directory,name+'.json'),log=path.join(directory,name+'.txt');
    const fd=fs.openSync(log,'wx');
    try {
      if(fault)fs.writeFileSync(files[fault[1]],originals.get(fault[1]).toString().replaceAll(fault[2],fault[3]));
      execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,capture,output,course],
        {cwd:game,stdio:['ignore',fd,fd],windowsHide:true,timeout:180000});
    } finally {
      fs.closeSync(fd);if(fault)fs.writeFileSync(files[fault[1]],originals.get(fault[1]));
    }
    const bytes=fs.readFileSync(output),value=JSON.parse(bytes),correct=expectedRows.get(course);
    assert.equal(value.courses,1);assert.equal(value.rows.length,1);assert.deepEqual(value.authored,expected.authored);
    const row=value.rows[0];assert.equal(row.name,course);
    assert.deepEqual(row.steps.map(s=>[s.name,s.error,s.expectedError]),correct.steps.map(s=>[s.name,s.error,s.expectedError]),name+' unrelated error');
    const matches=JSON.stringify(row)===JSON.stringify(correct);
    const compressed=gzipSync(bytes,{level:9});assert(gunzipSync(compressed).equals(bytes));
    fs.writeFileSync(output+'.gz',compressed);fs.unlinkSync(output);
    results.push({name,course,control:!fault,matches,observationsSha256:sha256(bytes),logSha256:sha256(fs.readFileSync(log))});
    writeJSON(path.join(directory,'progress.json'),{results});
    assert.equal(matches,!fault,name+' wrong detection outcome');console.log(name+' passed');
  }
  let passed=false;
  try {
    for(const fault of selectedFaults) {
      const course=fault[4];
      if(!controlled.has(course)){run('control-'+course,course);controlled.add(course);}
      run(fault[0],course,fault);
    }
    passed=true;
  } finally {
    assert.deepEqual(snapshot(path.join(game,'src')),sourceBefore);assert.deepEqual(snapshot(installed),packageBefore);
    const report={passed,directory,game,faults:selectedFaults.length,controls:controlled.size,results,sourceAndPackageRestored:true,expectedSha256:accepted.observationsSha256};
    writeJSON(path.join(directory,'verification.json'),report);
    writeJSON(path.join(root,'.artifacts/game-'+label+'-fault-verification.json'),report);
  }
}
