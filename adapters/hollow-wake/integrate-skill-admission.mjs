import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const admissionActor='src/engine/actor.ts',admissionBridge='src/engine/skillAdmissionAdapter.ts';
const lf=source=>source.replaceAll('\r\n','\n');
const parse=source=>ts.createSourceFile(admissionActor,source,ts.ScriptTarget.Latest,true);
function method(ast,name){
 const owner=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='Actor');assert(owner);
 const found=owner.members.filter(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)===name);
 assert.equal(found.length,1,name);return found[0];
}
export function renderAdmissionActor(source,reference){
 const current=lf(source),original=lf(reference),ast=parse(current),baseline=parse(original),edits=[];
 assert(!/\bsdkSkillAdmission\b/.test(current),'Admission already integrated or binding collision');
 for(const name of ['canAct','tagsForbidden','isReflex','canUse','unmetGate','gatesMet','primedPourOpen']){
  const node=method(ast,name),raw=method(baseline,name).getText(baseline);
  const accepted=new Set([raw]);
  if(name==='canUse'){
   const chargeBlock=`if (cc && !cc.optional) {
      const have = this.charges.get(cc.charge) ?? 0;
      const need = cc.amount === 'all'
        ? (cc.minimum ?? 1)
        : Math.max(cc.amount, cc.minimum ?? 0);
      if (have < need) return false;
    }`;
   assert(raw.includes(chargeBlock),'Moved original charge-cost admission');
   accepted.add(raw.replace(chargeBlock,'if (cc && !cc.optional && !sdkChargeCostReady(this.charges.get(cc.charge) ?? 0, cc)) return false;'));
   for(const variant of [...accepted])accepted.add(variant.replace('uc && uc.empower === undefined && !uc.ventAll && this.skillChargeBank(inst).count <= 0','requiresUseCharge(uc) && this.skillChargeBank(inst).count <= 0'));
  }
  assert(accepted.has(node.getText(ast)),'Unreviewed admission method '+name);
  edits.push({start:node.body.getStart(ast),end:node.body.end,text:`{ return sdkSkillAdmission.${name}(this${name==='canAct'?'':', inst'}); }`});
 }
 for(const[name,calls]of [['reflexOpen',1],['gatherReleasable',1]]){
  const node=method(ast,name);assert.equal(node.getText(ast),method(baseline,name).getText(baseline),'Unreviewed admission helper '+name);
  assert.equal((current.match(new RegExp('this\\.'+name+'\\(','g'))??[]).length,calls,'New private admission helper caller '+name);
  edits.push({start:node.getFullStart(),end:node.end,text:''});
 }
 const last=ast.statements.filter(ts.isImportDeclaration).at(-1).end;
 edits.push({start:last,end:last,text:"\nimport {skillAdmission as sdkSkillAdmission} from './skillAdmissionAdapter';"});
 let result=current;
 for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
 // Remove only imports whose last original callers were in these methods.
 // Other users of any imported symbol remain untouched.
 const tree=parse(result),cleanup=[];
 const candidates=new Set(['REFLEX_CFG','instanceGates','instanceChargeCost','instanceCastMode','instanceDelivery','gaugeReady','gaugeNote','reserveCostOf','summonContractSlots','summonReservationUnit','requiresUseCharge','sdkChargeCostReady']);
 for(const declaration of tree.statements.filter(ts.isImportDeclaration)){
  const bindings=declaration.importClause?.namedBindings;
  if(!bindings||!ts.isNamedImports(bindings))continue;
  const kept=bindings.elements.filter(element=>{
   const name=element.name.text;if(!candidates.has(name))return true;
   let uses=0;const visit=node=>{if(ts.isIdentifier(node)&&node.text===name&&node!==element.name)uses++;ts.forEachChild(node,visit);};
   visit(tree);return uses>0;
  });
  if(kept.length===bindings.elements.length)continue;
  if(!kept.length&&!declaration.importClause.name)cleanup.push({start:declaration.getFullStart(),end:declaration.end,text:''});
  else cleanup.push({start:bindings.getStart(tree),end:bindings.end,text:'{ '+kept.map(element=>element.getText(tree)).join(', ')+' }'});
 }
 for(const edit of cleanup.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
 return result;
}
export function integrateSkillAdmission(game,write=true){
 assert(!fs.existsSync(path.join(game,admissionBridge)),'Refusing to replace admission bridge');
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
 const reference=fs.readFileSync(path.join(root,'.reference',admissionActor));
 assert.equal(sha256(reference),lock.files[admissionActor]);
 const source=fs.readFileSync(path.join(game,admissionActor),'utf8');
 const rendered=renderAdmissionActor(source,reference.toString());
 if(write){fs.writeFileSync(path.join(game,admissionActor),rendered.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'));fs.copyFileSync(path.join(root,'adapters/hollow-wake/skillAdmissionAdapter.ts'),path.join(game,admissionBridge));}
 return {files:[admissionActor,admissionBridge]};
}
