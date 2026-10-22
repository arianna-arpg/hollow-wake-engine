import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const paymentActor='src/engine/actor.ts',paymentBridge='src/engine/resourcePaymentAdapter.ts';
const lf=s=>s.replaceAll('\r\n','\n');
function parse(source){return ts.createSourceFile(paymentActor,source,ts.ScriptTarget.Latest,true);}
function method(ast,name){const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='Actor');assert(cls);const rows=cls.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);assert.equal(rows.length,1,name);return rows[0];}
function repayment(ast){let found;const visit=n=>{if(ts.isForOfStatement(n)&&n.expression.getText(ast)==="['mana', 'life'] as const"&&n.statement.getText(ast).includes('overdriveRecoveryFlat')){assert(!found);found=n;}ts.forEachChild(n,visit);};visit(method(ast,'updateTimers'));assert(found,'Missing repayment loop');return found;}
export function renderPaymentActor(source,reference){
 const current=lf(source),original=lf(reference),ast=parse(current),base=parse(original),edits=[];
 assert(!current.includes('sdkResourcePayment'),'Payment already integrated');
 for(const[name,body]of[
  ['availableMaxMana','{ return sdkResourcePayment.availableMana(this); }'],
  ['lifeCeiling','{ return sdkResourcePayment.lifeCeiling(this); }'],
  ['overdraftHeadroom','{ return sdkResourcePayment.headroom(this, lane); }'],
  ['canAfford','{ return sdkResourcePayment.canAfford(this, cost); }'],
  ['payCost','{ sdkResourcePayment.pay(this, cost); }'],
 ]){const node=method(ast,name),old=method(base,name),expected=old.getText(base);
  // M2 installed these exact ordinary-cost fast paths. Retire that delegation
  // when the complete payment policy takes ownership; reject every other edit.
  const previous=name==='canAfford'?expected.replace('    const esMana = this.es *',
   '    if (this.mana >= cost.mana && this.life > cost.life) return canPayCast(this, cost);\n    const esMana = this.es *')
   :name==='payCost'?expected.replace('    let due = cost.mana;',`    // Ordinary payments delegate to the package; shield/debt routes remain native.
    if (this.mana >= cost.mana && this.life > cost.life) {
      payCast(this, cost);
      if (cost.life > 0) this.onLifeSpent?.(cost.life);
      return;
    }
    let due = cost.mana;`):expected;
  assert(node.getText(ast)===expected||node.getText(ast)===previous,'Unreviewed payment method '+name);
  if(name==='overdraftHeadroom'){
   // Retain a read-only host facade for diagnostics/reference observations.
   const modifier=node.modifiers?.find(n=>n.kind===ts.SyntaxKind.PrivateKeyword);assert(modifier);
   edits.push({start:modifier.getStart(ast),end:modifier.end+1,text:''});
  }
  edits.push({start:node.body.getStart(ast),end:node.body.end,text:body});}
 const legacy=ast.statements.find(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='./engineAdapter');
 if(legacy){const elements=legacy.importClause?.namedBindings?.elements;
  assert(elements&&elements.map(e=>e.getText(ast)).join(',')==='canPayCast,payCast,advanceCooldown,replaceStrongerDot,advanceDotFrame','Unreviewed prior actor bridge import');
  assert.equal(current.match(/\bcanPayCast\(/g)?.length,1,'Additional canPayCast caller');assert.equal(current.match(/\bpayCast\(/g)?.length,1,'Additional payCast caller');
  edits.push({start:elements[0].getStart(ast),end:elements[2].getStart(ast),text:''});
 }
 const idle=method(ast,'overdriveIdleDelay'),oldIdle=method(base,'overdriveIdleDelay');assert.equal(idle.getText(ast),oldIdle.getText(base),'Unreviewed idle helper');
 // Only the extracted payCost called this private helper in the pinned source.
 assert.equal(current.match(/this\.overdriveIdleDelay\(/g)?.length,2,'New idle helper caller needs review');
 edits.push({start:idle.getFullStart(),end:idle.end,text:''});
 const loop=repayment(ast),oldLoop=repayment(base);assert.equal(loop.getText(ast),oldLoop.getText(base),'Unreviewed repayment loop');
 assert.equal(loop.parent.getText(ast),oldLoop.parent.getText(base),'Unreviewed regeneration/repayment phase');
 edits.push({start:loop.getStart(ast),end:loop.end,text:'sdkResourcePayment.advanceDebt(this, dt, regen);'});
 const last=ast.statements.filter(ts.isImportDeclaration).at(-1).end;
 edits.push({start:last,end:last,text:"\nimport {resourcePayment as sdkResourcePayment} from './resourcePaymentAdapter';"});
 let result=current;for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.text+result.slice(e.end);
 return result;
}
export function integrateResourcePayment(game,write=true){
 assert(!fs.existsSync(path.join(game,paymentBridge)),'Refusing to replace payment bridge');
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),reference=fs.readFileSync(path.join(root,'.reference',paymentActor));
 assert.equal(sha256(reference),lock.files[paymentActor]);
 const source=fs.readFileSync(path.join(game,paymentActor),'utf8'),rendered=renderPaymentActor(source,reference.toString());
 if(write){fs.writeFileSync(path.join(game,paymentActor),rendered.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'));fs.copyFileSync(path.join(root,'adapters/hollow-wake/resourcePaymentAdapter.ts'),path.join(game,paymentBridge));}
 return {files:[paymentActor,paymentBridge]};
}
