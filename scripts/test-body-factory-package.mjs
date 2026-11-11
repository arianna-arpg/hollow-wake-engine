import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import vm from 'node:vm';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';import {bodyFactoryContracts} from '../test/body-factory-contracts.mjs';
assert.equal(process.argv.length,2);fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});const owned=fs.realpathSync(path.join(root,'.artifacts')),read=file=>fs.readFileSync(path.join(root,file));
const inputs=['package.json','package-lock.json','tsconfig.json','src/body-factory.ts','test/body-factory-contracts.mjs','test/body-factory.test.mjs','test/body-factory-consumer.ts','scripts/test-body-factory-package.mjs'];
const report={passed:false,sources:Object.fromEntries(inputs.map(file=>[file,sha256(read(file))])),faults:[]},logs={},work=fs.mkdtempSync(path.join(owned,'body-factory-package-owned-')),consumer=path.join(work,'consumer');
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>{const c=run(label,args,cwd);assert.equal(c.status,0,label+': '+JSON.stringify(logs[label]).slice(-7000));return c;};
try{
 fs.mkdirSync(consumer);fs.writeFileSync(path.join(consumer,'package.json'),'{"private":true,"type":"module"}');
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],root);const archive=path.join(work,JSON.parse(logs.pack.stdout)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const entry='@hollow-wake/engine/bodies/factory';fs.writeFileSync(path.join(consumer,'contracts.mjs'),read('test/body-factory-contracts.mjs'));
 fs.writeFileSync(path.join(consumer,'consumer.mjs'),"import * as api from '"+entry+"';\nimport {bodyFactoryContracts} from './contracts.mjs';\nconsole.log(JSON.stringify(bodyFactoryContracts(api)));\n");
 const accepted=JSON.parse(success('installed',['consumer.mjs']).stdout);assert.equal(accepted.contracts,27);report.contracts=27;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/body-factory.js'),original=fs.readFileSync(module),types=fs.readFileSync(module.replace(/\.js$/,'.d.ts'));report.moduleBytes=original.length;report.moduleSha256=sha256(original);report.typesSha256=sha256(types);assert(report.moduleBytes<=11*1024);
 fs.writeFileSync(path.join(consumer,'entry.mjs'),"export * from '"+entry+"';\n");const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'iife',globalName:'BodyFactoryApi',target:'es2022',minify:true,metafile:true,write:false,logLevel:'silent'});assert.equal(bundle.outputFiles.length,1);assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<=7*1024);
 const context=vm.createContext({});new vm.Script("for(const name of ['window','document','process','require','fetch','setTimeout','setInterval'])Object.defineProperty(globalThis,name,{get(){throw Error('Forbidden host global: '+name)}});Math.random=()=>{throw Error('Forbidden ambient RNG')};Date.now=()=>{throw Error('Forbidden ambient clock')};").runInContext(context);new vm.Script(bundle.outputFiles[0].text).runInContext(context);assert.deepEqual(bodyFactoryContracts(context.BodyFactoryApi),accepted);report.hostileBrowser=true;
 const typeText=read('test/body-factory-consumer.ts').toString();report.negativeTypeCases=(typeText.match(/@ts-expect-error/g)??[]).length;assert.equal(report.negativeTypeCases,11);fs.writeFileSync(path.join(consumer,'consumer.ts'),typeText);
 fs.writeFileSync(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noUncheckedIndexedAccess:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',types:[],lib:['ES2022']},files:['consumer.ts']}));success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json']);report.types=true;
 const quoted="'"+entry+"'";assert.equal(typeText.split(quoted).length,2);fs.writeFileSync(path.join(work,'source-consumer.ts'),typeText.replace(quoted,"'../../src/body-factory.js'"));
 const sourceOptions={...JSON.parse(read('tsconfig.json')).compilerOptions,noEmit:true};delete sourceOptions.rootDir;delete sourceOptions.outDir;fs.writeFileSync(path.join(work,'source-tsconfig.json'),JSON.stringify({compilerOptions:sourceOptions,files:['source-consumer.ts']}));success('source-types',[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(work,'source-tsconfig.json')],root);report.sourceTypes=true;
 const source=read('src/body-factory.ts').toString(),faults=[
  {
    "name": "relay-lost",
    "from": "a.statusRelay = this.p.statusRelay();",
    "to": "a.statusRelay = undefined;"
  },
  {
    "name": "mint-not-signalled",
    "from": "this.p.bombardMinted();",
    "to": "void a;"
  },
  {
    "name": "innate-array-borrowed",
    "from": "def.mods ? [...def.mods] : []",
    "to": "def.mods ? def.mods : []"
  },
  {
    "name": "innate-modifier-identity-lost",
    "from": "def.mods ? [...def.mods] : []",
    "to": "def.mods ? def.mods.map(m => ({...m})) : []"
  },
  {
    "name": "zero-detection-lost",
    "from": "def.detection !== undefined && def.detection !== 1",
    "to": "def.detection && def.detection !== 1"
  },
  {
    "name": "empty-innate-source-created",
    "from": "if (innate.length)",
    "to": "if (true)"
  },
  {
    "name": "owner-identity-lost",
    "from": "a.owner = owner;",
    "to": "a.owner = undefined;"
  },
  {
    "name": "owner-life-scaling-lost",
    "from": "owner.sheet.get('minionLife') - 1",
    "to": "0"
  },
  {
    "name": "owned-body-party-scaled",
    "from": "if (team === this.p.enemyTeam && !owner)",
    "to": "if (team === this.p.enemyTeam)"
  },
  {
    "name": "zero-heft-lost",
    "from": "def.heft ?? 1",
    "to": "def.heft || 1"
  },
  {
    "name": "explicit-zero-weight-rederived",
    "from": "if (def.base.weight === undefined)",
    "to": "if (!def.base.weight)"
  },
  {
    "name": "worm-look-identity-lost",
    "from": "{ looks: def.worm.looks }",
    "to": "{ looks: {...def.worm.looks} }"
  },
  {
    "name": "zero-shell-regeneration-lost",
    "from": "sg.regenRate ?? sg.max / 6",
    "to": "sg.regenRate || sg.max / 6"
  },
  {
    "name": "reserve-specs-copied",
    "from": "a.reserveSpecs = def.reserves;",
    "to": "a.reserveSpecs = [...def.reserves];"
  },
  {
    "name": "explicit-zero-scale-admitted",
    "from": "spawn.scale > 0",
    "to": "spawn.scale >= 0"
  },
  {
    "name": "juvenile-endpoint-lost",
    "from": "s <= def.juvenileBelow",
    "to": "s < def.juvenileBelow"
  },
  {
    "name": "personality-endpoint-lost",
    "from": "if (roll <= 0)",
    "to": "if (roll < 0)"
  },
  {
    "name": "attunement-effect-omitted",
    "from": "this.p.applyAttunement(a);",
    "to": "void a;"
  },
  {
    "name": "late-kit-read-ignored",
    "from": "a.skills = def.skills.map(",
    "to": "a.skills = ['strike'].map("
  },
  {
    "name": "zero-chance-grant-admitted",
    "from": "this.p.random() >= g.chance",
    "to": "this.p.random() > g.chance"
  },
  {
    "name": "socket-falsy-slot-admitted",
    "from": "x => x === null",
    "to": "x => !x"
  },
  {
    "name": "tree-pins-omitted",
    "from": "if (def.skillTrees)",
    "to": "if (false && def.skillTrees)"
  },
  {
    "name": "boon-alias-used-as-source",
    "from": "`boon:${group.id}`",
    "to": "`boon:${b.group}`"
  },
  {
    "name": "zero-boon-pick-draw-lost",
    "from": "Math.max(1, b.pick ?? 1)",
    "to": "Math.max(0, b.pick ?? 1)"
  },
  {
    "name": "zero-graft-level-lost",
    "from": "opt.graft.level ?? 1",
    "to": "opt.graft.level || 1"
  },
  {
    "name": "appearance-callback-ignored",
    "from": "this.p.appearance(a.defId!) ?? def.look",
    "to": "def.look"
  },
  {
    "name": "resource-fill-omitted",
    "from": "a.fillResources();",
    "to": "void a;"
  }
];assert.equal(faults.length,27);
 for(const{name,from,to}of faults){assert.equal(source.split(from).length,2,name+' selector');const mutant=ts.transpileModule(source.replace(from,to),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:'body-factory.ts'}).outputText;fs.writeFileSync(module,mutant);
  try{assert.equal(run(name,['consumer.mjs']).status,1,name+' escaped');assert.match(logs[name].stderr,/ERR_ASSERTION/);report.faults.push({name,detected:true,logSha256:sha256(JSON.stringify(logs[name]))});}finally{fs.writeFileSync(module,original);}}
 assert.deepEqual(JSON.parse(success('restored',['consumer.mjs']).stdout),accepted);assert(fs.readFileSync(module).equals(original));report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'body-factory-package.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'body-factory-package.json'),JSON.stringify(report,null,2)+'\n');}
assert(report.passed,report.failure??'Inputs changed');console.log({passed:true,contracts:report.contracts,faults:report.faults.length,types:report.types,sourceTypes:report.sourceTypes,negativeTypeCases:report.negativeTypeCases,moduleBytes:report.moduleBytes,browserBytes:report.browserBytes,cleaned:true});
