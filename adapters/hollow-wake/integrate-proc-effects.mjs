import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const procEffectPaths={magnitude:'src/data/procs.ts',resource:'src/engine/actor.ts',effect:'src/engine/world.ts',binding:'src/engine/procEffectAdapter.ts'};
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-nine/adapter-contract.json'))),lf=s=>s.replaceAll('\r\n','\n');
const name=n=>n.name&&(ts.isComputedPropertyName(n.name)?ts.isStringLiteral(n.name.expression)?n.name.expression.text:undefined:n.name.text);
export function procEffectTree(source,file){
  const row=contract.sourceBoundaries.find(r=>r.file===file);assert(row,'Unknown effect source boundary');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0,'Invalid effect source: '+file);
  let owner;
  if(row.owner){const nodes=ast.statements.filter(n=>ts.isClassDeclaration(n)&&name(n)===row.owner);assert.equal(nodes.length,1,'Ambiguous effect owner: '+row.owner);owner=nodes[0];}
  const nodes=(owner?owner.members:ast.statements).filter(n=>name(n)===row.name);
  assert.equal(nodes.length,1,'Ambiguous effect method: '+row.name);const node=nodes[0];
  assert((owner?ts.isMethodDeclaration(node):ts.isFunctionDeclaration(node))&&node.body,'Invalid effect method: '+row.name);
  let dispatch,ward,cases;
  if(row.wardCaseSha256){
    const switches=node.body.statements.filter(ts.isSwitchStatement);assert.equal(switches.length,1,'Unreviewed effect switch');dispatch=switches[0];
    assert.equal(dispatch.expression.getText(ast),'fx.type','Unreviewed effect discriminator');cases=dispatch.caseBlock.clauses;
    assert.equal(cases.length,22,'Unreviewed effect case count');assert(cases.every(c=>ts.isCaseClause(c)&&ts.isStringLiteral(c.expression)),'Unreviewed effect case shape');
    const wards=cases.filter(c=>c.expression.text==='ward');assert.equal(wards.length,1,'Ambiguous ward case');ward=wards[0];
  }
  return {ast,row,owner,node,dispatch,ward,cases};
}
export function renderProcEffectSource(source,file){
  const input=lf(source),tree=procEffectTree(input,file),{ast,row,node,ward,cases}=tree;
  const scan=n=>{if(ts.isIdentifier(n))assert(!contract.reservedNames.includes(n.text),'Effect binding collision or already integrated: '+n.text);ts.forEachChild(n,scan);};scan(ast);
  assert.equal(sha256(node.getText(ast)),row.methodSha256,'Unreviewed effect boundary: '+row.name);
  if(ward){
    assert.equal(sha256(ward.getText(ast)),row.wardCaseSha256,'Unreviewed ward case');
    for(const c of cases)if(c!==ward)assert.equal(sha256(c.getText(ast)),row.untouchedCaseHashes[c.expression.text],'Unreviewed effect sibling: '+c.expression.text);
  }
  const kind=Object.keys(procEffectPaths).find(k=>procEffectPaths[k]===file),target=ward??node.body;
  const text=ward?"case 'ward': {\n        if (engineApplyWardEffect(caster, fx, wardEffectPorts)) noteProcCue(caster, procCue, 'gain', proc.id);\n        break;\n      }":kind==='resource'?'{ return engineGainWard(this, amount, wardResourcePorts); }':'{ return engineScaleProcEffect(fx, pw) as ProcEffect; }';
  const lastImport=ast.statements.filter(ts.isImportDeclaration).at(-1);assert(lastImport,'Missing effect imports');
  const edits=[{start:target.getStart(ast),end:target.end,text},{start:lastImport.end,end:lastImport.end,text:'\n'+contract.imports[kind]}].sort((a,b)=>b.start-a.start);
  assert(edits[1].end<=edits[0].start,'Overlapping effect edits');
  let output=input;for(const edit of edits)output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  procEffectTree(output,file);return output;
}
/** All three source checks and binding checks finish before any file is written. */
export function integrateProcEffects(game,write=true){
  const target=path.join(game,procEffectPaths.binding);assert(!fs.existsSync(target),'Effect binding already exists');
  const edits=contract.sourceBoundaries.map(({file})=>{const source=fs.readFileSync(path.join(game,file),'utf8');return [file,renderProcEffectSource(source,file).replaceAll('\n',source.includes('\r\n')?'\r\n':'\n')];});
  edits.push([procEffectPaths.binding,fs.readFileSync(path.join(root,'adapters/hollow-wake/procEffectAdapter.ts'),'utf8')]);
  if(write)for(const [file,text]of edits)fs.writeFileSync(path.join(game,file),text);
  return {files:edits.map(([file])=>file),decision:contract.decision};
}
