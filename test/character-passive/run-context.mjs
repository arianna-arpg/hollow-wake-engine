import {livePassiveWorld as runContextWorld} from 'diagnostic/live-passive-world';
async function checkPassiveRunContext(){
 const policy=defs.character.passives,realm=policy.pack.realms.find(r=>r.id==='devotion'),roots=new Set(realm.roots);
 const node=policy.pack.nodes.find(r=>r.realm===realm.id&&!roots.has(r.id)&&!r.choice&&!r.vocation&&policy.adjacent(policy.index(r.id),roots));assert(node);
 const observations=[];
 for(const [runOpen,accountOpen]of [[true,false],[false,true],[true,true],[false,false]]){
  const original=runContextWorld();original.w.ledger={devotion_attuned:runOpen?1:0};original.w.account.ledger={devotion_attuned:accountOpen?1:0};
  let conditions={refundRefusal:null,openAllRealms:false,runLedger:copy(original.w.ledger)};
  const kernel=new CompleteAccountKernel(completeBase,{conditions:()=>conditions}),owner=new CompleteOwner({...completeDefs,completeKernel:kernel});
  accountComplete(owner,1,'separate-run-account');const save=as(owner,1).save;cs(owner,{op:'close-account',account:1});
  save.progression.account.ledger=copy(original.w.account.ledger);save.progression.account.features=[...original.w.account.features];
  cs(owner,{op:'restore-account',account:1,save});startComplete(owner,1,1,original.input(defs.character.contentId));
  const command={op:'allocate',nodeId:node.id},before=[as(owner,1),ws(owner,1)],pending=cs(owner,{op:'prepare',commands:[wcmd(1,{op:'character-passive',command})]});
  const candidate=pending.replies[0].reply.accepted,expected=original.original(command);
  assert.equal(expected,runOpen);assert.equal(candidate,expected,'passive realm must use the run ledger');
  assert.deepEqual([as(owner,1),ws(owner,1)],before);
  if(pending.token){
   const journal=owner.preparedJournal(pending.token),planned=kernel.read(journal[0].transitions.at(-1).after).character.passives;
   assert.deepEqual(copy(planned),original.passives());cs(owner,{op:'abort-prepared',token:pending.token});
  }
  for(const forged of [{...command,runLedger:{devotion_attuned:1}},{...command,ledger:{devotion_attuned:1}}]){
   const reply=owner.command({op:'prepare',commands:[wcmd(1,{op:'character-passive',command:forged})]});assert.equal(reply.ok,false);assert.deepEqual([as(owner,1),ws(owner,1)],before);
  }
  for(const bad of [{refundRefusal:null,openAllRealms:false},{refundRefusal:null,openAllRealms:false,runLedger:{devotion_attuned:'1'}}]){
   conditions=bad;const reply=owner.command({op:'prepare',commands:[wcmd(1,{op:'character-passive',command})]});
   assert.equal(reply.ok,false,'missing or malformed run context cannot fall back to the account');assert.deepEqual([as(owner,1),ws(owner,1)],before);
  }
  observations.push({runOpen,accountOpen,originalAccepted:expected,candidateAccepted:candidate});
 }
 console.log({passed:true,separateRunAccountCases:4,forgedPlayerContextsRefused:8,invalidHostContextsRefused:8,observations,runOwnershipNotYetDurable:true});
}

async function checkPassiveCompositionBoundary(){await checkPassiveRunContext();await checkPassiveDurableWorld();await checkMixedAccountPublication();await checkPassiveLifetimes();}
