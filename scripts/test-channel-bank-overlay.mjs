import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {bankPaths,bankTree,integrateChannelBanks} from '../adapters/hollow-wake/integrate-channel-banks.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const reports=[];
for(const ending of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/bank-overlay-'));fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
 const originals=new Map();
 for(const file of [bankPaths.world,bankPaths.actor,bankPaths.channel]){
  const from=file===bankPaths.channel?path.join(root,'adapters/hollow-wake/channelCastingAdapter.ts'):path.join(reference,file);
  const text=fs.readFileSync(from,'utf8').replaceAll('\r\n','\n')+(file===bankPaths.channel?'':'\n// unrelated bank baseline marker\n');
  originals.set(file,text.replaceAll('\n',ending));fs.writeFileSync(path.join(game,file),originals.get(file));
 }
 const unchanged=()=>{for(const [file,text]of originals)assert.equal(fs.readFileSync(path.join(game,file),'utf8'),text,file);};
 integrateChannelBanks(game,false);unchanged();assert(!fs.existsSync(path.join(game,bankPaths.binding)));
 for(const [file,before,after]of [
  [bankPaths.world,'bs.fill >= spec.bankAt','bs.fill > spec.bankAt'],
  [bankPaths.actor,'Math.round(b.fill * 5)','Math.floor(b.fill * 5)'],
  [bankPaths.channel,'bank.inst = state.inst; bank.spec = spec;','bank.inst = state.inst;'],
 ]){
  const old=originals.get(file);assert(old.includes(before));const changed=old.replaceAll(before,after);fs.writeFileSync(path.join(game,file),changed);
  assert.throws(()=>integrateChannelBanks(game),/Unreviewed/);assert.equal(fs.readFileSync(path.join(game,file),'utf8'),changed);
  for(const [other,text]of originals)if(other!==file)assert.equal(fs.readFileSync(path.join(game,other),'utf8'),text);
  fs.writeFileSync(path.join(game,file),old);
 }
 fs.writeFileSync(path.join(game,bankPaths.binding),'unrelated existing file');assert.throws(()=>integrateChannelBanks(game),/already exists/);unchanged();fs.unlinkSync(path.join(game,bankPaths.binding));
 integrateChannelBanks(game);
 for(const [file,typeName,changed]of [[bankPaths.world,'World',['update']],[bankPaths.actor,'Actor',['refreshConditions','gaugeHashA','gaugeHashB']]]){
  const output=fs.readFileSync(path.join(game,file),'utf8');assert.equal(output.includes('\r\n'),ending==='\r\n');assert(output.endsWith(ending+'// unrelated bank baseline marker'+ending));
  const before=bankTree(originals.get(file),file,typeName),after=bankTree(output,file,typeName);
  const members=tree=>new Map(tree.type.members.map(n=>[n.name?.getText(tree.ast),n.getText(tree.ast)]));const prior=members(before),now=members(after);
  for(const [name,text]of prior)if(!changed.includes(name))assert.equal(now.get(name),text,'Unrelated member changed: '+name);
  if(typeName==='World')assert.equal(prior.size,now.size);else{
   assert.equal(now.size,prior.size-1);assert(now.has('sdkActorGauges'));
   const oldMethod=before.type.members.find(n=>n.name?.getText(before.ast)==='refreshConditions');
   const newMethod=after.type.members.find(n=>n.name?.getText(after.ast)==='refreshConditions');
   assert.deepEqual(newMethod.body.statements.slice(0,21).map(n=>n.getText(after.ast)),oldMethod.body.statements.slice(0,21).map(n=>n.getText(before.ast)));
   assert.equal(newMethod.body.statements.at(-1).getText(after.ast),oldMethod.body.statements.at(-1).getText(before.ast));
  }
 }
 assert.throws(()=>integrateChannelBanks(game),/already integrated/);
 reports.push({ending,dryRunPreserved:true,threeSourceFaultsRejected:true,existingBindingRejectedBeforeWrites:true,unrelatedMembersPreserved:true,conditionStatementsPreserved:22,duplicateRejected:true});
}
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/channel-bank-overlay-verification.json'),{reports,reconstructedFromPinnedSource:true});
console.log('Bank/gauge overlay preserves condition policy, unrelated members and both newline styles; all source and collision controls passed.');
