import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const file=path.join(root,'dist/resource-restoration.js'),original=fs.readFileSync(file),source=original.toString().replaceAll('\r\n','\n'),
  output=fs.mkdtempSync(path.join(root,'.artifacts/restoration-mutations-'));
const faults=[
  ['shield-zero-queries','gainEnergyShield','amount <= 0 || actor.dead','amount < 0 || actor.dead'],
  ['shield-dead-gains','gainEnergyShield','amount <= 0 || actor.dead','amount <= 0'],
  ['shield-zero-cap-applies','gainEnergyShield','if (max <= 0)','if (false)'],
  ['shield-no-clamp','gainEnergyShield','Math.min(max, actor.es + amount)','actor.es + amount'],
  ['shield-threshold-lost','gainEnergyShield','actor.es >= max - 0.001','actor.es >= max'],
  ['shield-flag-cleared','gainEnergyShield','return actor.es - before;','actor.esJustFilled = false; return actor.es - before;'],
  ['poise-overcharge-lost','gainPoise','max * (1 + ports.poiseOvercharge(actor))','max'],
  ['poise-dead-gains','gainPoise','amount <= 0 || actor.dead','amount <= 0'],
  ['poise-rearms-early','gainPoise','return actor.poise - before;','actor.poiseBroken = false; return actor.poise - before;'],
  ['poise-before-overcharge','gainPoise','const cap = max * (1 + ports.poiseOvercharge(actor));\n    const before = actor.poise;',
    'const before = actor.poise;\n    const cap = max * (1 + ports.poiseOvercharge(actor));'],
  ['instant-zero-no-reset','applyInstantRestoration','if (effect.resetEsDelay)','if (landed > 0 && effect.resetEsDelay)'],
  ['instant-zero-no-notification','applyInstantRestoration',"if (effect.resource !== 'poise')","if (landed > 0 && effect.resource !== 'poise')"],
  ['instant-poise-reads-cue','applyInstantRestoration',"if (effect.resource !== 'poise')",'if (true)'],
  ['instant-event-overflow','applyInstantRestoration','actor.gainEvents.length < 64','actor.gainEvents.length <= 64'],
  ['instant-ignores-no-event','applyInstantRestoration','!options?.noEvent && ',''],
  ['instant-clones-tags','applyInstantRestoration','tags: options?.tags','tags: options?.tags ? [...options.tags] : undefined'],
  ['instant-mana-query-late','applyInstantRestoration','Math.min(ports.availableMana(actor), actor.mana + effect.amount)',
    'Math.min(actor.mana + effect.amount, ports.availableMana(actor))'],
  ['instant-uses-request','applyInstantRestoration','return landed;','return effect.amount;'],
  ['proc-reserved-percentage','applyProcRestoration','ports.maximumMana(actor)','ports.availableMana(actor)'],
  ['proc-skips-zero-query','applyProcRestoration',"(effect.resource === 'mana' ? ports.maximumMana(actor)","(effect.pctMax === undefined || effect.pctMax === 0 ? 0 : effect.resource === 'mana' ? ports.maximumMana(actor)"],
  ['proc-cues-without-growth','applyProcRestoration','return after > before;','return true;'],
  ['proc-loses-reset','applyProcRestoration','if (effect.resetEsDelay)','if (false)'],
  ['proc-adds-instant-event','applyProcRestoration','return after > before;',"actor.gainEvents.push({kind:'restore',id:effect.resource,depth:0,n:after-before}); return after > before;"],
];
const results=[];
for(const[name,method,before,after]of faults){
  const start=source.indexOf('export function '+method+'(');assert(start>=0);
  const next=source.indexOf('export function ',start+1),end=next<0?source.length:next;
  const body=source.slice(start,end);assert.equal(body.split(before).length-1,1,'Mutation anchor: '+name);
  const mutant=path.join(output,name+'.mjs');fs.writeFileSync(mutant,source.slice(0,start)+body.replace(before,after)+source.slice(end),{flag:'wx'});
  const syntax=spawnSync(process.execPath,['--check',mutant],{encoding:'utf8',windowsHide:true});assert.equal(syntax.status,0,syntax.stderr);
  const result=spawnSync(process.execPath,['--test','--test-reporter=tap','test/resource-restoration.test.mjs'],{
    cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:32*1024*1024,
    env:{...process.env,HOLLOW_WAKE_RESTORATION_MODULE:pathToFileURL(mutant).href}});
  assert.equal(result.error,undefined);assert.notEqual(result.status,0,'Surviving mutation: '+name);
  assert.match(result.stdout,/# fail [1-9][0-9]*/,'Expected assertions, not a loader failure: '+name);
  const log=result.stdout+result.stderr;fs.writeFileSync(path.join(output,name+'.txt'),log,{flag:'wx'});
  results.push({name,rejected:true,logSha256:sha256(log)});
}
assert(fs.readFileSync(file).equals(original));
writeJSON(path.join(root,'.artifacts/restoration-mutations.json'),{output,count:results.length,results,productionRuntimeUnchanged:true});
console.log('PASS: '+results.length+' restoration faults rejected; production runtime unchanged.');
