import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import ts from 'typescript';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const file=path.join(root,'dist/hit-reactions.js'),source=fs.readFileSync(file,'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-reactions-mutations-'));
const ast=ts.createSourceFile('hit-reactions.js',source,ts.ScriptTarget.Latest,true),factory=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createHitReactions'),apply=factory.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='apply'),statements=apply.body.statements;assert.equal(statements.length,29);
const faults=[
 ['author-clock',0,'ports.time()','ports.time()+1'],['victim-clock',1,'ports.time()','ports.time()+1'],['strike-clock',2,'ports.time()','ports.time()+1'],['strike-author',3,'caster.id','target.id'],
 ['explicit-origin',4,'hitOrigin ??','undefined ??'],['nested-origin',4,'depth > 0','depth >= 0'],
 ['hostility',5,'ports.hostileTo(target, caster)','false'],['alert-max',5,'Math.max','Math.min'],['alert-scale',5,'ports.alertScale(target)','1'],['zero-tier',5,'hitTier ?? caster.tier','hitTier || caster.tier'],
 ['foe-team',6,'target.team !== caster.team','target.team === caster.team'],['victim-drive',7,'target,','caster,'],['author-drive',8,'caster,','target,'],
 ['loot-cadence',9,'> 0.4','>= 0.4'],['loot-order',9,'.pop()','.shift()'],['loot-stamp',9,'target.lastSpillAt = ports.time();','target.lastSpillAt = ports.time()+1;'],['loot-identity',9,'target, item','target, {...item}'],
 ['essence-positive',10,'dealt > 0 && target.defId','target.defId'],['wound-reset',11,'target.recentHurt = 0;','target.recentHurt = 1;'],
 ['threat-zero',12,'?? ports.baseThreatWeight(target.brain) ?? 1','|| (ports.baseThreatWeight(target.brain) ?? 1)'],['threat-weight',12,'dealt * tw * gen','dealt * gen'],['threat-live-mods',12,'ports.instanceMods(inst)','extra'],['threat-tags',12,'ports.tags(def)','new Set()'],
 ['fragile-gate',13,'if (b.def.clearOnHit)','if (true)'],['fragile-iteration',13,'of target.buffs','of [...target.buffs]'],
 ['charge-depth',14,'depth === 0','depth >= 0'],['charge-counterpart',14,"ports.tapCharges(caster, 'hit', target)","ports.tapCharges(caster, 'hit', caster)"],['orb-cap',14,'ports.orbCount() < ports.orbCap','ports.orbCount() <= ports.orbCap'],['orb-construct',14,' && !target.construct',''],['orb-chance',14,'Math.min(0.5, c)','Math.min(1, c)'],['orb-keys',14,'ports.orbKeys()','ports.orbKeys().slice(0,1)'],['spool',14,'(caster.casting.hitSpool ?? 0) + 1','(caster.casting.hitSpool ?? 0) + 2'],
 ['rouse',15,'ports.rouseOnWound(target);','void target;'],['ambush',16,'target.ambushArmed','false'],
 ['stealth-radius',17,'> 320','>= 320'],['stealth-tier',17,'if (a.dead ||','if (a.tier !== target.tier || a.dead ||'],['stealth-origin',17,'if (!a.alertFrom)','if (true)'],['stealth-iteration',17,'of ports.actors()','of [...ports.actors()]'],
 ['watch-aggro',18,'&& !target.aggroed',''],['watch-point',18,'if (target.watchAt)','if (false)'],['watch-rung',18,'Math.max(target.watchRung,','Math.min(target.watchRung,'],
 ['low-life',19,'ports.player().life <','ports.player().life >'],['borrowed-result',20,'dealt, result','dealt, {...result}'],['cull',21,'result.culled','false'],['clamp',22,'result.clamped','false'],['poise',23,'result.poiseBroke','false'],['shield-clear',24,'target.esBroke = false','target.esBroke = true'],['defense-depth',25,'target, depth','target, 0'],
 ['captured-critical',26,'if (wasCrit)','if (result.crit)'],['trigger-depth',26,'inst.state?.trigDepth ?? 0','0'],['trigger-aim',26,'ports.aimPoint(target)','ports.aimPoint(caster)'],['zero-roll',27,'packet.rollT !== undefined','packet.rollT'],['roll-fraction',27,'rollT: packet.rollT','rollT: (packet.rollT ?? 0)+.1'],['captured-damage',28,'target, dealt, caster','target, result.total, caster'],
];
const run=module=>spawnSync(process.execPath,['--test','--test-reporter=tap','test/hit-reactions.test.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,HWE_HIT_REACTIONS_MODULE:module},timeout:30000,windowsHide:true});
const control=run(''),controlOutput=(control.stdout??'')+(control.stderr??'');fs.writeFileSync(path.join(directory,'control.txt'),controlOutput);assert.equal(control.status,0);assert.match(controlOutput,/# pass 32/);
const results=[];let passed=false;
try{for(const[name,index,needle,replacement]of faults){
 const node=statements[index],text=node.getText(ast);assert.equal(text.split(needle).length-1,1,'Fault selector '+name);const changed=source.slice(0,node.getStart(ast))+text.replace(needle,replacement)+source.slice(node.end),target=path.join(directory,name+'.mjs');fs.writeFileSync(target,changed,{flag:'wx'});
 const result=run(pathToFileURL(target).href),output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output,{flag:'wx'});
 assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');assert.match(output,/ERR_ASSERTION/,name+' must fail behavior');assert(!/SyntaxError|TypeError|ReferenceError|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_ESM_URL_SCHEME/.test(output),name+' unrelated failure');
 results.push({name,detected:true,sourceSha256:sha256(changed),outputSha256:sha256(output)});
 }passed=true;
}finally{assert.equal(sha256(fs.readFileSync(file)),sha256(source));const report={passed,directory,tests:32,sourceSha256:sha256(source),faults:results.length,results,runtimeUnchanged:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-reactions-mutation-verification.json',report);console.log({passed,directory,faults:results.length});}
