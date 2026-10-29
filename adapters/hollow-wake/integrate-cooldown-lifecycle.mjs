import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';

export const lifecyclePaths = ['src/engine/actor.ts','src/engine/skills.ts','src/engine/world.ts'];
export const lifecycleDecision = 'Delegate live elapsed clocks, shared pricing, stamp/refund order, orb refunds and snapshot skill reduction; preserve host occurrence and presentation';
const acceptance = JSON.parse(fs.readFileSync(path.join(root,'baseline/cooldown-lifecycle/acceptance.json')));
const boundaryBytes = fs.readFileSync(path.join(root,acceptance.sourceBoundary.file));
assert.equal(sha256(boundaryBytes),acceptance.sourceBoundary.sha256);
const boundary = JSON.parse(boundaryBytes).predecessor;
const entry = '@hollow-wake/engine/combat/cooldown-lifecycle';
const reserved = ['engineAdvanceSkillCooldowns','EngineRecoveryPorts','engineCooldownRecoveryPorts',
  'engineCalculateSkillCooldown','EngineCooldownPricePorts','engineCooldownPricePorts',
  'engineStampSkillCooldown','engineRefundSkillCooldown','engineRefundCooldownsOnOrb','engineReduceOtherCooldowns',
  'EngineStampPorts','EngineOrbRefundPorts','engineCooldownStampPorts','engineCooldownOrbPorts'];

export function lifecycleNodes(file, source) {
  const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,'Invalid lifecycle source');
  const nodes = {};
  if (file.endsWith('/skills.ts')) {
    const found = ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='skillCooldownSeconds');
    assert.equal(found.length,1,'Ambiguous cooldown price'); nodes.price=found;
  } else {
    const owners = ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text===(file.endsWith('/actor.ts')?'Actor':'World'));
    assert.equal(owners.length,1,'Ambiguous lifecycle owner');
    const method = name => { const found=owners[0].members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)===name); assert.equal(found.length,1,'Ambiguous '+name); assert(found[0].body); return found[0]; };
    if (file.endsWith('/actor.ts')) {
      const statements=[...method('updateTimers').body.statements], i=statements.findIndex(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='cdr'));
      assert(i>=0,'Missing cooldown tick'); assert(ts.isForOfStatement(statements[i+2]));
      assert.equal(statements[i+2].expression.getText(ast),'this.cooldowns'); nodes.elapsed=statements.slice(i,i+3);
    } else {
      for (const name of ['refundCooldown','stampSkillCooldown','refundOnOrb']) nodes[name]=[method(name)];
      const found=[]; const walk=n=>{if(ts.isIfStatement(n)&&n.expression.getText(ast)==="fx.type === 'reduceCooldowns'")found.push(n);ts.forEachChild(n,walk);};
      walk(method('executeSkill')); assert.equal(found.length,1,'Ambiguous cooldown skill effect'); nodes.skillEffect=found;
    }
  }
  return {ast,nodes};
}

