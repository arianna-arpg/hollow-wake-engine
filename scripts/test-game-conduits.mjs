import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {integrateConduits,renderConduits} from '../adapters/hollow-wake/integrate-conduits.mjs';
import {buildConduitPage} from './build-device-conduits.mjs';

const args=process.argv.slice(2);
function directoryOption(flag){
  const at=args.indexOf(flag);
  if(at<0)return undefined;
  assert(args[at+1] && !args[at+1].startsWith('--'),'Expected a path after '+flag);
  const result=fs.realpathSync(args[at+1]);
  args.splice(at,2);
  return result;
}
const workingGame=directoryOption('--working-game'),integratedGame=directoryOption('--integrated-game');
const browserAt=args.indexOf('--electron');
let electron;
if(browserAt>=0){electron=fs.realpathSync(args[browserAt+1]);args.splice(browserAt,2);}
assert(args.every(a=>['--benchmark','--record'].includes(a)));
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const scratchRoot=fs.realpathSync(path.join(root,'.artifacts'));
const scratch=fs.mkdtempSync(path.join(scratchRoot,'conduit-package-'));
const game=path.join(root,'.reference'), file=path.join(game,'src/engine/actor.ts');
const env={...process.env,TEMP:scratch,TMP:scratch,TMPDIR:scratch,npm_config_cache:path.join(scratch,'npm-cache')};
const run=(argv,cwd=scratch)=>execFileSync(process.execPath,argv,{cwd,env,windowsHide:true,encoding:'utf8',timeout:240000,maxBuffer:12<<20});
const spec='@hollow-wake/engine/resources/conduits';
const read=p=>fs.readFileSync(p,'utf8');
async function verify(){
  const [pack]=JSON.parse(run([npmCli(),'pack','--ignore-scripts','--json','--pack-destination',scratch],root));
  const archive=path.join(scratch,pack.filename);
  writeJSON(path.join(scratch,'package.json'),{name:'conduit-consumer',private:true});
  run([npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',archive]);
  const installed=fileURLToPath(run(['--input-type=module','-e','console.log(import.meta.resolve('+JSON.stringify(spec)+'))']).trim());
  const example=path.resolve(path.dirname(installed),'../examples/conduits.mjs');
  assert(run([example]).includes('Lowering the guard stopped the pump.'));
  const original=read(file);
  const fixture=path.join(scratch,'game'), actorCopy=path.join(fixture,'src/engine/actor.ts');
  fs.mkdirSync(path.dirname(actorCopy),{recursive:true});
  fs.copyFileSync(file,actorCopy);
  integrateConduits(fixture,false);
  assert.equal(read(actorCopy),original);
  integrateConduits(fixture);
  const generated=read(actorCopy);
  assert.throws(()=>integrateConduits(fixture),/already installed/);
  const accepted=JSON.parse(read(path.join(root,'baseline/conduits/acceptance.json')));
  assert.equal(sha256(original),accepted.actorSha256);
  const expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/conduits/original.json.gz')));
  assert.equal(sha256(expected),accepted.sha256);
  const observer=read(path.join(root,'reference/export-conduits.ts'));
  const virtualObserver=path.join(game,'balance/conduit-observer.ts');
  // Type-check the binding against the actual Actor and installed declarations. Serve
  // only the two changed files from memory so an existing game checkout stays intact.
  const config=ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(game,'tsconfig.json'),ts.sys.readFile).config,ts.sys,game);
  const options={...config.options,types:['node'],typeRoots:[path.join(game,'node_modules/@types')],
    paths:{[spec]:[installed.replace(/\.js$/,'.d.ts')]},baseUrl:root};
  const host=ts.createCompilerHost(options);
  const readFile=host.readFile.bind(host), exists=host.fileExists.bind(host);
  const overlay=new Map([[file,generated],[virtualObserver,observer]]);
  host.readFile=p=>overlay.get(path.resolve(p))??readFile(p);
  host.fileExists=p=>overlay.has(path.resolve(p))||exists(p);
  const program=ts.createProgram([file,virtualObserver,...config.fileNames.filter(n=>n.endsWith('.d.ts'))],options,host);
  const errors=[...program.getOptionsDiagnostics(),...[file,virtualObserver].flatMap(name=>{
    const source=program.getSourceFile(name);
    assert(source,'Missing type-check input: '+name);
    return [...program.getSyntacticDiagnostics(source),...program.getSemanticDiagnostics(source)];
  })];
  assert.equal(errors.length,0,ts.formatDiagnostics(errors,{getCurrentDirectory:()=>game,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));

  async function bundle(source,name,mode,hostGame=game,hostActor=original,boundActor=generated) {
    const output=path.join(scratch,name+'.cjs');
    const plugin={name:'installed-conduit-host',setup(b){
      b.onLoad({filter:/[\\/]engine[\\/]actor\.ts$/},args=>{
        assert.equal(path.resolve(args.path),path.join(hostGame,'src/engine/actor.ts'));
        return {contents:mode==='original'?hostActor:boundActor,loader:'ts',resolveDir:path.dirname(args.path)};
      });
      b.onResolve({filter:/^@hollow-wake\/engine\/resources\/conduits$/},()=>({path:installed}));
      if(mode==='installed' && hostGame===integratedGame){
        b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},args=>{
          if(args.pluginData==='conduit-installed-package')return;
          return b.resolve(args.path,{resolveDir:scratch,kind:args.kind,pluginData:'conduit-installed-package'});
        });
      }
      if(mode==='fault') b.onLoad({filter:/[\\/]dist[\\/]conduits\.js$/},args=>{
        const code=read(args.path),marker='room / exchange';
        assert.equal(code.split(marker).length,2);
        return {contents:code.replace(marker,'room * exchange'),loader:'js'};
      });
    }};
    await build({stdin:{contents:source,loader:'ts',resolveDir:path.join(hostGame,'balance')},bundle:true,platform:'node',
      format:'cjs',logLevel:'silent',plugins:[plugin],outfile:output});
    return output;
  }
  const replay=async(mode)=>{
    const entry=await bundle(observer,'observe-'+mode,mode), target=path.join(scratch,mode+'.json');
    run([entry,target]);
    return fs.readFileSync(target);
  };
  assert((await replay('installed')).equals(expected),'Installed Actor differs from the original');
  const fault=JSON.parse(await replay('fault')),truth=JSON.parse(expected);
  const detected=fault.courses.filter((c,i)=>JSON.stringify(c)!==JSON.stringify(truth.courses[i])).map(c=>c.id);
  assert(detected.length>0,'Cap-edge transfer fault survived the original-game replay');
  for(const nl of ['\n','\r\n']){
    const subject=original.replace(/\r?\n/g,nl),extension=nl+'// other host work'+nl;
    assert(renderConduits(subject+extension,original).endsWith(extension));
    assert.throws(()=>renderConduits(subject.replace('room / perPoint','room * perPoint'),original),/Unreviewed/);
  }
  const probes={};
  const expectedProbes={
    probe_passiveroutes:'Passive routes: 168 checks, 115 two-point walks, 0 failures.',
    probe_passiveweave:'Passive weave: 495 checks, 0 failures.',
    probe_devotedstartertrees:'Devoted starter trees: 471 passed, 0 failures; 72 terminal routes',
  };
  for(const [name,summary] of Object.entries(expectedProbes)){
    const entry=await bundle(read(path.join(game,'balance',name+'.ts')),name,'installed');
    const log=run([entry]);
    assert(!/^FAIL /m.test(log),name);
    probes[name]=log.trim().split(/\r?\n/).at(-1);
    assert.equal(probes[name],summary,'Incomplete original World acceptance: '+name);
  }
  const result={version:pack.version,archiveSha256:sha256(fs.readFileSync(archive)),original:accepted,
    exactInstalledReplay:true,caughtWrongExchange:detected.length,originalGameProbes:probes};
  const sourceCatalog=await bundle(read(path.join(root,'reference/export-conduit-catalogue.ts')),'catalogue','original');
  const rowsFile=path.join(scratch,'authored.json'), vectorsFile=path.join(scratch,'loadouts.json');
  run([sourceCatalog,rowsFile,vectorsFile]);
  const shipped=fileURLToPath(run(['--input-type=module','-e',"console.log(import.meta.resolve('@hollow-wake/engine/content/conduits.json'))"]).trim());
  assert.equal(read(shipped),read(rowsFile),'Shipped conduit grants differ from the original definitions');
  const {ConduitCatalogue}=await import(pathToFileURL(path.join(path.dirname(installed),'conduit-catalogue.js')).href);
  const authored=JSON.parse(read(shipped)), catalog=new ConduitCatalogue(authored);
  const vectors=JSON.parse(read(vectorsFile));
  for(const row of vectors)assert.deepEqual(catalog.forSkill(row.skill,row.admitted,row.invested),row.expected);
  for(const row of authored.entries)assert.deepEqual(catalog.get(row.source,row.id,row.owner),row.pumps);
  assert(vectors.some(row=>!row.admitted.length)&&vectors.some(row=>row.invested.length>1)&&vectors.some(row=>row.admitted.length>1));
  result.catalogue={entries:authored.entries.length,bytes:fs.statSync(shipped).size,sha256:sha256(read(shipped)),
    loadouts:vectors.length,originalLoadoutSha256:sha256(read(vectorsFile))};
  result.devicePage=await buildConduitPage(scratch,installed,pack,result.archiveSha256,accepted,truth);
  if(electron){
    execFileSync(electron,[path.join(root,'tools/device-conduits/check.cjs')],{cwd:scratch,
      env:{...env,HWE_DEVICE_DIR:scratch,HWE_DEVICE_PAGE:path.join(scratch,result.devicePage.file)},
      windowsHide:true,timeout:100000,stdio:['ignore','ignore','pipe']});
    result.devicePage.desktopBrowser=JSON.parse(read(path.join(scratch,'browser-acceptance.json')));
  }
  for(const [label,checkout] of [['workingGame',workingGame],['integratedGame',integratedGame]]){
    if(!checkout)continue;
    const actorPath=path.join(checkout,'src/engine/actor.ts');
    const raw=read(actorPath),bound=renderConduits(raw,original);
    const outputs=[];
    for(const mode of ['original','installed']){
      const entry=await bundle(observer,label+'-'+mode,mode,checkout,raw,bound);
      const output=path.join(scratch,label+'-'+mode+'.json');
      run([entry,output]);outputs.push(fs.readFileSync(output));
    }
    assert(outputs[0].equals(outputs[1]),'Working-game actor observations differ with the SDK');
    assert.equal(read(actorPath),raw,'Working game changed during verification');
    result[label]={actorSha256:sha256(raw),observationsSha256:sha256(outputs[0]),
      courses:JSON.parse(outputs[0]).courses.length,matchesPinned:outputs[0].equals(expected)};
    if(label==='integratedGame')result[label].previousPackage=JSON.parse(read(path.join(checkout,'node_modules/@hollow-wake/engine/package.json'))).version;
  }
  if(args.includes('--benchmark')){
    const {measure}=await import('./benchmark-conduits.mjs');
    const source=read(path.join(root,'reference/benchmark-conduits.ts'));
    result.benchmark=measure(await bundle(source,'bench-original','original'),await bundle(source,'bench-sdk','installed'));
  }
  if(args.includes('--record')){
    assert(result.benchmark && result.devicePage.desktopBrowser,
      'Recording a release requires --benchmark and --electron <executable>');
    const destination=path.join(scratchRoot,'downloads',pack.version,'conduits');
    const release=path.join(scratch,'verified-release');
    fs.mkdirSync(release);
    for(const name of [pack.filename,result.devicePage.file]){
      fs.copyFileSync(path.join(scratch,name),path.join(release,name),fs.constants.COPYFILE_EXCL);
    }
    writeJSON(path.join(release,'verification.json'),result);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    // A single rename publishes all three files. Preserve the first accepted timing series on a rerun.
    try {fs.renameSync(release,destination);}
    catch(error){
      if(!fs.existsSync(destination))throw error;
      const earlier=JSON.parse(read(path.join(destination,'verification.json')));
      assert.equal(earlier.archiveSha256,result.archiveSha256,'Existing candidate differs');
      assert.equal(earlier.devicePage.sha256,result.devicePage.sha256,'Existing page differs');
      for(const name of [pack.filename,result.devicePage.file])assert.equal(
        sha256(fs.readFileSync(path.join(destination,name))),sha256(fs.readFileSync(path.join(release,name))));
    }
  }
  console.log(JSON.stringify(result,null,2));
}
try {await verify();}
finally {assert.equal(path.dirname(fs.realpathSync(scratch)),scratchRoot);fs.rmSync(scratch,{recursive:true});}
