import assert from 'node:assert/strict';import ts from 'typescript';

/** Read-only build overlay. Exact original methods remain the reference oracle. */
export function patchPassiveActionsWorld(raw){
 let source=raw.replaceAll('\r\n','\n');
 const ast=ts.createSourceFile('world.ts',source,ts.ScriptTarget.Latest,true),world=ast.statements.find(s=>ts.isClassDeclaration(s)&&s.name?.text==='World');
 assert(world);const replacements=[];
 const bodies={
  allocateNode:'allocateNode(nodeId:string,seat:Seat=this.localSeat,optionId?:string):boolean{return this.sdkPassiveActions().allocate(seat,nodeId,optionId);}',
  refundPassiveNode:'refundPassiveNode(nodeId:string,seat:Seat=this.localSeat):boolean{return this.sdkPassiveActions().refund(seat,nodeId);}',
  ensureRealmRoots:'ensureRealmRoots(seat:Seat,realm:PassiveRealmDef):void{this.sdkPassiveActions().ensureRealmRoots(seat,realm.id);}',
  ensureOpenRealmRoots:'ensureOpenRealmRoots(seat:Seat=this.localSeat):void{this.sdkPassiveActions().ensureOpenRoots(seat);}',
  grantRealmPoints:'grantRealmPoints(currency:string,amount:number,seat:Seat=this.localSeat):void{this.sdkPassiveActions().grantRealmPoints(seat,currency,amount);}',
  bindGraft:'bindGraft(key:string,skillId:string|null,seat:Seat=this.localSeat):boolean{return this.sdkPassiveActions().bindGraft(seat,key,skillId);}'
 };
 for(const[name,text]of Object.entries(bodies)){
  const methods=world.members.filter(m=>ts.isMethodDeclaration(m)&&m.name.getText(ast)===name);assert.equal(methods.length,1,name);
  replacements.push({start:methods[0].getStart(ast),end:methods[0].end,text});
 }
 const unused=new Set(['vocationGateOpen','PASSIVE_CHOICE_CFG','choiceDealSpent','choiceLockReason','openRealms','realmOf','realmOpen','passiveRefund']),removed=[];
 for(const statement of ast.statements){
  if(!ts.isImportDeclaration(statement)||!statement.importClause?.namedBindings||!ts.isNamedImports(statement.importClause.namedBindings))continue;
  const bindings=statement.importClause.namedBindings.elements,remaining=bindings.filter(binding=>{
   if(!unused.has(binding.name.text))return true;removed.push(binding.name.text);return false;
  });
  if(remaining.length===bindings.length)continue;
  assert.equal(statement.importClause.name,undefined);
  replacements.push({start:statement.getStart(ast),end:statement.end,text:remaining.length?
   'import { '+remaining.map(binding=>binding.getText(ast)).join(', ')+' } from '+statement.moduleSpecifier.getText(ast)+';':''});
 }
 assert.deepEqual(removed.sort(),[...unused].sort());
 for(const edit of replacements.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 const insertion=`
 private sdkPassiveActionOwner?:PassiveActions<Seat,SkillInstance,{body:Actor;hero:Actor}>;
 private sdkPassiveActions():PassiveActions<Seat,SkillInstance,{body:Actor;hero:Actor}>{
  return this.sdkPassiveActionOwner??=new PassiveActions({
   session:seat=>sdkPassiveHost(seat.meta),access:()=>sdkPassiveAccess(this.ledger),refundRefusal:seat=>this.passiveRefundRefusal(seat),
   graft:(seat,key)=>seat.meta.grafts[key]??null,knownIds:seat=>new Set(seat.meta.knownSkills.keys()),known:(seat,id)=>seat.meta.knownSkills.get(id),
   skills:seat=>[...seat.meta.knownSkills.values(),...(seat.grantedInsts?.values()??[])],
   summons:seat=>{const hero=this.seatHero(seat);return this.actors.filter(a=>!a.dead&&a.owner===hero&&!a.construct&&!a.companion&&a.summonInst).map(body=>({body,hero}));},
   alive:entry=>!entry.body.dead,recalculate:seat=>{this.recalcSeat(seat);},refreshCompany:seat=>{this.refreshPassiveCompany(seat);},
   resyncSupports:inst=>{this.resyncMinionSupports(inst);},refreshSummon:(_seat,{body:a,hero})=>{
    const inst=a.summonInst!;
    if(inst.def.throng||inst.def.hivecall)this.bakeMinionOwnerStats(a,hero,inst,inst.def.throng?batchScaleOf(inst.def.throng):1);
    else{
     const inherited=resolveMinionInheritance(hero,inst,a.defId);
     a.sheet.setSource('owner',inherited.ownerMods);a.sheet.setSource('minionCombat',inherited.combatMods);a.guardMode=inherited.guard;
     applyMinionPlyBonus(a,inherited.plyBonus);syncAttributeBequests(a,inst.relicSource?RELIQUARY_CFG.minion.ordinaryStats:1,inherited.tags,inherited.extra);
    }
    a.life=Math.min(a.life,a.maxLife());
   },markMetaDirty:seat=>{this.markMetaDirty(seat);},markCharacterDirty:()=>{this.charDirty=true;},fail:(seat,key,reason)=>{this.failNote(seat.actor,key,reason);}
  });
 }
`;
 const anchor=bodies.allocateNode;assert.equal(source.split(anchor).length,2);source=source.replace(anchor,insertion+anchor);
 return "import {PassiveActions} from 'candidate/passive-actions';\nimport {sdkPassiveHost,sdkPassiveAccess} from './passivePolicyAdapter';\n"+source;
}
