import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {root,sha256} from '../../scripts/reference-utils.mjs';
process.chdir(root);
const runtimeFile='src/skill-bar.ts',worldFile='.reference/src/engine/world.ts',memoryFile='.reference/src/meta/skillSlotMemory.ts';
const parse=file=>ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
const runtime=parse(runtimeFile),world=parse(worldFile),memory=parse(memoryFile);
const body=(tree,name,owner)=>{const nodes=owner?tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text===owner).members:tree.statements;const found=nodes.filter(n=>(ts.isFunctionDeclaration(n)||ts.isMethodDeclaration(n))&&n.name?.getText(tree)===name);assert.equal(found.length,1,name);return found[0].body.getText(tree);};
const ports=[
 ['this.seatHero(seat)','r.hero(seat)'],['this.rememberSkillSlots(seat,','r.remember(seat,'],['this.rebindWornGrafts(seat,','r.rebind(seat,'],
 ['this.seatSkillById(seat,','r.resolve(seat,'],['this.recalcSeat(seat)','r.recalculate(seat)'],['inst.def.tags.includes(\'flask\')','r.isFlask(inst)'],
 ['seat.actor','r.actor(seat)'],['this.clearTreeFields(','r.clearFields('],['this.resyncMinionSupports(','r.resync('],
 ['this.localSeat','r.localSeat()'],['this.provisioningFlaskSlots.has(seat)','r.provisioning(seat)'],
 ['rememberSkillSlot(this.account.skillSlotMemory,','r.rememberSlot('],['this.accountDirty = true','r.preferencesDirty()'],
 ['SKILL_SLOT_MEMORY_CFG.tags.some(tag => inst.def.tags.includes(tag))','eligible(inst)'],
];
function canonical(source){
 const js=ts.transpileModule('function observed()'+source,{compilerOptions:{target:ts.ScriptTarget.ES2022,removeComments:true}}).outputText;
 const tree=ts.createSourceFile('observed.js',js,ts.ScriptTarget.Latest,true);
 const transformed=ts.transform(tree,[context=>root=>{
  const visit=node=>{
   const child=ts.visitEachChild(node,visit,context);
   if(ts.isBlock(child)&&child.statements.length===1&&node.parent&&(ts.isIfStatement(node.parent)||ts.isForStatement(node.parent)||ts.isForOfStatement(node.parent)))return child.statements[0];
   return child;
  };return ts.visitNode(root,visit);
 }]);
 try{
  const printed=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed}).printFile(transformed.transformed[0]);
  const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,printed),tokens=[];
  while(scanner.scan()!==ts.SyntaxKind.EndOfFileToken)tokens.push([scanner.getToken(),scanner.getTokenText()]);
  return JSON.stringify(tokens);
 }finally{transformed.dispose();}
}
const rows=[];
for(const [originalName,sdkName,owner]of [['bindSkill','bind','World'],['swapSkillSlots','swap','World'],['rebindWornGrafts','rebind','World'],['rememberSkillSlots','remember','World'],['restoreSkillSlotMemory','restoreSkillSlotMemory'],['rememberSkillSlot','rememberSkillSlot'],['planSkillSlots','planSkillSlots']]){
 let before=body(owner?world:memory,originalName,owner),after=body(runtime,sdkName,owner?'SkillBarActions':undefined);
 for(const [from,to]of ports)before=before.replaceAll(from,to);
 after=after.replace('const r=this.#p,p=r.hero(seat);','const p=r.hero(seat);').replace('const r=this.#p;','');
 const a=canonical(before),b=canonical(after);assert.equal(b,a,originalName);
 rows.push({original:originalName,runtime:sdkName,bodySha256:sha256(a)});
}
fs.writeFileSync('.artifacts/skill-bar-mechanical-proof.json',JSON.stringify({passed:true,method:'Compare emitted statement structures after explicit host-port substitution, removal of the local ports alias, and single-statement control-block normalization. Adapter argument/default forwarding is covered by installed and unit courses.',sources:Object.fromEntries([runtimeFile,worldFile,memoryFile].map(file=>[file,sha256(fs.readFileSync(file))])),ports,rows},null,2)+'\n');
console.log({passed:true,methods:rows.length});
