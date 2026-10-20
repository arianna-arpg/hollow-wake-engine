import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {renderPassiveGrants} from './integrate-passive-grants.mjs';
const worldFile='src/engine/world.ts',editorFile='src/dev/passiveEditor.ts',refundFile='src/engine/passiveRefund.ts',bridgeFile='src/engine/passivePolicyAdapter.ts';
const lf=s=>s.replaceAll('\r\n','\n');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,`Ambiguous policy patch: ${a.slice(0,75)}`);return s.replace(a,b);};
function method(source,name){const ast=ts.createSourceFile(worldFile,source,ts.ScriptTarget.Latest,true);const world=ast.statements.find(s=>ts.isClassDeclaration(s)&&s.name?.text==='World');const rows=world.members.filter(m=>ts.isMethodDeclaration(m)&&m.name.getText(ast)===name);assert.equal(rows.length,1);const m=rows[0];return {start:m.getStart(ast),end:m.end,text:source.slice(m.getStart(ast),m.end)};}
export function renderPassivePolicy(world,editor,refund,reference){
 let next=lf(world);assert.ok(!next.includes('sdkPassiveHost'),'Policy bridge already applied');
 assert.equal(lf(refund),reference[refundFile],'Unreviewed refund helper');
 // M9 editor is the exact prior adapter output, with refresh hooks already present.
 const expectedEditor=renderPassiveGrants(reference[worldFile],reference[editorFile],reference[worldFile],reference[editorFile]).editor;
 assert.equal(lf(editor),expectedEditor,'Unreviewed policy editor input');
 const replacements={
  allocateNode:`allocateNode(nodeId: string, seat: Seat = this.localSeat, optionId?: string): boolean {
    const host = sdkPassiveHost(seat.meta), node = host.policy.node(nodeId);
    if (!node) return false;
    const realm = host.policy.realm(node), access = sdkPassiveAccess(this.ledger);
    if (!realm || !host.policy.open(realm, access)) return false;
    // Preserve the root-only rebuild before the paid transition, including refused purchases.
    this.ensureRealmRoots(seat, realmOf(PASSIVE_NODES[nodeId])!);
    if (!sdkPassiveHost(seat.meta).allocate(nodeId, access, optionId).accepted) return false;
    this.recalcSeat(seat);
    this.refreshPassiveCompany(seat);
    return true;
  }`,
  ensureRealmRoots:`ensureRealmRoots(seat: Seat, realm: PassiveRealmDef): void {
    if (sdkPassiveHost(seat.meta).ensureRealmRoots(realm.id).length) this.recalcSeat(seat);
  }`,
  grantRealmPoints:`grantRealmPoints(currency: string, amount: number, seat: Seat = this.localSeat): void {
    if (sdkPassiveHost(seat.meta).grantRealmPoints(currency, amount)) this.markMetaDirty(seat);
  }`,
 };
 for(const name of ['allocateNode','refundPassiveNode','ensureRealmRoots','grantRealmPoints','bindGraft']){
  const before=method(next,name),original=method(reference[worldFile],name);assert.equal(before.text,original.text,`Unreviewed ${name}`);
  let body=replacements[name]??before.text;
  if(name==='refundPassiveNode'){
   const begin='    m.allocated.delete(nodeId);',end='    this.recalcSeat(seat);';
   assert.equal(body.split(begin).length,2);assert.equal(body.split(end).length,2);
   body=body.slice(0,body.indexOf(begin))+"    if (sdkPassiveHost(m).refund(nodeId).refusal !== null) return false;\n"+body.slice(body.indexOf(end));
  }
  if(name==='bindGraft'){
   const a="    const source = graftSourcesOf(m.allocated, m.choices, PASSIVE_NODES).find(s => s.key === key);",b='    this.recalcSeat(seat); // rebuilds every instance';
   assert.equal(body.split(a).length,2);assert.equal(body.split(b).length,2);
   body=body.slice(0,body.indexOf(a))+"    const prev = m.grafts[key] ?? null;\n    if (!sdkPassiveHost(m).bindGraft(key, skillId, new Set(m.knownSkills.keys()))) return false;\n    if (prev === skillId) return true;\n"+body.slice(body.indexOf(b));
  }
  next=next.slice(0,before.start)+body+next.slice(before.end);
 }
 next=once(next,'PASSIVE_NODES, vocationGateOpen','PASSIVE_NODES');
 next=once(next,'openRealms, realmOf, realmOpen,','openRealms, realmOf,');
 next=once(next,'CHOICE_GROUPS, PASSIVE_CHOICE_CFG, choiceDealSpent, choiceLockReason, graftSourcesOf, sanitizeChoices','CHOICE_GROUPS, sanitizeChoices');
 const imports=ts.createSourceFile(worldFile,next,ts.ScriptTarget.Latest,true).statements.filter(ts.isImportDeclaration),end=imports.at(-1).end;
 next=next.slice(0,end)+"\nimport { sdkPassiveHost, sdkPassiveAccess } from './passivePolicyAdapter';"+next.slice(end);
 let nextEditor=expectedEditor.replaceAll('refreshSdkPassiveGrants','refreshSdkPassivePolicy').replace("from '../engine/passiveGrantAdapter'","from '../engine/passivePolicyAdapter'");
 nextEditor=once(nextEditor,'  const toggleLink = (a: string, b: string): void => {','  const toggleLink = (a: string, b: string): void => {\n    refreshSdkPassivePolicy();');
 const nextRefund="import { sdkPassiveHost } from './passivePolicyAdapter';\nimport type { PlayerMeta } from './world';\ntype RefundMeta = Pick<PlayerMeta, 'classDef' | 'allocated' | 'choices' | 'vocations'>;\nexport function passiveRefund(meta: RefundMeta, nodeId: string): { points: number; currency: string; refusal: string | null } {\n  return sdkPassiveHost(meta).quoteRefund(nodeId);\n}\n";
 return {[worldFile]:next,[editorFile]:nextEditor,[refundFile]:nextRefund};
}
export function integratePassivePolicy(game,write=true,pendingGrants=false){
 const files=[worldFile,editorFile,refundFile],lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),reference={},current={};
 for(const file of files){const bytes=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(bytes),lock.files[file]);reference[file]=lf(bytes.toString());current[file]=fs.readFileSync(path.join(game,file),'utf8');}
 if(pendingGrants){assert.equal(write,false);const preview=renderPassiveGrants(current[worldFile],current[editorFile],reference[worldFile],reference[editorFile]);current[worldFile]=preview.world;current[editorFile]=preview.editor;}
 assert.ok(!fs.existsSync(path.join(game,bridgeFile)),'Refusing to overwrite policy bridge');
 const rendered=renderPassivePolicy(current[worldFile],current[editorFile],current[refundFile],reference);
 if(write){for(const file of files)fs.writeFileSync(path.join(game,file),rendered[file].replaceAll('\n',current[file].includes('\r\n')?'\r\n':'\n'));fs.copyFileSync(path.join(root,'adapters/hollow-wake/passivePolicyAdapter.ts'),path.join(game,bridgeFile));}
 return {files:[...files,bridgeFile]};
}
