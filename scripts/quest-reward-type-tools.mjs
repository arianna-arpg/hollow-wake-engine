import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';import {questRewardRuntime,questRewardAliases,questRewardGameFixtures} from '../test/quest-rewards/courses.mjs';
/** Both declaration modes use final runtime paths. Preflight source overlays
 * must separately verify their underlying source hashes after this returns. */
export function runQuestRewardTypes(mode,overrides={}){
 assert(['sdk','world'].includes(mode));const world=mode==='world',stem=overrides.stem??(world?'quest-rewards-world-types':'quest-rewards-types');assert(/^[a-z0-9-]+$/.test(stem));
 fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
 const key=f=>path.resolve(f).toLowerCase(),read=overrides.read??(f=>fs.readFileSync(path.join(root,f))),exists=overrides.exists??(f=>fs.existsSync(path.join(root,f)));
 const relative=f=>path.relative(root,f).replaceAll('\\','/'),inside=f=>{const name=relative(f);return !path.isAbsolute(name)&&name!=='..'&&!name.startsWith('../');};
 const dependencyRoots=[path.join(root,'node_modules'),...(world?[path.join(root,'.reference/node_modules')]:[])].map(f=>key(fs.realpathSync(f)));
 const dependency=f=>dependencyRoots.some(dir=>key(f)===dir||key(f).startsWith(dir+path.sep));
 const allowed=f=>inside(f)||dependency(f);
 // A neighboring game checkout must never supply missing fixture dependencies.
 // Existing worktrees may share their two exact, locked dependency directories.
 const readFile=f=>inside(f)?exists(relative(f))?read(relative(f)).toString():undefined:dependency(f)?ts.sys.readFile(f):undefined;
 const directory=world?path.join(root,'.reference'):root,configFile=path.join(directory,'tsconfig.json'),config=ts.readConfigFile(configFile,readFile);assert(!config.error);
 const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,directory);assert.deepEqual(parsed.errors,[]);
 // These fixtures live outside .reference, so TypeScript's ancestor search
 // cannot discover its locked Node declarations on a clean CI checkout.
 const options={...parsed.options,noEmit:true,rootDir:root,...(world?{types:['node'],typeRoots:[path.join(directory,'node_modules/@types')]}:{})};
 const fixtureFiles=world?questRewardGameFixtures.map(f=>path.join(root,f)):[...['owner-types.ts','checkpoint-types.ts','experience-types.ts','earned-points-types.ts'].map(f=>path.join(root,'test/run-character',f)),...['vocation-types.ts','counter-types.ts','plan-types.ts','memory-types.ts','owner-boundary-types.ts','owner-types.ts'].map(f=>path.join(root,'test/quest-rewards',f))];
 const fixtures=new Map(fixtureFiles.map(f=>[key(f),readFile(f)]));assert([...fixtures.values()].every(code=>typeof code==='string'));
 const gameFixtures=new Set(questRewardGameFixtures.map(f=>key(path.join(root,f))));
 const hostFor=(negative,compilerOptions=options)=>{
  const host=ts.createCompilerHost(compilerOptions);host.fileExists=f=>inside(f)?exists(relative(f)):dependency(f)&&ts.sys.fileExists(f);host.readFile=readFile;
  host.directoryExists=f=>allowed(f)&&ts.sys.directoryExists(f);host.getDirectories=f=>allowed(f)?ts.sys.getDirectories(f):[];
  host.getSourceFile=(f,version)=>{const code=readFile(f);return code===undefined?undefined:ts.createSourceFile(f,negative&&fixtures.has(key(f))?code.replaceAll('@ts-expect-error','deliberate-invalid-call'):code,version,true);};
  host.resolveModuleNames=(names,from)=>names.map(name=>questRewardAliases[name]?{resolvedFileName:path.join(root,questRewardAliases[name]),extension:questRewardAliases[name].endsWith('.mjs')?ts.Extension.Mjs:ts.Extension.Ts}:ts.resolveModuleName(name,gameFixtures.has(key(from))&&name.startsWith('../src/')?path.join(root,'.reference/balance/quest-types.ts'):from,compilerOptions,host).resolvedModule);
  return host;
 };
 const files=[...new Set([...parsed.fileNames,...questRewardRuntime.map(f=>path.join(root,'src',f)),...fixtureFiles])],program=ts.createProgram(files,options,hostFor(false)),errors=ts.getPreEmitDiagnostics(program),negative=world?[]:ts.getPreEmitDiagnostics(ts.createProgram(files,options,hostFor(true)));
 const nodeDeclarations=program.getSourceFiles().filter(f=>/[/\\]@types[/\\]node[/\\]/.test(f.fileName));
 if(world)assert(nodeDeclarations.length>0&&nodeDeclarations.every(f=>fs.realpathSync(f.fileName).startsWith(fs.realpathSync(path.join(directory,'node_modules/@types/node'))+path.sep)),'Node declarations must come from the locked reference tools');
 const controls=[];
 if(world){
  // Virtual source only: no copied dependencies or temporary project is needed.
  const probe=path.join(root,'test/quest-rewards/node-types-control.ts');
  const diagnose=(compilerOptions,invalid=false)=>{
   const host=hostFor(false,compilerOptions),get=host.getSourceFile.bind(host);
   host.getSourceFile=(f,version,...rest)=>key(f)===key(probe)?ts.createSourceFile(f,
    "import assert from 'node:assert/strict'; assert.equal(process.pid, 0);"+(invalid?'const bad: string = process.pid; void bad;':''),version,true):get(f,version,...rest);
   return ts.getPreEmitDiagnostics(ts.createProgram([probe],compilerOptions,host));
  };
  assert.deepEqual(diagnose(options),[]);controls.push('locked-node-types-resolve');
  const invalid=diagnose(options,true);assert(invalid.some(d=>d.code===2322&&key(d.file?.fileName??'')===key(probe)));controls.push('node-types-remain-checked');
  const absent={...options,types:[],typeRoots:[]},missing=diagnose(absent);
  assert(missing.some(d=>d.code===2307)&&missing.some(d=>d.code===2591||d.code===2580));controls.push('missing-types-fault-detected');
 }
 const report={passed:errors.length===0&&(world||negative.length===130&&negative.every(d=>fixtures.has(key(d.file?.fileName??'')))),mode,sources:{},negativeCases:negative.length,...(world?{productionFiles:parsed.fileNames.length,nodeTypes:{version:JSON.parse(read('.reference/node_modules/@types/node/package.json')).version,files:nodeDeclarations.length,lockedReference:true,controls}}:{}),errors:errors.map(d=>({file:d.file?.fileName,line:d.file&&d.file.getLineAndCharacterOfPosition(d.start).line+1,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))};
 const lock=JSON.parse(read('baseline/source-lock.json'));
 for(const source of program.getSourceFiles()){
  const file=relative(source.fileName);if(path.isAbsolute(file)||file.startsWith('../')||file.startsWith('node_modules/')||file.includes('/node_modules/'))continue;
  report.sources[file]=sha256(read(file));if(file.startsWith('.reference/src/'))assert.equal(report.sources[file],lock.files[file.slice(11)],file);
 }
 for(const f of ['scripts/quest-reward-type-tools.mjs','scripts/test-quest-reward-types.mjs','test/quest-rewards/courses.mjs','baseline/source-lock.json',relative(configFile)])report.sources[f]=sha256(read(f));
 report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(read(f))===h);report.passed&&=report.inputsUnchanged;fs.writeFileSync(path.join(root,'.artifacts',stem+'.json'),JSON.stringify(report,null,2)+'\n');
 assert(report.passed,JSON.stringify(report.errors));console.log({passed:true,mode,negativeCases:report.negativeCases,...(world?{productionFiles:report.productionFiles}:{})});return report;
}
