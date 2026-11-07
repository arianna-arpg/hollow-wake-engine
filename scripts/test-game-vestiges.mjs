import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {renderVestiges,integrateVestiges} from '../adapters/hollow-wake/integrate-vestiges.mjs';

import {itemPack} from './compile-item-content.mjs';

const args=process.argv.slice(2),record=args.includes('--record');
function option(name){const i=args.indexOf(name);if(i<0)return;const dir=fs.realpathSync(args[i+1]);args.splice(i,2);return dir;}
const working=option('--working-game'),integrated=option('--integrated-game');
assert(args.length===(record?1:0));
const ref=path.join(root,'.reference'),read=f=>fs.readFileSync(f,'utf8'),json=f=>JSON.parse(read(f));
const proof=json(path.join(root,'baseline/vestiges/acceptance.json'));
const expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/vestiges/original.json.gz')));
assert.equal(sha256(expected),proof.sha256);
const parent=fs.realpathSync(path.join(root,'.artifacts')),dir=fs.mkdtempSync(path.join(parent,'vestige-install-'));
const env={...process.env,TEMP:dir,TMP:dir,TMPDIR:dir,npm_config_cache:path.join(dir,'cache')};
const run=(argv,cwd=dir)=>execFileSync(process.execPath,argv,{cwd,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8<<20});
const world='src/engine/world.ts',source=read(path.join(ref,world)),observer=read(path.join(root,'reference/export-vestiges.ts'));
try{
  const [packageInfo]=JSON.parse(run([npmCli(),'pack','--ignore-scripts','--offline','--json','--pack-destination',dir],root));
  const archive=path.join(dir,packageInfo.filename);
  writeJSON(path.join(dir,'package.json'),{private:true});
  run([npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',archive]);
  const resolve=spec=>fileURLToPath(run(['--input-type=module','-e','console.log(import.meta.resolve('+JSON.stringify(spec)+'))']).trim());
  const spec='@hollow-wake/engine/items/vestiges',installed=resolve(spec),catalogueFile=resolve('@hollow-wake/engine/content/vestiges.json');
  assert.equal(sha256(fs.readFileSync(catalogueFile)),proof.contentSha256);
  const {VestigeCatalogue}=await import(pathToFileURL(resolve(spec+'/catalogue')).href);
  const catalogue=new VestigeCatalogue(json(catalogueFile)),truth=JSON.parse(expected);
  for(const row of truth.effects)assert.deepEqual(JSON.parse(JSON.stringify(catalogue.modifiers('common',row.category,[row.id]))),row.lines);
  for(const r of truth.words)assert.equal(catalogue.word(r.rarity,r.category,r.sockets)?.id??null,r.found);
  assert(run([path.resolve(path.dirname(installed),'../examples/vestiges.mjs')]).includes('Held Breath awakened.'));
  const fixture=path.join(dir,'fixture'),file=path.join(fixture,world);
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);
  integrateVestiges(fixture,false);assert.equal(read(file),source);
  integrateVestiges(fixture);assert.throws(()=>integrateVestiges(fixture),/already installed/);
  const generated=read(file);
  assert.throws(()=>renderVestiges(source.replace('m.vestiges[vestigeId] -= 1','m.vestiges[vestigeId] -= 2'),source),/Unreviewed/);
  const virtual=path.join(ref,'balance/observe-vestiges.ts'),worldFile=path.join(ref,world);
  const config=ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(ref,'tsconfig.json'),ts.sys.readFile).config,ts.sys,ref);
  const opts={...config.options,baseUrl:root,paths:{[spec]:[installed.replace(/\.js$/,'.d.ts')]}};
  const host=ts.createCompilerHost(opts),readFile=host.readFile.bind(host),exists=host.fileExists.bind(host);
  const files=new Map([[worldFile,generated],[virtual,observer]]);
  host.fileExists=f=>files.has(path.resolve(f))||exists(f);host.readFile=f=>files.get(path.resolve(f))??readFile(f);
  const program=ts.createProgram([worldFile,virtual,...config.fileNames.filter(p=>p.endsWith('.d.ts'))],opts,host);
  const errors=[...program.getOptionsDiagnostics(),...[virtual,worldFile].flatMap(f=>{
    const ast=program.getSourceFile(f);return [...program.getSyntacticDiagnostics(ast),...program.getSemanticDiagnostics(ast)];
  })];
  assert.equal(errors.length,0,ts.formatDiagnostics(errors,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));
  async function replay(game,label,body,fault=false){
    const entry=path.join(dir,label+'.cjs'),out=path.join(dir,label+'.json');
    const plugins=[{name:'isolated-game',setup(b){
      b.onLoad({filter:/[\\/]engine[\\/]world\.ts$/},a=>{assert.equal(path.resolve(a.path),path.join(game,world));return {contents:body,loader:'ts',resolveDir:path.dirname(a.path)};});
      b.onResolve({filter:/^@hollow-wake\/engine\/items\/vestiges$/},()=>({path:installed}));
      if(game===integrated&&label.endsWith('-adapter'))b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},a=>
        a.pluginData==='candidate'?undefined:b.resolve(a.path,{resolveDir:dir,kind:a.kind,pluginData:'candidate'}));
      if(fault)b.onLoad({filter:/[\\/]dist[\\/]vestige-inlays\.js$/},a=>{
        const code=read(a.path);assert(code.includes('owner.vestiges[id]--;'));return {contents:code.replace('owner.vestiges[id]--;','owner.vestiges[id] += 0;'),loader:'js'};
      });
    }}];
    await build({stdin:{contents:observer,loader:'ts',resolveDir:path.join(game,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',outfile:entry,plugins});
    run([entry,out,path.join(dir,label+'-pack.json')]);return fs.readFileSync(out);
  }
  assert((await replay(ref,'pinned',generated)).equals(expected),'Installed World differs from frozen observations');
  const mutant=JSON.parse(await replay(ref,'fault',generated,true));
  const faults=mutant.steps.filter((s,i)=>JSON.stringify(s)!==JSON.stringify(truth.steps[i])).length;
  assert(faults>0,'Missing material debit survived');
  const result={version:packageInfo.version,archive:packageInfo.filename,archiveSha256:sha256(fs.readFileSync(archive)),
    reference:proof,installedWorldMatches:true,wrongDebitDetectedIn:faults};
  const caps=itemPack().config.sockets.cap;
  result.ordinaryForge=catalogue.pack.epitaphs.map(w=>({id:w.id,sockets:w.sequence.length,
    eligibleCategories:w.categories.filter(c=>(caps[c]??0)>=w.sequence.length)}));
  assert(result.ordinaryForge.find(w=>w.id==='held_breath').eligibleCategories.includes('helmet'));
  for(const [label,game] of [['workingGame',working],['integratedGame',integrated]]){
    if(!game)continue;
    const raw=read(path.join(game,world)),before=await replay(game,label+'-original',raw);
    assert((await replay(game,label+'-adapter',renderVestiges(raw,source))).equals(before));
    assert.equal(read(path.join(game,world)),raw);
    result[label]={worldSha256:sha256(raw),observationSha256:sha256(before),matchesPinned:before.equals(expected)};
  }
  if(record){
    const dest=path.join(parent,'downloads',result.version,'vestiges');
    const stage=path.join(dir,'accepted');
    fs.mkdirSync(stage);
    fs.copyFileSync(archive,path.join(stage,packageInfo.filename),fs.constants.COPYFILE_EXCL);
    writeJSON(path.join(stage,'verification.json'),result);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    try{fs.renameSync(stage,dest);}
    catch(error){
      if(!fs.existsSync(dest))throw error;
      const prior=json(path.join(dest,'verification.json'));
      assert.equal(prior.archiveSha256,result.archiveSha256,'Existing candidate differs');
      assert.equal(sha256(fs.readFileSync(path.join(dest,packageInfo.filename))),result.archiveSha256);
    }
  }
  console.log(result);
}finally{assert.equal(path.dirname(fs.realpathSync(dir)),parent);fs.rmSync(dir,{recursive:true});}
