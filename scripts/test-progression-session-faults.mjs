import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const [option,receipt]=process.argv.slice(2);assert.equal(option,'--package');
const pkg=JSON.parse(fs.readFileSync(receipt)),hash=f=>sha256(fs.readFileSync(f));assert(pkg.passed);
const consumer=path.join(pkg.directory,'consumer'),installed=path.join(consumer,'node_modules/@hollow-wake/engine');
assert.equal(hash(pkg.sdkArchive),pkg.sdkArchiveSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/progression-session-faults-'));
const cases=[
  {name:'restore-rng-reset',test:'seeded rewards continue',file:'progression-session.js',
    from:"Random.restore({ algorithm: 'mulberry32/v1', state: save.random.state, draws: save.random.draws })",to:'new Random(1)'},
  {name:'lost-investment',test:'account transactions preserve',file:'unlock-lifecycle.js',from:'this.writeInvestment(a, u.id, now);',to:'this.writeInvestment(a, u.id, 0);'},
  {name:'storage-no-reconcile',test:'storage purchases retain',file:'relic-custody.js',from:'state.stash = this.#storage.restore(def, this.#reserve(state), stash);',to:'state.stash = stash;'},
  {name:'claim-not-retired',test:'earned class settlement',file:'unlock-lifecycle.js',from:'a.pendingClassUnlocks.delete(u.payload.classId)',to:'a.pendingClassUnlocks.has(u.payload.classId)'},
];
const report={passed:false,directory,archiveSha256:pkg.sdkArchiveSha256,runs:[]};
const verification=path.join(directory,'verification.json');writeJSON(verification,report);
writeJSON(path.join(root,'.artifacts/progression-session-faults-latest.json'),{directory,receipt:verification});
try {
for(const row of cases){
  const folder=path.join(directory,row.name);fs.mkdirSync(folder);
  writeJSON(path.join(folder,'package.json'),{name:'progression-fault-consumer',private:true,type:'module'});
  const target=path.join(folder,'node_modules/@hollow-wake/engine');fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.cpSync(installed,target,{recursive:true,force:false,errorOnExist:true});
  for(const file of ['contract.test.mjs','content.json'])fs.copyFileSync(path.join(consumer,file),path.join(folder,file));
  const execute=label=>{
    const out=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern',row.test,'contract.test.mjs'],{cwd:folder,windowsHide:true,encoding:'utf8',timeout:60000});
    assert(!out.error&&!out.signal);fs.writeFileSync(path.join(folder,label+'.txt'),out.stdout+out.stderr,{flag:'wx'});return out;
  };
  const control=execute('control');assert.equal(control.status,0,control.stdout+control.stderr);
  const file=path.join(target,'dist',row.file),original=fs.readFileSync(file,'utf8');
  assert.equal(original.split(row.from).length,2,row.name+' exact mutation span');fs.writeFileSync(file,original.replace(row.from,row.to));
  const fault=execute('fault');assert.equal(fault.status,1,row.name);assert.match(fault.stdout,/code: 'ERR_ASSERTION'/);assert.match(fault.stdout,/# fail 1\b/);
  report.runs.push({name:row.name,test:row.test,controlPassed:true,faultDetected:true,controlLogSha256:hash(path.join(folder,'control.txt')),faultLogSha256:hash(path.join(folder,'fault.txt'))});
}
assert.equal(hash(pkg.sdkArchive),pkg.sdkArchiveSha256);report.passed=true;
console.log({passed:true,faults:report.runs.length,directory});
}catch(error){report.failure={name:error.name,message:error.message};throw error;}finally{writeJSON(verification,report);}
