import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root,listFiles,sha256,writeJSON,git} from './reference-utils.mjs';
import {itemPack} from './compile-item-content.mjs';
import {passivePack} from './compile-passive-content.mjs';
import {build,version as bundlerVersion} from '../.reference/node_modules/esbuild/lib/main.js';

const args=process.argv.slice(2);assert.equal(args.length,2);assert.equal(args[0],'--qjs','Supply --qjs /path/to/the/pinned/runtime');
const binary=fs.realpathSync(args[1]),lockFile=path.join(root,'experiments/embedded-js/runtime-lock.json');
const lockBytes=fs.readFileSync(lockFile),lock=JSON.parse(lockBytes),asset=lock.assets[process.platform+'-'+process.arch];
assert(asset,'No runtime asset pinned for this host');assert.equal(sha256(fs.readFileSync(binary)),asset.sha256,'Runtime binary differs from the pinned release');
const snapshot=()=>Object.fromEntries(listFiles(path.join(root,'dist')).map(f=>[f,sha256(fs.readFileSync(path.join(root,'dist',f)))]));
const before=snapshot(),source=path.join(root,'experiments/embedded-js/compatibility.mjs'),sourceBytes=fs.readFileSync(source);
const artifacts=path.join(root,'.artifacts');fs.mkdirSync(artifacts,{recursive:true});
const directory=fs.mkdtempSync(path.join(artifacts,'embedded-js-')),receipt=path.join(directory,'verification.json');
writeJSON(path.join(artifacts,'embedded-js-latest.json'),{directory,receipt});
const input=path.join(directory,'input.json');writeJSON(input,{core:JSON.parse(fs.readFileSync(path.join(root,'content/milestone-one.json'))),items:itemPack(),passives:passivePack()});
const inputHash=sha256(fs.readFileSync(input)),bundle=path.join(directory,'bundle.mjs');
const report={schemaVersion:1,passed:false,status:'running',runtime:lock.runtime,version:lock.version,release:lock.release,
  binarySha256:asset.sha256,platform:process.platform,arch:process.arch,node:process.version,bundlerVersion,
  commit:git(root,['rev-parse','HEAD']).trim(),sourceSha256:sha256(sourceBytes),runtimeLockSha256:sha256(lockBytes),
  runtimeOutputs:Object.keys(before).length,runtimeMapSha256:sha256(JSON.stringify(before)),inputSha256:inputHash,
  scope:'Compatibility discovery using a CLI. No native ABI, VM-versus-native-kernel performance result, game-engine package, device support or full-SDK coverage is claimed.'};
writeJSON(receipt,report);
try {
  const built=await build({entryPoints:[source],outfile:bundle,bundle:true,platform:'neutral',format:'esm',target:'es2022',minify:false,metafile:true});
  assert(Object.values(built.metafile.outputs).every(o=>o.imports.length===0),'Bundle must not require an external module');
  writeJSON(path.join(directory,'bundle-map.json'),built.metafile);
  for(const [kind,module] of [['source',pathToFileURL(source).href],['bundle','./bundle.mjs']])
    fs.writeFileSync(path.join(directory,'node-'+kind+'.mjs'),`import fs from 'node:fs';import {observe} from ${JSON.stringify(module)};console.log(JSON.stringify(observe(JSON.parse(fs.readFileSync(new URL('./input.json',import.meta.url))))));\n`,{flag:'wx'});
  fs.writeFileSync(path.join(directory,'quickjs.mjs'),"import * as std from 'qjs:std';import {observe} from './bundle.mjs';console.log(JSON.stringify(observe(JSON.parse(std.loadFile('input.json')))));\n",{flag:'wx'});
  const run=(label,command,argv)=>{
    const output=path.join(directory,label+'.json'),error=path.join(directory,label+'.txt'),out=fs.openSync(output,'wx'),err=fs.openSync(error,'wx');
    try { execFileSync(command,argv,{cwd:directory,windowsHide:true,stdio:['ignore',out,err],timeout:60000}); }
    finally {fs.closeSync(out);fs.closeSync(err);}
    return JSON.parse(fs.readFileSync(output));
  };
  const original=run('node-source',process.execPath,['node-source.mjs']);
  const bundled=run('node-bundle',process.execPath,['node-bundle.mjs']);assert.deepEqual(bundled,original);
  const quick=run('quickjs',binary,['--memory-limit','262144','--stack-size','1024','--module','quickjs.mjs']);
  let numericComparisons=0,exactNumbers=0;
  function compare(a,b,where='$') {
    if(typeof a==='number'&&typeof b==='number') {
      numericComparisons++;if(Object.is(a,b))exactNumbers++;
      assert(Number.isFinite(a)&&Number.isFinite(b),where);
      assert(Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a),Math.abs(b)),where);return;
    }
    assert.equal(typeof a,typeof b,where);
    if(a===null||b===null||typeof a!=='object'){assert.equal(a,b,where);return;}
    assert.equal(Array.isArray(a),Array.isArray(b),where);assert.deepEqual(Object.keys(a),Object.keys(b),where);
    for(const k of Object.keys(a))compare(a[k],b[k],where+'.'+k);
  }
  compare(quick,original);
  for(const x of quick.continuation)assert.deepEqual(x.live,x.restored);
  assert.equal(quick.core.hits.length,32);assert.equal(quick.items.length,256);
  const accepted=quick.passives.filter(x=>x.allocation.accepted);assert(accepted.length>100);
  for(const action of accepted){assert.equal(action.refund.refusal,null);assert.equal(action.afterRefund.passivePoints,10);assert.deepEqual(action.restored,action.afterRefund);}
  Object.assign(report,{passed:true,status:'completed',bundleSha256:sha256(fs.readFileSync(bundle)),bundleBytes:fs.statSync(bundle).size,
    inputBytes:fs.statSync(input).size,content:quick.content,hits:32,itemRolls:256,continuedItemRolls:16,
    passiveActions:quick.passives.length,acceptedPassiveActions:accepted.length,numericComparisons,exactNumbers,
    sourceAndBundleEqual:true,quickjsCompatibleWithinTolerance:true,
    raw:Object.fromEntries(['node-source.json','node-bundle.json','quickjs.json'].map(f=>[f,sha256(fs.readFileSync(path.join(directory,f)))]))});
} catch(error) {report.status='failed';throw error;}
finally {
  assert.deepEqual(snapshot(),before);assert(fs.readFileSync(source).equals(sourceBytes));assert(fs.readFileSync(lockFile).equals(lockBytes));
  assert.equal(sha256(fs.readFileSync(input)),inputHash);assert.equal(sha256(fs.readFileSync(binary)),asset.sha256);
  report.inputsUnchanged=true;writeJSON(receipt,report);console.log({directory,passed:report.passed,numericComparisons:report.numericComparisons,exactNumbers:report.exactNumbers});
}
