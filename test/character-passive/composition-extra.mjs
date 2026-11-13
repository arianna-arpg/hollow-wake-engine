// Additional authored-composition checks. Existing 343 observations remain intact.
{
 const policy=defs.character.passives,realm=policy.pack.realms.find(row=>row.id==='devotion');assert(realm?.roots?.length&&realm.unlockLedger&&realm.currency);
 const roots=new Set(realm.roots),node=policy.pack.nodes.find(row=>row.realm===realm.id&&!roots.has(row.id)&&!row.choice&&!row.vocation&&policy.adjacent(policy.index(row.id),roots));assert(node);
 const graftNode=syntheticNode;
 function passiveOwner(points,learned=false,graft=false){
  const trace=[],kernel=new CompleteAccountKernel(graft?graftDefinitions:completeBase,{conditions:()=>({refundRefusal:null,openAllRealms:false,runLedger:{[realm.unlockLedger]:1}}),trace:row=>trace.push(row)});
  const owner=new CompleteOwner({...completeDefs,completeKernel:kernel});accountComplete(owner,71);
  const saved=as(owner,71).save;cs(owner,{op:'close-account',account:71});saved.progression.account.ledger[realm.unlockLedger]=1;cs(owner,{op:'restore-account',account:71,save:saved});
  const input=copy(invInput),p=input.character.passives;p.allocated=p.allocated.filter(id=>!roots.has(id)&&policy.node(id)?.realm!==realm.id);p.choices={};p.grafts={};p.realmPoints={[realm.currency]:points};
  if(learned){const row=initialResidence.known.find(row=>row.gem.skillId==='firebolt');assert(row);input.state.skillBook.known=[copy(row)];}
  if(graft&&!p.allocated.includes(graftNode.id))p.allocated.push(graftNode.id);
  startComplete(owner,701,71,input);return{owner,kernel,trace};
 }
 const request={op:'character-passive',command:{op:'allocate',nodeId:node.id}};
 for(const points of [0,2]){
  const {owner,kernel,trace}=passiveOwner(points),before=ws(owner,701),originalToken=trace.at(-1).continuation;
  const pending=cs(owner,{op:'prepare',commands:[wcmd(701,request)]});assert(pending.token);assert.deepEqual(ws(owner,701),before);
  const journal=owner.preparedJournal(pending.token),entry=journal[0],reply=entry.reply.reply;
  assert.equal(reply.accepted,points>0);assert.equal(reply.changed,true);assert.equal(entry.transitions.length,points?2:1,'passive rebuild path count');
  assert.equal(entry.transitions[0].before,originalToken);
  const rootBuild=kernel.read(entry.transitions[0].after);assert(realm.roots.every(id=>rootBuild.character.passives.allocated.includes(id)));assert(!rootBuild.character.passives.allocated.includes(node.id));
  assert.equal(rootBuild.character.passives.realmPoints[realm.currency],points);
  assert.deepEqual(reply.events.map(row=>row.kind),points?['recalculate','recalculate','refresh-company']:['recalculate']);
  assert.deepEqual(reply.events.filter(row=>row.kind==='recalculate').map(row=>row.rebuild),points?[0,1]:[0]);
  if(points){const final=kernel.read(entry.transitions[1].after);assert(final.character.passives.allocated.includes(node.id));assert.equal(final.character.passives.realmPoints[realm.currency],points-1);assert.equal(entry.transitions[1].before,entry.transitions[0].after);}
  cs(owner,{op:'commit-prepared',token:pending.token});const saved=ws(owner,701).save;assert(!JSON.stringify(saved).includes('rebuilds'));assert(realm.roots.every(id=>saved.character.passives.allocated.includes(id)));
  // A later invalid command must discard all earlier private root/purchase work.
  const beforeFailed=ws(owner,701),failed=owner.command({op:'prepare',commands:[wcmd(701,{op:'character-passive',command:{op:'refund',nodeId:node.id}}),wcmd(701,{op:'character-passive',command:{op:'allocate',nodeId:node.id,ledger:{forged:1}}})]});
  assert.equal(failed.ok,false);assert.deepEqual(ws(owner,701),beforeFailed);
 }
 const {owner,kernel}=passiveOwner(2,true);const buy=cs(owner,{op:'prepare',commands:[wcmd(701,request)]});cs(owner,{op:'commit-prepared',token:buy.token});
 const refund=cs(owner,{op:'prepare',commands:[wcmd(701,{op:'character-passive',command:{op:'refund',nodeId:node.id}})]});
 const entry=owner.preparedJournal(refund.token)[0],events=entry.reply.reply.events,view=kernel.read(entry.transitions[0].after).projection;
 assert.equal(events[0].kind,'capture-summons','capture summons precedes rebuild');assert.equal(events[1].kind,'recalculate');
 assert(view.known.some(([id])=>id==='firebolt')&&view.grants.some(([id])=>id==='firebolt'));
 assert.deepEqual(copy(events.filter(e=>e.kind==='resync-supports')),[],'refund must not freeze preparation-time skill targets');
 assert.equal(events[2].kind,'resync-owned-supports','refund refreshes current owned skills');
 assert.deepEqual(events.slice(-4).map(e=>e.kind),['refresh-captured-summons','refresh-company','meta-dirty','character-dirty']);cs(owner,{op:'abort-prepared',token:refund.token});
 {
  const {owner}=passiveOwner(0,true,true),bind={op:'character-passive',command:{op:'bindGraft',key:graftNode.id,skillId:'firebolt'}};
  const first=cs(owner,{op:'prepare',commands:[wcmd(701,bind)]});assert(first.token);assert.equal(first.replies[0].reply.accepted,true);cs(owner,{op:'commit-prepared',token:first.token});
  const before=ws(owner,701),again=cs(owner,{op:'prepare',commands:[wcmd(701,bind)]});assert.equal(again.token,0,'repeated graft has no publication');assert.deepEqual(ws(owner,701),before);assert.equal(again.replies[0].reply.accepted,true);
  const clear=cs(owner,{op:'prepare',commands:[wcmd(701,{...bind,command:{...bind.command,skillId:null}})]});assert(clear.token);
  assert.deepEqual(clear.replies[0].reply.events.map(e=>e.kind),['recalculate','resync-supports']);cs(owner,{op:'abort-prepared',token:clear.token});assert.deepEqual(ws(owner,701),before);
 }
 console.log({additionalPassiveCompositionChecks:10,originalWorldPublicationQualified:false});
}
import passiveOriginal from 'diagnostic/passive-original';
{
 let commands=0,rebuilds=0;
 for(const scenario of passiveOriginal.scenarios.filter(row=>!row.policy)){
  let conditions={refundRefusal:null,openAllRealms:false,runLedger:{}};
  const kernel=new CompleteAccountKernel(completeBase,{conditions:()=>conditions}),owner=new CompleteOwner({...completeDefs,completeKernel:kernel});accountComplete(owner,81);
  const input=copy(invInput);input.state.equipped={};input.state.items=[];input.state.overflow=[];input.state.skillBook={known:[],bar:Array(8).fill(null)};
  input.character.containers={};input.character.passives=copy(scenario.initial);startComplete(owner,801,81,input);
  for(const row of scenario.steps){
   const c=row.command;assert(c.type==='allocate'||c.type==='refund');
   conditions={refundRefusal:c.serviceRefusal??null,openAllRealms:c.openAllRealms??false,runLedger:copy(c.ledger??{})};
   const command={op:c.type,nodeId:c.id,...(c.option===undefined?{}:{option:c.option})};
   const pending=cs(owner,{op:'prepare',commands:[wcmd(801,{op:'character-passive',command})]});
   const reply=pending.replies[0].reply;assert.equal(reply.accepted,c.type==='refund'?row.result.accepted:row.result,scenario.name+': '+c.type+' '+c.id);
   if(pending.token){
    const journal=owner.preparedJournal(pending.token);rebuilds+=journal[0].transitions.length;cs(owner,{op:'commit-prepared',token:pending.token});
   }
   assert.deepEqual(ws(owner,801).save.character.passives,row.expected,scenario.name+': '+c.type+' '+c.id);
   const ordered=reply.events.flatMap(event=>event.kind==='recalculate'?['recalc']:event.kind==='refresh-company'?['company']:event.kind==='meta-dirty'?['dirty']:event.kind==='refusal'?['refused:'+event.reason]:[]);
   assert.deepEqual(ordered,row.events,scenario.name+': effect order');commands++;
  }
 }
 assert.equal(commands,9360);console.log({originalAuthoredPassiveCommands:commands,privateRebuilds:rebuilds,originalWorldPublicationQualified:false});
}
