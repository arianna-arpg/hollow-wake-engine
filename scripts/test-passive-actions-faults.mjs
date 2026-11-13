import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';
import {runOriginalPassiveActions,verifyPassiveActionOrdering} from '../test/passive-actions/contracts.mjs';
const read=file=>fs.readFileSync(path.join(root,file));
const source=read('src/passive-actions.ts').toString(),fixture=JSON.parse(gunzipSync(read('baseline/milestone-eight/passives.json.gz')));
const report={passed:false,faults:[],sources:Object.fromEntries(['src/passive-actions.ts','scripts/test-passive-actions-faults.mjs',
 'test/passive-actions/contracts.mjs','baseline/milestone-eight/passives.json.gz','dist/passive-policy.js','dist/validation.js'].map(file=>[file,sha256(read(file))])),temporaryDirectoriesCreated:0};
const compile=async text=>{
 const result=await build({stdin:{contents:text,loader:'ts',resolveDir:path.join(root,'src')},bundle:true,format:'esm',platform:'neutral',target:'es2022',write:false,metafile:true});
 assert(Object.values(result.metafile.outputs).every(row=>row.imports.length===0));
 return(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'))).PassiveActions;
};
const check=Actions=>{assert.equal(runOriginalPassiveActions(Actions,fixture),9699);assert.equal(verifyPassiveActionOrdering(Actions),7);};
try{
 const Actions=await compile(source);check(Actions);
 for(const[name,needle,replacement]of [
  ['skip-root-rebuild','if(this.#p.session(seat).ensureRealmRoots(realm).length)this.#p.recalculate(seat);','this.#p.session(seat).ensureRealmRoots(realm);'],
  ['company-before-rebuild','p.recalculate(seat);p.refreshCompany(seat);return true;','p.refreshCompany(seat);p.recalculate(seat);return true;'],
  ['skip-refund-dirty','p.refreshCompany(seat);p.markMetaDirty(seat);p.markCharacterDirty();return true;','p.refreshCompany(seat);p.markCharacterDirty();return true;'],
  ['repeat-graft-effects','if(previous===skillId)return true;','if(false)return true;']]){
  assert.equal(source.split(needle).length,2,name);const Broken=await compile(source.replace(needle,replacement));
  assert.throws(()=>check(Broken),{code:'ERR_ASSERTION'},name+' escaped');report.faults.push({name,detected:true});
 }
 check(Actions);report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed&&=report.inputsUnchanged;
 fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'.artifacts/maintained-passive-actions-faults.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure);console.log({passed:true,originalCommands:9699,focusedCases:7,faults:report.faults.length,temporaryDirectoriesCreated:0});
