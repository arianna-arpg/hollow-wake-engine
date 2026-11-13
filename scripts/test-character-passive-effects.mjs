import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'character-passive-effects-owned-')),report={passed:false,sources:{},runs:[]},logs={};
try{
 const capture=file=>{const text=fs.readFileSync(path.join(root,file),'utf8');report.sources[file]=sha256(text);return text;};
 capture('scripts/test-character-passive-effects.mjs');
 const test=capture('test/character-passive/effects-contracts.mjs'),planner=capture('src/character-passive-commands.ts'),source=capture('src/character-passive-effects.ts');
 const variants=[['control',source],['missing-current-grants',source.replace("const skills=[...p.learned(),...p.granted()];","const skills=[...p.learned()];")],
  ['uncaptured-new-summon',source.replace('captured=[...p.captureSummons()]','captured=p.captureSummons()')],['restored',source]];
 for(const[name,effects]of variants){
  if(name!=='control'&&name!=='restored')assert.notEqual(effects,source);
  const file=path.join(work,name+'.mjs');await build({stdin:{contents:test,loader:'js',resolveDir:path.join(root,'test/character-passive')},bundle:true,platform:'node',format:'esm',target:'es2022',outfile:file,logLevel:'silent',plugins:[{name:'private-effects',setup(b){
   b.onResolve({filter:/\.js$/},a=>{const file=path.resolve(a.resolveDir,a.path),module=path.basename(file);if(['character-passive-effects.js','character-passive-commands.js'].includes(module))return{path:path.join(root,'dist',module)};
    if(file.startsWith(path.join(root,'dist')+path.sep))return{path:pathToFileURL(file).href,external:true};});
   b.onLoad({filter:/character-passive-(effects|commands)\.js$/},a=>({contents:a.path.endsWith('effects.js')?effects:planner,loader:'ts',resolveDir:path.join(root,'dist')}));
  }}]});
  const child=spawnSync(process.execPath,[file],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'cache')}});
  logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal);const control=name==='control'||name==='restored';
  assert.equal(child.status,control?0:1,child.stderr);if(!control){assert.match(child.stderr,/ERR_ASSERTION/);assert.match(child.stderr,/acknowledgement playback differs/);}
  report.runs.push({name,passed:true});
 }
 report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file),'utf8'))===hash);report.passed&&=report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 fs.writeFileSync(path.join(owned,'character-passive-effects.json'),JSON.stringify({...report,logs},null,2)+'\n');
}
assert(report.passed,report.failure);console.log(report);
