import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const resourceFiles=['src/engine/actor.ts','src/engine/gauge.ts','src/engine/world.ts'];
export const resourceBridge='src/engine/resourceAdapter.ts';
const lf=s=>s.replaceAll('\r\n','\n'),parse=(file,s)=>ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true);
const apply=(source,edits)=>{for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);return source;};
// Insert after the import's whole line, retaining its trailing comment.
const importEnd=(ast,source)=>{const end=ast.statements.filter(ts.isImportDeclaration).at(-1).end,next=source.indexOf('\n',end);return next<0?source.length:next;};
export function renderResources(file,source,reference){
 const current=lf(source),original=lf(reference),ast=parse(file,current),base=parse(file,original),edits=[];
 if(file===resourceFiles[0]){
  const actor=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='Actor'),oldActor=base.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='Actor');assert(actor&&oldActor);
  assert(!actor.members.some(n=>['sdkResourceRuntime','sdkCharges'].includes(n.name?.getText(ast))),'Resource binding already exists');
  const methods={gainCharge:'this.sdkCharges().gain(charge, amount, max, inst, chainDepth)',chargeCapFor:'this.sdkCharges().capFor(charge, inst)',spendCharge:'this.sdkCharges().spend(charge, amount)',startChargeDrain:'this.sdkCharges().startDrain(charge, perSec)',isChargeDraining:'this.sdkCharges().isDraining(charge)',updateCharges:'this.sdkCharges().advance(dt)',clearTreeChargeClocks:'this.sdkCharges().clearTreeClocks(inst.def.id)',spendsCharge:'this.sdkCharges().spendsCharge(id)'};
  for(const name of [...Object.keys(methods),'syncChargeMods']){
   const nodes=actor.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name),old=oldActor.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(base)===name);assert.equal(nodes.length,1,`Ambiguous resource method ${name}`);assert.equal(old.length,1);
   const node=nodes[0];assert.equal(node.getText(ast),old[0].getText(base),`Unreviewed resource method ${name}`);
   if(name==='syncChargeMods')edits.push({start:node.jsDoc?.[0]?.pos??node.getStart(ast),end:node.end,text:`/** Instance-owned SDK binding; the actor retains its original state maps. */\n  private sdkResourceRuntime?: ReturnType<typeof createResourceRuntime>;\n  private sdkCharges(): ReturnType<typeof createResourceRuntime> {\n    return this.sdkResourceRuntime ??= createResourceRuntime(this, { charges: this.charges, clocks: this.chargeState, modifierCounts: this.chargeModCount });\n  }`});
   else edits.push({start:node.body.pos,end:node.body.end,text:` { return ${methods[name]}; }`});
  }
  const costBlock="const cc = instanceChargeCost(inst);\n    if (cc && !cc.optional) {\n      const have = this.charges.get(cc.charge) ?? 0;\n      const need = cc.amount === 'all'\n        ? (cc.minimum ?? 1)\n        : Math.max(cc.amount, cc.minimum ?? 0);\n      if (have < need) return false;\n    }";
  assert.equal(original.split(costBlock).length,2);assert.equal(current.split(costBlock).length,2,'Unreviewed resource cost admission');
  const costAt=current.indexOf(costBlock);edits.push({start:costAt,end:costAt+costBlock.length,text:"const cc = instanceChargeCost(inst);\n    if (cc && !cc.optional && !sdkChargeCostReady(this.charges.get(cc.charge) ?? 0, cc)) return false;"});
  let rendered=apply(current,edits);const tree=parse(file,rendered),imports=[];
  // Only remove now-unused symbols; preserve unrelated work that still reads one.
  for(const [module,names] of [['./charges',['CHARGE_DEFS']],['./gauge',['gaugeTick']],['./skills',['instanceChargeGain']]]){
   for(const node of tree.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text===module)){
    const bindings=node.importClause?.namedBindings;if(!bindings||!ts.isNamedImports(bindings))continue;
    const outside=rendered.slice(0,node.getStart(tree))+rendered.slice(node.end),kept=bindings.elements.filter(n=>!names.includes(n.name.text)||new RegExp('\\b'+n.name.text+'\\b').test(outside));
    if(kept.length===bindings.elements.length)continue;
    // The charge module registers stat families at import time. Its original
    // position is observable by catalogue/grant consumers even without reads.
    imports.push({start:node.getStart(tree),end:node.end,text:kept.length?`import { ${kept.map(n=>n.getText(tree)).join(', ')} } from '${module}';`:module==='./charges'?"import './charges';":''});
   }
  }
  const at=importEnd(tree,rendered);imports.push({start:at,end:at,text:"\nimport { createResourceRuntime } from './resourceAdapter';\nimport { chargeCostReady as sdkChargeCostReady } from '@hollow-wake/engine/resources/charges';"});return apply(rendered,imports);
 }
 if(file===resourceFiles[2]){
  const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),oldWorld=base.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert(world&&oldWorld);
  assert(!current.includes('consumeResourceCost'),'Resource cost binding already exists');
  const nodes=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='consumeChargeCost'),old=oldWorld.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(base)==='consumeChargeCost');assert.equal(nodes.length,1,'Ambiguous resource payment');assert.equal(old.length,1);
  assert.equal(nodes[0].getText(ast),old[0].getText(base),'Unreviewed resource payment');edits.push({start:nodes[0].body.pos,end:nodes[0].body.end,text:' { return consumeResourceCost(caster, inst); }'});
  const at=importEnd(ast,current);edits.push({start:at,end:at,text:"\nimport { consumeResourceCost } from './resourceAdapter';"});return apply(current,edits);
 }
 assert.equal(file,resourceFiles[1]);assert(!current.includes('sdkResourceGauges'),'Resource gauges already integrated');
 const args={gaugeEffOf:'spec, needMul, gainMul, lockMul, GAUGE_CFG',gaugeFill:'inst',gaugeLocked:'inst',gaugeLockLeft:'inst',gaugeFloor:'spec, eff',gaugeReady:'inst, eff, spec',gaugePowerOf:'spec, eff, fill',gaugeFrac:'inst, eff',gaugeAdd:'inst, amount, eff',gaugeSpend:'inst, spec, eff',gaugeTick:'inst, spec, eff, dt',gaugeNote:'inst, spec, eff, GAUGE_CFG',gaugeShaveSec:'spec, eff, amount'};
 for(const [name,argumentsText] of Object.entries(args)){
  const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name),old=base.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.equal(nodes.length,1,`Ambiguous resource function ${name}`);assert.equal(old.length,1);
  const node=nodes[0];assert.equal(node.getText(ast),old[0].getText(base),`Unreviewed resource function ${name}`);edits.push({start:node.body.pos,end:node.body.end,text:` { return sdkResourceGauges.${name}(${argumentsText}); }`});
 }
 const at=importEnd(ast,current);edits.push({start:at,end:at,text:"\nimport * as sdkResourceGauges from '@hollow-wake/engine/resources/gauges';"});return apply(current,edits);
}
export function integrateResources(game,write=true){
 assert(!fs.existsSync(path.join(game,resourceBridge)),'Refusing to overwrite resource binding');
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),outputs=[];
 for(const file of resourceFiles){const original=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(original),lock.files[file]);const source=fs.readFileSync(path.join(game,file),'utf8');outputs.push({file,source,after:renderResources(file,source,original.toString())});}
 if(write){for(const {file,source,after} of outputs)fs.writeFileSync(path.join(game,file),after.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'));fs.copyFileSync(path.join(root,'adapters/hollow-wake/resourceAdapter.ts'),path.join(game,resourceBridge));}
 return {files:[...resourceFiles,resourceBridge]};
}
