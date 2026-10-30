import assert from 'node:assert/strict';
import ts from 'typescript';
/** Read-only source locator for the complete caster-side status-delivery policy. */
export function statusDeliveryTree(source){
 const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0);
 const worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1);const world=worlds[0];
 const methods=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='executeSkill');assert.equal(methods.length,1);const method=methods[0],branches={};
 const visit=n=>{if(ts.isIfStatement(n)&&["fx.type === 'siphonStatus'","fx.type === 'recallImpales'"].includes(n.expression.getText(ast))){const key=n.expression.right.text;assert(!branches[key]);assert(ts.isBlock(n.thenStatement));assert.equal(n.thenStatement.statements.length,4);branches[key]=n;}ts.forEachChild(n,visit);};visit(method);
 assert.deepEqual(Object.keys(branches).sort(),['recallImpales','siphonStatus']);assert.equal(branches.siphonStatus.parent,branches.recallImpales.parent);
 const loop=branches.siphonStatus.parent.parent;assert(ts.isForOfStatement(loop));assert.equal(loop.expression.getText(ast),'instanceEffects(inst)');
 const fields=world.members.filter(n=>n.name?.getText(ast)==='recallTreeSpears');assert.equal(fields.length,1);
 const clear=world.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='clearTreeFields');assert(clear);
 const retirement=clear.body.statements.filter(s=>s.getText(ast).includes('this.recallTreeSpears.get'));assert.equal(retirement.length,1);
 return {input,ast,world,method,branches,loop,field:fields[0],retirement:retirement[0]};
}
