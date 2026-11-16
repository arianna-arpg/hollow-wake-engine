import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {buildNodeGodotExample} from './build-node-godot.mjs';

const args=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i+=2){assert(['--distribution','--baseline','--out'].includes(args[i])&&args[i+1]&&!opts[args[i]],'Expected --out DIRECTORY [--distribution DIRECTORY | --baseline DIRECTORY]');opts[args[i]]=path.resolve(args[i+1]);}
assert(opts['--out']&&!fs.existsSync(opts['--out']),'Choose a new output directory');
assert(!(opts['--distribution']&&opts['--baseline']),'Choose one input kind');
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'composed-benchmark-owned-'));
let complete=false,created=false;
try{
 let archives,bundle,baselineSourceCommit;
 if(opts['--baseline']){
  const provenance=JSON.parse(fs.readFileSync(path.join(opts['--baseline'],'provenance.json'))),compressed=fs.readFileSync(path.join(opts['--baseline'],'previous-workload.mjs.gz'));
  assert.equal(sha256(compressed),provenance.archiveSha256,'Baseline archive changed');bundle=gunzipSync(compressed);
  assert.equal(sha256(bundle),provenance.uncompressedSha256,'Baseline workload changed');
  assert.equal(sha256(fs.readFileSync(path.join(root,'tools/combat-performance/workload.mjs'))),provenance.workloadSourceSha256,'Different workload definition');
  archives=provenance.archives;baselineSourceCommit=provenance.sourceCommit;
 }else{
 const distribution=opts['--distribution']??path.join(work,'distribution');
 if(!opts['--distribution'])await buildNodeGodotExample(distribution);
 const manifest=JSON.parse(fs.readFileSync(path.join(distribution,'manifest.json'))),dependencies={};
 for(const [file,hash] of Object.entries(manifest.archives)){
  const archive=path.join(distribution,'packages',file);assert.equal(sha256(fs.readFileSync(archive)),hash,file);
 }
 const distributionPackage=JSON.parse(fs.readFileSync(path.join(distribution,'package.json')));
 for(const [name,value] of Object.entries(distributionPackage.dependencies))dependencies[name]='file:'+path.join(distribution,value.slice(5)).replaceAll('\\','/');
 const consumer=path.join(work,'consumer');fs.mkdirSync(consumer);writeJSON(path.join(consumer,'package.json'),{private:true,type:'module',dependencies});
 const installed=spawnSync(process.execPath,[npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,windowsHide:true,encoding:'utf8',timeout:300000,
  env:{...process.env,NPM_CONFIG_CACHE:path.join(work,'cache'),NPM_CONFIG_UPDATE_NOTIFIER:'false'},maxBuffer:2*1024*1024});
 assert(!installed.error&&installed.status===0,installed.stderr||String(installed.error));
 fs.copyFileSync(path.join(root,'tools/combat-performance/workload.mjs'),path.join(consumer,'workload.mjs'));
 fs.copyFileSync(path.join(distribution,'host/scene.mjs'),path.join(consumer,'scene.mjs'));
 const compiled=await build({absWorkingDir:consumer,entryPoints:['workload.mjs'],bundle:true,platform:'node',format:'esm',target:'node22',write:false,metafile:true,minify:false});
 assert.equal(compiled.outputFiles.length,1);
 for(const output of Object.values(compiled.metafile.outputs))assert.equal(output.imports.length,0,'Portable workload must have no runtime imports');
 bundle=compiled.outputFiles[0].contents;archives=manifest.archives;
 }
 const out=opts['--out'];fs.mkdirSync(out,{recursive:true});created=true;
 fs.writeFileSync(path.join(out,'workload.mjs'),bundle);
 for(const file of ['run.mjs','compare.mjs','lifetime.mjs','index.html','browser-worker.mjs','serve.mjs','README.md'])fs.copyFileSync(path.join(root,'tools/combat-performance',file),path.join(out,file));
 for(const name of ['LICENSE.md','NOTICE.md'])fs.copyFileSync(path.join(root,name),path.join(out,name));
 const sources={};for(const file of ['tools/combat-performance/workload.mjs','tools/combat-performance/run.mjs','scripts/build-combat-benchmark.mjs'])sources[file]=sha256(fs.readFileSync(path.join(root,file)));
 const files=Object.fromEntries(['workload.mjs','run.mjs','compare.mjs','lifetime.mjs','index.html','browser-worker.mjs','serve.mjs','README.md'].map(file=>[file,{sha256:sha256(fs.readFileSync(path.join(out,file))),bytes:fs.statSync(path.join(out,file)).size}]));
 writeJSON(path.join(out,'manifest.json'),{schemaVersion:1,capability:'combat-performance/v1',archives,...(baselineSourceCommit?{baselineSourceCommit}:{}),sources,files,
  seedNotes:'The pinned workload uses seed 711 for scripted courses and additional item rolls; its imported reference scene retains seed 71. Custom distributions need their own scene provenance.',
  questsRequired:false,persistenceRequired:false,deviceQualified:false});
 complete=true;console.log(JSON.stringify({out,files}));
}finally{
 assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});
 if(created&&!complete){assert.equal(fs.realpathSync(opts['--out']),path.resolve(opts['--out']));fs.rmSync(opts['--out'],{recursive:true,maxRetries:3});}
}
