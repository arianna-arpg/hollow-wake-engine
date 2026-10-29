import assert from 'node:assert/strict';
import ts from 'typescript';
export function hitStatusTree(source){
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0);
  const one=(nodes,label)=>{assert.equal(nodes.length,1,'Ambiguous hit/status boundary: '+label);return nodes[0];};
  const world=one(ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),'World');
  const hit=one(world.members.filter(n=>n.name?.getText(ast)==='resolveHit'),'resolveHit');assert(ts.isMethodDeclaration(hit)&&hit.body);
  const top=hit.body.statements;
  const variable=name=>one(top.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name)),name);
  const start=variable('tags'),finish=variable('stacksBonusFor'),first=top.indexOf(start),last=top.indexOf(finish);assert.equal(last-first,8);
  const prepare=Object.fromEntries(['tags','durScale','bonusChance','hexLink','hexDmg','hexDur','potencyFor','stacksBonusFor'].map(name=>[name,variable(name)]));
  prepare.linked=top[first+4];assert(ts.isIfStatement(prepare.linked)&&prepare.linked.expression.getText(ast)==='def.linkedHexes && dealt > 0');
  const find=(predicate,label)=>{const found=[];const visit=n=>{if(predicate(n))found.push(n);ts.forEachChild(n,visit);};visit(hit);return one(found,label);};
  const discharge=find(n=>ts.isIfStatement(n)&&n.expression.getText(ast)==='dealt > 0 && depth === 0 && !target.dead'&&n.thenStatement.getText(ast).includes('!STATUS_DEFS[s.id]?.dischargeOnHit'),'discharge');
  const plant=find(n=>ts.isIfStatement(n)&&n.expression.getText(ast)==='dealt > 0 && depth === 0 && !target.dead'&&n.thenStatement.getText(ast).includes("const ip = caster.sheet.get('impalePower'"),'plant');
  assert.equal(discharge.parent,plant.parent);const siblings=discharge.parent.statements,index=siblings.indexOf(discharge),assault=siblings[index+1];assert.equal(siblings[index+2],plant);assert.equal(assault.getText(ast),'this.assaults.plant(caster, target, packet, depth, dealt);');
  const riders=find(n=>ts.isIfStatement(n)&&n.expression.getText(ast)==='dealt > 0 && depth === 0 && caster.buffs.size','riders');
  const authoredIf=find(n=>ts.isIfStatement(n)&&n.expression.getText(ast)==="fx.type === 'status'",'authored status');
  const wet=variable('wetHere'),granted=top[top.indexOf(wet)+1];assert(ts.isIfStatement(granted)&&granted.getText(ast).includes("caster.sheet.armedFamily('apply_', STATUS_IDS, extra)"));
  let effectLoop=authoredIf;while(effectLoop&&!ts.isForOfStatement(effectLoop))effectLoop=effectLoop.parent;
  assert(effectLoop&&ts.isBlock(effectLoop.statement)&&effectLoop.statement.statements.length===1,'Status branch must terminate the effect iteration');
  return {input,ast,world,hit,prepare,start,finish,phases:{discharge,assault,plant,riders,authored:authoredIf.thenStatement,wet,granted}};
}
