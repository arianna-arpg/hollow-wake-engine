import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';import {root,sha256,writeJSON} from './reference-utils.mjs';
const source=fs.readFileSync(path.join(root,'dist/hit-landing.js'),'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-landing-mutations-'));
// Count and optional occurrence index make repeated selectors explicit.
const mutations=[
 ['force-admission','forceDamage || ',''],
 ['captured-admission','def.effects.some','inst.def.effects.some'],
 ['unconditional-admission',"forceDamage || def.effects.some(effect => effect.type === 'damage')",'true'],
 ['bind-deeds','ports.bindDeeds();','void 0;'],
 ['hidden-concealment','|| ports.concealed(caster, ports.time())',''],
 ['hidden-detectability',"caster.sheet.get('detectability') < 1",'false'],
 ['self-damage-floor','Math.max(0, target.life)','target.life'],
 ['critical-capture','wasCrit = result.crit','wasCrit = false'],
 ['meta-admission','if (ports.metaActive())','if (false)'],
 ['block-deed-positive','&& (result.blockedAmount ?? 0) > 0',''],
 ['deed-alive-before','deedLifeBefore > 0 && ',''],
 ['deed-owner','&& ports.deedOwned(caster)',''],
 ['deed-poise','if (result.poiseBroke)','if (false)'],
 ['deed-elements','(result.receivedAmounts ?? packet.amounts)','packet.amounts'],
 ['evade-heal','if (mend > 0)','if (mend >= 0)',2,0],
 ['evade-stamp',"target.noteRecent('evade')","target.noteRecent('hurt')"],
 ['evade-spend',"target.spendBuffs('evade')","target.spendBuffs('hurt')"],
 ['striker-tag-identity','{ tags: packet.tags, extra, inst, target, depth }','{ tags: new Set(packet.tags), extra, inst, target, depth }',2],
 ['evade-return','return;','',3,0],
 ['block-thorns','ports.thorns(target, caster);',''],
 ['block-depth','depth === 0','depth <= 0'],
 ['block-heal','if (mend > 0)','if (mend >= 0)',2,1],
 ['block-spend',"target.spendBuffs('block')","target.spendBuffs('hurt')"],
 ['block-trigger','ports.blockTriggers(target, caster);',''],
 ['block-dead','&& !target.dead',''],
 ['block-return','return;','',3,1],
 ['immune-wounding','struckTone, false, inst','struckTone, true, inst'],
 ['immune-return','return;','',3,2],
 ['mimic-enemy',"&& caster.team === 'enemy'",''],
 ['mimic-watch','target.mimicWatch && ',''],
 ['dealt-capture','dealt = result.total','dealt = 0'],
 ['rear-positive','rearHit && dealt > 0','rearHit'],
 ['rear-disabled','&& def.backstabCue !== false',''],
 ['struck-zero','if (result.receivedAmounts)','if (dealt > 0 && result.receivedAmounts)'],
 ['received-identity','receivedAmounts: result.receivedAmounts','receivedAmounts: {...result.receivedAmounts}',2],
 ['hit-stamp-order',"caster.noteRecent('hit');\n                target.noteRecent('hurt');","target.noteRecent('hurt');\n                caster.noteRecent('hit');"],
 ['pool-zero','if (dealt > 0)','if (dealt >= 0)',2,1],
 ['pool-value-snapshot','amount ?? 0','packet.amounts[type] ?? 0'],
 ['result-identity','landedResult = result;','landedResult = {...result};'],
 ['packet-identity','def, extra, packet, rearHit, struckTone, afflictionCarry, hasDamage','def, extra, {...packet}, rearHit, struckTone, afflictionCarry, hasDamage'],
 ['continuation-return','return ports.continue(','ports.continue('],
];
const results=[];
for(const[name,needle,replacement,count=1,occurrence]of mutations){
 assert.equal(source.split(needle).length-1,count,'Fault selector '+name);
 let changed;if(occurrence===undefined)changed=source.replaceAll(needle,replacement);else{let at=-needle.length;for(let i=0;i<=occurrence;i++)at=source.indexOf(needle,at+needle.length);assert(at>=0);changed=source.slice(0,at)+replacement+source.slice(at+needle.length);}
 const file=path.join(directory,name+'.mjs');fs.writeFileSync(file,changed);
 const result=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join(root,'test/hit-landing.test.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,HWE_HIT_LANDING_MODULE:pathToFileURL(file).href},timeout:30000,windowsHide:true});
 const output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output);
 assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');assert.match(output,/ERR_ASSERTION/,name+' must fail behavior');assert(!/SyntaxError|TypeError|ReferenceError|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_ESM_URL_SCHEME/.test(output),name+' introduced an unrelated failure');
 results.push({name,detected:true,sha256:sha256(fs.readFileSync(file))});
}
assert.equal(sha256(fs.readFileSync(path.join(root,'dist/hit-landing.js'))),sha256(source));
const report={passed:true,directory,sourceSha256:sha256(source),faults:results.length,results};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-landing-mutation-verification.json'),report);console.log({passed:true,directory,faults:results.length});
