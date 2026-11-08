import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';
import {AccountWorkshopSession} from '../dist/account-workshop-session.js';
import {encodeContentTable} from '../dist/content-table-compiler.js';
import {packs,definitions,baseline} from '../test/shared-account/fixtures.mjs';
import {openCourse,replayStep,snapshot,send} from '../test/shared-account/contracts.mjs';
const args=process.argv.slice(2),options={};
assert.equal(args.length,6,'Use --package public-gameplay-0.4.tgz --python python.exe --output fresh-report.json');
for(let i=0;i<args.length;i+=2){
  assert(['--package','--python','--output'].includes(args[i])&&!Object.hasOwn(options,args[i]));
  options[args[i]]=path.resolve(args[i+1]);
}
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
const output=options['--output'];assert(!fs.existsSync(output)&&!fs.existsSync(output+'.inputs.json.gz'));
const archiveSha256='e75f83bad493ddb159ab0217513e5216e203bdb0c7e5834a1c5dc0a8a2721317';
const nativeSha256='5819b60989b3c9d79ca1b5850e4a8461fc2411db400ae4c453a6ed4f6c8ff82f';
assert.equal(sha256(fs.readFileSync(options['--package'])),archiveSha256,'Use the exact public Unity progression preview archive');
const report={exploratory:true,completed:false,passed:false,scope:'Windows x64 native replay and tracked heap; no engine or device or timing acceptance',
  nativeSha256,archiveSha256,sources:{}};
const sources=['scripts/probe-shared-account-native.mjs','scripts/probe-shared-account-native.py',
  'test/shared-account/contracts.mjs','test/shared-account/fixtures.mjs','baseline/shared-account/admitted-socket/acceptance.json',
  ...fs.readdirSync(path.join(root,'src')).filter(file=>file.endsWith('.ts')).map(file=>'src/'+file)];
for(const file of sources)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const work=fs.mkdtempSync(path.join(root,'.artifacts/shared-account-native-spike-')),courses=[];
try{
  for(const scenario of baseline.scenarios){
    const rows=[];
    class Recorded extends AccountWorkshopSession {
      command(request){const reply=super.command(request);rows.push({request,reply});return reply;}
    }
    const session=openCourse(new Recorded(definitions),scenario);
    assert.deepEqual(snapshot(session),scenario.initial);
    for(const row of baseline.rows.filter(r=>r.scenario===scenario.name)){
      assert.deepEqual(snapshot(session),row.before);replayStep(session,scenario,row);assert.deepEqual(snapshot(session),row.after);
    }
    send(session,{op:'close-workshop',profile:1});send(session,{op:'close-account',account:1});
    courses.push({name:scenario.name,rows});
  }
  const prefix=path.join(root,'dist').replaceAll('\\','/');
  const entry=path.join(work,'entry.mjs');
  fs.writeFileSync(entry,
    "import {AccountWorkshopSession} from '"+prefix+"/account-workshop-session.js';"+
    "import {ItemContent} from '"+prefix+"/item-rules.js';"+
    "import {CraftingContent} from '"+prefix+"/crafting-content.js';"+
    "import {SkillProgression} from '"+prefix+"/skill-progression.js';"+
    "import {decodeContentTable} from '"+prefix+"/content-table.js';"+
    "export function create(table){let {items:ip,crafting:cp,skills:sp,unlocks,memories,gates}=decodeContentTable(table);table.nodes.length=0;"+
    "const items=new ItemContent(ip);ip=null;const crafting=new CraftingContent(cp,items);cp=null;"+
    "const skills=new SkillProgression(sp);sp=null;return new AccountWorkshopSession({workshop:{crafting,skills,"+
    "memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}},progression:{unlocks,memories,gates}})}"+
    "export const dispatch=(session,request)=>session.command(request);");
  await build({entryPoints:[entry],bundle:true,format:'iife',globalName:'HollowWakeSession',platform:'neutral',
    target:'es2022',minify:true,outfile:path.join(work,'bundle.js')});
  fs.writeFileSync(path.join(work,'content.json'),JSON.stringify(encodeContentTable(packs)));
  fs.writeFileSync(path.join(work,'courses.json'),JSON.stringify(courses));
  fs.writeFileSync(path.join(work,'input.json'),JSON.stringify({archive:options['--package'],nativeSha256}));
  const result=spawnSync(options['--python'],
    ['-I',path.join(root,'scripts/probe-shared-account-native.py'),work],
    {encoding:'utf8',windowsHide:true,timeout:240000,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work}});
  report.process={status:result.status,signal:result.signal,error:result.error?.message??null};
  report.output=result.stdout+'\n'+result.stderr;
  assert.equal(result.status,0,report.output);assert(!result.error&&!result.signal);
  report.observed=JSON.parse(fs.readFileSync(path.join(work,'result.json')));
  assert(report.observed.rows.some(row=>row.coursePassed),JSON.stringify(report.observed.rows));
  report.inputs=Object.fromEntries(['entry.mjs','bundle.js','content.json','courses.json'].map(file=>[file,{bytes:fs.statSync(path.join(work,file)).size,sha256:sha256(fs.readFileSync(path.join(work,file)))}]));
  const artifacts=Object.fromEntries(['entry.mjs','bundle.js','content.json','courses.json'].map(file=>[file,fs.readFileSync(path.join(work,file),'utf8')]));
  const packed=gzipSync(JSON.stringify(artifacts),{level:9});
  fs.writeFileSync(output+'.inputs.json.gz',packed,{flag:'wx'});
  report.inputsArchiveSha256=sha256(packed);report.completed=true;
  report.passed=report.observed.rows.every(row=>row.coursePassed&&row.disposed);
}catch(error){report.failure=String(error);throw error;}
finally{
  assert.equal(path.dirname(fs.realpathSync(work)),path.join(root,'.artifacts'));
  fs.rmSync(work,{recursive:true,force:true});report.cleaned=true;
  for(const[file,hash]of Object.entries(report.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
console.log(report.observed);
