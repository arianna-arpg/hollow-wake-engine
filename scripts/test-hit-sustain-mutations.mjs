import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import ts from 'typescript';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const file=path.join(root,'dist/hit-sustain.js'),source=fs.readFileSync(file,'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-sustain-mutations-'));
const ast=ts.createSourceFile('hit-sustain.js',source,ts.ScriptTarget.Latest,true),factory=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createHitSustain'),apply=factory.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='apply'),statements=apply.body.statements;assert.equal(statements.length,3);
const faults=[
 ['siphon-zero',0,'dealt > 0','dealt >= 0'],['siphon-truth',0,'def.siphon &&','(def.siphon ?? 0) > 0 &&'],['siphon-dead',0,' && !caster.dead',''],['siphon-depth',0,'dealt > 0','dealt > 0 && depth === 0'],
 ['siphon-power',0,"caster.sheet.get('healPower', ports.tags(def), extra)",'1'],['modifier-identity',0,'ports.tags(def), extra','ports.tags(def), [...extra]'],['siphon-measured',0,'target, gained,','target, dealt,'],['siphon-cue',0,'gained, def.feedingCue','gained, undefined'],
 ['share-depth',1,'depth === 0','depth <= 0'],['share-dead-caster',1,' && !caster.dead',''],['share-zero',1,'if (vamp > 0)','if (vamp >= 0)'],['share-story',1,'!ports.sameStory(ally, caster)','false'],
 ['share-dead',1,'ally.dead || ',''],['share-team',1,'ally.team !== caster.team || ',''],['share-self',1,' || ally === caster',''],['share-radius',1,'> ports.sharingRadius','>= ports.sharingRadius'],
 ['share-distance',1,'ports.distance(caster.pos, ally.pos)','ports.distance(target.pos, ally.pos)'],['share-snapshot',1,'for (const ally of ports.actors())','for (const ally of [...ports.actors()])'],['share-measured',1,'target, got,','target, heal,'],
 ['share-text',1,'if (got > 0.5)\n                        ports.sharedHealingCue','if (got >= 0.5)\n                        ports.sharedHealingCue'],
 ['bond-order',1,'ports.actors().find','[...ports.actors()].reverse().find'],['bond-dead',1,'bonded.dead || ',''],['bond-buff',1,' || !bonded.buffs.has(caster.bond.buffId)',''],['bond-clear',1,'caster.bond = undefined;','void 0;'],
 ['bond-positive',1,'if (share > 0)','if (share >= 0)'],['bond-feed',1,'def.bondFeed ?? 1','def.bondFeed || 1'],['bond-text',1,'if (got > 0.5)\n                            ports.bondedHealingCue','if (got >= 0.5)\n                            ports.bondedHealingCue'],
 ['tree-depth',2,'depth === 0','depth <= 0'],['tree-caster',2,'depth === 0','depth === 0 && !caster.dead'],['tree-story',2,'ports.sameStory(tree, target)','ports.sameStory(tree, caster)'],['tree-dead',2,'tree.dead || ',''],['tree-team',2,' || tree.team !== caster.team',''],
 ['tree-range',2,'> tree.construct.range','>= tree.construct.range'],['tree-cap',2,'Math.min(burst.cap, (tree.construct.stored ?? 0) + dealt)','(tree.construct.stored ?? 0) + dealt'],['tree-add',2,'(tree.construct.stored ?? 0) + dealt','dealt'],['tree-base',2,'tree.construct.baseRadius ?? tree.radius','tree.construct.baseRadius || tree.radius'],['tree-growth',2,'1 + 0.6 *','1 + 0.5 *'],
 ['tree-burst-capture',2,'Math.min(burst.cap,','Math.min(tree.construct.healBurst.cap,'],
];
const run=module=>spawnSync(process.execPath,['--test','--test-reporter=tap','test/hit-sustain.test.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,HWE_HIT_SUSTAIN_MODULE:module},timeout:30000,windowsHide:true});
const control=run(''),controlOutput=(control.stdout??'')+(control.stderr??'');fs.writeFileSync(path.join(directory,'control.txt'),controlOutput);assert.equal(control.status,0);assert.match(controlOutput,/# pass 24/);
const results=[];let passed=false;
try{for(const[name,index,needle,replacement]of faults){
 const node=statements[index],text=node.getText(ast);assert.equal(text.split(needle).length-1,1,'Fault selector '+name);const changed=source.slice(0,node.getStart(ast))+text.replace(needle,replacement)+source.slice(node.end),target=path.join(directory,name+'.mjs');fs.writeFileSync(target,changed);
 const result=run(pathToFileURL(target).href),output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output);
 assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');assert.match(output,/ERR_ASSERTION/,name+' must fail behavior');assert(!/SyntaxError|TypeError|ReferenceError|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_ESM_URL_SCHEME/.test(output),name+' unrelated failure');
 results.push({name,detected:true,sourceSha256:sha256(changed),outputSha256:sha256(output)});
 }passed=true;
}finally{assert.equal(sha256(fs.readFileSync(file)),sha256(source));const report={passed,directory,tests:24,sourceSha256:sha256(source),faults:results.length,results,runtimeUnchanged:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-sustain-mutation-verification.json',report);console.log({passed,directory,faults:results.length});}
