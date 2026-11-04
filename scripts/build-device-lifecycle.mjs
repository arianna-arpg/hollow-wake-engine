import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
  const flag=args[i];
  assert(['--archive','--output'].includes(flag)&&args[i+1]&&!Object.hasOwn(options,flag),'Expected --archive FILE or --output FILE');
  options[flag]=path.resolve(args[i+1]);
}
const artifacts=path.join(root,'.artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const directory=fs.mkdtempSync(path.join(artifacts,'device-lifecycle-')),consumer=path.join(directory,'consumer');
const file=options['--output']??path.join(directory,'hollow-wake-device-benchmark.html');
assert(!fs.lstatSync(file,{throwIfNoEntry:false}),'Refusing to replace an existing output');
assert(fs.statSync(path.dirname(file)).isDirectory(),'Choose an existing output directory');
fs.mkdirSync(consumer);writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
const npm=(cwd,argv)=>execFileSync(process.execPath,[npmCli(),...argv,'--cache',path.join(artifacts,'npm-cache')],{cwd,encoding:'utf8',windowsHide:true});
let archive=options['--archive'];
if(!archive){
  const [packed]=JSON.parse(npm(root,['pack','--json','--ignore-scripts','--pack-destination',directory]));
  archive=path.join(directory,packed.filename);
}
npm(consumer,['install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
const toolDir=path.join(root,'tools/device-lifecycle');
for(const name of ['browser.mjs','workload.mjs'])fs.copyFileSync(path.join(toolDir,name),path.join(consumer,name));
const pkg=fs.realpathSync(path.join(consumer,'node_modules/@hollow-wake/engine'));
const read=f=>JSON.parse(fs.readFileSync(f));
const meta=read(path.join(pkg,'package.json'));assert.equal(meta.name,'@hollow-wake/engine');
const pack=fs.readFileSync(path.join(pkg,'content/milestone-one.json'));
const definition=read(path.join(root,'baseline/milestone-two/authored.json')).timedDamage;
const reference=path.join(root,'evidence/milestone-two/lifecycle-performance.json');
const expected=read(reference).runs.map(r=>({actors:r.actors,completions:r.completionsIncludingWarmup,ticks:r.dotTicksIncludingWarmup,checksum:r.checksum,planBuilds:r.planBuilds}));
assert.deepEqual(expected.map(r=>r.actors),[100,500,1000]);
const data={sdk:{version:meta.version,archiveSha256:sha256(fs.readFileSync(archive))},course:{version:1,referenceSha256:sha256(fs.readFileSync(reference)),
  contentSha256:sha256(pack),definitionSha256:sha256(JSON.stringify(definition)),workloadSha256:sha256(fs.readFileSync(path.join(consumer,'workload.mjs')))},
  pack:JSON.parse(pack),definition,expected};
const js=await build({absWorkingDir:consumer,entryPoints:['browser.mjs'],bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,metafile:true,write:false,legalComments:'none'});
for(const source of Object.keys(js.metafile.inputs)){
  const resolved=fs.realpathSync(path.resolve(consumer,source));
  assert(resolved===path.join(consumer,'browser.mjs')||resolved===path.join(consumer,'workload.mjs')||resolved.startsWith(path.join(pkg,'dist')+path.sep),source);
}
assert.equal(js.outputFiles.length,1);assert(Object.values(js.metafile.outputs).every(row=>row.imports.length===0));
const template=fs.readFileSync(path.join(toolDir,'index.html'),'utf8');
for(const marker of ['__COURSE_DATA__','__COURSE_SCRIPT__','__LICENSE__'])assert.equal(template.split(marker).length,2,marker);
const notice=['NOTICE.md','LICENSE.md'].map(f=>fs.readFileSync(path.join(pkg,f),'utf8')).join('\n\n');
const html=template.replace('__LICENSE__',()=>notice.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'))
  .replace('__COURSE_DATA__',()=>JSON.stringify(data).replaceAll('<','\\u003c'))
  .replace('__COURSE_SCRIPT__',()=>js.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
const bytes=Buffer.byteLength(html,'utf8');assert(bytes<256*1024,'Device probe exceeds 256 KiB');
fs.writeFileSync(file,html,{flag:'wx'});
const report={passed:true,file,bytes,htmlSha256:sha256(fs.readFileSync(file)),sdk:data.sdk,course:data.course,expected};
writeJSON(path.join(directory,'verification.json'),report);console.log(report);
