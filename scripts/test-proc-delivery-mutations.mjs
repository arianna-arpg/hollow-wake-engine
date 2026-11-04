import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root, sha256, writeJSON} from './reference-utils.mjs';

const faults = [
  ['power-context', "'procPower_' + proc.id, instance", "'procPower_' + proc.id, null"],
  ['power-fold', 'scaleProcEffect(proc.effect, power)', 'proc.effect'],
  ['charge-depth', 'fx.max, instance ?? undefined, depth + 1', 'fx.max, instance ?? undefined, depth'],
  ['charge-cap-cue', '?? 0) > before', '?? 0) >= before'],
  ['buff-stored-false', 'fx.buff.storedCue ??', 'fx.buff.storedCue ||'],
  ['buff-announcement', ' || proc.announceName === false', ''],
  ['status-source', 'ports.status(fx, proc.name', 'ports.status(fx, proc.id'],
  ['heal-cue', 'if (ports.heal(caster, fx))', 'if (!ports.heal(caster, fx))'],
  ['cooldown-instance', 'ports.cooldown(caster, fx, instance)', 'ports.cooldown(caster, fx, null)'],
  ['restore-delegation', 'ports.restore(caster, fx)', 'false'],
  ['ward-delegation', 'ports.ward(caster, fx)', 'false'],
  ['delay-depth', 'ports.delayed(caster, fx, proc.color, depth, target)', 'ports.delayed(caster, fx, proc.color, depth + 1, target)'],
  ['burst-level', 'Math.max(0, caster.level - 1)', 'Math.max(0, caster.level)'],
  ['burst-live-level', 'ports.mitigate(enemy, fx.damage, damage)', 'ports.mitigate(enemy, fx.damage, fx.base + fx.perLevel * (caster.level - 1))'],
  ['burst-radius', 'enemy.radius > fx.radius', 'enemy.radius >= fx.radius'],
  ['invulnerability-order', 'const landed = ports.mitigate', 'if (enemy.invulnerable) continue; const landed = ports.mitigate'],
  ['shield-edge', 'enemy.esBroke = false;', 'void 0;'],
  ['shield-depth', 'ports.shieldBreak(enemy, depth + 1)', 'ports.shieldBreak(enemy, depth)'],
  ['sweep-depth', 'ports.sweepDefenses(enemy, depth + 1)', 'ports.sweepDefenses(enemy, depth)'],
  ['lethal-burst', 'ports.kill(enemy);', 'void enemy;'],
  ['fortify-magnitude', '(fx.pctMaxLife ?? 0) * caster.maxLife()', '(fx.pctMaxLife ?? 0)'],
  ['fortify-cue', 'if (banked > 0)', 'if (banked >= 0)'],
  ['fortify-copy', 'ports.copyPosition(caster.pos), caster.radius + 8', 'caster.pos, caster.radius + 8'],
  ['duplicate-removal', 'of fx.buff)', 'of new Set(fx.buff))'],
  ['explicit-cleanse', 'new Set(fx.statuses)', 'new Set()'],
  ['ailment-cleanse', 'fx.afflictions && def.dotType', 'false'],
  ['cc-cleanse', 'fx.hardCC && def.hardCC', 'false'],
  ['cleanse-cue', 'caster.statuses.length < before', 'caster.statuses.length <= before'],
  ['kindle-copy', 'ports.lightwell(fx.kind, ports.copyPosition(at))', 'ports.lightwell(fx.kind, at)'],
  ['vent-duration-context', "ports.stat(caster, 'effectDuration'), caster.tier", "ports.stat(caster, 'effectDuration', instance), caster.tier"],
  ['cast-aim', 'depth + 1, fx.cast, aim', 'depth + 1, fx.cast, undefined'],
  ['cast-depth', 'depth + 1, fx.cast, aim', 'depth, fx.cast, aim'],
  ['zero-hit-instance', 'instance != null && target', 'instance && target', 2],
  ['collision-radius', "kind === 'extraHit' ? 8 : 10", '8'],
  ['splash-story', 'ports.sameStory(target, enemy)', 'ports.sameStory(caster, enemy)'],
  ['splash-edge', 'enemy.radius <= fx.radius', 'enemy.radius < fx.radius'],
  ['zero-arc-instance', 'instance == null || !target', '!instance || !target'],
  ['fractional-hops', 'hop < fx.hops', 'hop < Math.floor(fx.hops)'],
  ['arc-tie', 'distance <= nearest', 'distance < nearest'],
  ['arc-repeat', ' || struck.has(enemy)', ''],
  ['arc-live-origin', 'from = best;', 'from = target;'],
  ['signed-push', 'fx.force > 0 ?', 'fx.force >= 0 ?'],
  ['push-magnitude', 'Math.abs(fx.force)', 'fx.force'],
  ['summon-cap', 'ports.summonCount(owner, key) >= fx.max', 'ports.summonCount(owner, key) > fx.max'],
  ['summon-owner', 'key = \'__proc:\' + proc.id, owner = caster.owner ?? caster', "key = '__proc:' + proc.id, owner = caster"],
  ['summon-lifeline', 'ports.lifeline(owner)', 'ports.lifeline(caster)'],
  ['summon-sockets', 'ports.forwardSockets(instance, summon);', 'void 0;'],
  ['summon-context', "ports.stat(owner, 'effectDuration', instance)", "ports.stat(caster, 'effectDuration', instance)"],
  ['summon-identity', 'summon.summonInst = instance;', 'void 0;'],
  ['census-length', 'i < end; i++', 'i < actors.length; i++'],
  ['census-dead', ' && !actor.dead', ''],
  ['birth-site', '!!target && site === target', 'false'],
  ['birth-position', 'ports.copyPosition(site.pos)', 'site.pos'],
  ['rider-depth', 'ports.riders(proc, caster, instance, target, depth)', 'ports.riders(proc, caster, instance, target, depth + 1)'],
];

