import assert from 'node:assert/strict';import ts from 'typescript';
export function hitSustainTree(source,original=false){
 const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0);
 const one=(rows,name)=>{assert.equal(rows.length,1,'Ambiguous sustain boundary: '+name);return rows[0];};
 const world=one(ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),'World'),name=original?'resolveHit':'continueLandedHit';
 const hit=one(world.members.filter(n=>n.name?.getText(ast)===name),name);assert(ts.isMethodDeclaration(hit)&&hit.body);
 const damage=hit.body.statements[original?26:0];assert(ts.isIfStatement(damage)&&ts.isBlock(damage.thenStatement));assert.equal(damage.expression.getText(ast),'hasDamage');
 const statements=damage.thenStatement.statements,offset=original?18:1,sustain=statements.slice(offset,offset+3);assert.equal(sustain.length,3);assert(statements.length>offset+3);
 assert.equal(statements[offset+3].getText(ast),'caster.lastCombatAt = this.time;');
 const prefix=input.slice(hit.getStart(ast),sustain[0].getFullStart()),suffix=input.slice(sustain[2].end,hit.end),imports=ast.statements.filter(n=>ts.isImportDeclaration(n));
 return {input,ast,world,hit,sustain,prefix,suffix,imports};
}