export function renderCooldownLifecycle(inputs) {
  assert.deepEqual(Object.keys(inputs).sort(),[...lifecyclePaths].sort());
  const outputs={};
  for (const file of lifecyclePaths) {
    const input=inputs[file], source=input.replaceAll('\r\n','\n'), {ast,nodes}=lifecycleNodes(file,source);
    const scan=n=>{if(ts.isIdentifier(n))assert(!reserved.includes(n.text),'Lifecycle binding collision');
      if(n.name){const name=ts.isComputedPropertyName(n.name)?n.name.expression.text:n.name.text;assert(!reserved.includes(name),'Lifecycle binding collision');}
      ts.forEachChild(n,scan);}; scan(ast);
    for (const [name,selected] of Object.entries(nodes)) assert.equal(sha256(selected.map(n=>n.getText(ast)).join('\n')),boundary.blocks[name].sha256,'Unreviewed lifecycle boundary: '+name);
    const edits=[], imports=ast.statements.filter(ts.isImportDeclaration); assert(imports.length);
    const replaceBody=(node,body)=>edits.push({start:node.body.getStart(ast),end:node.body.end,text:'{\n    '+body+'\n  }'});
    let binding;
    if (nodes.elapsed) {
      edits.push({start:nodes.elapsed[0].getStart(ast),end:nodes.elapsed.at(-1).end,text:'engineAdvanceSkillCooldowns(this, dt, engineCooldownRecoveryPorts);'});
      const leafImports=imports.filter(n=>n.getText(ast)==="import { advanceCooldown, replaceStrongerDot, advanceDotFrame } from './engineAdapter';");
      assert.equal(leafImports.length,1,'Unreviewed cooldown leaf import');
      let leafReferences=0;const count=n=>{if(ts.isIdentifier(n)&&n.text==='advanceCooldown')leafReferences++;ts.forEachChild(n,count);};count(ast);
      // Remove the superseded leaf binding only when no other caller uses it.
      if(leafReferences===2)edits.push({start:leafImports[0].getStart(ast),end:leafImports[0].end,
        text:"import { replaceStrongerDot, advanceDotFrame } from './engineAdapter';"});
      binding=`import {advanceSkillCooldowns as engineAdvanceSkillCooldowns, type RecoveryPorts as EngineRecoveryPorts} from '${entry}';
const engineCooldownRecoveryPorts: EngineRecoveryPorts<Actor, SkillInstance> = {
  global: actor => actor.sheet.get('cooldownRecovery'),
  hasTagged: actor => actor.sheet.hasTaggedMods('cooldownRecovery'),
  scoped: (actor, inst) => actor.sheet.get('cooldownRecovery', skillContextTags(inst), instanceMods(inst)),
};`;
    } else if (nodes.price) {
      replaceBody(nodes.price[0],'return engineCalculateSkillCooldown(caster, inst, base, engineCooldownPricePorts);');
      binding=`import {calculateSkillCooldown as engineCalculateSkillCooldown, type CooldownPricePorts as EngineCooldownPricePorts} from '${entry}';
const engineCooldownPricePorts: EngineCooldownPricePorts<Parameters<typeof skillCooldownSeconds>[0], SkillInstance, Set<SkillTag>, Modifier[]> = {
  tags: inst => skillContextTags(inst), modifiers: inst => instanceMods(inst),
  absorbCooldown: inst => guardArtsOf(inst)?.absorb?.cooldown,
  read: (actor, stat, tags, extra) => actor.sheet.get(stat, tags, extra),
};`;
    } else {
      replaceBody(nodes.refundCooldown[0],'engineRefundSkillCooldown(caster, skillId);');
      replaceBody(nodes.stampSkillCooldown[0],'engineStampSkillCooldown(caster, inst, base, engineCooldownStampPorts);');
      replaceBody(nodes.refundOnOrb[0],'engineRefundCooldownsOnOrb(a, kind, engineCooldownOrbPorts);');
      const node=nodes.skillEffect[0]; edits.push({start:node.getStart(ast),end:node.end,text:`if (fx.type === 'reduceCooldowns') {
        if (engineReduceOtherCooldowns(caster, def, fx) > 0) this.text(caster.pos, 'time slips', '#8ae0e8', 12, 'combat');
      }`});
      binding=`import {stampSkillCooldown as engineStampSkillCooldown, refundSkillCooldown as engineRefundSkillCooldown, refundCooldownsOnOrb as engineRefundCooldownsOnOrb, reduceOtherSkillCooldowns as engineReduceOtherCooldowns, type StampPorts as EngineStampPorts, type OrbRefundPorts as EngineOrbRefundPorts} from '${entry}';
const engineCooldownStampPorts: EngineStampPorts<Actor, SkillInstance> = {
  price: (actor, inst, base) => skillCooldownSeconds(actor, inst, base), ultimateCap: () => ultCooldownCap(),
};
const engineCooldownOrbPorts: EngineOrbRefundPorts<Actor, SkillInstance> = {
  seconds: (actor, kind, inst) => actor.sheet.get(orbRefundStat(kind), skillContextTags(inst, grantedTags(inst)), instanceMods(inst)),
};`;
    }
    edits.push({start:imports.at(-1).end,end:imports.at(-1).end,text:'\n'+binding}); edits.sort((a,b)=>b.start-a.start);
    for(let i=1;i<edits.length;i++)assert(edits[i].end<=edits[i-1].start,'Overlapping lifecycle edits');
    let output=source; for(const edit of edits)output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
    assert.equal(ts.createSourceFile(file,output,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
    outputs[file]=input.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
  }
  return outputs;
}

/** Inspect all three files before making any write. Never overwrite unknown behavior. */
export function integrateCooldownLifecycle(game, write=true) {
  const inputs=Object.fromEntries(lifecyclePaths.map(file=>[file,fs.readFileSync(path.join(game,file),'utf8')]));
  const outputs=renderCooldownLifecycle(inputs);
  if(write)for(const file of lifecyclePaths)fs.writeFileSync(path.join(game,file),outputs[file]);
  return {files:lifecyclePaths,decision:lifecycleDecision};
}