fs.mkdirSync(path.join(root, '.artifacts'), {recursive:true});
const directory = fs.mkdtempSync(path.join(root,'.artifacts/proc-delivery-mutations-'));
const file = path.join(root,'dist/proc-delivery.js'), source = fs.readFileSync(file,'utf8');
const testFile = path.join(root,'test/proc-delivery.test.mjs');
const testHash = sha256(fs.readFileSync(testFile));
fs.copyFileSync(path.join(root,'dist/proc-effects.js'),path.join(directory,'proc-effects.js'));
const results = [], failures = [];
function run(name, code) {
  const module = path.join(directory,name+'.mjs'); fs.writeFileSync(module,code,{flag:'wx'});
  const result = spawnSync(process.execPath,['--test','--test-reporter=tap',testFile],{cwd:root, encoding:'utf8', windowsHide:true,
    timeout:30000,env:{...process.env,HWE_PROC_DELIVERY_MODULE:pathToFileURL(module).href}});
  assert(!result.error && !result.signal,name);
  const log = result.stdout + result.stderr; fs.writeFileSync(path.join(directory,name+'.txt'),log,{flag:'wx'});
  assert(!/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/.test(log),name+' unrelated exception');
  if(name==='control'){assert.equal(result.status,0);assert.match(log,/# pass 20/);}
  else{assert.equal(result.status,1,name+' survived');assert.match(log,/ERR_ASSERTION|Expected values to be strictly(?: deep-)?equal:|Expected "actual" to be reference-equal to "expected":/,name+' no behavioral failure');}
  results.push({name,status:result.status,sourceSha256:sha256(code),logSha256:sha256(log)});
}
let passed = false;
try {
  run('control',source);
  for(const [name,needle,replacement,count=1] of faults) {
    try {
      assert.equal(source.split(needle).length-1,count,name+' selection');
      run(name,source.replaceAll(needle,replacement));
    } catch (error) {
      failures.push({name,reason:error.message.split('\n')[0]});
    }
  }
  assert.deepEqual(failures,[]);
  passed=true;
} finally {
  assert.equal(fs.readFileSync(file,'utf8'),source);assert.equal(sha256(fs.readFileSync(testFile)),testHash);
  const report={passed,directory,faults:results.filter(r=>r.name!=='control').length,tests:20,sourceSha256:sha256(source),testSha256:testHash,results,failures};
  writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/proc-delivery-mutation-verification.json',report);
  console.log({passed,directory,faults:report.faults});
}
