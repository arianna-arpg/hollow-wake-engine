// Original-source negative controls; never rewrites accepted expectations.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {gzipSync,gunzipSync} from 'node:zlib';import ts from 'typescript';
import {root,materialize,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
assert.equal(process.argv.length,2,'This observer control takes no arguments');
const acceptedFile=path.join(root,'baseline/hit-effects/acceptance.json'),acceptedBytes=fs.readFileSync(acceptedFile),capture=JSON.parse(acceptedBytes);
assert.equal(capture.schemaVersion,1);assert.equal(capture.courses,107);
const tracked=new Map([[acceptedFile,sha256(acceptedBytes)]]);
for(const[file,hash]of [[capture.helper,capture.helperSha256],['baseline/hit-effects/source-boundary.json',capture.sourceBoundarySha256],[capture.observations,capture.compressedSha256]]){
 const absolute=path.join(root,file);assert.equal(sha256(fs.readFileSync(absolute)),hash,file);tracked.set(absolute,hash);
}
const boundary=JSON.parse(fs.readFileSync(path.join(root,'baseline/hit-effects/source-boundary.json'))),lockFile=path.join(root,'baseline/source-lock.json'),lock=JSON.parse(fs.readFileSync(lockFile));
assert.equal(sha256(fs.readFileSync(lockFile)),boundary.sourceLockSha256);tracked.set(lockFile,boundary.sourceLockSha256);
const expected=gunzipSync(fs.readFileSync(path.join(root,capture.observations))),helper=fs.readFileSync(path.join(root,capture.helper),'utf8');assert.equal(sha256(expected),capture.observationsSha256);
assert.equal(JSON.parse(expected).rows.length,107);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-effects-observer-faults-')),game=path.join(directory,'game');materialize(null,lock,game);verifyReference(game,lock);
fs.symlinkSync(fs.realpathSync(path.join(root,'.reference/node_modules')),path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
const file=path.join(game,'src/engine/world.ts'),bytes=fs.readFileSync(file),source=bytes.toString().replaceAll('\r\n','\n'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='World'),hit=world.members.find(n=>n.name?.getText(ast)==='resolveHit');
const top=hit.body.statements,at=top.findIndex(n=>n.getText(ast)==='const effects = instanceEffects(inst);'),loop=top[at+1];assert(ts.isForOfStatement(loop));const branches=new Map();let branch=loop.statement.statements[0];while(branch){const type=branch.expression.getText(ast).match(/^fx\.type === '([^']+)'/)[1];branches.set(type,branch.thenStatement);branch=branch.elseStatement;}
const runtime=path.join(directory,'capture.ts');fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
assert.equal(branches.size,16);
const faults=[
 ['heal-power','heal','target, fx, dmgMult','target, fx, 1'],
 ['heal-self','heal','!(fx.excludeCaster && target === caster)','true'],
 ['cleanse-default','cleanse','fx.count ?? 2','fx.count ?? 1'],
 ['buff-reference','buff','inst, fx, durScale','inst, {...fx}, durScale'],
 ['buff-bond','buff','if (fx.bond)','if (false)'],
 ['rupture-multiplier','rupture','fx.mul ?? 1','1'],
 ['status-admission','status','tuneAilmentChance(fx.status, fx.chance)','0'],
 ['grab-target','grabSeize','caster, inst, target, fx.grab','caster, inst, caster, fx.grab'],
 ['possess-target','possess','caster, inst, target, fx.spec','caster, inst, caster, fx.spec'],
 ['buffet-random','knockback','rand(0, Math.PI * 2)','0'],
 ['pull-gap','pull','- caster.radius - target.radius - 12','- caster.radius - 12'],
 ['pull-dormant','pull','&& !isDormant(target)',''],
 ['absorb-duration','absorb','fx.duration * durScale','fx.duration'],
 ['restore-tags','restore','tags: def.tags','tags: []'],
 ['ward-recipient','ward','target.gainWard(fx.amount)','caster.gainWard(fx.amount)'],
 ['siphon-depth','siphonOrb','depth === 0','depth >= 0'],
 ['siphon-owner','siphonOrb','caster.owner ?? caster','caster'],
 ['birth-gate','birth','fx.onHit && dealt > 0','dealt > 0'],
 ['spread-cap','spreadStatus','fx.maxTargets ?? 8','fx.maxTargets ?? 9'],
 ['spread-story','spreadStatus','if (!sameStory(e, target)) continue;','if (false) continue;'],
 ['transfuse-story','transfuseStatus','if (!sameStory(e, target)) continue;','if (false) continue;'],
 ['spread-edge','spreadStatus','dist(target.pos, e.pos) - e.radius','dist(target.pos, e.pos)'],
 ['transfuse-donor-reference','transfuseStatus','caster.statuses.filter(s =>','caster.statuses.map(s => ({...s})).filter(s =>'],
 ['transfuse-flash-radius','transfuseStatus','radius: (fx.splash ?? 60)','radius: ((fx.splash ?? 60) * 2)'],
 ['live-effect-list','loop',': effects)',': [...effects])'],
];
const errors=data=>data.rows.flatMap(r=>r.steps.filter(s=>!s.error.$undefined).map(s=>[r.name,s.error.message]));const expectedErrors=errors(JSON.parse(expected)),results=[];let passed=false;
assert.deepEqual(expectedErrors,[['transfuse-partial-failure','transplant observer fault'],['buff-partial-failure','buff observer fault']]);
try{for(const[name,type,needle,replacement]of [['control',null,null,null],...faults,['pre-effect-order','order',null,null]]){
 let changed=source;
 if(type==='order')changed=source.slice(0,top[at-1].getStart(ast))+top[at].getText(ast)+'\n    '+top[at-1].getText(ast)+source.slice(top[at].end);
 else if(type){const node=type==='loop'?loop:branches.get(type),text=node.getText(ast);assert.equal(text.split(needle).length-1,1,'Fault selector '+name);changed=source.slice(0,node.getStart(ast))+text.replace(needle,replacement)+source.slice(node.end);}
 if(type)fs.writeFileSync(file,changed);
 const out=path.join(directory,name+'.json'),log=fs.openSync(path.join(directory,name+'.txt'),'wx');
 try{execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out],{cwd:game,stdio:['ignore',log,log],timeout:180000,windowsHide:true});}finally{fs.closeSync(log);fs.writeFileSync(file,bytes);}
 const actual=fs.readFileSync(out),matches=actual.equals(expected),value=JSON.parse(actual);assert.equal(matches,name==='control',name+' was not distinguished');assert.equal(value.courses,107);assert.deepEqual(errors(value),expectedErrors,'Unrelated exception: '+name);
 const compressed=gzipSync(actual,{level:9});assert(gunzipSync(compressed).equals(actual));fs.writeFileSync(out+'.gz',compressed,{flag:'wx'});fs.unlinkSync(out);
 results.push({name,detected:name!=='control',observationsSha256:sha256(actual),compressedSha256:sha256(compressed),matches});console.log('Verified observer: '+name);
 }passed=true;
}finally{fs.writeFileSync(file,bytes);verifyReference(game,lock);for(const[file,hash]of tracked)assert.equal(sha256(fs.readFileSync(file)),hash,file);
 const report={passed,directory,game,originalRestored:true,expectedFilesRewritten:false,acceptanceSha256:sha256(acceptedBytes),courses:107,helperSha256:capture.helperSha256,expectedSha256:capture.observationsSha256,faults:results.filter(r=>r.detected).length,results};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-effects-observer-verification.json'),report);console.log({passed,directory,faults:report.faults});}
