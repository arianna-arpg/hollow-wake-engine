import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const source=fs.readFileSync(path.join(root,'dist/damage-pipeline.js'),'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/damage-mutations-'));
const mutations=[
  ['armor','DEFENSE_CFG.armor.k * dmg / (Math.max(0, armor) + DEFENSE_CFG.armor.k * dmg)','1'],
  ['penetration','res - p','res + p'],
  ['insight','total -= avoided;','total += avoided;'],
  ['poise-drain','DEFENSE_CFG.poise.drainFlat','0'],
  ['endurance','target.endurance - prevented * DEFENSE_CFG.endurance.spendRatio','target.endurance'],
  ['ledger','aura.ledger.balance += skim;','aura.ledger.balance += 0;'],
  ['block','wound - stopped','wound'],
  ['crit-avoidance','packet.amounts[t] /= multi','packet.amounts[t] *= multi'],
  ['hit-cap','landed = cap;','landed = cap + 1;'],
  ['ply','target.plies - 1 - rend','target.plies - 1'],
  ['last-gasp','target.life = stood;','target.life = stood + 1;'],
  ['leech','healed * (leech / Math.max(0.000001, onHit + leech))','healed * 0'],
  ['dot-shield-resistance','total *= 1 - resist;','total *= 1 + resist;'],
  ['shield-bypass','total * (1 - bypass) * shred','total * shred'],
  ['expiry','layer.remaining > 1e-9','layer.remaining > 0'],
  ['added-flat',"fire: 'addedFire'","fire: 'added_fire'"],
  ['conversion-extra','(amounts[to] ?? 0) + total * frac','(amounts[to] ?? 0) + total * frac * 2'],
  ['incoming-normalization','Math.max(1, sum)','1'],
  ['lucky','if (lucky !== unlucky)','if (false)'],
];
const results=[];
for(const [name,needle,replacement] of mutations){
  const matches=source.split(needle).length-1;assert.equal(matches,1,'Fault selector '+name);
  const file=path.join(directory,name+'.mjs');fs.writeFileSync(file,source.replace(needle,replacement));
  const result=spawnSync(process.execPath,['--test',path.join(root,'test/damage-pipeline.test.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,HWE_DAMAGE_MODULE:file},timeout:30000});
  const text=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),text);
  assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');assert.match(text,/ERR_ASSERTION/,name+' must fail a behavior assertion');assert(!/SyntaxError/.test(text),name);
  results.push({name,detected:true,sha256:sha256(fs.readFileSync(file))});
}
const report={passed:true,directory,sourceSha256:sha256(source),faults:results.length,results};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/damage-mutation-verification.json'),report);console.log({directory,faults:results.length,passed:true});
