import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
const temp=fs.mkdtempSync(path.join(root,'.artifacts/condition-mutations-'));
for(const folder of ['dist','test'])fs.cpSync(path.join(root,folder),path.join(temp,folder),{recursive:true});
fs.cpSync(path.join(root,'baseline/milestone-thirty-seven'),path.join(temp,'baseline/milestone-thirty-seven'),{recursive:true});
writeJSON(path.join(temp,'package.json'),{type:'module'});
const target=path.join(temp,'dist/actor-conditions.js'),source=fs.readFileSync(target,'utf8'),results=[];
for(const [name,before,after]of [
  ['low-life-inclusive','actor.life < maxLife','actor.life <= maxLife'],
  ['full-life-exclusive','actor.life >= maxLife','actor.life > maxLife'],
  ['stride-exclusive','actor.strideDist >= reach','actor.strideDist > reach'],
  ['recency-inclusive','actor.since[row.index] < row.seconds','actor.since[row.index] <= row.seconds'],
  ['birth-events','actor.condMask === -1 ? 0 : mask & ~actor.condMask','actor.condMask === -1 ? mask : mask & ~actor.condMask'],
  ['queue-cap-expanded','actor.condRose.length < 16','actor.condRose.length < 17'],
  ['sink-replacement-ignored','mask === actor.condMask && previous === sink','mask === actor.condMask'],
  ['failure-confirmed','actor.condSheet = null;\n        }','actor.condSheet = actor.sheet;\n        }'],
  ['recursion-allowed','if (previous === sampling)','if (false)'],
  ['stride-read-eager','if (actor.strideDist > 0)','if (true)'],
]){
  assert(source.includes(before),'Fault anchor changed: '+name);fs.writeFileSync(target,source.replace(before,after));
  const run=spawnSync(process.execPath,['--test','test/actor-conditions.test.mjs'],{cwd:temp,encoding:'utf8'}),output=run.stdout+run.stderr;
  fs.writeFileSync(target,source);assert(run.status!==0&&/AssertionError/.test(output)&&!/ERR_MODULE_NOT_FOUND|SyntaxError/.test(output),'Fault not behaviorally detected: '+name);
  fs.writeFileSync(path.join(temp,name+'.txt'),output);results.push({name,detected:true});console.log('Rejected condition fault: '+name);
}
writeJSON(path.join(root,'.artifacts/actor-condition-mutation-verification.json'),{faults:results.length,results,productionUnchanged:fs.readFileSync(path.join(root,'dist/actor-conditions.js'),'utf8')===source});
