import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import ts from 'typescript';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const file=path.join(root,'dist/hit-aftermath.js'),source=fs.readFileSync(file,'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-aftermath-mutations-'));
const ast=ts.createSourceFile('hit-aftermath.js',source,ts.ScriptTarget.Latest,true),factory=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createHitAftermath'),apply=factory.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='apply');
const top=[...apply.body.statements],inner=[...top[0].thenStatement.statements];assert.equal(top.length,28);assert.equal(inner.length,16);
const faults=[
 ['volatile-life','inner',0,'target.life > 0','true'],['volatile-dead','inner',0,'&& !target.dead',''],['volatile-hidden','inner',0,'&& !target.untargetable',''],
 ['volatile-ready','inner',0,'ports.time() >= target.volatileReadyAt','ports.time() > target.volatileReadyAt'],['volatile-chance','inner',0,'ports.chance(target.volatile.chance)','true'],
 ['volatile-zero-icd','inner',0,'target.volatile.icd ?? 1.5','target.volatile.icd || 1.5'],['volatile-cache','inner',0,'target.volatileInst ??=','target.volatileInst ='],['volatile-round-level','inner',0,'Math.round(target.level)','Math.floor(target.level)'],
 ['volatile-quiet','inner',0,'target.volatile.cue !== false','true'],['volatile-aim','inner',0,'ports.copyPosition(caster)','ports.copyPosition(target)'],['volatile-zero-scale','inner',0,'target.volatile.dmgMult ?? 1','target.volatile.dmgMult || 1'],
 ['element-ready','inner',1,'ports.time() >= target.onHitTypeReadyAt','ports.time() > target.onHitTypeReadyAt'],['element-zero-icd','inner',1,'target.onHitTypeIcd ?? 0.8','target.onHitTypeIcd || 0.8'],
 ['element-zero-chance','inner',1,'row.chance !== undefined','!!row.chance'],['element-packet-type','inner',1,'packet.amounts[dtype]','packet.amounts.physical'],['element-first-row','inner',1,'break;','continue;'],['element-cache','inner',1,'if (!oi)','if (true)'],
 ['fixture-wound','inner',2,'dealt > 0','dealt >= 0'],
 ['contagion-generation','inner',3,'gen < lid','gen <= lid'],['contagion-ready','inner',3,'ports.time() >= target.contagionReadyAt','ports.time() > target.contagionReadyAt'],['contagion-seen-gate','inner',3,'!chain?.seen.has(target.id)','true'],
 ['contagion-decay-zero','inner',3,'cg.decay ?? ports.contagionConfig.decay','cg.decay || ports.contagionConfig.decay'],['contagion-shared-set','inner',3,'chain?.seen ?? new Set()','new Set(chain?.seen)'],['contagion-next-generation','inner',3,'gen: gen + 1','gen: gen'],
 ['contagion-delay-zero','inner',3,'cg.delay ?? ports.contagionConfig.delay','cg.delay || ports.contagionConfig.delay'],['contagion-zero-scale','inner',3,'cg.damageScale ?? 1','cg.damageScale || 1'],
 ['spread-story','inner',4,'!ports.sameStory(e, target)','false'],['spread-existing-status','inner',4,'|| e.statuses.some(x => x.id === s.id)',''],['spread-tie','inner',4,'dd <= bd','dd < bd'],
 ['curse-self-instance','inner',5,'hex.inst === inst','false'],['curse-live-map','inner',5,'of caster.hexToggles.values()','of [...caster.hexToggles.values()]'],['curse-dead','inner',5,'&& !target.dead',''],['curse-depth','inner',5,'depth === 0','depth >= 0'],
 ['discharge-composition','inner',6,'ports.dischargeStatuses(caster, target, packet, dealt, depth);','void target;'],['assault-plant-composition','inner',7,'ports.plantAssault(caster, target, packet, depth, dealt);','void target;'],['impale-composition','inner',8,'ports.plantImpale(caster, target, def, packet, extra, dealt, depth);','void target;'],
 ['echo-magnitude','inner',9,'dealt * echo','dealt + echo'],['echo-depth','inner',9,'depth === 0','depth >= 0'],
 ['dominate-cap','inner',10,').length < dom.max',').length <= dom.max'],['dominate-boss','inner',10,'&& !ports.monster(target.defId).boss',''],['dominate-minion','inner',10,'&& !target.isMinion()',''],
 ['grip-owner','inner',11,'caster.id !== target.gripping.id','caster.id === target.gripping.id'],['grip-arithmetic','inner',11,'dealt / target.maxLife()','dealt / (target.maxLife() * 2)'],
 ['thorns-damage','inner',12,'target, caster, dealt','target, caster, 0'],['iron-expiry','inner',13,'ports.time() < target.ironWard.until','ports.time() <= target.ironWard.until'],['iron-cap','inner',13,'Math.min','Math.max'],
 ['share-depth','inner',14,'depth === 0','depth >= 0'],['share-construct','inner',14,'&& !m.construct',''],['share-hidden','inner',14,'&& !m.untargetable',''],['share-ceiling','inner',14,'Math.min(target.lifeCeiling(), target.life + moved)','target.life + moved'],
 ['share-fixed-recipients','inner',14,'m.life -= per;','if (m.dead || m.owner !== target) continue; m.life -= per;'],['share-division','inner',14,'moved / pack.length','moved'],
 ['retaliate-charge','inner',15,'< 1','< 0'],['retaliate-cap','inner',15,').length >= rt.max',').length > rt.max'],['retaliate-spending','inner',15,'target.spendCharge(rt.charge, 1);','void target;'],['retaliate-first','inner',15,'break;','continue;'],
 ['displacement-melee','top',1,"packet.tags.has('melee') ? 1",'false ? 1'],['displacement-buffet','top',1,"caster.sheet.get('knockBuffet', packet.tags, extra) > 0",'false'],['displacement-sign','top',1,'force > 0','force < 0'],
 ['current-life-nonlethal','top',2,'target.life - 1','target.life'],['current-life-resistance','top',2,'1 - ports.resistance(target, elem)','1'],
 ['status-frame-carry','top',3,'depth, afflictionCarry','depth, 0'],['status-context-composition','top',4,'const { tags } = hitStatusFrame;','const tags = new Set();'],
 ['rider-composition','top',5,'ports.applyRiders(hitStatusFrame);','void hitStatusFrame;'],['before-effects-composition','top',6,'ports.beforeEffects(caster, inst, target, dealt, depth);','void target;'],
 ['authored-effects-composition','top',7,'ports.dispatchEffects(hitStatusFrame, dmgMult, hitEffects);','void hitStatusFrame;'],['granted-status-composition','top',8,'ports.applyGrantedStatuses(hitStatusFrame);','void hitStatusFrame;'],
 ['splash-story','top',9,'!ports.sameStory(e, target)','false'],['splash-radius-edge','top',9,'- e.radius > splash','- e.radius >= splash'],['splash-magnitude','top',9,'dmgMult * 0.5','dmgMult'],
 ['hit-orb-cap','top',10,'ports.orbCount() < ports.orbCap','ports.orbCount() <= ports.orbCap'],['hit-orb-rate','top',10,'* rate, ports.time()','* 1, ports.time()'],['hit-orb-enumeration','top',10,'ports.orbKeys()',"['life']"],
 ['remnant-cap','top',11,'ports.remnantCount() < 14','ports.remnantCount() <= 14'],['remnant-chance-cap','top',11,'Math.min(0.4, rc)','Math.min(1, rc)'],['remnant-rolled-element','top',11,'|| (packet.amounts[el] ?? 0) > 0',''],
 ['bell-admission','top',12,'dealt > 0','dealt >= 0'],['lethal-capture','top',13,'target.life <= 0 && !target.dead','false'],
 ['kill-life','top',14,'caster.healBy(lk)','caster.healBy(lk * 2)'],['kill-mana-cap','top',14,'Math.min(caster.availableMaxMana(), caster.mana + mk)','caster.mana + mk'],['kill-shield-cap','top',14,'Math.min(caster.maxEs(), caster.es + ek)','caster.es + ek'],
 ['throng-hit-composition','top',15,'ports.throngOnHit(caster, target, wasCrit, lethal);','void target;'],['throng-attack','top',16,"tags.has('attack')",'false'],['throng-magnitude','top',16,'36, splash, target','36, splash * 2, target'],
 ['spawn-due','top',17,'s.gauge >= spec.hits','s.gauge > spec.hits'],['spawn-reset','top',17,'s.gauge = 0','s.gauge = 1'],['spawn-chance','top',17,'ports.chance(spec.pct)','true'],
 ['elite-rarity','top',18,"target.rarity === 'rare'",'false'],['ordinary-proc-composition','top',19,'ports.hitProcs(caster, inst, target, packet, dealt, depth, wasCrit, lethal, elite, tags, extra);','void target;'],
 ['carry-owner-gate','top',20,'&& !caster.owner.dead',''],['carry-kill-chance','top',20,'spec.chance !== undefined','!!spec.chance'],
 ['assault-after-composition','top',21,'ports.assaultAfterHit(caster, target, dealt, depth, hasDamage);','void target;'],['doom-composition','top',22,'ports.assaultDoomCull(target);','void target;'],['challenge-after-composition','top',23,'ports.challengeAfterHit(caster, inst, target, dealt, depth, dmgMult);','void target;'],
 ['sequence-physical','top',24,'packet.amounts.physical ?? 0','dealt'],['spent-live-context','top',25,'ports.contextTags(inst)','new Set(def.tags)'],['spent-stride','top',25,'caster.strideSpent = true','caster.strideSpent = false'],
 ['final-death-live','top',26,'target.life <= 0 && !target.dead','lethal'],['kill-trigger-composition','top',26,"ports.rollTriggers(caster, 'kill',","ports.rollTriggers(caster, 'meleeHit',"],
 ['melee-trigger-depth','top',27,'depth === 0','depth >= 0'],['melee-trigger-stamp','top',27,'&& !inst.state?.trigDepth',''],['melee-trigger-spec','top',27,'&& !ports.instanceTrigger(inst)',''],
];
const prepared=faults.map(([name,section,index,needle,replacement])=>{
 const node=(section==='top'?top:inner)[index],text=node.getText(ast);assert.equal(text.split(needle).length-1,1,'Fault selector '+name);
 const changed=source.slice(0,node.getStart(ast))+text.replace(needle,replacement)+source.slice(node.end);
 assert.equal(ts.createSourceFile(name,changed,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,name);
 return{name,changed};
});
const testFile=path.join(root,'test/hit-aftermath.test.mjs'),testHash=sha256(fs.readFileSync(testFile));
const run=module=>spawnSync(process.execPath,['--test','--test-reporter=tap','test/hit-aftermath.test.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,HWE_HIT_AFTERMATH_MODULE:module},timeout:30000,windowsHide:true});
const results=[];let passed=false;
try {
 const control=run(''),output=(control.stdout??'')+(control.stderr??'');fs.writeFileSync(path.join(directory,'control.txt'),output);
 assert.equal(control.status,0);assert.match(output,/# pass 35/);
 for(const {name,changed}of prepared) {
  const target=path.join(directory,name+'.mjs');fs.writeFileSync(target,changed,{flag:'wx'});
  const result=run(pathToFileURL(target).href),out=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),out,{flag:'wx'});
  const row={name,detected:false,exitStatus:result.status,sourceSha256:sha256(changed),outputSha256:sha256(out)};results.push(row);
  assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');
  // Node's test IPC can serialize an AssertionError containing function-bearing
  // actor records as ERR_TEST_FAILURE. Its explicit strict-assertion diagnostic
  // remains available; an arbitrary exception is never accepted as detection.
  const assertion=out.includes('ERR_ASSERTION')||/^    Expected "actual" to be reference-equal to "expected":$/m.test(out)||/^    Expected values to be strictly(?: deep-)?equal:$/m.test(out);
  assert(assertion,name+' must fail behavior');
  assert(!/SyntaxError|TypeError|ReferenceError|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_ESM_URL_SCHEME/.test(out),name+' unrelated failure');
  row.detected=true;
 }
 passed=true;
}finally {
 assert.equal(sha256(fs.readFileSync(file)),sha256(source));assert.equal(sha256(fs.readFileSync(testFile)),testHash);
 const report={passed,directory,tests:35,sourceSha256:sha256(source),testSha256:testHash,faults:results.filter(r=>r.detected).length,results,runtimeUnchanged:true};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-aftermath-mutation-verification.json',report);console.log({passed,directory,faults:report.faults});
}
