import fs from 'node:fs';import assert from 'node:assert/strict';import {renderSkillBar} from '../adapters/hollow-wake/integrate-skill-bar.mjs';
import ts from 'typescript';
const inputs={
 'src/engine/world.ts':{names:['bindSkill','swapSkillSlots','rebindWornGrafts','rememberSkillSlots'],needle:'const already = prev?.def.id === skillId;'},
 'src/meta/skillSlotMemory.ts':{names:['restoreSkillSlotMemory','rememberSkillSlot','planSkillSlots'],needle:'const slots = [...bar], plan = new Map<string, number>();'},
};
for(const[file,{names,needle}]of Object.entries(inputs)){
 const source=fs.readFileSync(new URL('../.reference/'+file,import.meta.url),'utf8').replaceAll('\r\n','\n');
 for(const newline of ['\n','\r\n']){
  const original=source.replaceAll('\n',newline),marker=newline+'// unrelated extension'+newline;
  const output=renderSkillBar(file,original+marker,original);assert(output.endsWith(marker));assert.equal(output.includes('\r\n'),newline==='\r\n');
  assert(output.includes('@hollow-wake/engine/skills/bar'));
  assert.throws(()=>renderSkillBar(file,output,original),/already present/);
  assert.throws(()=>renderSkillBar(file,original.replace(needle,needle+' /* edit */'),original),/Unreviewed/);
  for(const name of names){
   const pattern=new RegExp('\\b'+name+'\\(');assert(pattern.test(original));
   // Rename the declaration only; an earlier call in World must not satisfy it.
   const declaration=new RegExp('(^|\\n)([ \\t]*(?:export function |private )?)'+name+'\\(', 'm');
   assert(declaration.test(original),name);
   const changed=original.replace(declaration,(_m,start,prefix)=>start+prefix+'changed_'+name+'(');
   assert.throws(()=>renderSkillBar(file,changed,original),/Expected one skill bar method/);
   const ast=ts.createSourceFile(file,original,ts.ScriptTarget.Latest,true);
   const members=file.endsWith('world.ts')?ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World').members:ast.statements;
   const node=members.find(n=>(ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name?.getText(ast)===name);assert(node);
   const doubled=original.slice(0,node.end)+newline+node.getText(ast)+original.slice(node.end);
   assert.throws(()=>renderSkillBar(file,doubled,original),/Expected one skill bar method/);
  }
 }
}
assert.throws(()=>renderSkillBar('other.ts','',''));
console.log({passed:true,files:2,newlines:2,guardedDeclarations:7});
