import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync,execFileSync} from 'node:child_process';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const argument=name=>{const at=process.argv.indexOf(name);assert(at>=0&&process.argv[at+1],name+' required');return path.resolve(process.argv[at+1]);};
const game=argument('--game'),dist=argument('--dist'),electron=argument('--electron'),
  snapshot=directory=>Object.fromEntries(listFiles(directory).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]));
const positive=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/ready-bank-ui-verification.json')));assert(positive.passed&&positive.rawObservationsByteEqual);assert.equal(positive.game,game);assert.equal(positive.dist,dist);
const packageDir=fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine')),source=snapshot(path.join(game,'src')),pkg=snapshot(packageDir),bundle=snapshot(dist);
assert.equal(sha256(JSON.stringify(source)),positive.sourceMapSha256);assert.equal(sha256(JSON.stringify(snapshot(path.join(packageDir,'dist')))),positive.runtimeMapSha256);
const out=fs.mkdtempSync(path.join(root,'.artifacts/ready-bank-ui-controls-')),results=[];
const project={};for(const entry of fs.readdirSync(game,{withFileTypes:true})){if(entry.name==='node_modules')continue;assert(!entry.isSymbolicLink());const file=path.join(game,entry.name);if(entry.isDirectory())for(const[name,hash]of Object.entries(snapshot(file)))project[entry.name+'/'+name]=hash;else project[entry.name]=sha256(fs.readFileSync(file));}
const dependencies=fs.realpathSync(path.join(game,'node_modules'));
const faults=[
 {name:'credit-omitted',kind:'runtime',file:'dist/ready-cooldown-bank.js',before:'bank.bank + amount',after:'bank.bank + 0',stages:6},
 {name:'spending-omitted',kind:'runtime',file:'dist/ready-cooldown-bank.js',before:'bank.bank - extra * unit',after:'bank.bank - 0',stages:10},
 {name:'progress-halved',kind:'source',file:'src/render/renderer.ts',before:'slot * h.progress, 5',after:'slot * h.progress * 0.5, 5',stages:6},
 {name:'hit-label-incremented',kind:'source',file:'src/render/renderer.ts',before:"'Next: ' + h.hits +",after:"'Next: ' + (h.hits + 1) +",stages:2},
 {name:'background-omitted',kind:'source',file:'src/render/renderer.ts',before:"ctx.fillStyle = '#292516'; ctx.fillRect(x, by - 46, slot, 5);",after:"ctx.fillStyle = '#292516';",stages:2},
];
let passed=false;
try{for(const fault of faults){
 const directory=path.join(out,fault.name),copy=path.join(directory,'game'),modules=path.join(copy,'node_modules'),ownPackage=path.join(modules,'@hollow-wake/engine'),output=path.join(directory,'bundle');fs.mkdirSync(copy,{recursive:true});
 for(const[file,hash]of Object.entries(project)){assert.equal(sha256(fs.readFileSync(path.join(game,file))),hash);const to=path.join(copy,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(game,file),to,fs.constants.COPYFILE_EXCL);}
 fs.mkdirSync(modules);for(const entry of fs.readdirSync(dependencies,{withFileTypes:true})){if(entry.name==='@hollow-wake'||!fs.statSync(path.join(dependencies,entry.name)).isDirectory())continue;fs.symlinkSync(path.join(dependencies,entry.name),path.join(modules,entry.name),process.platform==='win32'?'junction':'dir');}
 for(const[file,hash]of Object.entries(pkg)){const to=path.join(ownPackage,file);assert.equal(sha256(fs.readFileSync(path.join(packageDir,file))),hash);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(packageDir,file),to,fs.constants.COPYFILE_EXCL);}
 assert.deepEqual(snapshot(path.join(copy,'src')),source);assert.deepEqual(snapshot(ownPackage),pkg);
 const target=path.join(fault.kind==='runtime'?ownPackage:copy,fault.file),stat=fs.lstatSync(target),text=fs.readFileSync(target,'utf8');assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);assert.equal(text.split(fault.before).length,2,fault.name+' anchor');
 fs.writeFileSync(target,text.replace(fault.before,fault.after));const fd=fs.openSync(path.join(directory,'build.txt'),'wx');try{execFileSync(process.execPath,['scripts/build-game-item-ui.mjs','--game',copy,'--output',output],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd],timeout:180000});}finally{fs.closeSync(fd);}
 const run=spawnSync(process.execPath,['scripts/test-ready-bank-ui.mjs','--game',copy,'--dist',output,'--electron',electron],{cwd:root,windowsHide:true,encoding:'utf8',timeout:240000,maxBuffer:4*1024*1024});assert.equal(run.error,undefined);assert.notEqual(run.status,0,'Renderer fault escaped: '+fault.name);
 const log=run.stdout+run.stderr;fs.writeFileSync(path.join(directory,'driver.txt'),log,{flag:'wx'});
 const rejected=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/ready-bank-ui-verification.json')));assert.equal(rejected.game,copy);assert.equal(rejected.passed,false);assert(rejected.sourceUnchanged&&rejected.wholePackageUnchanged&&rejected.bundleUnchanged);
 const processLog=fs.readFileSync(path.join(rejected.trial,'process.txt'),'utf8');assert.match(processLog,/AssertionError/);assert(!/SyntaxError|ERR_MODULE_NOT_FOUND|ReferenceError|TypeError/.test(processLog));
 const observations=fs.readFileSync(path.join(rejected.reports,'ready-bank-ui.json'));assert.equal(JSON.parse(observations).length,fault.stages,'Unexpected rejection stage');if(fault.name==='background-omitted')assert.match(processLog,/Missing or duplicate bank background/);
 results.push({name:fault.name,kind:fault.kind,directory,trial:rejected.trial,reports:rejected.reports,stages:fault.stages,detected:true,driverLogSha256:sha256(log),processLogSha256:sha256(processLog),observationsSha256:sha256(observations)});console.log({fault:fault.name,detected:true,stages:fault.stages});
 }passed=true;
}finally{assert.deepEqual(snapshot(path.join(game,'src')),source);assert.deepEqual(snapshot(packageDir),pkg);assert.deepEqual(snapshot(dist),bundle);
 fs.writeFileSync(path.join(root,'.artifacts/ready-bank-ui-verification.json'),JSON.stringify(positive,null,2)+'\n');
 writeJSON(path.join(out,'verification.json'),{passed,out,positive,results,suppliedGameAndPackageUnchanged:true,suppliedBundleUnchanged:true});writeJSON(path.join(root,'.artifacts/ready-bank-ui-controls.json'),{passed,out,positive,results,suppliedGameAndPackageUnchanged:true,suppliedBundleUnchanged:true});}
