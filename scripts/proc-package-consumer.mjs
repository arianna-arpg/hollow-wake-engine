import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';

export async function verifyProcConsumer({name, exports, types, count, modules = [], browserLimit}) {
  const entry = '@hollow-wake/engine/combat/' + name;
  const artifacts = path.join(root,'.artifacts');
  fs.mkdirSync(artifacts,{recursive:true});
  const directory = fs.mkdtempSync(path.join(artifacts,name+'-package-'));
  const consumer = fs.mkdtempSync(path.join(os.tmpdir(),'hollow-'+name+'-'));
  const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  const [packed] = JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(artifacts,'npm-cache')],
    {cwd:root,encoding:'utf8',windowsHide:true}));
  writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
  const archive = path.join(directory,packed.filename);
  execFileSync(process.execPath,[npm,'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],
    {cwd:consumer,stdio:'pipe',windowsHide:true});
  const testFile = path.join(root,'test',name+'.test.mjs');
  const source = fs.readFileSync(testFile,'utf8').replace("'../dist/"+name+".js'",JSON.stringify(entry));
  assert(!source.includes('../dist/'));
  fs.writeFileSync(path.join(consumer,'test.mjs'),"Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};\n"+source);
  const env = {...process.env,['HWE_'+name.toUpperCase().replaceAll('-','_')+'_MODULE']:''};
  function run(args, log) {
    const fd = fs.openSync(path.join(directory,log),'wx');
    try {execFileSync(process.execPath,args,{cwd:consumer,env,stdio:['ignore',fd,fd],windowsHide:true,timeout:60000});}
    finally {fs.closeSync(fd);}
  }
  run(['--test','--test-reporter=tap','test.mjs'],'tests.txt');
  assert.match(fs.readFileSync(path.join(directory,'tests.txt'),'utf8'),new RegExp('^# pass '+count+'$','m'));
  fs.writeFileSync(path.join(consumer,'types.ts'),types);
  writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,types:[]},include:['types.ts']});
  run([path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],'types.txt');
  fs.writeFileSync(path.join(consumer,'browser.mjs'),'export {'+exports.join(', ')+'} from '+JSON.stringify(entry)+';\n');
  const bundle = await build({absWorkingDir:consumer,tsconfigRaw:{},entryPoints:['browser.mjs'],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
  const inputs = Object.keys(bundle.metafile.inputs).map(f=>f.replaceAll('\\','/')).sort();
  assert.deepEqual(inputs,['browser.mjs',...[name,...modules].map(n=>'node_modules/@hollow-wake/engine/dist/'+n+'.js')].sort());
  const browser = bundle.outputFiles[0].contents;
  assert(browser.length < browserLimit);fs.writeFileSync(path.join(directory,'browser.mjs'),browser);
  const report = {passed:true,directory,consumer,tests:count,testSha256:sha256(fs.readFileSync(testFile)),typesPassed:true,
    browserBytes:browser.length,browserInputs:inputs,archiveSha256:sha256(fs.readFileSync(archive)),independentInstallation:true};
  writeJSON(path.join(directory,'verification.json'),report);
  writeJSON(path.join(artifacts,name+'-package-verification.json'),report);console.log(report);
}
